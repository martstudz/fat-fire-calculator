import React from "react";
import { fmt$, fmtK } from "./utils";

// ── Catmull-Rom spline → cubic bezier ─────────────────────────────────────────

function smoothPath(pts, { anchorLast = false } = {}) {
  if (pts.length < 2) return "";
  if (pts.length === 2) {
    return `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)} L ${pts[1][0].toFixed(1)} ${pts[1][1].toFixed(1)}`;
  }
  const maxPts = 40;
  let sampled = pts;
  if (pts.length > maxPts) {
    // Always include the last point when anchorLast is set (used for accum phase to pin retirement peak)
    const interior = maxPts - (anchorLast ? 1 : 0);
    sampled = [];
    for (let i = 0; i < interior; i++) {
      const idx = Math.round((i / (interior - 1)) * (pts.length - (anchorLast ? 2 : 1)));
      sampled.push(pts[idx]);
    }
    if (anchorLast) sampled.push(pts[pts.length - 1]);
  }
  const tension = 0.2;
  const n = sampled.length;
  let d = `M ${sampled[0][0].toFixed(1)} ${sampled[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = i === 0     ? sampled[0]     : sampled[i - 1];
    const p1 = sampled[i];
    const p2 = sampled[i + 1];
    const p3 = i === n - 2 ? sampled[n - 1] : sampled[i + 2];
    const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
    const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
    const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
    const cp2y = p2[1] - (p3[1] - p1[1]) * tension;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

function fmtYAxis(v) {
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (Math.abs(v) >= 1_000) return Math.round(v / 1000) + "k";
  return String(Math.round(v));
}

// ── Net Worth SVG Chart ───────────────────────────────────────────────────────

export function NetWorthChart({ displayRows, retireAge }) {
  if (!displayRows || displayRows.length === 0) return null;

  const W = 640, H = 260, PL = 52, PR = 20, PT = 36, PB = 32;
  const rows = displayRows;
  const maxVal = Math.max(...rows.map(r => r.endDisp));
  const minVal = Math.min(0, ...rows.map(r => r.endDisp));
  const range = maxVal - minVal || 1;
  const xScale = (i) => PL + (i / (rows.length - 1)) * (W - PL - PR);
  const yScale = (v) => PT + ((maxVal - v) / range) * (H - PT - PB);

  const retIdx = rows.findIndex(r => r.age === retireAge);
  const accumPts = rows.slice(0, retIdx >= 0 ? retIdx + 1 : rows.length).map((r, i) => [xScale(i), yScale(r.endDisp)]);
  const drawPts  = retIdx >= 0 ? rows.slice(retIdx).map((r, i) => [xScale(retIdx + i), yScale(r.endDisp)]) : [];

  const accumPath = smoothPath(accumPts, { anchorLast: true });
  const drawPath  = smoothPath(drawPts);
  const zero = yScale(0);

  const accumAreaPath = accumPts.length > 1
    ? accumPath + ` L ${accumPts[accumPts.length - 1][0].toFixed(1)} ${zero.toFixed(1)} L ${accumPts[0][0].toFixed(1)} ${zero.toFixed(1)} Z`
    : "";
  const drawAreaPath = drawPts.length > 1
    ? drawPath + ` L ${drawPts[drawPts.length - 1][0].toFixed(1)} ${zero.toFixed(1)} L ${drawPts[0][0].toFixed(1)} ${zero.toFixed(1)} Z`
    : "";

  const yLevels = [0, 0.33, 0.67, 1].map(f => minVal + f * range);
  const tickAges = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].age % 10 === 0) tickAges.push({ i, age: rows[i].age });
  }

  const retX = retIdx >= 0 ? xScale(retIdx) : null;
  const retY = retIdx >= 0 ? yScale(rows[retIdx].endDisp) : null;

  return (
    <div style={{ overflowX: "auto", margin: "8px 0" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        <defs>
          <linearGradient id="nw-accum-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="nw-draw-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.01" />
          </linearGradient>
          <clipPath id="accum-clip">
            <rect x={PL} y={0} width={retX ? retX - PL : W - PL - PR} height={H} />
          </clipPath>
          <clipPath id="draw-clip">
            <rect x={retX || PL} y={0} width={W - (retX || PL) - PR} height={H} />
          </clipPath>
        </defs>
        {yLevels.map((v, idx) => (
          <line key={idx} x1={PL} y1={yScale(v)} x2={W - PR} y2={yScale(v)}
            stroke="var(--line)" strokeWidth="1" strokeDasharray="4 5" />
        ))}
        {accumAreaPath && <path d={accumAreaPath} fill="url(#nw-accum-grad)" clipPath="url(#accum-clip)" />}
        {drawAreaPath  && <path d={drawAreaPath}  fill="url(#nw-draw-grad)"  clipPath="url(#draw-clip)"  />}
        {accumPath && <path d={accumPath} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        {drawPath  && <path d={drawPath}  fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" opacity="0.5" />}
        {retX !== null && (
          <line x1={retX} y1={PT - 8} x2={retX} y2={H - PB}
            stroke="var(--sun)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.8" />
        )}
        {retX !== null && retY !== null && (() => {
          const label = `age ${retireAge}`;
          const pw = label.length * 7 + 20;
          const ph = 24;
          const px = Math.max(PL, Math.min(retX - pw / 2, W - PR - pw));
          const py = Math.max(4, retY - ph - 10);
          return (
            <g>
              <rect x={px} y={py} width={pw} height={ph} rx="12" fill="var(--accent-deep)" />
              <text x={px + pw / 2} y={py + ph / 2 + 4.5} textAnchor="middle"
                fontSize="12" fontWeight="500" fill="white" fontFamily="var(--font-ui)" letterSpacing="0">
                {label}
              </text>
            </g>
          );
        })()}
        {yLevels.map((v, idx) => (
          <text key={idx} x={PL - 8} y={yScale(v) + 4}
            textAnchor="end" fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-ui)">
            ${fmtYAxis(v)}
          </text>
        ))}
        {tickAges.map(({ i, age }) => (
          <text key={age} x={xScale(i)} y={H - 10}
            textAnchor="middle" fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-ui)">
            {age}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ── Account Mix Donut ─────────────────────────────────────────────────────────

export function AccountMixDonut({ rrsp, tfsa, nr, hidden }) {
  const total = rrsp + tfsa + nr;
  if (total <= 0) return <div className="text-body">No portfolio data</div>;

  const accounts = [
    { label: "RRSP",    value: rrsp, color: "var(--accent)", note: "Tax-deferred" },
    { label: "TFSA",    value: tfsa, color: "var(--sun)",    note: "Tax-free" },
    { label: "Non-reg", value: nr,   color: "var(--dusk)",   note: "Taxable" },
  ];

  const R = 54, C = 2 * Math.PI * R;
  let offset = 0;
  const fmt = (n) => fmt$(n, hidden);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 28, alignItems: "center" }}>
      <svg viewBox="0 0 140 140" style={{ width: 140, height: 140 }}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--paper-3)" strokeWidth="16" />
        {accounts.map((a) => {
          const frac = a.value / total;
          const dash = frac * C;
          const el = (
            <circle key={a.label} cx="70" cy="70" r={R}
              fill="none" stroke={a.color} strokeWidth="16"
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
              strokeLinecap="butt"
            />
          );
          offset += dash;
          return el;
        })}
        <text x="70" y="66" textAnchor="middle" fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-mono)" letterSpacing="0.06em">TOTAL</text>
        <text x="70" y="84" textAnchor="middle" fontSize="16" fill="var(--ink)" fontFamily="var(--font-mono)" fontWeight="500">
          {hidden ? "••••" : `$${Math.round(total / 1000)}k`}
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {accounts.map(a => {
          const pct = Math.round((a.value / total) * 100);
          return (
            <div key={a.label} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto auto", gap: 12, alignItems: "center", padding: "6px 0" }}>
              <span className="dot-swatch" style={{ background: a.color }} />
              <div>
                <div style={{ fontWeight: 500, fontSize: "var(--step--1)" }}>{a.label}</div>
                <div className="text-meta" style={{ marginTop: 1 }}>{a.note}</div>
              </div>
              <div className="mono text-body">{fmt(a.value)}</div>
              <div className="mono text-meta" style={{ minWidth: 32, textAlign: "right" }}>{pct}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Contribution Room Bars ────────────────────────────────────────────────────

export function RoomBar({ label, used, room, color }) {
  const pct = room > 0 ? Math.min(100, (used / room) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span className="text-body">{label}</span>
        <span className="text-meta" style={{ fontFamily: "var(--font-mono)" }}>{Math.round(pct)}% used</span>
      </div>
      <div style={{ height: 8, background: "var(--paper-3)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

// ── Cashflow Sankey Bars ──────────────────────────────────────────────────────

export function CashflowBars({ s, inputs, hidden }) {
  const fmt = (n) => fmtK(n, hidden);

  const yourBase    = s.yourBase   || 0;
  const spouseBase  = s.spouseBase || 0;
  const yourBonus   = yourBase   * (s.yourBonusPct   || 0);
  const spouseBonus = spouseBase * (s.spouseBonusPct || 0);
  const yourEquity  = yourBase   * (s.yourEquityPct   || 0);
  const spouseEquity= spouseBase * (s.spouseEquityPct || 0);

  const grossTotal = yourBase + spouseBase + yourBonus + spouseBonus + yourEquity + spouseEquity;
  const taxAmt     = grossTotal * (s.taxRate || 0);
  const netIncome  = grossTotal - taxAmt;

  const housing = inputs.monthlyExpensesTotal * 12 * 0.40;
  const living  = inputs.monthlyExpensesTotal * 12 * 0.42;
  const other   = inputs.monthlyExpensesTotal * 12 - housing - living;
  const rrspSav = ((s.startingMonthly || 0) + (s.spouseMonthly || 0)) * 12 + (s.rrspTopUp || 0);
  const tfsaSav = ((s.yourTfsaMonthly || 0) + (s.spouseTfsaMonthly || 0)) * 12 + (s.tfsaTopUp || 0);
  const nrSav   = ((s.yourNrMonthly   || 0) + (s.spouseNrMonthly   || 0)) * 12 + (s.nrTopUp   || 0);
  const carsCost= ((s.carPayment||0)+(s.carGas||0)+(s.carInsurance||0)+(s.carParking||0)) * 12
                + (s.carMaintenance||0) + (s.carRegistration||0);
  const annualOneTime = inputs.oneTimeAnnualTotal || 0;
  const buffer  = Math.max(0, netIncome - taxAmt - housing - living - other - rrspSav - tfsaSav - nrSav - carsCost - annualOneTime);

  const incomeSegs = [
    ...(s.partnered !== false
      ? [
          { k: `${s.yourName   || "You"}    · T4`, v: yourBase   + yourBonus   + yourEquity,   tone: "accent" },
          { k: `${s.spouseName || "Spouse"} · T4`, v: spouseBase + spouseBonus + spouseEquity, tone: "accent" },
        ]
      : [{ k: `${s.yourName || "You"} · T4`, v: yourBase + yourBonus + yourEquity, tone: "accent" }]
    ),
  ].filter(x => x.v > 0);

  const outSegs = [
    { k: "Tax",     v: taxAmt,  tone: "slate"  },
    { k: "Housing", v: housing, tone: "dusk"   },
    { k: "Living",  v: living,  tone: "dusk"   },
    { k: "Other",   v: other,   tone: "dusk"   },
    ...(carsCost > 0 ? [{ k: "Cars",    v: carsCost, tone: "dusk"   }] : []),
    ...(rrspSav > 0  ? [{ k: "RRSP",    v: rrspSav,  tone: "accent" }] : []),
    ...(tfsaSav > 0  ? [{ k: "TFSA",    v: tfsaSav,  tone: "sun"    }] : []),
    ...(nrSav > 0    ? [{ k: "Non-reg", v: nrSav,    tone: "dusk"   }] : []),
    ...(buffer > 0   ? [{ k: "Buffer",  v: buffer,   tone: "moss"   }] : []),
  ].filter(x => x.v > 0);

  const toneColor = (t) =>
    t === "accent" ? "var(--accent)" : t === "sun" ? "var(--sun)" :
    t === "dusk"   ? "var(--dusk)"   : t === "slate" ? "var(--slate)" : "var(--moss)";

  const totalSavings = rrspSav + tfsaSav + nrSav;
  const outTotal = outSegs.reduce((a, b) => a + b.v, 0);
  const savPct = outTotal > 0 ? Math.round((totalSavings / outTotal) * 100) : 0;

  const SegBar = ({ segs, total, label, sub }) => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <span className="label-xs">{label}</span>
        <span className="mono" style={{ fontSize: "var(--step-1)", fontWeight: 500 }}>
          {fmt(total)} <span className="text-meta" style={{ fontWeight: 400 }}>· {sub}</span>
        </span>
      </div>
      <div style={{ display: "flex", height: 36, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)" }}>
        {segs.map((sg, i) => (
          <div key={i} title={`${sg.k} · ${fmt(sg.v)}`} style={{
            flex: sg.v, background: toneColor(sg.tone), opacity: 0.88,
            borderRight: i < segs.length - 1 ? "1px solid var(--paper)" : "none",
          }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
        {segs.map((sg, i) => (
          <div key={i} className="legend-row">
            <span className="dot-swatch" style={{ background: toneColor(sg.tone) }} />
            <span>{sg.k}</span>
            <span className="mono text-meta">{fmt(sg.v)}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <SegBar segs={incomeSegs} total={grossTotal} label="Gross in" sub={`${incomeSegs.length} source${incomeSegs.length > 1 ? "s" : ""}`} />
      <SegBar segs={outSegs} total={outTotal} label="Out" sub={`${savPct}% toward future self`} />
      {totalSavings > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "var(--accent-soft)", borderRadius: 10 }}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, color: "var(--accent-deep)" }}>
            <path d="M10 2l2 5h5l-4 3 1.5 5L10 12l-4.5 3L7 10 3 7h5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
          </svg>
          <div className="text-body">
            <span style={{ fontWeight: 500 }}>{fmt(totalSavings)}</span> is walking toward independence this year.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Drawdown Timeline ─────────────────────────────────────────────────────────

export function DrawdownTimeline({ retireAge, deathAge }) {
  if (!retireAge) return <div className="text-body">No drawdown data yet.</div>;

  const end = deathAge || 90;
  const allBands = [];
  for (let a = retireAge; a < end; a += 5) {
    allBands.push({ start: a, end: Math.min(a + 5, end) });
  }

  const bandData = allBands.map(b => {
    const midAge = (b.start + b.end) / 2;
    const cpp = midAge >= 65 ? 20 : 0;
    const oas = midAge >= 65 ? 15 : 0;
    const guaranteed = cpp + oas;
    const remaining = 100 - guaranteed;
    let rrsp, nr, tfsa;
    if (midAge < 65)      { rrsp = Math.round(remaining * 0.65); nr = Math.round(remaining * 0.25); tfsa = remaining - rrsp - nr; }
    else if (midAge < 71) { rrsp = Math.round(remaining * 0.55); nr = Math.round(remaining * 0.20); tfsa = remaining - rrsp - nr; }
    else                  { rrsp = Math.round(remaining * 0.30); nr = Math.round(remaining * 0.05); tfsa = remaining - rrsp - nr; }
    return { label: `${b.start}–${b.end}`, segs: { RRSP: rrsp, NonReg: nr, TFSA: tfsa, CPP: cpp, OAS: oas } };
  });

  const colors = { RRSP: "var(--accent)", NonReg: "var(--dusk)", TFSA: "var(--sun)", CPP: "var(--moss)", OAS: "var(--slate-ink)" };
  const labels = { RRSP: "RRSP/RRIF", NonReg: "Non-reg", TFSA: "TFSA", CPP: "CPP", OAS: "OAS" };
  const keys   = ["RRSP", "NonReg", "TFSA", "CPP", "OAS"];

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
        {keys.map(k => (
          <div key={k} className="legend-row">
            <span className="dot-swatch" style={{ background: colors[k] }} />
            {labels[k]}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {bandData.map(b => (
          <div key={b.label} style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 14, alignItems: "center" }}>
            <div className="mono text-meta">ages {b.label}</div>
            <div style={{ display: "flex", height: 26, borderRadius: 6, overflow: "hidden", border: "1px solid var(--line)" }}>
              {keys.map(k => b.segs[k] > 0 && (
                <div key={k} title={`${labels[k]} · ${b.segs[k]}%`} style={{
                  flex: b.segs[k], background: colors[k], opacity: 0.9,
                  borderRight: "1px solid var(--paper)",
                  display: "grid", placeItems: "center",
                  fontSize: 10, color: "white", fontFamily: "var(--font-mono)",
                }}>
                  {b.segs[k] >= 18 ? `${b.segs[k]}%` : ""}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CashRow ───────────────────────────────────────────────────────────────────

export function CashRow({ label, value, fmt }) {
  const isNeg = value < 0;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span className="text-body">{label}</span>
      <span className={`mono text-body ${isNeg ? "text-neg" : ""}`}>
        {isNeg ? "−" : "+"}{fmt(Math.abs(value))}
      </span>
    </div>
  );
}

// ── MiniStat ──────────────────────────────────────────────────────────────────

export function MiniStat({ label, value, sub, tone }) {
  const color = tone === "green" ? "var(--moss-ink)" : tone === "red" ? "var(--slate-ink)" : tone === "sun" ? "var(--sun-ink)" : "var(--ink)";
  return (
    <div className="mini-stat">
      <div className="label-xs">{label}</div>
      <div className="mono" style={{ fontSize: "var(--step-3)", fontWeight: 500, marginTop: 6, color }}>{value}</div>
      {sub && <div className="text-meta" style={{ marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
