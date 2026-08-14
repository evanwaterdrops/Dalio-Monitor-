import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
export function db(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null; // stateless mode: dashboard reads /api/live directly
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export async function saveSnapshot(snap: any) {
  const s = db(); if (!s) return { persisted: false };
  await s.from("snapshots").insert({ as_of: snap.asOf, payload: snap });
  for (const trig of snap.triggers ?? []) {
    // fire-once semantics: skip if same trigger key fired in last 7 days
    const { data } = await s.from("alerts").select("id").eq("trigger_key", trig.key)
      .gte("fired_at", new Date(Date.now() - 7 * 864e5).toISOString()).limit(1);
    if (!data?.length) await s.from("alerts").insert({ trigger_key: trig.key, tier: trig.tier, payload: trig });
  }
  return { persisted: true };
}

export async function latestSnapshot() {
  const s = db(); if (!s) return null;
  const { data } = await s.from("snapshots").select("payload").order("as_of", { ascending: false }).limit(1);
  return data?.[0]?.payload ?? null;
}

export async function recentAlerts(n = 20) {
  const s = db(); if (!s) return [];
  const { data } = await s.from("alerts").select("*").order("fired_at", { ascending: false }).limit(n);
  return data ?? [];
}

/** Curated inputs for series with no API (hyperscaler coverage, rollover share, Japan TIC until pinned). */
export async function getManual(key: string): Promise<{ value: number; enteredAt: string; stale: boolean } | null> {
  const s = db(); if (!s) return null;
  const { data } = await s.from("manual_inputs").select("*").eq("key", key)
    .order("entered_at", { ascending: false }).limit(1);
  if (!data?.length) return null;
  const row = data[0];
  const stale = Date.now() - new Date(row.entered_at).getTime() > 90 * 864e5;
  return { value: Number(row.value), enteredAt: row.entered_at, stale };
}

/**
 * Optional narrative layer: turn a snapshot diff into two paragraphs of
 * analyst prose using the user's own ANTHROPIC_API_KEY. Off unless set.
 */
export async function narrate(snap: any, prev: any): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{
        role: "user",
        content:
`You are the monitoring layer of a Dalio big-debt-cycle framework. Previous factor states: ${JSON.stringify(prev?.factors ?? {})}. New factor states: ${JSON.stringify(snap.factors)}. New triggers: ${JSON.stringify(snap.triggers)}. In <=2 short paragraphs, state ONLY what changed and what it means for (a) small-cycle phase, (b) the Top->Deleveraging boundary. No preamble.`,
      }],
    }),
  });
  if (!r.ok) return null;
  const d = await r.json();
  return (d.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n") || null;
}
