"use client";
import { useEffect, useState } from "react";

type Status = "critical" | "elevated" | "watch" | "ok";
type SourceType = "live" | "manual" | "derived" | "stale";

interface Threshold {
  value: number;
  label: string;
  direction: "above" | "below";
  current?: number | null;
}
interface SubInput {
  key: string; label: string; value: string; unit?: string;
  source: SourceType; sourceName: string; contribution: string; trendNote?: string;
  latestActual?: string;
  latestForecast?: string;
  latestPrior?: string;
  beatMiss?: string;
  beatMissDir?: "beat" | "miss" | "inline";
  threshold?: Threshold;
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

function thresholdDotColor(t: Threshold) {
  const cur = t.current;
  if (cur == null || !Number.isFinite(cur)) return "var(--text-ghost)";
  const breached = t.direction === "above" ? cur >= t.value : cur <= t.value;
  if (breached) return "var(--red)";
  const near = Math.abs(cur - t.value) <= Math.abs(t.value) * 0.1;
  return near ? "var(--amber)" : "var(--green)";
}

function ThresholdRow({ threshold }: { threshold: Threshold }) {
  return (
    <div className="threshold-row">
      <span className="threshold-tag">THRESHOLD</span>
      <span className="threshold-sep">──</span>
      <span className="threshold-label">{threshold.label}</span>
      <span className="threshold-sep">──</span>
      <span className="threshold-dot" style={{ background: thresholdDotColor(threshold) }} />
    </div>
  );
}

function SubInputCard({ sub, borderColor }: { sub: SubInput; borderColor: string }) {
  const sc = sourceColor(sub.source);
  return (
    <div className="sub-card" style={{ borderTop: `2px solid ${borderColor}` }}>
      <div className="sub-card-header">
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span className="source-badge" style={{ color: sc, borderColor: `color-mix(in srgb, ${sc} 30%, transparent)`, background: `color-mix(in srgb, ${sc} 10%, transparent)` }}>
              {sourceLabel(sub.source)}
            </span>
            <span className="source-name">{sub.sourceName}</span>
          </div>
          <div className="sub-label">{sub.label}</div>
        </div>
        <div className="sub-value-wrap">
          <div className="sub-value" style={{ color: borderColor }}>{sub.value}</div>
          {sub.unit && <div className="sub-unit">{sub.unit}</div>}
        </div>
      </div>
      {sub.latestActual != null && <AfpStrip sub={sub} />}
      {sub.threshold && <ThresholdRow threshold={sub.threshold} />}
      <div className="contrib-block">
        <div className="contrib-label">HOW THIS FEEDS THE FACTOR</div>
        <p className="contrib-text">{sub.contribution}</p>
      </div>
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
    <div className="factor-row">
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
