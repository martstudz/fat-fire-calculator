import React, { useContext, useState } from "react";
import { PrivacyContext } from "./FatFireCalculator";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n, hidden) {
  if (hidden) return "••••••";
  if (!isFinite(n) || n == null) return "—";
  return "$" + Math.round(n).toLocaleString("en-CA");
}

function fmtK(n, hidden) {
  if (hidden) return "••••";
  if (!isFinite(n) || n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n < 0 ? "−" : "") + "$" + (abs / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000) return (n < 0 ? "−" : "") + "$" + Math.round(abs / 1000) + "k";
  return "$" + Math.round(n).toLocaleString();
}

// ── CashRow ───────────────────────────────────────────────────────────────────

function CashRow({ label, value, fmt }) {
  const isNeg = value < 0;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ fontSize: "var(--step--1)", color: "var(--ink-3)" }}>{label}</span>
      <span className="mono" style={{
        fontSize: "var(--step--1)",
        color: isNeg ? "var(--slate-ink)" : "var(--ink-2)",
      }}>
        {isNeg ? "−" : "+"}{fmt(Math.abs(value))}
      </span>
    </div>
  );
}

// ── Panel wrapper ─────────────────────────────────────────────────────────────

function Panel({ children, style }) {
  return (
    <div className="dash-panel" style={style}>
      {children}
    </div>
  );
}

function PanelHead({ label, title, aside }) {
  return (
    <div className="dash-panel__head">
      <div>
        {label && <div className="label-xs">{label}</div>}
        {title && <h3 style={{ fontSize: "var(--step-2)", fontWeight: 600, marginTop: 4 }}>{title}</h3>}
      </div>
      {aside}
    </div>
  );
}

// ── MiniStat ──────────────────────────────────────────────────────────────────

