import episodesData from "@/lib/playbook/episodes.json";
import returnsData from "@/lib/playbook/returns.json";
import AnalogCard from "./AnalogCard";

interface LeaderboardEntry {
  id: string;
  name: string;
  tier: string;
  score: number;
  band: "strong" | "moderate" | "weak" | string;
}

const BAND_LABEL: Record<string, string> = {
  strong: "STRONG RHYME",
  moderate: "MODERATE RHYME",
  weak: "WEAK RHYME",
};
const BAND_COLOR: Record<string, string> = {
  strong: "var(--red)",
  moderate: "var(--amber)",
  weak: "var(--text-faint)",
};

const CORE_ASSETS = ["spx", "gold", "bond10", "cash"] as const;

/** Winner among the four core assets on h12 nominal for one episode's primary anchor. */
function h12Winner(episodeId: string, anchorMonth: string): string | null {
  const horizons = (returnsData as any).episodes?.[episodeId]?.anchors?.[anchorMonth]?.horizons?.h12;
  if (!horizons) return null;
  let best: string | null = null;
  let bestVal = -Infinity;
  for (const key of CORE_ASSETS) {
    const v = horizons[key]?.nominal;
    if (typeof v === "number" && Number.isFinite(v) && v > bestVal) {
      bestVal = v;
      best = key;
    }
  }
  return best;
}

function assetLabel(key: string): string {
  const asset = ((returnsData as any).assets ?? []).find((a: any) => a.key === key);
  return asset?.label ?? key;
}

function ConsensusLine({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length < 2) return null;
  const episodeById = new Map((episodesData as any[]).map(e => [e.id, e]));
  const winners = entries.map(e => {
    const ep = episodeById.get(e.id);
    return ep ? h12Winner(e.id, ep.anchorMonth) : null;
  });
  const valid = winners.filter((w): w is string => w != null);
  const mode = valid[0] ?? null;
  const unanimous = mode != null && valid.length === entries.length && valid.every(w => w === mode);

  if (unanimous) {
    return (
      <div className="leaderboard-consensus">
        {entries.length} of {entries.length} top analogs share the same 12-month winner: {assetLabel(mode!)}
      </div>
    );
  }
  return (
    <div className="leaderboard-consensus leaderboard-consensus-dispersion">
      Top analogs disagree on the 12-month winner — dispersion is the finding.
    </div>
  );
}

function LeaderboardRow({ entry, rank, dimmed }: { entry: LeaderboardEntry; rank: number; dimmed?: boolean }) {
  const bandColor = BAND_COLOR[entry.band] ?? "var(--text-faint)";
  const row = (
    <div className="leaderboard-row-head">
      <span className="leaderboard-rank">{rank}</span>
      <span className="leaderboard-name">{entry.name}</span>
      <span className="leaderboard-chips">
        {entry.tier === "coarse" && <span className="leaderboard-chip leaderboard-chip-coarse">COARSE MATCH</span>}
        <span className="leaderboard-chip" style={{ color: bandColor, borderColor: `color-mix(in srgb, ${bandColor} 35%, transparent)`, background: `color-mix(in srgb, ${bandColor} 8%, transparent)` }}>
          {BAND_LABEL[entry.band] ?? entry.band.toUpperCase()}
        </span>
      </span>
    </div>
  );

  if (dimmed) {
    return (
      <div className="leaderboard-row leaderboard-row-weak" key={entry.id}>
        {row}
      </div>
    );
  }

  return (
    <details className="leaderboard-row" key={entry.id}>
      <summary className="leaderboard-row-summary">{row}</summary>
      <div className="leaderboard-row-expanded">
        <AnalogCard episodeId={entry.id} />
      </div>
    </details>
  );
}

export default function Leaderboard({ entries, limit }: { entries: LeaderboardEntry[]; limit?: number }) {
  const shown = limit != null ? entries.slice(0, limit) : entries;
  const strongOrModerate = shown.filter(e => e.band === "strong" || e.band === "moderate");
  const weak = shown.filter(e => e.band === "weak");

  return (
    <div className="leaderboard">
      <ConsensusLine entries={strongOrModerate} />
      <div className="leaderboard-rows">
        {strongOrModerate.map((entry, idx) => (
          <LeaderboardRow key={entry.id} entry={entry} rank={idx + 1} />
        ))}
      </div>
      {weak.length > 0 && (
        <>
          <div className="leaderboard-weak-divider">WEAK RHYMES</div>
          <div className="leaderboard-rows">
            {weak.map((entry, idx) => (
              <LeaderboardRow key={entry.id} entry={entry} rank={strongOrModerate.length + idx + 1} dimmed />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
