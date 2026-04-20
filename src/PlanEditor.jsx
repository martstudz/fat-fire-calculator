import React, { useState, useEffect, useContext } from "react";
import { PrivacyContext } from "./FatFireCalculator";

// ── Primitives ────────────────────────────────────────────────────────────────

function fmt$(n, hidden) {
  if (hidden) return "••••••";
  if (!isFinite(n) || n == null) return "—";
  return "$" + Math.round(n).toLocaleString("en-CA");
}

function formatCommas(n) {
  if (n == null || n === "" || !isFinite(n)) return "";
  return Math.round(n).toLocaleString("en-CA");
}

// Comma-formatted number input: shows commas when blurred, raw digits when focused
function CommaInput({ value, onChange, small, className = "" }) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(value != null ? String(value) : "");
  useEffect(() => {
    if (!focused) setRaw(value != null ? String(value) : "");
  }, [value, focused]);
  const display = focused ? raw : formatCommas(value);
  return (
    <input
      type="text"
      inputMode="numeric"
      className={[small ? "--sm" : "", "mono", className].filter(Boolean).join(" ")}
      value={display || ""}
      onFocus={() => { setFocused(true); setRaw(value != null ? String(value) : ""); }}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/[^0-9]/g, "");
        setRaw(cleaned);
        const n = parseInt(cleaned, 10);
        onChange(isNaN(n) ? 0 : n);
      }}
      onBlur={() => {
        setFocused(false);
        const n = parseInt(raw, 10);
        setRaw(isNaN(n) ? "" : String(n));
      }}
    />
  );
}

function NumInput({ label, value, onChange, prefix, small, hint }) {
  return (
    <div className="inp-row">
      <span>{label}{hint && <span className="inp-hint"> · {hint}</span>}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {prefix && <span style={{ color: "var(--ink-3)", fontSize: "var(--step--1)" }}>{prefix}</span>}
        <CommaInput value={value} onChange={onChange} small={small} />
      </div>
    </div>
  );
}

function PctInput({ label, value, onChange, hint }) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState("");
  const display = focused ? raw : (value ? parseFloat((value * 100).toFixed(2)).toString() : "");
  useEffect(() => {
    if (!focused) setRaw(value ? parseFloat((value * 100).toFixed(2)).toString() : "");
  }, [value, focused]);
  return (
    <div className="inp-row">
      <span>{label}{hint && <span className="inp-hint"> · {hint}</span>}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          type="text"
          inputMode="decimal"
          className="--sm mono"
          value={display}
          onFocus={() => { setFocused(true); setRaw(value ? parseFloat((value * 100).toFixed(2)).toString() : ""); }}
          onChange={(e) => {
            const cleaned = e.target.value.replace(/[^0-9.]/g, "");
            setRaw(cleaned);
            const n = parseFloat(cleaned);
            if (!isNaN(n)) onChange(n / 100);
            else if (cleaned === "") onChange(0);
          }}
          onBlur={() => {
            setFocused(false);
            const n = parseFloat(raw);
            setRaw(isNaN(n) ? "" : parseFloat(n.toFixed(2)).toString());
          }}
        />
        <span style={{ color: "var(--ink-3)", fontSize: "var(--step--1)" }}>%</span>
      </div>
    </div>
  );
}

function ExpenseRow({ label, value, onChange, freq }) {
  return (
    <div className="inp-row">
      <span>{label} <span style={{ color: "var(--ink-3)", fontSize: "var(--step--2)" }}>/{freq === "annual" ? "yr" : "mo"}</span></span>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ color: "var(--ink-3)", fontSize: "var(--step--1)" }}>$</span>
        <CommaInput value={value} onChange={onChange} />
      </div>
    </div>
  );
}