function MiniStat({ label, value, sub, tone }) {
  const color = tone === "green" ? "var(--moss-ink)" : tone === "red" ? "var(--slate-ink)" : tone === "sun" ? "var(--sun-ink)" : "var(--ink)";
  return (
    <div className="mini-stat">
      <div className="label-xs">{label}</div>
      <div className="mono" style={{ fontSize: "var(--step-3)", fontWeight: 500, marginTop: 6, color }}>{value}</div>
      {sub && <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Net Worth SVG Chart ───────────────────────────────────────────────────────

function NetWorthChart({ displayRows, retireAge }) {
  if (!displayRows || displayRows.length === 0) return null;
  const W = 600, H = 220, PL = 60, PR = 20, PT = 16, PB = 30;
  const rows = displayRows;
  const maxVal = Math.max(...rows.map(r => r.endDisp));
  const minVal = Math.min(0, ...rows.map(r => r.endDisp));
  const xScale = (i) => PL + (i / (rows.length - 1)) * (W - PL - PR);
  const yScale = (v) => PT + ((maxVal - v) / (maxVal - minVal || 1)) * (H - PT - PB);

  const linePath = rows.map((r, i) => `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(r.endDisp).toFixed(1)}`).join(" ");
  const areaPath = linePath + ` L ${xScale(rows.length - 1).toFixed(1)} ${yScale(0).toFixed(1)} L ${xScale(0).toFixed(1)} ${yScale(0).toFixed(1)} Z`;

  // Tick labels: age
  const tickAges = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].age % 10 === 0) tickAges.push({ i, age: rows[i].age });
  }

  const retIdx = rows.findIndex(r => r.age === retireAge);

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        <defs>
          <linearGradient id="nw-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(f => {
          const y = PT + f * (H - PT - PB);
          return <line key={f} x1={PL} y1={y} x2={W - PR} y2={y} stroke="var(--line)" strokeWidth="1" />;
        })}

        {/* Area */}
        <path d={areaPath} fill="url(#nw-grad)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" />

        {/* Retire line */}
        {retIdx >= 0 && (
          <line
            x1={xScale(retIdx)} y1={PT}
            x2={xScale(retIdx)} y2={H - PB}
            stroke="var(--sun)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        )}

        {/* Retire label */}
        {retIdx >= 0 && (
          <text x={xScale(retIdx) + 4} y={PT + 10} fontSize="10" fill="var(--sun-ink)" fontFamily="var(--font-ui)">
            retire
          </text>
        )}

        {/* Y axis labels */}
        {[0, 0.5, 1].map(f => {
          const v = minVal + f * (maxVal - minVal);
          const y = yScale(v);
          const label = Math.abs(v) >= 1_000_000 ? (v / 1_000_000).toFixed(1) + "M" : Math.round(v / 1000) + "k";
          return (
            <text key={f} x={PL - 6} y={y + 4} textAnchor="end" fontSize="9" fill="var(--ink-3)" fontFamily="var(--font-mono)">
              ${label}
            </text>
          );
        })}

        {/* X axis ticks */}
        {tickAges.map(({ i, age }) => (
          <text key={age} x={xScale(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--ink-3)" fontFamily="var(--font-ui)">
            {age}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ── Account Mix Donut ─────────────────────────────────────────────────────────
// Stroke-based donut (strokeDasharray) matching the design reference

function AccountMixDonut({ rrsp, tfsa, nr, hidden }) {
  const total = rrsp + tfsa + nr;
  if (total <= 0) return <div style={{ color: "var(--ink-3)", fontSize: "var(--step--1)" }}>No portfolio data</div>;

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
            <circle
              key={a.label}
              cx="70" cy="70" r={R}
              fill="none"
              stroke={a.color}
              strokeWidth="16"
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
              <span style={{ width: 10, height: 10, borderRadius: 2, background: a.color, display: "block" }} />
              <div>
                <div style={{ fontWeight: 500, fontSize: "var(--step--1)" }}>{a.label}</div>
                <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 1 }}>{a.note}</div>
              </div>
              <div className="mono" style={{ fontSize: "var(--step--1)", color: "var(--ink)" }}>{fmt(a.value)}</div>
              <div className="mono" style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", minWidth: 32, textAlign: "right" }}>{pct}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Contribution Room Bars ────────────────────────────────────────────────────

function RoomBar({ label, used, room, color }) {
  const pct = room > 0 ? Math.min(100, (used / room) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: "var(--step--1)", color: "var(--ink-2)" }}>{label}</span>
        <span style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{Math.round(pct)}% used</span>
      </div>
      <div style={{ height: 8, background: "var(--paper-3)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

// ── Cashflow Sankey Bar ───────────────────────────────────────────────────────
// Segmented income → outflow bars matching the design reference

function CashflowBars({ s, inputs, hidden }) {
  const fmt = (n) => fmtK(n, hidden);

  const yourBase = s.yourBase || 0;
  const spouseBase = s.spouseBase || 0;
  const yourBonus = yourBase * (s.yourBonusPct || 0);
  const spouseBonus = spouseBase * (s.spouseBonusPct || 0);
  const yourEquity = yourBase * (s.yourEquityPct || 0);
  const spouseEquity = spouseBase * (s.spouseEquityPct || 0);

  const grossTotal = yourBase + spouseBase + yourBonus + spouseBonus + yourEquity + spouseEquity;
  const taxAmt = grossTotal * (s.taxRate || 0);
  const netIncome = grossTotal - taxAmt;

  const housing = inputs.monthlyExpensesTotal * 12 * 0.40; // approx housing share
  const living  = inputs.monthlyExpensesTotal * 12 * 0.42;
  const other   = inputs.monthlyExpensesTotal * 12 - housing - living;
  const rrspSav = ((s.startingMonthly || 0) + (s.spouseMonthly || 0)) * 12 + (s.rrspTopUp || 0);
  const tfsaSav = ((s.yourTfsaMonthly || 0) + (s.spouseTfsaMonthly || 0)) * 12 + (s.tfsaTopUp || 0);
  const nrSav   = ((s.yourNrMonthly || 0) + (s.spouseNrMonthly || 0)) * 12 + (s.nrTopUp || 0);
  const carsCost = ((s.carPayment||0)+(s.carGas||0)+(s.carInsurance||0)+(s.carParking||0)) * 12
    + (s.carMaintenance||0) + (s.carRegistration||0);
  const annualOneTime = inputs.oneTimeAnnualTotal || 0;
  const buffer = Math.max(0, netIncome - taxAmt - housing - living - other - rrspSav - tfsaSav - nrSav - carsCost - annualOneTime);

  const incomeSegs = [
    ...(s.partnered !== false
      ? [
          { k: `${s.yourName || "You"} · T4`,     v: yourBase + yourBonus + yourEquity,    tone: "accent" },
          { k: `${s.spouseName || "Spouse"} · T4`, v: spouseBase + spouseBonus + spouseEquity, tone: "accent" },
        ]
      : [{ k: `${s.yourName || "You"} · T4`, v: yourBase + yourBonus + yourEquity, tone: "accent" }]
    ),
  ].filter(x => x.v > 0);

  const outSegs = [
    { k: "Tax",     v: taxAmt,      tone: "slate"  },
    { k: "Housing", v: housing,     tone: "dusk"   },
    { k: "Living",  v: living,      tone: "dusk"   },
    { k: "Other",   v: other,       tone: "dusk"   },
    ...(carsCost > 0   ? [{ k: "Cars",    v: carsCost,    tone: "dusk"   }] : []),
    ...(rrspSav > 0    ? [{ k: "RRSP",    v: rrspSav,     tone: "accent" }] : []),
    ...(tfsaSav > 0    ? [{ k: "TFSA",    v: tfsaSav,     tone: "sun"    }] : []),
    ...(nrSav > 0      ? [{ k: "Non-reg", v: nrSav,       tone: "dusk"   }] : []),
    ...(buffer > 0     ? [{ k: "Buffer",  v: buffer,      tone: "moss"   }] : []),
  ].filter(x => x.v > 0);

  const toneColor = (t) => t === "accent" ? "var(--accent)" : t === "sun" ? "var(--sun)" : t === "dusk" ? "var(--dusk)" : t === "slate" ? "var(--slate)" : "var(--moss)";
  const totalSavings = rrspSav + tfsaSav + nrSav;

  const SegBar = ({ segs, total, label, sub }) => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <span className="label-xs">{label}</span>
        <span className="mono" style={{ fontSize: "var(--step-1)", fontWeight: 500 }}>
          {fmt(total)} <span style={{ color: "var(--ink-3)", fontWeight: 400, fontSize: "var(--step--2)" }}>· {sub}</span>
        </span>
      </div>
      <div style={{ display: "flex", height: 36, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)" }}>
        {segs.map((sg, i) => (
          <div
            key={i}
            title={`${sg.k} · ${fmt(sg.v)}`}
            style={{
              flex: sg.v,
              background: toneColor(sg.tone),
              opacity: 0.88,
              borderRight: i < segs.length - 1 ? "1px solid var(--paper)" : "none",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
        {segs.map((sg, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--step--2)", color: "var(--ink-2)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: toneColor(sg.tone), display: "block" }} />
            <span>{sg.k}</span>
            <span className="mono" style={{ color: "var(--ink-3)" }}>{fmt(sg.v)}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const outTotal = outSegs.reduce((a, b) => a + b.v, 0);
  const savPct = outTotal > 0 ? Math.round((totalSavings / outTotal) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <SegBar segs={incomeSegs} total={grossTotal} label="Gross in" sub={`${incomeSegs.length} source${incomeSegs.length > 1 ? "s" : ""}`} />
      <SegBar segs={outSegs} total={outTotal} label="Out" sub={`${savPct}% toward future self`} />
      {totalSavings > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "var(--accent-soft)", borderRadius: 10 }}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, color: "var(--accent-deep)" }}>
            <path d="M10 2l2 5h5l-4 3 1.5 5L10 12l-4.5 3L7 10 3 7h5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
          </svg>
          <div style={{ fontSize: "var(--step--1)", color: "var(--accent-ink)" }}>
            <span style={{ fontWeight: 500 }}>{fmt(totalSavings)}</span> is walking toward independence this year.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Drawdown Timeline ─────────────────────────────────────────────────────────
// Horizontal stacked bars per age band, matching design reference

function DrawdownTimeline({ retireAge, deathAge }) {
  if (!retireAge) return <div style={{ color: "var(--ink-3)", fontSize: "var(--step--1)" }}>No drawdown data yet.</div>;

  const end = deathAge || 90;
  // Build 5-year bands with representative % mix (model: RRSP-first then TFSA)
  const allBands = [];
  for (let a = retireAge; a < end; a += 5) {
    allBands.push({ start: a, end: Math.min(a + 5, end) });
  }

  // Withdrawal mix evolves: early = RRSP heavy, CPP/OAS kick in at 65, RRIF at 71
  const bandData = allBands.map(b => {
    const midAge = (b.start + b.end) / 2;
    const cpp = midAge >= 65 ? 20 : 0;
    const oas = midAge >= 65 ? 15 : 0;
    const guaranteed = cpp + oas;
    const remaining = 100 - guaranteed;
    let rrsp, nr, tfsa;
    if (midAge < 65) {
      rrsp = Math.round(remaining * 0.65); nr = Math.round(remaining * 0.25); tfsa = remaining - rrsp - nr;
    } else if (midAge < 71) {
      rrsp = Math.round(remaining * 0.55); nr = Math.round(remaining * 0.20); tfsa = remaining - rrsp - nr;
    } else {
      rrsp = Math.round(remaining * 0.30); nr = Math.round(remaining * 0.05); tfsa = remaining - rrsp - nr;
    }
    return { label: `${b.start}–${b.end}`, segs: { RRSP: rrsp, NonReg: nr, TFSA: tfsa, CPP: cpp, OAS: oas } };
  });

  const colors = {
    RRSP:   "var(--accent)",
    NonReg: "var(--dusk)",
    TFSA:   "var(--sun)",
    CPP:    "var(--moss)",
    OAS:    "var(--slate-ink)",
  };
  const labels = { RRSP: "RRSP/RRIF", NonReg: "Non-reg", TFSA: "TFSA", CPP: "CPP", OAS: "OAS" };
  const keys = ["RRSP", "NonReg", "TFSA", "CPP", "OAS"];

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
        {keys.map(k => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--step--2)", color: "var(--ink-2)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: colors[k], display: "block" }} />
            {labels[k]}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {bandData.map(b => (
          <div key={b.label} style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 14, alignItems: "center" }}>
            <div className="mono" style={{ fontSize: "var(--step--2)", color: "var(--ink-3)" }}>ages {b.label}</div>
            <div style={{ display: "flex", height: 26, borderRadius: 6, overflow: "hidden", border: "1px solid var(--line)" }}>
              {keys.map(k => b.segs[k] > 0 && (
                <div
                  key={k}
                  title={`${labels[k]} · ${b.segs[k]}%`}
                  style={{
                    flex: b.segs[k],
                    background: colors[k],
                    opacity: 0.9,
                    borderRight: "1px solid var(--paper)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 10,
                    color: "white",
                    fontFamily: "var(--font-mono)",
                  }}
                >
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

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard({
  s,
  inputs,
  solved,
  scenarios,
  mc,
  mcRunning,
  mcTargetRate,
  mcReverse,
  setMcTargetRate,
  runMC,
  displayRows,
}) {
  const hidden = useContext(PrivacyContext);
  const fmt = (n) => fmt$(n, hidden);
  const fmtk = (n) => fmtK(n, hidden);

  // Derived
  const grandAnnual = inputs.monthlyExpensesTotal * 12 + inputs.oneTimeAnnualTotal;
  const retireAge = solved.age;
  const retRow = retireAge && solved.rows ? solved.rows.find(r => r.age === retireAge) : null;
  const portfolioAtRetirement = retRow ? retRow.endTotal / retRow.infFactor : null;
  const yearsToRetirement = retireAge ? retireAge - s.currentAge : null;
  const mortgagePayoff = solved.mortgagePayoffAge;

  // Starting portfolio total
  const startPortfolio = (s.yourRrspStart||0) + (s.yourTfsaStart||0) + (s.yourNrStart||0)
    + (s.partnered !== false ? (s.spouseRrspStart||0) + (s.spouseTfsaStart||0) + (s.spouseNrStart||0) : 0);

  // At-retirement account mix
  const retRrsp = retRow ? retRow.rrspBal / retRow.infFactor : 0;
  const retTfsa = retRow ? retRow.tfsaBal / retRow.infFactor : 0;
  const retNr = retRow ? retRow.nrBal / retRow.infFactor : 0;

  // Contribution room
  const rrspRoom = (s.yourRrspRoomExisting || 0) + (s.spouseRrspRoomExisting || 0);
  const tfsaRoom = (s.yourTfsaRoomExisting || 0) + (s.spouseTfsaRoomExisting || 0);
  const rrspUsed = (s.startingMonthly || 0) * 12 + (s.rrspTopUp || 0) + (s.spouseMonthly || 0) * 12;
  const tfsaUsed = ((s.yourTfsaMonthly || 0) + (s.spouseTfsaMonthly || 0)) * 12 + (s.tfsaTopUp || 0);

  // Cashflow contributions (used for per-person excess calc)
  const totalMonthlyContrib = (s.startingMonthly || 0)
    + (s.yourTfsaMonthly || 0) + (s.yourNrMonthly || 0)
    + (s.spouseMonthly || 0) + (s.spouseTfsaMonthly || 0) + (s.spouseNrMonthly || 0);

  // ── Per-person excess cash ────────────────────────────────────────────────
  // Net take-home per person (base + bonus + equity, after blended tax)
  const yourEquityAmt = s.yourBase * (s.yourEquityPct || 0);
  const spouseEquityAmt = s.spouseBase * (s.spouseEquityPct || 0);
  const yourNetIncome  = (s.yourBase  + s.yourBase  * (s.yourBonusPct  || 0) + yourEquityAmt)  * (1 - (s.taxRate || 0));
  const spouseNetIncome = (s.spouseBase + s.spouseBase * (s.spouseBonusPct || 0) + spouseEquityAmt) * (1 - (s.taxRate || 0));

  // Shared household expenses split proportionally to income (or 50/50 if solo)
  const partnered = s.partnered !== false;
  const totalNet = yourNetIncome + (partnered ? spouseNetIncome : 0);
  const yourShare  = totalNet > 0 ? yourNetIncome  / totalNet : 1;
  const spouseShare = totalNet > 0 ? spouseNetIncome / totalNet : 0;

  const yourAnnualExpenses  = grandAnnual * yourShare;
  const spouseAnnualExpenses = grandAnnual * spouseShare;

  // Per-person savings contributions
  const yourAnnualSavings   = ((s.startingMonthly || 0) + (s.yourTfsaMonthly || 0) + (s.yourNrMonthly || 0)) * 12
    + (s.rrspTopUp || 0) + (s.tfsaTopUp || 0) + (s.nrTopUp || 0);
  const spouseAnnualSavings = ((s.spouseMonthly || 0) + (s.spouseTfsaMonthly || 0) + (s.spouseNrMonthly || 0)) * 12;

  const yourExcess   = yourNetIncome   - yourAnnualExpenses  - yourAnnualSavings;
  const spouseExcess = spouseNetIncome - spouseAnnualExpenses - spouseAnnualSavings;
  const householdExcess = yourExcess + (partnered ? spouseExcess : 0);

  // Scenario base
  const baseScenario = scenarios ? scenarios.find(sc => sc.label === "Base") : null;

  return (
    <div style={{ padding: "24px 24px 60px" }}>

      {/* ── Panel 1: FI Hero ── */}
      <div className="dash-hero" style={{ marginBottom: 24 }}>
        <div className="dash-hero__moment dot-bg">
          <div className="label-xs">Years until financial independence</div>
          {retireAge !== null ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 100, lineHeight: 0.9, letterSpacing: "-0.04em", color: "var(--accent-deep)" }}>
                  {yearsToRetirement}
                </div>
                <div style={{ fontSize: "var(--step-1)", color: "var(--ink-2)", maxWidth: 240 }}>
                  year{yearsToRetirement === 1 ? "" : "s"} from today.
                  <div style={{ color: "var(--ink-3)", fontSize: "var(--step--1)", marginTop: 4 }}>
                    {s.yourName || "You"} age {retireAge}
                    {s.partnered !== false && ` · ${s.spouseName || "Spouse"} age ${retireAge + (s.spouseCurrentAge - s.currentAge)}`}
                  </div>
                </div>
              </div>
              {portfolioAtRetirement !== null && (
                <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span className="label-xs">Portfolio at retirement</span>
                  <span className="mono" style={{ fontSize: "var(--step-2)", color: "var(--ink)", fontWeight: 500 }}>{fmt(portfolioAtRetirement)}</span>
                  <span style={{ fontSize: "var(--step--2)", color: "var(--ink-3)" }}>today's $</span>
                </div>
              )}
              {/* Narrative sentence */}
              <div style={{ marginTop: 16, fontSize: "var(--step--1)", color: "var(--ink-2)", lineHeight: 1.6, maxWidth: 420 }}>
                {s.yourName || "You"}'s path crosses independence at {retireAge}.
                {portfolioAtRetirement !== null && ` At today's savings pace, you reach ${fmtk(portfolioAtRetirement)} and can hold ${fmtk(grandAnnual + (inputs.retirementSpendDelta || 0))}/year spending through age ${s.deathAge}.`}
              </div>
              <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="chip chip--sun">Fat FIRE</span>
                {s.partnered !== false && <span className="chip">Partnered</span>}
                <span className="chip">RRSP-first drawdown</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: "var(--step-5)", fontWeight: 700, color: "var(--slate)", marginTop: 12 }}>Not reachable</div>
              <div style={{ fontSize: "var(--step--1)", color: "var(--ink-3)", marginTop: 8 }}>
                No retirement age leaves {fmt(s.terminalTargetToday)} at age {s.deathAge} while covering all spending.
              </div>
            </>
          )}
        </div>

        {/* ── Panel 2: Mini-stat rail ── */}
        <div className="dash-hero__aside">
          <MiniStat
            label="FI age"
            value={retireAge !== null ? `age ${retireAge}` : "—"}
            sub={retireAge !== null ? `${new Date().getFullYear() + yearsToRetirement}` : undefined}
          />
          <MiniStat
            label="Mortgage-free"
            value={isFinite(mortgagePayoff) ? `age ${mortgagePayoff}` : "Never"}
            sub={isFinite(mortgagePayoff) ? `${mortgagePayoff - s.currentAge} yrs to go` : undefined}
          />
          <MiniStat
            label="Annual retirement spend"
            value={fmt(grandAnnual + (inputs.retirementSpendDelta || 0))}
            sub={`/yr today's $`}
          />
          <MiniStat
            label="Die with"
            value={fmt(s.terminalTargetToday)}
            sub={`at age ${s.deathAge}`}
          />
        </div>
      </div>

      {/* ── Panel 2b: Annual excess cash ── */}
      <div className="dash-panel" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <div>
            <div className="label-xs">Annual excess cash</div>
            <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 3 }}>
              Take-home minus spending and planned contributions — this year
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span className="mono" style={{
              fontSize: "var(--step-3)",
              fontWeight: 700,
              color: householdExcess >= 0 ? "var(--moss-ink)" : "var(--slate-ink)",
            }}>
              {fmt(householdExcess)}
            </span>
            <span style={{ fontSize: "var(--step--2)", color: "var(--ink-3)" }}>/yr household</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 0, borderTop: "1px solid var(--line)" }}>
          {/* Your column */}
          <div style={{ flex: 1, paddingTop: 14, paddingRight: 24 }}>
            <div className="label-xs" style={{ marginBottom: 10 }}>{s.yourName || "You"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <CashRow label="Take-home" value={yourNetIncome} fmt={fmt} />
              <CashRow label="Spending (share)" value={-yourAnnualExpenses} fmt={fmt} />
              <CashRow label="Savings contributions" value={-yourAnnualSavings} fmt={fmt} />
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 6, marginTop: 2, display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                <span style={{ fontSize: "var(--step--1)", color: "var(--ink)" }}>Excess</span>
                <span className="mono" style={{
                  fontSize: "var(--step-1)",
                  fontWeight: 700,
                  color: yourExcess >= 0 ? "var(--moss-ink)" : "var(--slate-ink)",
                }}>{fmt(yourExcess)}</span>
              </div>
            </div>
          </div>

          {/* Spouse column — only shown if partnered */}
          {partnered && (
            <>
              <div style={{ width: 1, background: "var(--line)", margin: "14px 0 0" }} />
              <div style={{ flex: 1, paddingTop: 14, paddingLeft: 24 }}>
                <div className="label-xs" style={{ marginBottom: 10 }}>{s.spouseName || "Spouse"}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <CashRow label="Take-home" value={spouseNetIncome} fmt={fmt} />
                  <CashRow label="Spending (share)" value={-spouseAnnualExpenses} fmt={fmt} />
                  <CashRow label="Savings contributions" value={-spouseAnnualSavings} fmt={fmt} />
                  <div style={{ borderTop: "1px solid var(--line)", paddingTop: 6, marginTop: 2, display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                    <span style={{ fontSize: "var(--step--1)", color: "var(--ink)" }}>Excess</span>
                    <span className="mono" style={{
                      fontSize: "var(--step-1)",
                      fontWeight: 700,
                      color: spouseExcess >= 0 ? "var(--moss-ink)" : "var(--slate-ink)",
                    }}>{fmt(spouseExcess)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Panel 3: Scenario pressure test ── */}
      {scenarios && (
        <Panel>
          <PanelHead label="Pressure test" title="What if markets disappoint?" />
          <div className="dash-scenario-grid" style={{ marginTop: 16 }}>
            {scenarios.map(sc => {
              const ageDiff = baseScenario && baseScenario.age !== null && sc.age !== null ? sc.age - baseScenario.age : null;
              const portDiff = baseScenario && baseScenario.portfolioAtRetirement !== null && sc.portfolioAtRetirement !== null
                ? sc.portfolioAtRetirement - baseScenario.portfolioAtRetirement : null;
              const isBase = sc.label === "Base";
              return (
                <div key={sc.label} className={"scen-card" + (isBase ? " is-active" : "")}>
                  <div className="label-xs">{sc.label}</div>
                  <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", margin: "4px 0 8px" }}>{(sc.return * 100).toFixed(1)}% ret · {(sc.inflation * 100).toFixed(1)}% inf</div>
                  {sc.age !== null ? (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <div className="mono" style={{ fontSize: "var(--step-3)", fontWeight: 500, color: isBase ? "var(--accent)" : "var(--ink)" }}>{sc.age}</div>
                      {!isBase && ageDiff !== null && (
                        <div className="mono" style={{ fontSize: "var(--step--1)", color: ageDiff > 0 ? "var(--slate-ink)" : "var(--moss-ink)" }}>
                          {ageDiff > 0 ? "+" : ""}{ageDiff}y
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: "var(--step-0)", fontWeight: 600, color: "var(--slate)" }}>—</div>
                  )}
                  {sc.portfolioAtRetirement !== null && (
                    <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 4 }}>
                      {fmt(sc.portfolioAtRetirement)}
                      {!isBase && portDiff !== null && (
                        <span style={{ marginLeft: 4, color: portDiff < 0 ? "var(--slate-ink)" : "var(--moss-ink)" }}>
                          {portDiff > 0 ? "+" : ""}{fmt(portDiff)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 12 }}>
            All other inputs held constant. Differences relative to Base.
          </div>
        </Panel>
      )}

      {/* ── Panel 4: Net worth chart ── */}
      <Panel>
        <PanelHead label="Projection" title="Your net worth over time." />
        <div style={{ marginTop: 16 }}>
          <NetWorthChart displayRows={displayRows} retireAge={retireAge} />
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 8 }}>
            <span>Dashed line = retirement year. Values in today's $.</span>
          </div>
        </div>
      </Panel>

      {/* ── Panel 5: Drawdown phases ── */}
      <Panel>
        <PanelHead label="Canadian tax-optimized" title="RRSP-first meltdown." />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
          <div style={{ padding: "14px 16px", background: "var(--sun-soft)", borderRadius: "var(--r-3)", border: "1px solid oklch(88% 0.08 70)" }}>
            <div style={{ fontWeight: 600, fontSize: "var(--step--1)", color: "var(--sun-ink)", marginBottom: 8 }}>Phase 1 · FAT FIRE → 65</div>
            <div style={{ fontSize: "var(--step--2)", color: "var(--ink-2)", lineHeight: 1.7 }}>
              ① RRSP first — lowest-tax window<br />
              ② Non-registered — 50% cap gains inclusion<br />
              ③ TFSA last — preserve tax-free shield
            </div>
            <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 6 }}>Depletes RRSP before forced RRIF withdrawals.</div>
          </div>
          <div style={{ padding: "14px 16px", background: "var(--dusk-soft)", borderRadius: "var(--r-3)", border: "1px solid oklch(88% 0.04 235)" }}>
            <div style={{ fontWeight: 600, fontSize: "var(--step--1)", color: "var(--dusk-ink)", marginBottom: 8 }}>Phase 2 · 65+ CPP/OAS/Pension</div>
            <div style={{ fontSize: "var(--step--2)", color: "var(--ink-2)", lineHeight: 1.7 }}>
              ① RRSP/RRIF — mandatory minimums at 71+<br />
              ② RRIF surplus → TFSA → Non-reg<br />
              ③ Gap → Non-reg → TFSA (OAS clawback shield)
            </div>
            <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 6 }}>OAS clawback ~$95k/person (2026).</div>
          </div>
        </div>
      </Panel>

      {/* ── Panel 6: Monte Carlo ── */}
      <Panel>
        <PanelHead
          label="Monte Carlo · 1,000 paths"
          title="How sure can we be?"
          aside={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--step--1)", color: "var(--ink-2)" }}>
                Target
                <input
                  type="number" min={50} max={99} step={5}
                  value={mcTargetRate}
                  onChange={(e) => setMcTargetRate(parseFloat(e.target.value) || 80)}
                  style={{ width: 52, border: "1px solid var(--line)", borderRadius: "var(--r-1)", padding: "4px 6px", fontFamily: "var(--font-mono)", fontSize: "var(--step--1)", textAlign: "right", background: "var(--paper)", color: "var(--ink)" }}
                />
                <span style={{ color: "var(--ink-3)" }}>%</span>
              </label>
              <button onClick={runMC} disabled={mcRunning || retireAge === null} className="btn btn--primary btn--sm" style={{ opacity: (mcRunning || retireAge === null) ? 0.4 : 1 }}>
                {mcRunning ? "Running…" : mc ? "Re-run" : "Run simulation"}
              </button>
            </div>
          }
        />
        {!mc && !mcRunning && (
          <p style={{ fontSize: "var(--step--1)", color: "var(--ink-3)", marginTop: 12, lineHeight: 1.6 }}>
            Run 1,000 randomised market paths to stress-test your plan. Captures sequence-of-returns risk that the deterministic model misses.
          </p>
        )}
        {mcRunning && <p style={{ fontSize: "var(--step--1)", color: "var(--ink-3)", marginTop: 12 }}>Running 1,000 simulations…</p>}
        {mc && (() => {
          const pct = Math.round(mc.successRate * 100);
          const ringColor = pct >= 90 ? "var(--accent)" : pct >= 75 ? "var(--sun)" : "var(--slate)";
          const labelColor = pct >= 90 ? "var(--moss-ink)" : pct >= 75 ? "var(--sun-ink)" : "var(--slate-ink)";
          return (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="mc-grid">
                <div className="mc-ring-wrap">
                  <div style={{ width: 140, height: 140, borderRadius: "50%", background: `conic-gradient(${ringColor} ${pct}%, var(--paper-3) 0)`, display: "grid", placeItems: "center", position: "relative" }}>
                    <div style={{ position: "absolute", inset: 12, background: "var(--paper)", borderRadius: "50%" }} />
                    <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
                      <div className="mono" style={{ fontSize: "var(--step-4)", fontWeight: 600, color: labelColor, lineHeight: 1 }}>{pct}</div>
                      <div className="label-xs" style={{ marginTop: 2 }}>% succeed</div>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: "var(--step--1)", color: "var(--ink-2)", lineHeight: 1.6 }}>
                    In <span className="mono">{pct}%</span> of simulated lifetimes, your portfolio ends above target at age {s.deathAge}. The other {100 - pct}% run out.
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                    {[
                      { l: "P10", v: mc.p10, tone: "slate" },
                      { l: "P25", v: mc.p25, tone: "ink" },
                      { l: "P50", v: mc.p50, tone: "ink" },
                      { l: "P75", v: mc.p75, tone: "moss" },
                      { l: "P90", v: mc.p90, tone: "moss" },
                    ].map(p => (
                      <div key={p.l} className="mc-pct">
                        <div className="label-xs" style={{ fontSize: 10 }}>{p.l}</div>
                        <div className="mono" style={{ fontSize: "var(--step--1)", fontWeight: 600, color: p.tone === "slate" ? "var(--slate-ink)" : p.tone === "moss" ? "var(--moss-ink)" : "var(--ink)", marginTop: 3 }}>{fmt(p.v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {mcReverse && (
                <div style={{ padding: "14px 16px", background: "var(--paper-2)", borderRadius: "var(--r-3)", border: "1px solid var(--line)" }}>
                  <div className="label-xs" style={{ marginBottom: 6 }}>Minimum portfolio for {mcTargetRate}% success</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <span className="mono" style={{ fontSize: "var(--step-3)", fontWeight: 600 }}>{fmt(mcReverse.portfolio)}</span>
                    <span style={{ fontSize: "var(--step--2)", color: "var(--ink-3)" }}>needed at retirement (age {retireAge})</span>
                  </div>
                  {(() => {
                    if (!portfolioAtRetirement) return null;
                    const gap = mcReverse.portfolio - portfolioAtRetirement;
                    return (
                      <div style={{ fontSize: "var(--step--2)", marginTop: 6, fontWeight: 600, color: gap > 0 ? "var(--slate-ink)" : "var(--moss-ink)" }}>
                        Your projection: {fmt(portfolioAtRetirement)} → {gap > 0 ? `${fmt(gap)} short` : `${fmt(-gap)} above target ✓`}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })()}
      </Panel>

      {/* ── Panel 7: Account mix at retirement ── */}
      {retRow && (
        <Panel>
          <PanelHead label="Account mix" title="Portfolio at retirement." />
          <div style={{ marginTop: 16 }}>
            <AccountMixDonut rrsp={retRrsp} tfsa={retTfsa} nr={retNr} hidden={hidden} />
          </div>
          <div style={{ marginTop: 16, fontSize: "var(--step--2)", color: "var(--ink-3)" }}>
            Snapshot at age {retireAge}. RRSP-first drawdown depletes registered accounts first to optimize taxes.
          </div>
        </Panel>
      )}

      {/* ── Panel 8: Contribution room ── */}
      <Panel>
        <PanelHead label="Contribution room" title="Registered account headroom." />
        <div style={{ marginTop: 16 }}>
          <RoomBar label={`RRSP room (carry-forward: ${fmt(rrspRoom)})`} used={rrspUsed} room={rrspRoom + rrspUsed} color="var(--sun)" />
          <RoomBar label={`TFSA room (carry-forward: ${fmt(tfsaRoom)})`} used={tfsaUsed} room={tfsaRoom + tfsaUsed} color="var(--accent)" />
        </div>
        <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 8 }}>
          RRSP room: 18% of prior year income. TFSA: $7,000/yr. Room accumulates annually — carry-forward is the unused balance.
        </div>
      </Panel>

      {/* ── Panel 9: Cashflow ── */}
      <Panel>
        <PanelHead label="Annual cashflow" title="Where the money goes." />
        <div style={{ marginTop: 18 }}>
          <CashflowBars s={s} inputs={inputs} hidden={hidden} />
        </div>
      </Panel>

      {/* ── Panel 10: Drawdown timeline ── */}
      <Panel>
        <PanelHead label="Drawdown timeline" title="Which accounts get drawn when." />
        <div style={{ marginTop: 18 }}>
          <DrawdownTimeline retireAge={retireAge} deathAge={s.deathAge} />
        </div>
        <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 12 }}>
          Trailhead uses a standard Non-reg → TFSA → RRSP sequence. CPP and OAS shown as guaranteed income from age 65. Optimized drawdown coming soon.
        </div>
      </Panel>

      {/* ── Panel 11: Year-by-year table ── */}
      <Panel style={{ padding: 0, overflow: "hidden" }}>
        <div className="dash-panel__head" style={{ padding: "14px 20px" }}>
          <div>
            <div className="label-xs">Year-by-year projection</div>
            <h3 style={{ fontSize: "var(--step-1)", fontWeight: 600, marginTop: 4 }}>Every year on the trail.</h3>
          </div>
          <span style={{ fontSize: "var(--step--2)", color: "var(--ink-3)" }}>Today's $ · real</span>
        </div>
        <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "70vh" }}>
          <table className="dd-table">
            <thead style={{ position: "sticky", top: 0 }}>
              <tr>
                <th style={{ textAlign: "left" }}>Yr</th>
                <th style={{ textAlign: "left" }}>Age</th>
                <th style={{ textAlign: "left" }}>Phase</th>
                <th>RRSP</th>
                <th>TFSA</th>
                <th>Non-reg</th>
                <th>Total</th>
                <th>Contrib</th>
                <th>Withdraw</th>
                <th>Spend</th>
                <th>Guar. Income</th>
              </tr>
            </thead>
            <tbody>
              {displayRows && displayRows.map((r) => {
                const isRetYr = r.age === solved.age;
                const isDecum = r.phase === "decum";
                const combinedIncome = r.cppDisp + r.pensionDisp + (r.oasDisp || 0);
                const incomeTooltip = [
                  r.cppDisp > 0 ? `CPP: ${fmt(r.cppDisp)}` : null,
                  r.pensionDisp > 0 ? `Pension: ${fmt(r.pensionDisp)}` : null,
                  r.oasDisp > 0 ? `OAS: ${fmt(r.oasDisp)}` : null,
                ].filter(Boolean).join(" · ");
                return (
                  <tr key={r.t} className={isRetYr ? "is-retire" : isDecum ? "is-decum" : ""}>
                    <td style={{ textAlign: "left", fontFamily: "var(--font-ui)" }}>{r.year}</td>
                    <td style={{ textAlign: "left", fontFamily: "var(--font-ui)", whiteSpace: "nowrap" }}>
                      {r.age}{s.partnered !== false ? `/${r.spouseAge}` : ""}
                    </td>
                    <td style={{ textAlign: "left", fontFamily: "var(--font-ui)" }}>
                      {isDecum ? (
                        <span style={{ color: r.drawdownPhase === "Phase 1" ? "var(--sun-ink)" : "var(--dusk-ink)" }}>
                          {r.drawdownPhase}
                        </span>
                      ) : "—"}
                    </td>
                    <td>{fmt(r.rrspDisp)}</td>
                    <td>{fmt(r.tfsaDisp)}</td>
                    <td>{fmt(r.nrDisp)}</td>
                    <td style={{ fontWeight: 600, color: r.endTotal <= 0 ? "var(--slate)" : "var(--ink)" }}>{fmt(r.endDisp)}</td>
                    <td style={{ color: "var(--moss-ink)" }}>{r.totalContrib > 0 ? fmt(r.contribDisp) : "—"}</td>
                    <td style={{ color: "var(--slate-ink)" }}>{r.totalWd > 0 ? fmt(r.wdDisp) : "—"}</td>
                    <td>{fmt(r.spendDisp)}</td>
                    <td>
                      {combinedIncome > 0
                        ? <span title={incomeTooltip} style={{ cursor: "help", borderBottom: "1px dotted var(--line-strong)" }}>{fmt(combinedIncome)}</span>
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 20px", borderTop: "1px solid var(--line)", display: "flex", gap: 16, flexWrap: "wrap", fontSize: "var(--step--2)", color: "var(--ink-3)" }}>
          <span>Highlighted = retirement year.</span>
          <span style={{ color: "var(--sun-ink)" }}>Phase 1 = RRSP-first (pre-65).</span>
          <span style={{ color: "var(--dusk-ink)" }}>Phase 2 = CPP/OAS (65+).</span>
        </div>
      </Panel>

    </div>
  );
}
