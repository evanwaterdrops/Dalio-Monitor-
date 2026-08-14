import { NextResponse } from "next/server";
import { assess } from "@/lib/framework/assess";
import { latestSnapshot } from "@/lib/db";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Returns the latest persisted snapshot; if no DB (or ?fresh=1), computes live. */
export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  if (!fresh) {
    const cached = await latestSnapshot();
    if (cached) return NextResponse.json(cached);
  }
  return NextResponse.json(await assess());
}
