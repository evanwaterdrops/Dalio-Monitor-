"use client";
/**
 * Small Cycle / Big Cycle (/ any number of extra tabs, e.g. Playbook,
 * Archetype) tab switcher. Hash-routed (#small / #big / #<extra.key>) so a
 * view survives refresh and can be linked. Only the active tab renders —
 * charts must mount visible for their pin-to-present scroll to apply.
 */
import { useEffect, useState } from "react";

export interface ExtraTab { key: string; label: string; sub: string; content: React.ReactNode }

export default function Tabs({
  small,
  big,
  extras,
}: {
  small: React.ReactNode;
  big: React.ReactNode;
  extras?: ExtraTab[];
}) {
  const [tab, setTab] = useState<string>("small");

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace("#", "");
      if (h === "big") setTab("big");
      else if (extras?.some(e => e.key === h)) setTab(h);
      else setTab("small");
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [extras]);

  const pick = (t: string) => {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
  };

  const active = tab === "small" ? small : tab === "big" ? big : extras?.find(e => e.key === tab)?.content;

  return (
    <div>
      <div className="cycle-tabs" role="tablist" aria-label="Cycle horizon">
        <button role="tab" aria-selected={tab === "small"} className={`cycle-tab${tab === "small" ? " active" : ""}`} onClick={() => pick("small")}>
          SMALL CYCLE
          <span className="cycle-tab-sub">labor · inflation · interest rates</span>
        </button>
        <button role="tab" aria-selected={tab === "big"} className={`cycle-tab${tab === "big" ? " active" : ""}`} onClick={() => pick("big")}>
          BIG CYCLE
          <span className="cycle-tab-sub">sovereign legs · century context</span>
        </button>
        {extras?.map(e => (
          <button key={e.key} role="tab" aria-selected={tab === e.key} className={`cycle-tab${tab === e.key ? " active" : ""}`} onClick={() => pick(e.key)}>
            {e.label}
            <span className="cycle-tab-sub">{e.sub}</span>
          </button>
        ))}
      </div>
      {active}
    </div>
  );
}
