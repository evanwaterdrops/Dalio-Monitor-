import HorizonTable from "./HorizonTable";

interface ChecklistItem { id: string; label: string; state: "matched" | "partial" | "notObserved" | string; note?: string }
interface Tripwire { id: string; label: string; threshold: string; live?: boolean; note?: string }
interface SnapTripwire { id: string; state: "fired" | "armed" | "stale" | string; detail: string }
interface Figure { text: string; flag: "verified" | "unverified" | "corrected" | string }
interface Parallel { name: string; returnsKey?: string; anchorMonth?: string }

const CHECKLIST_MARK: Record<string, string> = { matched: "✓", partial: "◐", notObserved: "○" };
const CHECKLIST_COLOR: Record<string, string> = {
  matched: "var(--green)", partial: "var(--amber)", notObserved: "var(--text-ghost)",
};
const TRIPWIRE_COLOR: Record<string, string> = {
  fired: "var(--red)", armed: "var(--text-muted)", stale: "var(--amber)",
};

export default function ThemeCard({
  theme,
  snapTheme,
}: {
  theme: any;
  snapTheme?: { tripwires: SnapTripwire[] };
}) {
  const checklist: ChecklistItem[] = theme.checklist ?? [];
  const tripwires: Tripwire[] = theme.tripwires ?? [];
  const figures: Figure[] = theme.figures ?? [];
  const parallels: Parallel[] = theme.historicalParallels ?? [];

  const liveTripwire = (id: string) => snapTheme?.tripwires?.find(t => t.id === id);

  return (
    <div className="theme-card">
      <div className="theme-card-header">
        <span className="theme-card-chip">THEME — ASSERTED, NOT MEASURED</span>
        <span className="theme-card-name">{theme.name}</span>
      </div>
      {theme.positionLabel && <p className="theme-position">{theme.positionLabel}</p>}

      {checklist.length > 0 && (
        <div className="theme-checklist">
          {checklist.map(item => (
            <div className="theme-checklist-item" key={item.id}>
              <span className="theme-checklist-marker" style={{ color: CHECKLIST_COLOR[item.state] ?? "var(--text-ghost)" }}>
                {CHECKLIST_MARK[item.state] ?? "○"}
              </span>
              <div>
                <div className="theme-checklist-label">{item.label}</div>
                {item.note && <div className="theme-checklist-note">{item.note}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tripwires.length > 0 && (
        <div className="theme-tripwires">
          <div className="theme-tripwires-label">TRIPWIRES</div>
          {tripwires.map(tw => {
            const live = liveTripwire(tw.id);
            const state = live?.state ?? "armed";
            const detail = live?.detail || tw.threshold;
            const color = TRIPWIRE_COLOR[state] ?? "var(--text-muted)";
            return (
              <div className="tripwire-row" key={tw.id} style={{ borderLeft: `2px solid ${color}` }}>
                <div className="tripwire-row-head">
                  <span className="tripwire-label">{tw.label}</span>
                  <span className="tripwire-state" style={{ color }}>{state.toUpperCase()}</span>
                </div>
                <div className="tripwire-detail">{detail}</div>
              </div>
            );
          })}
        </div>
      )}

      {parallels.length > 0 && (
        <div className="theme-parallels">
          <div className="theme-parallels-label">HISTORICAL PARALLELS</div>
          {parallels.map((p, idx) => (
            <div className="parallel-item" key={`${p.name}-${idx}`}>
              <div className="parallel-item-name">{p.name}</div>
              {p.returnsKey && p.anchorMonth && (
                <HorizonTable episodeId={p.returnsKey} anchor={p.anchorMonth} />
              )}
            </div>
          ))}
        </div>
      )}

      {figures.length > 0 && (
        <div className="theme-figures">
          <div className="theme-figures-label">FIGURES</div>
          {figures.map((fig, idx) => (
            <div className={`figure-item${fig.flag === "unverified" ? " figure-item-dim" : ""}`} key={idx}>
              {fig.flag === "unverified" && <span className="figure-flag-tag">unverified</span>}
              <span className="figure-item-text">{fig.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
