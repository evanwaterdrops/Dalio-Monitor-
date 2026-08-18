"use client";
/**
 * Episode path chart — the four core assets' first 24 months from an
 * episode's anchor month, indexed to 100. Client component (recharts).
 * Follows the axis/tooltip/color idiom of
 * src/app/components/charts/HeatTimeline.tsx, translated to recharts.
 */
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import returnsData from "@/lib/playbook/returns.json";

const SERIES: { key: "spx" | "gold" | "bond10" | "cash"; label: string; color: string }[] = [
  { key: "spx", label: "S&P 500", color: "var(--red)" },
  { key: "gold", label: "Gold", color: "var(--amber)" },
  { key: "bond10", label: "10Y Treasury", color: "var(--blue)" },
  { key: "cash", label: "T-bills", color: "var(--green)" },
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rc-tooltip">
      <div className="tt-head">MONTH {label}</div>
      {payload.map((p: any) => (
        <div className="tt-row" key={p.dataKey}>
          <span style={{ color: p.color }}>{SERIES.find(s => s.key === p.dataKey)?.label ?? p.dataKey}</span>
          <b>{typeof p.value === "number" ? p.value.toFixed(1) : "—"}</b>
        </div>
      ))}
    </div>
  );
}

export default function EpisodePathChart({ episodeId, anchor }: { episodeId: string; anchor: string }) {
  const anchorData = (returnsData as any).episodes?.[episodeId]?.anchors?.[anchor];
  const path24 = anchorData?.path24;
  if (!path24) return null;

  const present = SERIES.filter(s => Array.isArray(path24[s.key]) && path24[s.key].length > 0);
  if (present.length === 0) return null;

  const n = Math.max(...present.map(s => path24[s.key].length));
  const data = Array.from({ length: n }, (_, i) => {
    const row: Record<string, number | null> = { month: i };
    for (const s of present) row[s.key] = path24[s.key][i] ?? null;
    return row;
  });
  const ticks = [0, 6, 12, 18, 24].filter(t => t < n);

  return (
    <div className="episode-path-chart">
      <ResponsiveContainer width="100%" height={190}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--grid-line)" vertical={false} />
          <XAxis
            dataKey="month"
            type="number"
            domain={[0, n - 1]}
            ticks={ticks}
            tick={{ fontSize: 9, fill: "var(--text-faint)", fontFamily: "var(--mono)" }}
            axisLine={{ stroke: "var(--border-dim)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: "var(--text-faint)", fontFamily: "var(--mono)" }}
            axisLine={false}
            tickLine={false}
            width={34}
            domain={["auto", "auto"]}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} />
          {present.map(s => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={1.6}
              dot={false}
              connectNulls
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        {present.map(s => (
          <span key={s.key}><span className="chart-swatch" style={{ background: s.color }} /> {s.label.toUpperCase()}</span>
        ))}
        <span className="chart-legend-note">indexed to 100 at anchor · months 0–{n - 1}</span>
      </div>
    </div>
  );
}
