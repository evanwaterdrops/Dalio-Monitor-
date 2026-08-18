/** Live tripwire evaluation. Only tripwires with live:true are computed;
 *  the rest render as manual watch items. */
export function evalTripwires(theme, { hyOasBp = null, hyOasDelta3mBp = null }) {
  return theme.tripwires.map(t => {
    if (!t.live) return { id: t.id, state: "armed", detail: "manual watch — flip in themes.json when observed" };
    if (t.id === "hy_transmission") {
      if (hyOasBp == null) return { id: t.id, state: "stale", detail: "HY OAS unavailable this run" };
      const fired = hyOasBp > 450 && (hyOasDelta3mBp ?? 0) > 0;
      return { id: t.id, state: fired ? "fired" : "armed", detail: `HY OAS ${Math.round(hyOasBp)}bp vs 450bp line · 3m ${hyOasDelta3mBp == null ? "—" : Math.round(hyOasDelta3mBp) + "bp"}` };
    }
    return { id: t.id, state: "armed", detail: "" };
  });
}
