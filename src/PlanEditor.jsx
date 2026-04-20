import React, { useState, useEffect, useRef, useContext } from "react";
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

// ── Uniform field adornment wrapper ─────────────────────────────────────────
// Every input is the same width. Left slot = "$" or empty. Right slot = "%" or empty.
function FieldInput({ left, right, children }) {
  return (
    <div className="pe-field-wrap">
      <span className="pe-field-adorn pe-field-adorn--left">{left || ""}</span>
      {children}
      <span className="pe-field-adorn pe-field-adorn--right">{right || ""}</span>
    </div>
  );
}

// Comma-formatted number input: shows commas when blurred, raw digits when focused
function CommaInput({ value, onChange }) {
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
      className="pe-field-input mono"
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

function NumInput({ label, value, onChange, prefix, hint }) {
  return (
    <div className="inp-row">
      <span>{label}{hint && <span className="inp-hint"> · {hint}</span>}</span>
      <FieldInput left={prefix || ""}>
        <CommaInput value={value} onChange={onChange} />
      </FieldInput>
    </div>
  );
}

// PctInput supports up to 4 decimal places (e.g. 3.85% or 0.25%)
function PctInput({ label, value, onChange, hint }) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState("");
  const toDisplay = (v) => v ? parseFloat((v * 100).toFixed(4)).toString() : "";
  const display = focused ? raw : toDisplay(value);
  useEffect(() => {
    if (!focused) setRaw(toDisplay(value));
  }, [value, focused]);
  return (
    <div className="inp-row">
      <span>{label}{hint && <span className="inp-hint"> · {hint}</span>}</span>
      <FieldInput right="%">
        <input
          type="text"
          inputMode="decimal"
          className="pe-field-input mono"
          value={display}
          onFocus={() => { setFocused(true); setRaw(toDisplay(value)); }}
          onChange={(e) => {
            const cleaned = e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1");
            setRaw(cleaned);
            if (cleaned !== "" && !cleaned.endsWith(".")) {
              const n = parseFloat(cleaned);
              if (!isNaN(n)) onChange(n / 100);
            } else if (cleaned === "") {
              onChange(0);
            }
          }}
          onBlur={() => {
            setFocused(false);
            const n = parseFloat(raw);
            if (!isNaN(n)) {
              onChange(n / 100);
              setRaw(parseFloat(n.toFixed(4)).toString());
            } else {
              setRaw("");
            }
          }}
        />
      </FieldInput>
    </div>
  );
}

