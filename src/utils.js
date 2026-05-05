// ── Shared formatting utilities ───────────────────────────────────────────────
// Single source of truth — imported by Dashboard, PlanEditor, FatFireCalculator.

export const MASK = "••••••";

/** "$1,234,567" — or masked, or "—" for non-finite values */
export function fmt$(n, hidden) {
  if (hidden) return MASK;
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.round(n));
  return sign + "$" + abs.toLocaleString("en-CA");
}

/** Abbreviated: "$1.2M", "$450k", "$12" */
export function fmtK(n, hidden) {
  if (hidden) return "••••";
  if (!isFinite(n) || n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n < 0 ? "−" : "") + "$" + (abs / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000)     return (n < 0 ? "−" : "") + "$" + Math.round(abs / 1_000) + "k";
  return "$" + Math.round(n).toLocaleString("en-CA");
}

/** Comma-formatted integer string, empty for null/non-finite */
export function formatCommas(n) {
  if (n == null || n === "" || !isFinite(n)) return "";
  return Math.round(n).toLocaleString("en-CA");
}
