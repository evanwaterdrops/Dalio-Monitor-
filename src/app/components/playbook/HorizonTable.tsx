import returnsData from "@/lib/playbook/returns.json";

/**
 * 8 asset rows × 5 horizon columns, sourced directly from returns.json.
 * Server component — no toggle, no client state. Nominal is the headline
 * figure; real sits beneath in smaller muted type so both are always visible
 * at once (no "which basis am I looking at" ambiguity).
 */

const HORIZONS: { key: "h6" | "h12" | "h24" | "h60" | "h120"; label: string }[] = [
  { key: "h6", label: "6M" },
  { key: "h12", label: "1Y" },
  { key: "h24", label: "2Y" },
  { key: "h60", label: "5Y" },
  { key: "h120", label: "10Y" },
];

const fmtPct = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? null : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`;

export default function HorizonTable({ episodeId, anchor }: { episodeId: string; anchor: string }) {
  const assets: { key: string; label: string }[] = (returnsData as any).assets ?? [];
  const episode = (returnsData as any).episodes?.[episodeId];
  const anchorData = episode?.anchors?.[anchor];

  if (!anchorData) {
    return <p className="horizon-table-empty">No return data for this anchor.</p>;
  }

  return (
    <div className="horizon-table-wrap">
      <table className="horizon-table">
        <thead>
          <tr>
            <th className="horizon-table-asset-head">ASSET</th>
            {HORIZONS.map(h => (
              <th key={h.key}>{h.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {assets.map(a => (
            <tr key={a.key}>
              <td className="horizon-table-asset">{a.label}</td>
              {HORIZONS.map(h => {
                const cell = anchorData.horizons?.[h.key]?.[a.key];
                if (cell?.nonInvestable) {
                  return (
                    <td key={h.key} className="horizon-cell horizon-cell-pegged">
                      pegged
                    </td>
                  );
                }
                const nominal = fmtPct(cell?.nominal);
                if (nominal == null) {
                  return (
                    <td key={h.key} className="horizon-cell horizon-cell-na">
                      n/a
                    </td>
                  );
                }
                const real = fmtPct(cell?.real);
                return (
                  <td key={h.key} className="horizon-cell">
                    <div className="horizon-cell-nominal">{nominal}</div>
                    <div className="horizon-cell-real">{real ?? "n/a"} real</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
