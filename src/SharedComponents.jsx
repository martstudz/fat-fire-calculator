import React from "react";

// ── PersonBlock ───────────────────────────────────────────────────────────────
// Coloured-header pill wrapping fields for one person.
// variant: "you" | "spouse" | "shared"
// When inside a PersonGroup the outer border is stripped via CSS child selector.
// open: when false, the block collapses with animation. Defaults to true.
// This keeps PersonBlock a direct child of PersonGroup so CSS selectors work.
export function PersonBlock({ name, variant = "you", open = true, children }) {
  return (
    <div className={`pe-person pe-person--${variant}${open ? "" : " pe-person--collapsed"}`}>
      <div className="pe-person__header">
        <span className="pe-person__dot" />
        {name}
      </div>
      <div className="pe-person__fields">
        {children}
      </div>
    </div>
  );
}

// ── PersonGroup ───────────────────────────────────────────────────────────────
// Outer card wrapping one or more PersonBlocks with an attached total footer.
export function PersonGroup({ totalLabel, totalValue, children }) {
  return (
    <div className="pe-person-group">
      {children}
      {totalLabel && (
        <div className="pe-person-group__total">
          <span className="pe-person-group__total-label">{totalLabel}</span>
          <span className="mono pe-person-group__total-value">{totalValue}</span>
        </div>
      )}
    </div>
  );
}