function ExpenseRow({ label, value, onChange, freq }) {
  return (
    <div className="inp-row">
      <span>{label} <span style={{ color: "var(--ink-3)", fontSize: "var(--step--2)" }}>/{freq === "annual" ? "yr" : "mo"}</span></span>
      <FieldInput left="$">
        <CommaInput value={value} onChange={onChange} />
      </FieldInput>
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

// ── PersonBlock ───────────────────────────────────────────────────────────────
// Wraps a group of fields for one person with a coloured header pill.
// variant: "you" | "spouse" | "shared"
function PersonBlock({ name, variant = "you", children }) {
  return (
    <div className={`pe-person pe-person--${variant}`}>
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
          padding: "16px 0",
          cursor: "pointer",
          borderBottom: open ? "none" : "1px solid var(--line)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {icon && <span style={{ fontSize: "var(--step-1)" }}>{icon}</span>}
          <span style={{ fontSize: "var(--step-1)", fontWeight: 600, color: "var(--ink)" }}>{title}</span>
        </div>
        <svg
          width="20" height="20" viewBox="0 0 20 20" fill="none"
          style={{
            color: "var(--ink-3)",
            flexShrink: 0,
            transition: "transform 0.22s cubic-bezier(0.32,0.72,0.24,1)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
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

// ── Housing type toggle ───────────────────────────────────────────────────────

// ── Main PlanEditor ───────────────────────────────────────────────────────────

export default function PlanEditor({ s, update, solved, inputs, saveStatus }) {
  const hidden = useContext(PrivacyContext);
  const fmtMoney = (n) => fmt$(n, hidden);

  // Housing type: "mortgage" or "rent"
  const housingType = s.housingType || (s.mortgage > 0 ? "mortgage" : "rent");

  // Derive sensible CPP / OAS start age defaults from income
  // CPP: if household gross > ~150k, suggest 70; else 65
  const suggestedCppAge = s.yourBase + (s.spouseBase || 0) > 150000 ? 70 : 65;
  const suggestedOasAge = s.yourBase + (s.spouseBase || 0) > 150000 ? 70 : 65;

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

  // Default snowbird to travel value if not yet set
  const retirementTravelValue = s.retirementTravel != null ? s.retirementTravel : (s.travel || 0);

  const sections = [
    { id: "household", label: "Household" },
    { id: "income", label: "Income & Tax" },
    { id: "spending", label: "Spending" },
    { id: "savings", label: "Savings & Portfolio" },
    { id: "windfalls", label: "Windfalls" },
    { id: "goal", label: "Retirement Goal" },
    { id: "assumptions", label: "Assumptions" },
  ];

  // Ref to the scrollable content column — used for IntersectionObserver root
  const scrollRef = useRef(null);

  // Track which section is currently in view
  const [activeSection, setActiveSection] = useState("household");
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const els = sections.map(sec => document.getElementById(`pe-${sec.id}`)).filter(Boolean);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id.replace("pe-", ""));
        }
      },
      { root, rootMargin: "-10% 0px -60% 0px", threshold: 0 }
    );
    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function scrollToSection(id) {
    const root = scrollRef.current;
    const el = document.getElementById(`pe-${id}`);
    if (!root || !el) return;
    // Smooth-scroll within the content column, not window
    const offset = el.offsetTop - 16; // small breathing room
    root.scrollTo({ top: offset, behavior: "smooth" });
  }

  return (
    <div className="pe-frame" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{
        padding: "16px 24px",
        borderBottom: "1px solid var(--line)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--paper)",
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: "var(--step-0)", fontWeight: 600, color: "var(--ink)" }}>Plan Editor</div>
          <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 2 }}>All your assumptions in one place</div>
        </div>
        <SaveIndicator saveStatus={saveStatus} />
      </div>

      {/* Body: ToC + scrollable content side by side, filling remaining height */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        {/* ToC sidebar — fixed height, never scrolls */}
        <div style={{
          width: 172,
          flexShrink: 0,
          padding: "24px 12px 24px 20px",
          borderRight: "1px solid var(--line)",
          overflowY: "auto",
          height: "100%",
        }}>
          <div style={{ fontSize: "var(--step--2)", fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Sections</div>
          {sections.map(sec => {
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => scrollToSection(sec.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  fontSize: "var(--step--1)",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--ink)" : "var(--ink-2)",
                  background: isActive ? "var(--paper-2)" : "none",
                  border: "none",
                  borderLeft: isActive ? "2px solid var(--accent-deep)" : "2px solid transparent",
                  padding: "6px 10px",
                  borderRadius: "0 var(--r-2) var(--r-2) 0",
                  cursor: "pointer",
                  marginBottom: 1,
                  transition: "all 0.15s",
                }}
              >
                {sec.label}
              </button>
            );
          })}
        </div>

        {/* Main content — this is the ONLY thing that scrolls */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", height: "100%" }}>
        <div className="pe-stack" style={{ padding: "0 32px 60px", maxWidth: 680 }}>

          {/* ── Household ── */}
          <AccSection id="household" title="Household" icon="👥">
            <PersonBlock name={s.yourName || "You"} variant="you">
              <div className="inp-row">
                <span>Name</span>
                <input
                  type="text"
                  value={s.yourName || ""}
                  placeholder="e.g. Alex"
                  onChange={(e) => update("yourName")(e.target.value)}
                  className="--sm"
                />
              </div>
              <NumInput label="Current age" value={s.currentAge} onChange={update("currentAge")} small />
            </PersonBlock>

            {s.partnered !== false && (
              <PersonBlock name={s.spouseName || "Spouse"} variant="spouse">
                <div className="inp-row">
                  <span>Name</span>
                  <input
                    type="text"
                    value={s.spouseName || ""}
                    placeholder="e.g. Jamie"
                    onChange={(e) => update("spouseName")(e.target.value)}
                    className="--sm"
                  />
                </div>
                <NumInput label="Current age" value={s.spouseCurrentAge} onChange={update("spouseCurrentAge")} small />
              </PersonBlock>
            )}

            <PersonBlock name="Household" variant="shared">
              <NumInput label="End-of-plan age" value={s.deathAge} onChange={update("deathAge")} small hint="horizon for projections" />
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
            </PersonBlock>
          </AccSection>

          {/* ── Income & Tax ── */}
          <AccSection id="income" title="Income & Tax" icon="💼">
            <PersonBlock name={s.yourName || "You"} variant="you">
              <NumInput label="Annual base salary" value={s.yourBase} onChange={update("yourBase")} prefix="$" step={1000} />
              <PctInput label="Performance bonus (% of base)" value={s.yourBonusPct} onChange={update("yourBonusPct")} />
              <PctInput label="Equity / RSUs / options (% of base)" value={s.yourEquityPct} onChange={update("yourEquityPct")} hint="total variable equity, invested as vested" />
              <PctInput label="Commission & profit sharing (% of base)" value={s.yourCommissionPct || 0} onChange={update("yourCommissionPct")} />
            </PersonBlock>

            {s.partnered !== false && (
              <PersonBlock name={s.spouseName || "Spouse"} variant="spouse">
                <NumInput label="Annual base salary" value={s.spouseBase} onChange={update("spouseBase")} prefix="$" step={1000} />
                <PctInput label="Performance bonus (% of base)" value={s.spouseBonusPct} onChange={update("spouseBonusPct")} />
                <PctInput label="Equity / RSUs / options (% of base)" value={s.spouseEquityPct} onChange={update("spouseEquityPct")} hint="total variable equity, invested as vested" />
                <PctInput label="Commission & profit sharing (% of base)" value={s.spouseCommissionPct || 0} onChange={update("spouseCommissionPct")} />
              </PersonBlock>
            )}

            <PersonBlock name="Tax & growth" variant="shared">
              <PctInput label="Blended tax rate" value={s.taxRate} onChange={update("taxRate")} />
              <PctInput label="Income growth (real)" value={s.incomeGrowth} onChange={update("incomeGrowth")} />
            </PersonBlock>

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

            {/* Mortgage / Rent toggle */}
            <div className="inp-row">
              <span>Housing type</span>
              <div className="seg">
                <button
                  onClick={() => update("housingType")("mortgage")}
                  className={housingType === "mortgage" ? "is-active" : ""}
                >Mortgage</button>
                <button
                  onClick={() => update("housingType")("rent")}
                  className={housingType === "rent" ? "is-active" : ""}
                >Rent</button>
              </div>
            </div>

            {housingType === "mortgage" ? (
              <>
                <ExpenseRow label="Mortgage payment" value={s.mortgage} onChange={update("mortgage")} freq="monthly" />
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
                <ExpenseRow label="Property tax" value={s.propertyTax} onChange={update("propertyTax")} freq="monthly" />
                <ExpenseRow label="Home insurance" value={s.homeInsurance || 0} onChange={update("homeInsurance")} freq="monthly" />
                <ExpenseRow label="Maintenance & repairs" value={s.maintenance} onChange={update("maintenance")} freq="monthly" />
              </>
            ) : (
              <>
                <ExpenseRow label="Rent" value={s.rent || 0} onChange={update("rent")} freq="monthly" />
                <ExpenseRow label="Tenant insurance" value={s.homeInsurance || 0} onChange={update("homeInsurance")} freq="monthly" />
              </>
            )}
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

            {/* Cars sub-section */}
            <div className="label-xs" style={{ padding: "12px 0 4px" }}>Cars</div>
            <PersonBlock name="Running costs (monthly)" variant="shared">
              <ExpenseRow label="Car payment / lease" value={s.carPayment || 0} onChange={update("carPayment")} freq="monthly" />
              <ExpenseRow label="Gas & charging" value={s.carGas || 0} onChange={update("carGas")} freq="monthly" />
              <ExpenseRow label="Insurance" value={s.carInsurance || 0} onChange={update("carInsurance")} freq="monthly" />
              <ExpenseRow label="Parking & tolls" value={s.carParking || 0} onChange={update("carParking")} freq="monthly" />
            </PersonBlock>
            <PersonBlock name="Annual costs" variant="shared">
              <ExpenseRow label="Maintenance & repairs" value={s.carMaintenance || 0} onChange={update("carMaintenance")} freq="annual" />
              <ExpenseRow label="Registration & licensing" value={s.carRegistration || 0} onChange={update("carRegistration")} freq="annual" />
              <NumInput label="Replacement cost" value={s.carReplacementCost || 0} onChange={update("carReplacementCost")} prefix="$" hint="per vehicle, today's $" />
              <NumInput label="Replace every N years" value={s.carReplaceEvery || 10} onChange={update("carReplaceEvery")} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--step--2)", color: "var(--ink-3)", paddingTop: 4 }}>
                <span>Implied annual provision</span>
                <span className="mono">{fmtMoney((s.carReplacementCost || 0) / Math.max(1, s.carReplaceEvery || 10))}/yr</span>
              </div>
            </PersonBlock>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, color: "var(--ink)", fontSize: "var(--step--1)", padding: "6px 0 4px", borderTop: "1px solid var(--line)" }}>
              <span>Total car cost / yr</span>
              <span className="mono">{fmtMoney(((s.carPayment||0)+(s.carGas||0)+(s.carInsurance||0)+(s.carParking||0))*12+(s.carMaintenance||0)+(s.carRegistration||0))}</span>
            </div>

            {/* Retirement-specific spend */}
            <div className="label-xs" style={{ padding: "12px 0 4px" }}>Retirement-specific spend</div>
            <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginBottom: 8 }}>These replace your working-years budget once retired.</div>
            <ExpenseRow label="Snowbird / extended travel" value={retirementTravelValue} onChange={update("retirementTravel")} freq="annual" />
            <ExpenseRow label="Private health / dental / vision" value={s.retirementHealthcare != null ? s.retirementHealthcare : 3000} onChange={update("retirementHealthcare")} freq="annual" />
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, paddingTop: 6, borderTop: "1px solid var(--line)", color: (inputs.retirementSpendDelta || 0) > 0 ? "var(--slate)" : "var(--accent-deep)" }}>
              <span style={{ fontSize: "var(--step--1)" }}>Net retirement spend change</span>
              <span className="mono" style={{ fontSize: "var(--step--1)" }}>{(inputs.retirementSpendDelta || 0) > 0 ? "+" : ""}{fmtMoney(inputs.retirementSpendDelta || 0)}/yr</span>
            </div>
          </AccSection>

          {/* ── Savings & Portfolio ── */}
          <AccSection id="savings" title="Savings & Portfolio" icon="📊">
            <div className="label-xs" style={{ padding: "8px 0 4px" }}>Starting portfolio</div>
            <PersonBlock name={s.yourName || "You"} variant="you">
              <NumInput label="RRSP" value={s.yourRrspStart} onChange={update("yourRrspStart")} prefix="$" step={10000} />
              <NumInput label="TFSA" value={s.yourTfsaStart} onChange={update("yourTfsaStart")} prefix="$" step={10000} />
              <NumInput label="Non-registered" value={s.yourNrStart} onChange={update("yourNrStart")} prefix="$" step={10000} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--step--2)", color: "var(--ink-3)", paddingTop: 4, borderTop: "1px solid var(--line)", marginTop: 2 }}>
                <span>Subtotal</span>
                <span className="mono">{fmtMoney((s.yourRrspStart||0) + (s.yourTfsaStart||0) + (s.yourNrStart||0))}</span>
              </div>
            </PersonBlock>
            {s.partnered !== false && (
              <PersonBlock name={s.spouseName || "Spouse"} variant="spouse">
                <NumInput label="RRSP" value={s.spouseRrspStart} onChange={update("spouseRrspStart")} prefix="$" step={10000} />
                <NumInput label="TFSA" value={s.spouseTfsaStart} onChange={update("spouseTfsaStart")} prefix="$" step={10000} />
                <NumInput label="Non-registered" value={s.spouseNrStart} onChange={update("spouseNrStart")} prefix="$" step={10000} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--step--2)", color: "var(--ink-3)", paddingTop: 4, borderTop: "1px solid var(--line)", marginTop: 2 }}>
                  <span>Subtotal</span>
                  <span className="mono">{fmtMoney((s.spouseRrspStart||0) + (s.spouseTfsaStart||0) + (s.spouseNrStart||0))}</span>
                </div>
              </PersonBlock>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, color: "var(--ink)", fontSize: "var(--step--1)", padding: "6px 0 8px", borderTop: "1px solid var(--line)" }}>
              <span>Total portfolio</span>
              <span className="mono">{fmtMoney((s.yourRrspStart||0)+(s.yourTfsaStart||0)+(s.yourNrStart||0)+(s.partnered !== false ? (s.spouseRrspStart||0)+(s.spouseTfsaStart||0)+(s.spouseNrStart||0) : 0))}</span>
            </div>

            <div className="label-xs" style={{ padding: "8px 0 4px" }}>Monthly contributions</div>
            <PersonBlock name={s.yourName || "You"} variant="you">
              <NumInput label="RRSP" value={s.startingMonthly} onChange={update("startingMonthly")} prefix="$" step={100} />
              <NumInput label="TFSA" value={s.yourTfsaMonthly || 0} onChange={update("yourTfsaMonthly")} prefix="$" step={100} />
              <NumInput label="Non-registered" value={s.yourNrMonthly || 0} onChange={update("yourNrMonthly")} prefix="$" step={100} />
            </PersonBlock>
            {s.partnered !== false && (
              <PersonBlock name={s.spouseName || "Spouse"} variant="spouse">
                <NumInput label="RRSP" value={s.spouseMonthly || 0} onChange={update("spouseMonthly")} prefix="$" step={100} />
                <NumInput label="TFSA" value={s.spouseTfsaMonthly || 0} onChange={update("spouseTfsaMonthly")} prefix="$" step={100} />
                <NumInput label="Non-registered" value={s.spouseNrMonthly || 0} onChange={update("spouseNrMonthly")} prefix="$" step={100} />
              </PersonBlock>
            )}

            <PersonBlock name="Annual lump-sum top-ups" variant="shared">
              <NumInput label="RRSP" value={s.rrspTopUp || 0} onChange={update("rrspTopUp")} prefix="$" step={1000} hint="e.g. year-end bonus contribution" />
              <NumInput label="TFSA" value={s.tfsaTopUp || 0} onChange={update("tfsaTopUp")} prefix="$" step={1000} />
              <NumInput label="Non-registered" value={s.nrTopUp || 0} onChange={update("nrTopUp")} prefix="$" step={1000} />
              <PctInput label="Monthly contrib growth" value={s.contribGrowth} onChange={update("contribGrowth")} />
            </PersonBlock>

            <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "6px 0 8px", borderTop: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-2)", fontSize: "var(--step--1)" }}>
                <span>Total monthly contributions</span>
                <span className="mono">{fmtMoney(totalMonthlyContrib)}/mo</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-2)", fontSize: "var(--step--1)" }}>
                <span>Net annual contribution (yrs 1–3)</span>
                <span className="mono" style={{ fontWeight: 600 }}>{fmtMoney(Math.max(0, startingAnnualContrib - (s.extraMortgagePayment || 0) * 12))}</span>
              </div>
              <div style={{ color: "var(--ink-3)", marginTop: 2, fontSize: "var(--step--2)" }}>Waterfall: TFSA room → RRSP room → Non-reg overflow.</div>
            </div>

            <div className="label-xs" style={{ padding: "8px 0 4px" }}>Contribution room</div>
            <PersonBlock name={`${s.yourName || "You"} — carry-forward`} variant="you">
              <NumInput label="RRSP room" value={s.yourRrspRoomExisting} onChange={update("yourRrspRoomExisting")} prefix="$" />
              <NumInput label="TFSA room" value={s.yourTfsaRoomExisting} onChange={update("yourTfsaRoomExisting")} prefix="$" />
              <NumInput label="RRSP room / yr" value={s.yourRrspRoomAnnual} onChange={update("yourRrspRoomAnnual")} prefix="$" hint="2026 max: $32,490" />
              <NumInput label="TFSA room / yr" value={s.yourTfsaRoomAnnual} onChange={update("yourTfsaRoomAnnual")} prefix="$" hint="2026: $7,000" />
            </PersonBlock>
            {s.partnered !== false && (
              <PersonBlock name={`${s.spouseName || "Spouse"} — carry-forward`} variant="spouse">
                <NumInput label="RRSP room" value={s.spouseRrspRoomExisting} onChange={update("spouseRrspRoomExisting")} prefix="$" />
                <NumInput label="TFSA room" value={s.spouseTfsaRoomExisting} onChange={update("spouseTfsaRoomExisting")} prefix="$" />
                <NumInput label="RRSP room / yr" value={s.spouseRrspRoomAnnual} onChange={update("spouseRrspRoomAnnual")} prefix="$" hint="2026 max: $32,490" />
                <NumInput label="TFSA room / yr" value={s.spouseTfsaRoomAnnual} onChange={update("spouseTfsaRoomAnnual")} prefix="$" hint="2026: $7,000" />
              </PersonBlock>
            )}
          </AccSection>

          {/* ── Retirement Goal ── */}
          <AccSection id="goal" title="Retirement Goal" icon="🎯">
            <div className="label-xs" style={{ padding: "8px 0 4px" }}>CPP</div>
            <PersonBlock name={s.yourName || "You"} variant="you">
              <NumInput label="Estimated CPP (today's $/yr)" value={s.yourCppAmount || Math.round((s.cppAmountToday || 0) / (s.partnered !== false ? 2 : 1))} onChange={update("yourCppAmount")} prefix="$" step={500} />
            </PersonBlock>
            {s.partnered !== false && (
              <PersonBlock name={s.spouseName || "Spouse"} variant="spouse">
                <NumInput label="Estimated CPP (today's $/yr)" value={s.spouseCppAmount || Math.round((s.cppAmountToday || 0) / 2)} onChange={update("spouseCppAmount")} prefix="$" step={500} />
              </PersonBlock>
            )}
            <PersonBlock name="CPP start age" variant="shared">
              <NumInput label="Start age" value={s.cppStartAge} onChange={update("cppStartAge")} small hint={suggestedCppAge === 70 ? "70 recommended based on your income" : "65–70"} />
              {s.cppStartAge < suggestedCppAge && (
                <InfoBox>
                  Based on your income level, delaying CPP to {suggestedCppAge} is typically optimal — it acts as a guaranteed inflation-linked annuity and reduces portfolio pressure in late retirement.
                  <span
                    style={{ display: "inline-block", marginLeft: 8, color: "var(--accent-deep)", cursor: "pointer", textDecoration: "underline" }}
                    onClick={() => update("cppStartAge")(suggestedCppAge)}
                  >Set to {suggestedCppAge}</span>
                </InfoBox>
              )}
            </PersonBlock>

            <PersonBlock name="OAS (Old Age Security)" variant="shared">
              <NumInput label="OAS per person (today's $/yr)" value={s.oasAmountToday} onChange={update("oasAmountToday")} prefix="$" step={100} />
              <NumInput label="OAS start age" value={s.oasStartAge} onChange={update("oasStartAge")} small hint={suggestedOasAge === 70 ? "70 recommended based on your income" : "65 or 70"} />
              {s.oasStartAge < suggestedOasAge && (
                <InfoBox>
                  Delaying OAS to {suggestedOasAge} increases payments by 36% permanently — worth it if your portfolio can cover the gap.
                  <span
                    style={{ display: "inline-block", marginLeft: 8, color: "var(--accent-deep)", cursor: "pointer", textDecoration: "underline" }}
                    onClick={() => update("oasStartAge")(suggestedOasAge)}
                  >Set to {suggestedOasAge}</span>
                </InfoBox>
              )}
              <NumInput label="Clawback threshold / person" value={s.oasClawbackThreshold} onChange={update("oasClawbackThreshold")} prefix="$" step={1000} hint="2026: $95,323" />
            </PersonBlock>

            <div className="label-xs" style={{ padding: "8px 0 4px" }}>Defined Benefit Pension</div>
            <PersonBlock name={s.yourName || "You"} variant="you">
              <NumInput label="Monthly pension amount" value={s.pensionMonthly} onChange={update("pensionMonthly")} prefix="$" step={100} hint="today's $" />
              <NumInput label="Pension start age" value={s.pensionStartAge} onChange={update("pensionStartAge")} small />
            </PersonBlock>
            {s.partnered !== false && (
              <PersonBlock name={s.spouseName || "Spouse"} variant="spouse">
                <NumInput label="Monthly pension amount" value={s.spousePensionMonthly || 0} onChange={update("spousePensionMonthly")} prefix="$" step={100} hint="today's $" />
                <NumInput label="Pension start age" value={s.spousePensionStartAge || s.pensionStartAge} onChange={update("spousePensionStartAge")} small />
              </PersonBlock>
            )}

          </AccSection>

          {/* ── Windfalls ── */}
          <AccSection id="windfalls" title="Windfalls" icon="💰" defaultOpen={false}>
            <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginBottom: 8 }}>
              Expected lump sum — inheritance, property sale, RSU cliff, business exit, etc.
            </div>
            <PersonBlock name={s.yourName || "You"} variant="you">
              <NumInput label="Windfall amount" value={s.yourWindfallAmount} onChange={update("yourWindfallAmount")} prefix="$" />
              <NumInput label="Age at receipt" value={s.yourWindfallAge} onChange={update("yourWindfallAge")} />
            </PersonBlock>
            {s.partnered !== false && (
              <PersonBlock name={s.spouseName || "Spouse"} variant="spouse">
                <NumInput label="Windfall amount" value={s.spouseWindfallAmount} onChange={update("spouseWindfallAmount")} prefix="$" />
                <NumInput label="Age at receipt" value={s.spouseWindfallAge} onChange={update("spouseWindfallAge")} />
              </PersonBlock>
            )}
          </AccSection>

          {/* ── Assumptions ── */}
          <AccSection id="assumptions" title="Assumptions" icon="⚙️">
            <PersonBlock name="Market" variant="shared">
              <PctInput label="Market return (nominal)" value={s.investmentReturn != null ? s.investmentReturn : 0.07} onChange={update("investmentReturn")} hint="long-run nominal; 7% = ~4% real + 3% inflation" />
              <PctInput label="Inflation" value={s.inflation != null ? s.inflation : 0.03} onChange={update("inflation")} hint="3% = Bank of Canada target" />
            </PersonBlock>

            <PersonBlock name="Die with" variant="shared">
              <NumInput label="Die with (today's $)" value={s.terminalTargetToday} onChange={update("terminalTargetToday")} prefix="$" step={25000} />
              <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", paddingTop: 2 }}>
                Solver finds the earliest age where spending is fully covered and portfolio ends at or above this amount.
              </div>
            </PersonBlock>

            <PersonBlock name="Withdrawal tax rates" variant="shared">
              <PctInput label="RRSP/RRIF withdrawal rate" value={s.rrspTaxRate != null ? s.rrspTaxRate : 0.37} onChange={update("rrspTaxRate")} hint="marginal rate in retirement" />
              <PctInput label="Non-reg cap-gains rate" value={s.nrCapGainsRate != null ? s.nrCapGainsRate : 0.21} onChange={update("nrCapGainsRate")} hint="50% inclusion × marginal rate" />
              <PctInput label="CPP + pension + OAS rate" value={s.retirementIncomeTaxRate != null ? s.retirementIncomeTaxRate : 0.25} onChange={update("retirementIncomeTaxRate")} hint="ordinary income in retirement" />
              <InfoBox>
                <strong>CPP, OAS &amp; DB pension are fully taxable</strong> as ordinary income. The model deducts this tax before netting against spending — your portfolio covers the remainder. RRSP refunds are automatically reinvested (TFSA first, then non-reg).
              </InfoBox>
            </PersonBlock>
          </AccSection>

        </div>
        </div>{/* end scrollable content */}
      </div>{/* end body */}
    </div>{/* end pe-frame */}
  );
}
