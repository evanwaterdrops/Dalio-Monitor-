"use client";
/**
 * Small Cycle / Big Cycle tab switcher. Hash-routed (#small / #big) so a
 * view survives refresh and can be linked. Only the active tab renders —
 * charts must mount visible for their pin-to-present scroll to apply.
 */
import { useEffect, useState } from "react";

export default function Tabs({ small, big }: { small: React.ReactNode; big: React.ReactNode }) {
  const [tab, setTab] = useState<"small" | "big">("small");

  useEffect(() => {
    const fromHash = () => setTab(window.location.hash === "#big" ? "big" : "small");
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const pick = (t: "small" | "big") => {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
  };

  return (
    <div>
      <div className="cycle-tabs" role="tablist" aria-label="Cycle horizon">
        <button role="tab" aria-selected={tab === "small"} className={`cycle-tab${tab === "small" ? " active" : ""}`} onClick={() => pick("small")}>
          SMALL CYCLE
          <span className="cycle-tab-sub">labor · inflation · price of money</span>
        </button>
        <button role="tab" aria-selected={tab === "big"} className={`cycle-tab${tab === "big" ? " active" : ""}`} onClick={() => pick("big")}>
          BIG CYCLE
          <span className="cycle-tab-sub">sovereign stations · century context</span>
        </button>
      </div>
      {tab === "small" ? small : big}
    </div>
  );
}
