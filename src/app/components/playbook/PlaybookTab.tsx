import episodesData from "@/lib/playbook/episodes.json";
import themesData from "@/lib/playbook/themes.json";
import returnsData from "@/lib/playbook/returns.json";
import Leaderboard from "./Leaderboard";
import ThemeCard from "./ThemeCard";
import EpisodePathChart from "./EpisodePathChart";

/**
 * PLAYBOOK tab — the full A/B "tab" composition: complete leaderboard
 * (weak tail dimmed, not truncated), episode path charts for the top
 * strong/moderate analogs, and every theme rhyme in full.
 */
export default function PlaybookTab({ playbook }: { playbook: any }) {
  if (!playbook?.leaderboard?.length) {
    return (
      <section className="section">
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>No playbook data in this snapshot.</p>
      </section>
    );
  }

  const episodeById = new Map((episodesData as any[]).map(e => [e.id, e]));
  const themeById = new Map((themesData as any[]).map(t => [t.id, t]));

  const hasPath24 = (episodeId: string, anchorMonth: string) => {
    const p = (returnsData as any).episodes?.[episodeId]?.anchors?.[anchorMonth]?.path24;
    return p != null && Object.keys(p).length > 0;
  };

  const pathEntries = (playbook.leaderboard as any[])
    .filter(e => e.band === "strong" || e.band === "moderate")
    .map(e => ({ entry: e, episode: episodeById.get(e.id) }))
    .filter((x): x is { entry: any; episode: any } => !!x.episode && hasPath24(x.entry.id, x.episode.anchorMonth))
    .slice(0, 5);

  const snapThemes: any[] = playbook.themes ?? [];

  return (
    <>
      <section className="section">
        <div className="section-header">
          <span className="section-title">CYCLE ANALOGS (MEASURED)</span>
          <span className="section-rule" />
          <span className="section-count" style={{ color: "var(--text-faint)" }}>
            {playbook.leaderboard.length} EPISODES · CLICK TO EXPAND
          </span>
        </div>
        <Leaderboard entries={playbook.leaderboard} />
      </section>

      {pathEntries.length > 0 && (
        <section className="section">
          <div className="section-header">
            <span className="section-title">EPISODE PATHS — FIRST 24 MONTHS</span>
            <span className="section-rule" />
            <span className="section-count" style={{ color: "var(--text-faint)" }}>INDEXED TO 100 AT ANCHOR</span>
          </div>
          <div className="playbook-paths-grid">
            {pathEntries.map(({ entry, episode }) => (
              <div className="chart-block" key={entry.id}>
                <div className="chart-panel-title">{episode.name.toUpperCase()} · {episode.dateRange}</div>
                <EpisodePathChart episodeId={entry.id} anchor={episode.anchorMonth} />
              </div>
            ))}
          </div>
        </section>
      )}

      {snapThemes.length > 0 && (
        <section className="section">
          <div className="section-header">
            <span className="section-title">THEME RHYMES (ASSERTED)</span>
            <span className="section-rule" />
            <span className="section-count" style={{ color: "var(--text-faint)" }}>
              {snapThemes.length} THEME{snapThemes.length !== 1 ? "S" : ""}
            </span>
          </div>
          <div className="playbook-themes-stack">
            {snapThemes.map(st => {
              const theme = themeById.get(st.id);
              if (!theme) return null;
              return (
                <div className="chart-block" key={st.id}>
                  <ThemeCard theme={theme} snapTheme={st} />
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