function InfoBox({ children }) {
  return (
    <div className="info-box" style={{ margin: "6px 0" }}>
      <div style={{ fontSize: "var(--step--2)", color: "var(--ink-2)", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

// ── Accordion section ─────────────────────────────────────────────────────────

function AccSection({ id, title, icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="pe-accordion" id={`pe-${id}`}>
      <button
        className="pe-accordion__head"
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          background: "none",
          border: "none",
          padding: "14px 0",
          cursor: "pointer",
          borderBottom: open ? "none" : "1px solid var(--line)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {icon && <span style={{ fontSize: "var(--step-0)" }}>{icon}</span>}
          <span style={{ fontSize: "var(--step-0)", fontWeight: 600, color: "var(--ink)" }}>{title}</span>
        </div>
        <span style={{ color: "var(--ink-3)", fontSize: "var(--step--1)", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
      </button>
      {open && (
        <div className="pe-fields" style={{ paddingBottom: 20, borderBottom: "1px solid var(--line)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Save indicator ────────────────────────────────────────────────────────────

function SaveIndicator({ saveStatus }) {
  if (saveStatus === "saving") return <span style={{ fontSize: "var(--step--2)", color: "var(--ink-3)" }}>Saving…</span>;
  if (saveStatus === "error") return <span style={{ fontSize: "var(--step--2)", color: "oklch(42% 0.12 25)" }}>Save error</span>;
  return <span style={{ fontSize: "var(--step--2)", color: "var(--ink-3)" }}>Auto-saved</span>;
}

// ── Main PlanEditor ───────────────────────────────────────────────────────────

export default function PlanEditor({ s, update, solved, inputs, saveStatus }) {
  const hidden = useContext(PrivacyContext);
  const fmtMoney = (n) => fmt$(n, hidden);

  // Derived values
  const yourBonusAmt = s.yourBase * s.yourBonusPct;
  const spouseBonusAmt = s.spouseBase * s.spouseBonusPct;
  const yourEquityAmt = s.yourBase * s.yourEquityPct;
  const spouseEquityAmt = s.spouseBase * s.spouseEquityPct;
  const householdGross = s.yourBase + s.spouseBase + yourBonusAmt + spouseBonusAmt + yourEquityAmt + spouseEquityAmt;
  const bonusAfterTax = (s.yourBase * s.yourBonusPct + s.spouseBase * s.spouseBonusPct) * (1 - s.taxRate);
  const equityAfterTax = (s.yourBase * s.yourEquityPct + s.spouseBase * s.spouseEquityPct) * (1 - s.taxRate);
  const totalMonthlyContrib = (s.startingMonthly || 0)
    + (s.yourTfsaMonthly || 0) + (s.yourNrMonthly || 0)
    + (s.spouseMonthly || 0) + (s.spouseTfsaMonthly || 0) + (s.spouseNrMonthly || 0);
  const annualTopUps = (s.rrspTopUp || 0) + (s.tfsaTopUp || 0) + (s.nrTopUp || 0);
  const startingAnnualContrib = totalMonthlyContrib * 12 + bonusAfterTax + annualTopUps;
  const grandAnnual = inputs.monthlyExpensesTotal * 12 + inputs.oneTimeAnnualTotal;
  const mortgagePayoff = solved.mortgagePayoffAge;

  const sections = [
    { id: "household", label: "Household" },
    { id: "income", label: "Income & Tax" },
    { id: "spending", label: "Spending" },
    { id: "savings", label: "Savings & Portfolio" },
    { id: "goal", label: "Retirement Goal" },
    { id: "assumptions", label: "Assumptions" },
  ];

  return (
    <div className="pe-frame">
      {/* Header */}
      <div className="pe-head" style={{
        padding: "16px 24px",
        borderBottom: "1px solid var(--line)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--paper)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}>
        <div>
          <div style={{ fontSize: "var(--step-0)", fontWeight: 600, color: "var(--ink)" }}>Plan Editor</div>
          <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 2 }}>All your assumptions in one place</div>
        </div>
        <SaveIndicator saveStatus={saveStatus} />
      </div>

      <div className="pe-body" style={{ display: "flex", gap: 0 }}>
        {/* ToC sidebar */}
        <div className="pe-toc" style={{
          width: 160,
          flexShrink: 0,
          padding: "24px 16px",
          borderRight: "1px solid var(--line)",
          position: "sticky",
          top: 57,
          alignSelf: "flex-start",
          height: "calc(100vh - 57px)",
          overflowY: "auto",
        }}>
          <div style={{ fontSize: "var(--step--2)", fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Sections</div>
          {sections.map(sec => (
            <a
              key={sec.id}
              href={`#pe-${sec.id}`}
              style={{
                display: "block",
                fontSize: "var(--step--1)",
                color: "var(--ink-2)",
                padding: "5px 8px",
                borderRadius: "var(--r-2)",
                textDecoration: "none",
                marginBottom: 2,
              }}
              onMouseEnter={e => e.target.style.background = "var(--paper-2)"}
              onMouseLeave={e => e.target.style.background = "none"}
            >
              {sec.label}
            </a>
          ))}
        </div>

        {/* Main content */}
        <div className="pe-stack" style={{ flex: 1, padding: "0 32px 60px", maxWidth: 680 }}>

          {/* ── Household ── */}
          <AccSection id="household" title="Household" icon="👥">
            <div className="inp-row">
              <span>Your name</span>
              <input
                type="text"
                value={s.yourName || ""}
                placeholder="e.g. Alex"
                onChange={(e) => update("yourName")(e.target.value)}
                className="--sm"
              />
            </div>
            {s.partnered !== false && (
              <div className="inp-row">
                <span>Spouse / partner name</span>
                <input
                  type="text"
                  value={s.spouseName || ""}
                  placeholder="e.g. Jamie"
                  onChange={(e) => update("spouseName")(e.target.value)}
                  className="--sm"
                />
              </div>
            )}
            <NumInput
              label={`${s.yourName || "Your"} current age`}
              value={s.currentAge}
              onChange={update("currentAge")}
              small
            />
            {s.partnered !== false && (
              <NumInput
                label={`${s.spouseName || "Spouse"}'s current age`}
                value={s.spouseCurrentAge}
                onChange={update("spouseCurrentAge")}
                small
              />
            )}
            <NumInput
              label="End-of-plan age"
              value={s.deathAge}
              onChange={update("deathAge")}
              small
              hint="horizon for projections"
            />
            <div className="inp-row">
              <span>Have children?</span>
              <div className="seg">
                <button onClick={() => update("hasKids")(true)} className={s.hasKids !== false ? "is-active" : ""}>Yes</button>
                <button onClick={() => update("hasKids")(false)} className={s.hasKids === false ? "is-active" : ""}>No</button>
              </div>
            </div>
            <div className="inp-row">
              <span>Partnered?</span>
              <div className="seg">
                <button onClick={() => update("partnered")(true)} className={s.partnered !== false ? "is-active" : ""}>Yes</button>
                <button onClick={() => update("partnered")(false)} className={s.partnered === false ? "is-active" : ""}>No</button>
              </div>
            </div>
          </AccSection>

          {/* ── Income & Tax ── */}
          <AccSection id="income" title="Income & Tax" icon="💼">
            <div className="ob-person-label">{s.yourName || "You"}</div>
            <NumInput label="Annual base salary" value={s.yourBase} onChange={update("yourBase")} prefix="$" step={1000} />
            <PctInput label="Performance bonus (% of base)" value={s.yourBonusPct} onChange={update("yourBonusPct")} />
            <PctInput label="Equity / RSUs / options (% of base)" value={s.yourEquityPct} onChange={update("yourEquityPct")} hint="total variable equity, invested as vested" />
            <PctInput label="Commission & profit sharing (% of base)" value={s.yourCommissionPct || 0} onChange={update("yourCommissionPct")} />

            {s.partnered !== false && (
              <>
                <div className="ob-person-label" style={{ paddingTop: 8 }}>{s.spouseName || "Spouse"}</div>
                <NumInput label="Annual base salary" value={s.spouseBase} onChange={update("spouseBase")} prefix="$" step={1000} />
                <PctInput label="Performance bonus (% of base)" value={s.spouseBonusPct} onChange={update("spouseBonusPct")} />
                <PctInput label="Equity / RSUs / options (% of base)" value={s.spouseEquityPct} onChange={update("spouseEquityPct")} hint="total variable equity, invested as vested" />
                <PctInput label="Commission & profit sharing (% of base)" value={s.spouseCommissionPct || 0} onChange={update("spouseCommissionPct")} />
              </>
            )}

            <div className="ob-person-label" style={{ paddingTop: 8 }}>Tax</div>
            <PctInput label="Blended tax rate" value={s.taxRate} onChange={update("taxRate")} />
            <PctInput label="Income growth (real)" value={s.incomeGrowth} onChange={update("incomeGrowth")} />

            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-2)", fontSize: "var(--step--1)" }}>
                <span>{s.yourName || "You"}'s total comp</span>
                <span className="mono">{fmtMoney(s.yourBase + yourBonusAmt + yourEquityAmt)}</span>
              </div>
              {s.partnered !== false && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-2)", fontSize: "var(--step--1)" }}>
                  <span>{s.spouseName || "Spouse"}'s total comp</span>
                  <span className="mono">{fmtMoney(s.spouseBase + spouseBonusAmt + spouseEquityAmt)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, color: "var(--ink)", fontSize: "var(--step--1)", paddingTop: 6, borderTop: "1px solid var(--line)" }}>
                <span>{s.partnered !== false ? "Household" : "Total"} gross</span>
                <span className="mono">{fmtMoney(householdGross)}</span>
              </div>
            </div>
          </AccSection>

          {/* ── Spending ── */}
          <AccSection id="spending" title="Spending" icon="🛒">
            <div className="ob-person-label">Housing</div>
            <ExpenseRow label="Mortgage" value={s.mortgage} onChange={update("mortgage")} freq="monthly" />
            <div style={{ paddingLeft: 12, borderLeft: "2px solid var(--line)", marginLeft: 4, display: "flex", flexDirection: "column", gap: 2 }}>
              <NumInput label="Principal remaining" value={s.mortgagePrincipal} onChange={update("mortgagePrincipal")} prefix="$" step={1000} />
              <PctInput label="Interest rate" value={s.mortgageRate} onChange={update("mortgageRate")} />
              <NumInput label="Extra payment / mo" value={s.extraMortgagePayment} onChange={update("extraMortgagePayment")} prefix="$" step={100} hint="reduces contributions by same amount" />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--step--2)", color: "var(--ink-2)", paddingTop: 4 }}>
                <span>Projected payoff</span>
                <span className="mono">
                  {isFinite(mortgagePayoff)
                    ? `age ${mortgagePayoff} (${Math.round(solved.mortgagePayoffMonths)} mo)`
                    : "payment doesn't cover interest"}
                </span>
              </div>
            </div>
            <ExpenseRow label="Rent" value={s.rent || 0} onChange={update("rent")} freq="monthly" />
            <ExpenseRow label="Property tax" value={s.propertyTax} onChange={update("propertyTax")} freq="monthly" />
            <ExpenseRow label="Home insurance" value={s.homeInsurance || 0} onChange={update("homeInsurance")} freq="monthly" />
            <ExpenseRow label="Maintenance & repairs" value={s.maintenance} onChange={update("maintenance")} freq="monthly" />
            <ExpenseRow label="Utilities (hydro, gas, water)" value={s.utilities} onChange={update("utilities")} freq="monthly" />

            <div className="ob-person-label" style={{ paddingTop: 8 }}>Essentials</div>
            <ExpenseRow label="Groceries" value={s.groceries} onChange={update("groceries")} freq="monthly" />
            <ExpenseRow label="Transport & transit" value={s.transport} onChange={update("transport")} freq="monthly" />
            <ExpenseRow label="Personal care & health" value={s.personalCare} onChange={update("personalCare")} freq="monthly" step={50} />
            {s.hasKids !== false && (
              <ExpenseRow label="Childcare & activities" value={s.childcare} onChange={update("childcare")} freq="monthly" step={100} />
            )}

            <div className="ob-person-label" style={{ paddingTop: 8 }}>Lifestyle</div>
            <ExpenseRow label="Dining & takeout" value={s.dining} onChange={update("dining")} freq="monthly" />
            <ExpenseRow label="Clothing & shopping" value={s.clothing} onChange={update("clothing")} freq="monthly" />
            <ExpenseRow label="Subscriptions & tech" value={s.subscriptions} onChange={update("subscriptions")} freq="monthly" step={50} />
            <ExpenseRow label="Entertainment & hobbies" value={s.entertainment || 0} onChange={update("entertainment")} freq="monthly" step={50} />

            <div className="ob-person-label" style={{ paddingTop: 8 }}>Annual</div>
            <ExpenseRow label="Travel & holidays" value={s.travel} onChange={update("travel")} freq="annual" step={1000} />
            {s.hasKids !== false && (
              <ExpenseRow label="RESP contributions" value={s.resp} onChange={update("resp")} freq="annual" step={500} />
            )}
            <ExpenseRow label="Other annual expenses" value={s.oneTimeMisc} onChange={update("oneTimeMisc")} freq="annual" step={1000} />

            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-2)", fontSize: "var(--step--1)" }}>
                <span>Monthly (×12)</span>
                <span className="mono">{fmtMoney(inputs.monthlyExpensesTotal * 12)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-2)", fontSize: "var(--step--1)" }}>
                <span>One-time annual (incl. RESP)</span>
                <span className="mono">{fmtMoney(inputs.oneTimeAnnualTotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, color: "var(--ink)", fontSize: "var(--step--1)", paddingTop: 6, borderTop: "1px solid var(--line)" }}>
                <span>Working years total / yr</span>
                <span className="mono">{fmtMoney(grandAnnual)}</span>
              </div>
            </div>

            {/* Retirement-specific spend */}
            <div className="ob-person-label" style={{ paddingTop: 16 }}>Retirement-specific spend</div>
            <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginBottom: 8 }}>These replace your working-years budget once retired.</div>
            <ExpenseRow label="Snowbird / extended travel" value={s.retirementTravel} onChange={update("retirementTravel")} freq="annual" step={1000} />
            <ExpenseRow label="Private health / dental / vision" value={s.retirementHealthcare} onChange={update("retirementHealthcare")} freq="annual" step={500} />
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, paddingTop: 4, borderTop: "1px solid var(--line)", color: (inputs.retirementSpendDelta || 0) > 0 ? "var(--slate)" : "var(--accent-deep)" }}>
              <span>Net retirement spend change</span>
              <span className="mono">{(inputs.retirementSpendDelta || 0) > 0 ? "+" : ""}{fmtMoney(inputs.retirementSpendDelta || 0)}/yr</span>
            </div>
          </AccSection>

          {/* ── Savings & Portfolio ── */}
          <AccSection id="savings" title="Savings & Portfolio" icon="📊">
            <div className="ob-person-label">Starting portfolio</div>
            <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginBottom: 6 }}>{s.yourName || "You"}</div>
            <NumInput label="RRSP" value={s.yourRrspStart} onChange={update("yourRrspStart")} prefix="$" step={10000} />
            <NumInput label="TFSA" value={s.yourTfsaStart} onChange={update("yourTfsaStart")} prefix="$" step={10000} />
            <NumInput label="Non-registered" value={s.yourNrStart} onChange={update("yourNrStart")} prefix="$" step={10000} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--step--2)", color: "var(--ink-3)", paddingBottom: 4 }}>
              <span>{s.yourName || "You"}'s subtotal</span>
              <span className="mono">{fmtMoney((s.yourRrspStart||0) + (s.yourTfsaStart||0) + (s.yourNrStart||0))}</span>
            </div>
            {s.partnered !== false && (
              <>
                <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 8, marginBottom: 4 }}>{s.spouseName || "Spouse"}</div>
                <NumInput label="RRSP" value={s.spouseRrspStart} onChange={update("spouseRrspStart")} prefix="$" step={10000} />
                <NumInput label="TFSA" value={s.spouseTfsaStart} onChange={update("spouseTfsaStart")} prefix="$" step={10000} />
                <NumInput label="Non-registered" value={s.spouseNrStart} onChange={update("spouseNrStart")} prefix="$" step={10000} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--step--2)", color: "var(--ink-3)", paddingBottom: 4 }}>
                  <span>{s.spouseName || "Spouse"}'s subtotal</span>
                  <span className="mono">{fmtMoney((s.spouseRrspStart||0) + (s.spouseTfsaStart||0) + (s.spouseNrStart||0))}</span>
                </div>
              </>
            )}
            <div style={{ paddingTop: 4, marginTop: 4, borderTop: "1px solid var(--line)", fontSize: "var(--step--1)", color: "var(--ink-2)", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600, color: "var(--ink)" }}>Total portfolio</span>
              <span className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>{fmtMoney((s.yourRrspStart||0)+(s.yourTfsaStart||0)+(s.yourNrStart||0)+(s.partnered !== false ? (s.spouseRrspStart||0)+(s.spouseTfsaStart||0)+(s.spouseNrStart||0) : 0))}</span>
            </div>

            <div className="ob-person-label" style={{ paddingTop: 16 }}>Monthly contributions</div>
            <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginBottom: 6 }}>{s.yourName || "You"}</div>
            <NumInput label="RRSP" value={s.startingMonthly} onChange={update("startingMonthly")} prefix="$" step={100} />
            <NumInput label="TFSA" value={s.yourTfsaMonthly || 0} onChange={update("yourTfsaMonthly")} prefix="$" step={100} />
            <NumInput label="Non-registered" value={s.yourNrMonthly || 0} onChange={update("yourNrMonthly")} prefix="$" step={100} />
            {s.partnered !== false && (
              <>
                <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 8, marginBottom: 4 }}>{s.spouseName || "Spouse"}</div>
                <NumInput label="RRSP" value={s.spouseMonthly || 0} onChange={update("spouseMonthly")} prefix="$" step={100} />
                <NumInput label="TFSA" value={s.spouseTfsaMonthly || 0} onChange={update("spouseTfsaMonthly")} prefix="$" step={100} />
                <NumInput label="Non-registered" value={s.spouseNrMonthly || 0} onChange={update("spouseNrMonthly")} prefix="$" step={100} />
              </>
            )}

            <div className="ob-person-label" style={{ paddingTop: 8 }}>Annual lump-sum top-ups</div>
            <NumInput label="RRSP" value={s.rrspTopUp || 0} onChange={update("rrspTopUp")} prefix="$" step={1000} hint="e.g. year-end bonus contribution" />
            <NumInput label="TFSA" value={s.tfsaTopUp || 0} onChange={update("tfsaTopUp")} prefix="$" step={1000} />
            <NumInput label="Non-registered" value={s.nrTopUp || 0} onChange={update("nrTopUp")} prefix="$" step={1000} />
            <PctInput label="Monthly contrib growth" value={s.contribGrowth} onChange={update("contribGrowth")} />

            <div style={{ paddingTop: 8, marginTop: 4, borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-2)", fontSize: "var(--step--1)" }}>
                <span>Total monthly contributions</span>
                <span className="mono">{fmtMoney(totalMonthlyContrib)}/mo</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-2)", fontSize: "var(--step--1)" }}>
                <span>Net annual contribution (yrs 1–3)</span>
                <span className="mono" style={{ fontWeight: 600 }}>{fmtMoney(Math.max(0, startingAnnualContrib - s.extraMortgagePayment * 12))}</span>
              </div>
              <div style={{ color: "var(--ink-3)", marginTop: 4, fontSize: "var(--step--2)" }}>Waterfall: TFSA room → RRSP room → Non-reg overflow.</div>
            </div>

            <div className="ob-person-label" style={{ paddingTop: 16 }}>Contribution room (registered plans)</div>
            <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginBottom: 6 }}>{s.yourName || "You"} — carry-forward</div>
            <NumInput label="RRSP room" value={s.yourRrspRoomExisting} onChange={update("yourRrspRoomExisting")} prefix="$" step={1000} />
            <NumInput label="TFSA room" value={s.yourTfsaRoomExisting} onChange={update("yourTfsaRoomExisting")} prefix="$" step={1000} />
            {s.partnered !== false && (
              <>
                <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 8, marginBottom: 4 }}>{s.spouseName || "Spouse"} — carry-forward</div>
                <NumInput label="RRSP room" value={s.spouseRrspRoomExisting} onChange={update("spouseRrspRoomExisting")} prefix="$" step={1000} />
                <NumInput label="TFSA room" value={s.spouseTfsaRoomExisting} onChange={update("spouseTfsaRoomExisting")} prefix="$" step={1000} />
              </>
            )}

            <div style={{ fontSize: "var(--step--2)", fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", paddingTop: 8, paddingBottom: 4, borderTop: "1px solid var(--line)", marginTop: 8 }}>Annual new room (today's $)</div>
            <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginBottom: 4 }}>{s.yourName || "You"}</div>
            <NumInput label="RRSP room / yr" value={s.yourRrspRoomAnnual} onChange={update("yourRrspRoomAnnual")} prefix="$" step={500} />
            <NumInput label="TFSA room / yr" value={s.yourTfsaRoomAnnual} onChange={update("yourTfsaRoomAnnual")} prefix="$" step={500} />
            {s.partnered !== false && (
              <>
                <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 8, marginBottom: 4 }}>{s.spouseName || "Spouse"}</div>
                <NumInput label="RRSP room / yr" value={s.spouseRrspRoomAnnual} onChange={update("spouseRrspRoomAnnual")} prefix="$" step={500} />
                <NumInput label="TFSA room / yr" value={s.spouseTfsaRoomAnnual} onChange={update("spouseTfsaRoomAnnual")} prefix="$" step={500} />
              </>
            )}
          </AccSection>

          {/* ── Retirement Goal ── */}
          <AccSection id="goal" title="Retirement Goal" icon="🎯">
            <div className="ob-person-label">CPP</div>
            <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginBottom: 4 }}>{s.yourName || "You"}</div>
            <NumInput label="Estimated CPP (today's $/yr)" value={s.yourCppAmount || Math.round((s.cppAmountToday || 0) / (s.partnered !== false ? 2 : 1))} onChange={update("yourCppAmount")} prefix="$" step={500} hint="check My Service Canada for your estimate" />
            {s.partnered !== false && (
              <>
                <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 6, marginBottom: 4 }}>{s.spouseName || "Spouse"}</div>
                <NumInput label="Estimated CPP (today's $/yr)" value={s.spouseCppAmount || Math.round((s.cppAmountToday || 0) / 2)} onChange={update("spouseCppAmount")} prefix="$" step={500} />
              </>
            )}
            <NumInput label="CPP start age" value={s.cppStartAge} onChange={update("cppStartAge")} small hint="70 = optimal" />
            <InfoBox>
              Delaying CPP to 70 is typically optimal with sufficient assets — it becomes a guaranteed inflation-linked bond and reduces portfolio pressure late in retirement.
            </InfoBox>

            <div className="ob-person-label" style={{ paddingTop: 8 }}>OAS (Old Age Security)</div>
            <NumInput label="OAS per person (today's $/yr)" value={s.oasAmountToday} onChange={update("oasAmountToday")} prefix="$" step={100} />
            <NumInput label="OAS start age" value={s.oasStartAge} onChange={update("oasStartAge")} small hint="65 or 70" />
            <NumInput label="Clawback threshold / person" value={s.oasClawbackThreshold} onChange={update("oasClawbackThreshold")} prefix="$" step={1000} hint="2026: $95,323" />

            <div className="ob-person-label" style={{ paddingTop: 8 }}>Defined Benefit Pension</div>
            <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginBottom: 4 }}>{s.yourName || "You"}</div>
            <NumInput label="Monthly pension amount" value={s.pensionMonthly} onChange={update("pensionMonthly")} prefix="$" step={100} hint="today's $, leave 0 if none" />
            <NumInput label="Pension start age" value={s.pensionStartAge} onChange={update("pensionStartAge")} small />
            {s.partnered !== false && (
              <>
                <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 8, marginBottom: 4 }}>{s.spouseName || "Spouse"}</div>
                <NumInput label="Monthly pension amount" value={s.spousePensionMonthly || 0} onChange={update("spousePensionMonthly")} prefix="$" step={100} hint="today's $, leave 0 if none" />
                <NumInput label="Pension start age" value={s.spousePensionStartAge || s.pensionStartAge} onChange={update("spousePensionStartAge")} small />
              </>
            )}

            <div className="ob-person-label" style={{ paddingTop: 8 }}>Windfalls</div>
            <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginBottom: 8 }}>Enter an expected lump sum (inheritance, property sale, RSU cliff, etc.).</div>
            <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginBottom: 4 }}>{s.yourName || "You"}</div>
            <NumInput label="Windfall amount" value={s.yourWindfallAmount} onChange={update("yourWindfallAmount")} prefix="$" step={25000} />
            <NumInput label={`Age at receipt`} value={s.yourWindfallAge} onChange={update("yourWindfallAge")} small />
            {s.partnered !== false && (
              <>
                <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 8, marginBottom: 4 }}>{s.spouseName || "Spouse"}</div>
                <NumInput label="Windfall amount" value={s.spouseWindfallAmount} onChange={update("spouseWindfallAmount")} prefix="$" step={25000} />
                <NumInput label={`Age at receipt`} value={s.spouseWindfallAge} onChange={update("spouseWindfallAge")} small />
              </>
            )}
          </AccSection>

          {/* ── Assumptions ── */}
          <AccSection id="assumptions" title="Assumptions" icon="⚙️">
            <div className="ob-person-label">Market</div>
            <PctInput label="Nominal return" value={s.investmentReturn} onChange={update("investmentReturn")} />
            <PctInput label="Inflation" value={s.inflation} onChange={update("inflation")} />

            <div className="ob-person-label" style={{ paddingTop: 8 }}>Target</div>
            <NumInput label="Terminal target (age 90)" value={s.terminalTargetToday} onChange={update("terminalTargetToday")} prefix="$" step={25000} hint="today's $" />
            <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)" }}>
              Solver finds the earliest age where spending is fully covered and portfolio ends at or above this amount.
            </div>

            <div className="ob-person-label" style={{ paddingTop: 8 }}>Withdrawal tax rates</div>
            <PctInput label="RRSP/RRIF tax rate" value={s.rrspTaxRate} onChange={update("rrspTaxRate")} hint="on withdrawals" />
            <PctInput label="NR cap-gains effective rate" value={s.nrCapGainsRate} onChange={update("nrCapGainsRate")} hint="50% inclusion × marginal" />
            <PctInput label="CPP + pension tax rate" value={s.retirementIncomeTaxRate} onChange={update("retirementIncomeTaxRate")} hint="ordinary income" />
            <InfoBox>
              <strong>CPP, OAS &amp; DB pension are fully taxable</strong> as ordinary income. The model deducts this tax before netting against spending — your portfolio covers the remainder. RRSP refunds are automatically reinvested (TFSA first, then non-reg).
            </InfoBox>
          </AccSection>

        </div>
      </div>
    </div>
  );
}
