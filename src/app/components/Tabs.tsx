"use client";
/**
 * Small Cycle / Big Cycle (/ optional Playbook) tab switcher. Hash-routed
 * (#small / #big / #playbook) so a view survives refresh and can be linked.
 * Only the active tab renders — charts must mount visible for their
 * pin-to-present scroll to apply.
 */
import { useEffect, useState } from "react";

type TabKey = "small" | "big" | "extra";

export default function Tabs({
  small,
  big,
  extra,
}: {
  small: React.ReactNode;
  big: React.ReactNode;
  extra?: { label: string; sub: string; content: React.ReactNode };
}) {
  const [tab, setTab] = useState<TabKey>("small");

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash;
      if (h === "#big") setTab("big");
      else if (h === "#playbook" && extra) setTab("extra");
      else setTab("small");
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [extra]);

  const pick = (t: TabKey, hash: string) => {
    setTab(t);
    history.replaceState(null, "", `#${hash}`);
  };

  return (
    <div>
      <div className="cycle-tabs" role="tablist" aria-label="Cycle horizon">
        <button role="tab" aria-selected={tab === "small"} className={`cycle-tab${tab === "small" ? " active" : ""}`} onClick={() => pick("small", "small")}>
          SMALL CYCLE
          <span className="cycle-tab-sub">labor · inflation · interest rates</span>
        </button>
        <button role="tab" aria-selected={tab === "big"} className={`cycle-tab${tab === "big" ? " active" : ""}`} onClick={() => pick("big", "big")}>
          BIG CYCLE
          <span className="cycle-tab-sub">sovereign stations · century context</span>
        </button>
        {extra && (
          <button role="tab" aria-selected={tab === "extra"} className={`cycle-tab${tab === "extra" ? " active" : ""}`} onClick={() => pick("extra", "playbook")}>
            {extra.label}
            <span className="cycle-tab-sub">{extra.sub}</span>
          </button>
        )}
      </div>
      {tab === "small" ? small : tab === "big" ? big : extra?.content}
    </div>
  );
}
