"use client";
import { useEffect, useState } from "react";

type Status = "critical" | "elevated" | "watch" | "ok";
type SourceType = "live" | "manual" | "derived" | "stale";

interface Print { period: string; value: number }
interface Threshold {
  value: number;
  label: string;
  direction: "above" | "below";
  current?: number | null;
}
interface SubInput {
  key: string; label: string; value: string; unit?: string;
  source: SourceType; sourceName: string; contribution: string; trendNote?: string;
  sourceUrl?: string;
  latestActual?: string;
  latestForecast?: string;
  latestPrior?: string;
  beatMiss?: string;
  beatMissDir?: "beat" | "miss" | "inline";
  momDelta?: string;
  momDir?: "up" | "down" | "flat";
  prints?: Print[];
  printUnit?: string;
  printThreshold?: number;
  threshold?: Threshold;
  alsoFeeds?: string[];
}
interface FactorData {
  key: string; name: string; station: string; status: Status;
  headline: string; logic: string; subInputs: SubInput[];
}

function statusColor(s: Status) {
  if (s === "critical") return "var(--red)";
  if (s === "elevated") return "var(--amber)";
  if (s === "watch") return "var(--blue)";
  return "var(--green)";
}
function statusLabel(s: Status) {
  if (s === "critical") return "CRITICAL";
  if (s === "elevated") return "ELEVATED";
  if (s === "watch") return "WATCH";
  return "OK";
}
function sourceColor(t: SourceType) {
  if (t === "live") return "var(--green)";
  if (t === "manual") return "var(--amber)";
  if (t === "derived") return "var(--purple)";
  return "var(--red)";
}
function sourceLabel(t: SourceType) {
  if (t === "live") return "LIVE";
  if (t === "manual") return "MANUAL";
  if (t === "derived") return "DERIVED";
  return "STALE";
}

function StatusChip({ status }: { status: Status }) {
  const c = statusColor(status);
  return (
    <span
      className={`status-chip${status === "critical" ? " critical-pulse" : ""}`}
      style={{ color: c, borderColor: c, background: `color-mix(in srgb, ${c} 8%, transparent)` }}
    >
      {statusLabel(status)}
    </span>
  );
}

function deltaColor(dir?: "beat" | "miss" | "inline") {
  if (dir === "beat") return "var(--green)";
  if (dir === "miss") return "var(--red)";
  return "var(--text-muted)";
}

function AfpStrip({ sub }: { sub: SubInput }) {
  return (
    <div className="afp-strip">
      <div className="afp-cell">
        <div className="afp-label">ACTUAL</div>
        <div className="afp-value">{sub.latestActual ?? "—"}</div>
      </div>
      <div className="afp-cell">
        <div className="afp-label">FORECAST</div>
        <div className="afp-value">{sub.latestForecast ?? "—"}</div>
      </div>
      <div className="afp-cell">
        <div className="afp-label">PRIOR</div>
        <div className="afp-value">{sub.latestPrior ?? "—"}</div>
      </div>
      <div className="afp-cell">
        <div className="afp-label">VS FCST</div>
        <div className="afp-delta" style={{ color: deltaColor(sub.beatMissDir) }}>
          {sub.beatMiss ?? "—"}
          {sub.beatMissDir && sub.beatMissDir !== "inline" ? ` ${sub.beatMissDir.toUpperCase()}` : ""}
        </div>
      </div>
    </div>
  );
}

/**
 * Mini print history. Zero-anchored bars for flow/rate series; if the series
 * lives far from zero (market prices), a truncated-baseline bar would lie, so
 * it switches to a position-encoded line + dots. Latest print is emphasised
 * and direct-labeled; every mark carries a native tooltip.
 */
