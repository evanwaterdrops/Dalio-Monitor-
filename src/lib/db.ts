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
 * Rendered by the dashboard as the "WHAT CHANGED" band above the tabs.
 */
const NARRATIVE_SYSTEM = `You are the monitoring layer of a Dalio big-debt-cycle framework, writing the "what changed" note that sits at the top of an instrument dashboard for one reader: a quant who already knows the framework.

Write exactly two paragraphs, each opening with a bold-free label:
"Small cycle — " for the first (labour, inflation, the price of money), and
"Top → Deleveraging boundary — " for the second (the sovereign stations: r vs g, interest/receipts, debt demand, store-of-value flight).

Rules:
- State only what moved and what it means. No preamble, no restating the framework, no advice.
- Cite the numbers that carry the claim, and say when a factor did NOT move ("unchanged this run") rather than padding.
- Every number you use must come from the data given to you. Never estimate or infer a figure that is not there.
- Any trigger in the new snapshot that was not in the previous one is the lede of its paragraph.
- Plain prose, no markdown, no bullet points, no headings. Roughly 90 words per paragraph.`;

export async function narrate(snap: any, prev: any): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  // Only the fields the note is allowed to talk about — keeps the model from
  // inventing figures out of the deep history arrays the snapshot also carries.
  const readings = (s: any) => s && {
    asOf: s.asOf,
    stage: s.stage,
    // factors is included wholesale, so the new fast-clock factors (money, curve,
    // equity, bdc, premise) flow through automatically alongside the existing ones.
    factors: s.factors,
    triggers: s.triggers,
    inputs: Object.fromEntries(
      Object.entries(s.inputs ?? {}).filter(([, v]) => typeof v === "number"),
    ),
    // slow clock: position layer, clock score only — never the revised inputs it's
    // built from (position.inputs), keeping the narrative model on the same
    // fast/slow separation the framework enforces (spec §2).
    position: s.position ? { clock: s.position.clock } : null,
    playbookLeaderboard: s.playbook?.leaderboard?.map((r: any) => `${r.id}:${r.band}`).join(",") ?? null,
  };

  const msg = await client.beta.messages.create({
    model: "claude-opus-5",
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: NARRATIVE_SYSTEM,
    messages: [{
      role: "user",
      content: prev
        ? `Previous run:\n${JSON.stringify(readings(prev))}\n\nThis run:\n${JSON.stringify(readings(snap))}\n\nWrite the note.`
        : `First run — there is no prior snapshot to diff against, so describe where the cycle stands rather than what changed, in the same two-paragraph shape.\n\nThis run:\n${JSON.stringify(readings(snap))}`,
    }],
  });

  if (msg.stop_reason === "refusal") return null;
  const text = msg.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n")
    .trim();
  return text || null;
}
