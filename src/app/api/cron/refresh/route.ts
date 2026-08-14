import { NextResponse } from "next/server";
import { assess } from "@/lib/framework/assess";
import { saveSnapshot, latestSnapshot, narrate, db } from "@/lib/db";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Accepts Vercel Cron (Authorization: Bearer CRON_SECRET) or x-cron-secret header (GitHub Actions booster). */
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // pre-config convenience; set CRON_SECRET in prod
  const h = req.headers;
  return h.get("authorization") === `Bearer ${secret}` || h.get("x-cron-secret") === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const prev = await latestSnapshot();
  const snap = await assess();
  const note = await narrate(snap, prev).catch(() => null);
  if (note) (snap as any).narrative = note;
  const { persisted } = await saveSnapshot(snap);
  if (snap.triggers.length && db()) {
    // Alert delivery beyond the dashboard (email/Slack) = roadmap; rows are in `alerts`.
  }
  return NextResponse.json({ ok: true, persisted, triggers: snap.triggers.length, problems: snap.problems });
}