function PrintChart({ prints, unit = "", threshold }: { prints: Print[]; unit?: string; threshold?: number }) {
  const W = 300, H = 80, top = 16, bottom = 13, left = 2;
  const right = threshold != null ? 36 : 2;
  const plotW = W - left - right, plotH = H - top - bottom;
  const vals = prints.map(p => p.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const useLine = minV > 0 && maxV - minV < 0.25 * maxV;
  let lo = useLine ? minV : Math.min(0, minV);
  let hi = useLine ? maxV : Math.max(0, maxV);
  if (threshold != null) { lo = Math.min(lo, threshold); hi = Math.max(hi, threshold); }
  if (hi === lo) { hi += 1; lo -= 1; }
  const span = hi - lo;
  lo -= span * 0.08; hi += span * 0.08;
  const y = (v: number) => top + ((hi - v) / (hi - lo)) * plotH;
  const n = prints.length;
  const step = plotW / n;
  const bw = Math.min(26, Math.max(4, step - 3));
  const cx = (k: number) => left + step * k + step / 2;
  const lastIdx = n - 1;
  const lastVal = prints[lastIdx].value;
  const fmtV = (v: number) => `${v}${unit}`;

  return (
    <div className="print-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Recent prints, latest ${fmtV(lastVal)}`}>
        {!useLine && lo < 0 && hi > 0 && (
          <line x1={left} x2={W - right} y1={y(0)} y2={y(0)} stroke="var(--border)" strokeWidth={1} />
        )}
        {threshold != null && (
          <>
            <line x1={left} x2={W - right + 4} y1={y(threshold)} y2={y(threshold)}
              stroke="var(--amber)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
            <text x={W - 2} y={y(threshold) + 3} textAnchor="end" fontSize={8}
              fontFamily="var(--mono)" fill="var(--amber)">{fmtV(threshold)}</text>
          </>
        )}
        {useLine ? (
          <>
            <path
              d={prints.map((p, k) => `${k === 0 ? "M" : "L"}${cx(k)},${y(p.value)}`).join(" ")}
              fill="none" stroke="var(--text-faint)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
            />
            {prints.map((p, k) => (
              <g key={p.period + k}>
                <title>{`${p.period}: ${fmtV(p.value)}`}</title>
                <circle cx={cx(k)} cy={y(p.value)} r={k === lastIdx ? 3.5 : 2.5}
                  fill={k === lastIdx ? "var(--text-dim)" : "var(--text-faint)"} stroke="var(--surface)" strokeWidth={1} />
              </g>
            ))}
          </>
        ) : (
          prints.map((p, k) => {
            const yv = y(p.value), y0 = y(0);
            const rectY = Math.min(yv, y0), h = Math.max(1.5, Math.abs(yv - y0));
            return (
              <g key={p.period + k}>
                <title>{`${p.period}: ${fmtV(p.value)}`}</title>
                <rect x={left + step * k + (step - bw) / 2} y={rectY} width={bw} height={h} rx={2}
                  fill={k === lastIdx ? "var(--text-dim)" : "var(--text-faint)"} opacity={k === lastIdx ? 1 : 0.75} />
              </g>
            );
          })
        )}
        <text x={cx(lastIdx)} y={(useLine || lastVal >= 0 ? y(Math.max(lastVal, useLine ? lastVal : 0)) : y(0)) - 5}
          textAnchor="middle" fontSize={9} fontWeight={600} fontFamily="var(--mono)" fill="var(--text-dim)">
          {fmtV(lastVal)}
        </text>
        <text x={left} y={H - 2} fontSize={8} fontFamily="var(--mono)" fill="var(--text-ghost)">{prints[0].period}</text>
        <text x={W - right} y={H - 2} textAnchor="end" fontSize={8} fontFamily="var(--mono)" fill="var(--text-ghost)">
          {prints[lastIdx].period}
        </text>
      </svg>
    </div>
  );
}

function ThresholdGauge({ threshold }: { threshold: Threshold }) {
  const { value, label, direction, current } = threshold;
  const has = current != null && Number.isFinite(current);
  const c = has ? (current as number) : 0;
  const breached = has && (direction === "above" ? c >= value : c <= value);
  let pct: number | null = null;
  if (has) {
    pct = direction === "above" ? (value !== 0 ? c / value : null) : (c !== 0 ? value / c : null);
    if (pct != null) pct = Math.max(0, Math.min(1, pct));
  }
  const color = !has ? "var(--text-ghost)" : breached ? "var(--red)" : (pct ?? 0) >= 0.85 ? "var(--amber)" : "var(--green)";
  const dist = has ? Math.abs(value - c) : null;
  const distStr = dist == null ? null : dist >= 10 ? dist.toFixed(0) : String(Math.round(dist * 100) / 100);
  return (
    <div className="gauge-row">
      <div className="gauge-head">
        <span className="threshold-tag">THRESHOLD</span>
        <span className="threshold-label">{label}</span>
      </div>
      <div className="gauge-track">
        <div className="gauge-fill" style={{ width: `${breached ? 100 : Math.max(2, (pct ?? 0) * 100)}%`, background: color }} />
      </div>
      <div className="gauge-meta">
        <span style={breached ? { color: "var(--red)", fontWeight: 600 } : undefined}>
          {!has ? "NO DATA" : breached ? "BREACHED" : `${Math.round((pct ?? 0) * 100)}% OF THRESHOLD`}
        </span>
        <span>{!has || distStr == null ? "" : breached ? `${distStr} past the line` : `${distStr} to the line`}</span>
      </div>
    </div>
  );
}

function SubInputCard({ sub, borderColor }: { sub: SubInput; borderColor: string }) {
  const sc = sourceColor(sub.source);
  const jumpTo = (key: string) => document.getElementById(`factor-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  return (
    <div className="sub-card" style={{ borderTop: `2px solid ${borderColor}` }}>
      <div className="sub-card-header">
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span className="source-badge" style={{ color: sc, borderColor: `color-mix(in srgb, ${sc} 30%, transparent)`, background: `color-mix(in srgb, ${sc} 10%, transparent)` }}>
              {sourceLabel(sub.source)}
            </span>
            {sub.sourceUrl ? (
              <a className="source-name source-link" href={sub.sourceUrl} target="_blank" rel="noreferrer">{sub.sourceName} ↗</a>
            ) : (
              <span className="source-name">{sub.sourceName}</span>
            )}
          </div>
          <div className="sub-label">{sub.label}</div>
        </div>
        <div className="sub-value-wrap">
          <div className="sub-value" style={{ color: borderColor }}>{sub.value}</div>
          {sub.unit && <div className="sub-unit">{sub.unit}</div>}
          {sub.momDelta && (
            <div className="mom-delta">
              {sub.momDir === "up" ? "▲" : sub.momDir === "down" ? "▼" : "◆"} {sub.momDelta} m/m
            </div>
          )}
        </div>
      </div>
      {sub.latestActual != null && <AfpStrip sub={sub} />}
      {sub.prints && sub.prints.length >= 2 && (
        <PrintChart prints={sub.prints} unit={sub.printUnit} threshold={sub.printThreshold} />
      )}
      {sub.threshold && <ThresholdGauge threshold={sub.threshold} />}
      <div className="contrib-block">
        <div className="contrib-label">HOW THIS FEEDS THE FACTOR</div>
        <p className="contrib-text">{sub.contribution}</p>
      </div>
      {sub.alsoFeeds && sub.alsoFeeds.length > 0 && (
        <div className="also-feeds">
          <span className="also-feeds-label">ALSO FEEDS</span>
          {sub.alsoFeeds.map(k => (
            <span key={k} className="also-feeds-link" onClick={() => jumpTo(k)}>{k}</span>
          ))}
        </div>
      )}
      {sub.trendNote && <div className="trend-note">{sub.trendNote}</div>}
    </div>
  );
}

function FactorRow({ factor, bulk }: { factor: FactorData; bulk: { mode: boolean; seq: number } }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (bulk.seq > 0) setExpanded(bulk.mode);
  }, [bulk]);
  const color = statusColor(factor.status);
  return (
    <div className="factor-row" id={`factor-${factor.key}`}>
      <div className="factor-row-summary" style={{ background: expanded ? "var(--panel)" : "var(--surface)" }}
        onClick={() => setExpanded(v => !v)} role="button" aria-expanded={expanded}>
        <span className="factor-key" style={{ color: expanded ? color : "var(--text-ghost)" }}>{factor.key}</span>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span className="factor-name">{factor.name}</span>
            <span className="factor-station">· {factor.station}</span>
            <span className="factor-count">{factor.subInputs.length} inputs</span>
          </div>
          <span className="factor-headline">{factor.headline}</span>
        </div>
        <div className="factor-sub-counts" />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatusChip status={factor.status} />
          <svg width={12} height={12} viewBox="0 0 12 12" className={`factor-chevron${expanded ? " open" : ""}`}>
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      {expanded && (
        <div className="factor-expanded">
          <div className="logic-block" style={{ borderLeft: `3px solid color-mix(in srgb, ${color} 40%, transparent)` }}>
            <div className="logic-label">AGGREGATION LOGIC</div>
            <p className="logic-text">{factor.logic}</p>
          </div>
          <div className="subcomponents-grid">
            {factor.subInputs.map(sub => <SubInputCard key={sub.key} sub={sub} borderColor={color} />)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FactorBoard({ factors }: { factors: FactorData[] }) {
  const [bulk, setBulk] = useState<{ mode: boolean; seq: number }>({ mode: false, seq: 0 });
  return (
    <div>
      <div className="board-controls">
        <span className="board-control" onClick={() => setBulk(b => ({ mode: true, seq: b.seq + 1 }))}>EXPAND ALL</span>
        <span className="board-control-sep">·</span>
        <span className="board-control" onClick={() => setBulk(b => ({ mode: false, seq: b.seq + 1 }))}>COLLAPSE ALL</span>
      </div>
      <div className="factor-board">
        {factors.map(f => <FactorRow key={f.key} factor={f} bulk={bulk} />)}
      </div>
    </div>
  );
}
