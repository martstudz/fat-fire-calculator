import React, { useState, useEffect, useRef, useContext } from "react";
import { PrivacyContext } from "./FatFireCalculator";
import { fmt$, formatCommas } from "./utils";
import { PersonBlock, PersonGroup } from "./SharedComponents";

// ── Collapse — animates children in/out on boolean `open` prop ───────────────
function Collapse({ open, children }) {
  return (
    <div className={`collapse-wrap${open ? "" : " is-collapsed"}`}>
      <div className="collapse-inner">{children}</div>
    </div>
  );
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
      onFocus={(e) => { setFocused(true); setRaw(value ? String(value) : ""); e.target.select(); }}
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
          onFocus={(e) => { setFocused(true); setRaw(value ? toDisplay(value) : ""); e.target.select(); }}
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

function InfoBox({ children }) {
  return (
    <div className="info-box" style={{ margin: "6px 0" }}>
      {children}
    </div>
  );
}

// ── Accordion section ─────────────────────────────────────────────────────────

function AccSection({ id, title, icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="pe-accordion" id={`pe-${id}`}>
      <button className={`pe-accordion__head${open ? "" : " is-closed"}`} onClick={() => setOpen(o => !o)}>
        <div className="pe-accordion__title">
          {icon && <span className="pe-accordion__icon">{icon}</span>}
          <span>{title}</span>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 20 20" fill="none"
          className={`pe-accordion__chevron${open ? " is-open" : ""}`}
        >
          <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <div className={`collapse-wrap${open ? "" : " is-collapsed"}`}>
        <div className="collapse-inner">
          <div className="pe-fields pe-fields--section">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Save indicator ────────────────────────────────────────────────────────────

function SaveIndicator({ saveStatus }) {
  if (saveStatus === "saving") return <span style={{ fontSize: "var(--step--2)", color: "var(--ink-3)" }}>Saving…</span>;
  if (saveStatus === "error") return <span className="pe-save-error" style={{ fontSize: "var(--step--2)" }}>Save failed</span>;
  return <span style={{ fontSize: "var(--step--2)", color: "var(--ink-3)" }}>Saved</span>;
}

// ── Housing type toggle ───────────────────────────────────────────────────────

// ── Main PlanEditor ───────────────────────────────────────────────────────────

export default function PlanEditor({ s, update, solved, inputs, saveStatus }) {
  const hidden = useContext(PrivacyContext);
  const fmtMoney = (n) => fmt$(n, hidden);

  // Housing type: "mortgage" or "rent"
  const housingType = s.housingType || (s.mortgage > 0 ? "mortgage" : "rent");

  // Derived values
  const yourBonusAmt = s.yourBase * s.yourBonusPct;
  const spouseBonusAmt = s.spouseBase * s.spouseBonusPct;
  const householdGross = s.yourBase + s.spouseBase + yourBonusAmt + spouseBonusAmt;
  const totalMonthlyContrib = (s.startingMonthly || 0)
    + (s.yourTfsaMonthly || 0) + (s.yourNrMonthly || 0)
    + (s.spouseMonthly || 0) + (s.spouseTfsaMonthly || 0) + (s.spouseNrMonthly || 0);
  const mortgagePayoff = solved.mortgagePayoffAge;

  const sections = [
    { id: "household", label: "Household" },
    { id: "income", label: "Income & Tax" },
    { id: "spending", label: "Spending" },
    { id: "savings", label: "Savings & Portfolio" },
    { id: "assumptions", label: "Assumptions" },
  ];

  const scrollRef = useRef(null);

  // Track which section is currently in view — observe within our own scroll container
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
    const rootRect = root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    root.scrollTo({ top: root.scrollTop + (elRect.top - rootRect.top) - 16, behavior: "smooth" });
  }

  return (
    <div className="pe-frame" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Body: ToC (static) + content (scrolls). minHeight:0 lets flex children shrink. */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        {/* ToC sidebar — never scrolls, always visible */}
        <div style={{
          width: 172,
          flexShrink: 0,
          padding: "24px 12px 24px 20px",
          borderRight: "1px solid var(--line)",
          overflowY: "auto",
        }}>
          <div style={{ fontSize: "var(--step--2)", fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Sections</div>
          {sections.map(sec => {
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => scrollToSection(sec.id)}
                className={`pe-toc-btn${isActive ? " is-active" : ""}`}
              >
                {sec.label}
              </button>
            );
          })}
        </div>

        {/* Main content — this is the ONLY thing that scrolls */}
        <div ref={scrollRef} style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
        <div className="pe-stack" style={{ padding: "0 32px 60px", maxWidth: 680 }}>

          {/* ── Household ── */}
          <AccSection id="household" title="Household" icon="🏡">
            <PersonGroup>
              <PersonBlock name={s.yourName || "You"} variant="you">
                <div className="inp-row">
                  <span>Name</span>
                  <div className="pe-field-wrap">
                    <input
                      type="text"
                      value={s.yourName || ""}
                      placeholder="e.g. Alex"
                      onChange={(e) => update("yourName")(e.target.value)}
                      className="pe-field-input"
                    />
                  </div>
                </div>
                <NumInput label="Current age" value={s.currentAge} onChange={update("currentAge")} small />
              </PersonBlock>

              <PersonBlock name={s.spouseName || "Spouse"} variant="spouse" open={s.partnered !== false}>
                <div className="inp-row">
                  <span>Name</span>
                  <div className="pe-field-wrap">
                    <input
                      type="text"
                      value={s.spouseName || ""}
                      placeholder="e.g. Jamie"
                      onChange={(e) => update("spouseName")(e.target.value)}
                      className="pe-field-input"
                    />
                  </div>
                </div>
                <NumInput label="Current age" value={s.spouseCurrentAge} onChange={update("spouseCurrentAge")} small />
              </PersonBlock>
            </PersonGroup>

            <PersonBlock name="Household" variant="shared">
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
            <PersonGroup
              totalLabel="Total Household Income"
              totalValue={fmtMoney(s.yourBase + yourBonusAmt + (s.partnered !== false ? s.spouseBase + spouseBonusAmt : 0))}
            >
              <PersonBlock name={s.yourName || "You"} variant="you">
                <NumInput label="Base pay" value={s.yourBase} onChange={update("yourBase")} prefix="$" step={1000} hint="annual salary" />
                <NumInput label="Bonus" value={Math.round(s.yourBase * (s.yourBonusPct || 0))} onChange={(v) => update("yourBonusPct")(s.yourBase > 0 ? v / s.yourBase : 0)} prefix="$" step={1000} hint="annual average" />
              </PersonBlock>

              <PersonBlock name={s.spouseName || "Spouse"} variant="spouse" open={s.partnered !== false}>
                <NumInput label="Base pay" value={s.spouseBase} onChange={update("spouseBase")} prefix="$" step={1000} hint="annual salary" />
                <NumInput label="Bonus" value={Math.round(s.spouseBase * (s.spouseBonusPct || 0))} onChange={(v) => update("spouseBonusPct")(s.spouseBase > 0 ? v / s.spouseBase : 0)} prefix="$" step={1000} hint="annual average" />
              </PersonBlock>
            </PersonGroup>

            <PersonBlock name="Tax & growth" variant="shared">
              <PctInput label="Blended tax rate" value={s.taxRate} onChange={update("taxRate")} />
              <PctInput label="Income growth (real)" value={s.incomeGrowth} onChange={update("incomeGrowth")} />
            </PersonBlock>
          </AccSection>

          {/* ── Spending ── */}
          <AccSection id="spending" title="Spending" icon="🛒">

            {/* Housing */}
            <div className="label-xs pe-section-label">Housing</div>

            {/* Housing rows in a card */}
            <div className="pe-row-group">
              <div className="inp-row">
                <span>Housing type</span>
                <div className="seg">
                  <button onClick={() => update("housingType")("mortgage")} className={housingType === "mortgage" ? "is-active" : ""}>Mortgage</button>
                  <button onClick={() => update("housingType")("rent")} className={housingType === "rent" ? "is-active" : ""}>Rent</button>
                </div>
              </div>
              <Collapse open={housingType === "mortgage"}>
                <div className="inp-row">
                  <span>Mortgage</span>
                  <FieldInput left="$"><CommaInput value={s.mortgage} onChange={update("mortgage")} /></FieldInput>
                </div>
                <div className="inp-row">
                  <span>Principal remaining</span>
                  <FieldInput left="$"><CommaInput value={s.mortgagePrincipal} onChange={update("mortgagePrincipal")} /></FieldInput>
                </div>
                <div className="inp-row">
                  <span>Interest rate</span>
                  <FieldInput right="%">
                    <input type="text" inputMode="decimal" className="pe-field-input mono"
                      value={s.mortgageRate ? parseFloat((s.mortgageRate * 100).toFixed(4)).toString() : ""}
                      onFocus={(e) => { if (!s.mortgageRate) e.target.value = ""; e.target.select(); }}
                      onChange={(e) => { const n = parseFloat(e.target.value); if (!isNaN(n)) update("mortgageRate")(n / 100); else if (e.target.value === "") update("mortgageRate")(0); }}
                    />
                  </FieldInput>
                </div>
                {isFinite(mortgagePayoff) && (
                  <div className="inp-row" style={{ color: "var(--ink-3)" }}>
                    <span>Projected payoff</span>
                    <span className="mono" style={{ fontSize: "var(--step--2)" }}>age {mortgagePayoff} ({Math.round(solved.mortgagePayoffMonths)} mo)</span>
                  </div>
                )}
                <div className="inp-row">
                  <span>Property tax</span>
                  <FieldInput left="$"><CommaInput value={s.propertyTax} onChange={update("propertyTax")} /></FieldInput>
                </div>
                <div className="inp-row">
                  <span>Home insurance</span>
                  <FieldInput left="$"><CommaInput value={s.homeInsurance || 0} onChange={update("homeInsurance")} /></FieldInput>
                </div>
                <div className="inp-row">
                  <span>Maintenance</span>
                  <FieldInput left="$"><CommaInput value={s.maintenance} onChange={update("maintenance")} /></FieldInput>
                </div>
              </Collapse>
              <Collapse open={housingType === "rent"}>
                <div className="inp-row">
                  <span>Rent</span>
                  <FieldInput left="$"><CommaInput value={s.rent || 0} onChange={update("rent")} /></FieldInput>
                </div>
                <div className="inp-row">
                  <span>Tenant insurance</span>
                  <FieldInput left="$"><CommaInput value={s.homeInsurance || 0} onChange={update("homeInsurance")} /></FieldInput>
                </div>
              </Collapse>
              <div className="inp-row">
                <span>Utilities</span>
                <FieldInput left="$"><CommaInput value={s.utilities} onChange={update("utilities")} /></FieldInput>
              </div>
            </div>

            {/* Monthly spending buckets */}
            <div className="label-xs pe-section-label" style={{ paddingTop: 12 }}>Everything else</div>
            <div className="pe-row-group">
              <div className="inp-row">
                <span>Transport <span className="pe-row-sub">cars, gas, transit</span></span>
                <FieldInput left="$"><CommaInput value={(s.transport||0)+(s.carPayment||0)+(s.carGas||0)+(s.carInsurance||0)+(s.carParking||0)} onChange={(v) => { update("transport")(v); update("carPayment")(0); update("carGas")(0); update("carInsurance")(0); update("carParking")(0); }} /></FieldInput>
              </div>
              <div className="inp-row">
                <span>Groceries <span className="pe-row-sub">food in</span></span>
                <FieldInput left="$"><CommaInput value={s.groceries} onChange={update("groceries")} /></FieldInput>
              </div>
              <div className="inp-row">
                <span>Dining & fun <span className="pe-row-sub">eating out, entertainment</span></span>
                <FieldInput left="$"><CommaInput value={(s.dining||0)+(s.entertainment||0)} onChange={(v) => { update("dining")(Math.round(v*0.65)); update("entertainment")(Math.round(v*0.35)); }} /></FieldInput>
              </div>
              <div className="inp-row">
                <span>Travel <span className="pe-row-sub">flights, hotels, trips</span></span>
                <FieldInput left="$"><CommaInput value={s.travel||0} onChange={update("travel")} /></FieldInput>
              </div>
              <div className="inp-row">
                <span>Health <span className="pe-row-sub">insurance, gym, chiro</span></span>
                <FieldInput left="$"><CommaInput value={s.personalCare||0} onChange={update("personalCare")} /></FieldInput>
              </div>
              <div className={`inp-row collapse-row${s.hasKids !== false ? "" : " is-collapsed"}`}>
                <span>Childcare <span className="pe-row-sub">daycare, activities</span></span>
                <FieldInput left="$"><CommaInput value={s.childcare} onChange={update("childcare")} /></FieldInput>
              </div>
              <div className="inp-row">
                <span>Other <span className="pe-row-sub">subscriptions, gifts</span></span>
                <FieldInput left="$"><CommaInput value={(s.clothing||0)+(s.subscriptions||0)} onChange={(v) => { update("clothing")(Math.round(v*0.4)); update("subscriptions")(Math.round(v*0.6)); }} /></FieldInput>
              </div>
              <div className="pe-row-group__total">
                <span>Total Monthly Spending</span>
                <span className="mono">{fmtMoney(inputs.monthlyExpensesTotal)}</span>
              </div>
            </div>

            {/* Retirement spend */}
            <div className="label-xs pe-section-label" style={{ paddingTop: 12 }}>Retirement</div>
            <div className="pe-hint">
              How much will you spend per year once retired? Defaults to your current spend — adjust if retirement looks different.
            </div>
            <div className="pe-row-group">
              <div className="inp-row">
                <span>Annual retirement spend <span className="pe-row-sub">today's $</span></span>
                <FieldInput left="$">
                  <CommaInput value={s.retirementSpendOverride || inputs.monthlyExpensesTotal * 12} onChange={(v) => update("retirementSpendOverride")(v)} />
                </FieldInput>
              </div>
            </div>
          </AccSection>

          {/* ── Savings & Portfolio ── */}
          <AccSection id="savings" title="Savings & Portfolio" icon="📈">

            {/* Account balances */}
            <div className="label-xs pe-section-label">Account balances</div>
            <PersonGroup
              totalLabel="Total Nest Egg"
              totalValue={fmtMoney((s.yourRrspStart||0)+(s.yourTfsaStart||0)+(s.yourNrStart||0)+(s.partnered !== false ? (s.spouseRrspStart||0)+(s.spouseTfsaStart||0)+(s.spouseNrStart||0) : 0))}
            >
              <PersonBlock name={s.yourName || "You"} variant="you">
                <NumInput label={<>RRSP <span className="pe-row-sub">tax-deferred</span></>} value={s.yourRrspStart || 0} onChange={update("yourRrspStart")} prefix="$" />
                <NumInput label={<>TFSA <span className="pe-row-sub">tax-free</span></>} value={s.yourTfsaStart || 0} onChange={update("yourTfsaStart")} prefix="$" />
                <NumInput label={<>Non-reg <span className="pe-row-sub">taxable</span></>} value={s.yourNrStart || 0} onChange={update("yourNrStart")} prefix="$" />
              </PersonBlock>
              <PersonBlock name={s.spouseName || "Spouse"} variant="spouse" open={s.partnered !== false}>
                <NumInput label={<>RRSP <span className="pe-row-sub">tax-deferred</span></>} value={s.spouseRrspStart || 0} onChange={update("spouseRrspStart")} prefix="$" />
                <NumInput label={<>TFSA <span className="pe-row-sub">tax-free</span></>} value={s.spouseTfsaStart || 0} onChange={update("spouseTfsaStart")} prefix="$" />
                <NumInput label={<>Non-reg <span className="pe-row-sub">taxable</span></>} value={s.spouseNrStart || 0} onChange={update("spouseNrStart")} prefix="$" />
              </PersonBlock>
            </PersonGroup>

            {/* Monthly savings */}
            <div className="label-xs pe-section-label" style={{ paddingTop: 16 }}>Monthly savings</div>
            <PersonGroup
              totalLabel="Total Monthly Savings"
              totalValue={fmtMoney(totalMonthlyContrib)}
            >
              <PersonBlock name={s.yourName || "You"} variant="you">
                <NumInput label={<>RRSP <span className="pe-row-sub">tax-deferred</span></>} value={s.startingMonthly || 0} onChange={update("startingMonthly")} prefix="$" />
                <NumInput label={<>TFSA <span className="pe-row-sub">tax-free</span></>} value={s.yourTfsaMonthly || 0} onChange={update("yourTfsaMonthly")} prefix="$" />
                <NumInput label={<>Non-reg <span className="pe-row-sub">taxable</span></>} value={s.yourNrMonthly || 0} onChange={update("yourNrMonthly")} prefix="$" />
              </PersonBlock>
              <PersonBlock name={s.spouseName || "Spouse"} variant="spouse" open={s.partnered !== false}>
                <NumInput label={<>RRSP <span className="pe-row-sub">tax-deferred</span></>} value={s.spouseMonthly || 0} onChange={update("spouseMonthly")} prefix="$" />
                <NumInput label={<>TFSA <span className="pe-row-sub">tax-free</span></>} value={s.spouseTfsaMonthly || 0} onChange={update("spouseTfsaMonthly")} prefix="$" />
                <NumInput label={<>Non-reg <span className="pe-row-sub">taxable</span></>} value={s.spouseNrMonthly || 0} onChange={update("spouseNrMonthly")} prefix="$" />
              </PersonBlock>
            </PersonGroup>

            <PersonBlock name="Savings growth" variant="shared">
              <PctInput label="Monthly contrib growth" value={s.contribGrowth} onChange={update("contribGrowth")} hint="annual rate" />
            </PersonBlock>
          </AccSection>

          {/* ── Assumptions ── */}
          <AccSection id="assumptions" title="Assumptions" icon="⚙️">
            <PersonBlock name="Market" variant="shared">
              <PctInput label="Market return (nominal)" value={s.investmentReturn} onChange={update("investmentReturn")} hint="long-run nominal return" />
              <PctInput label="Inflation" value={s.inflation} onChange={update("inflation")} hint="Bank of Canada target" />
            </PersonBlock>

            <PersonBlock name="Death" variant="shared">
              <NumInput label="Death age" hint="horizon for projections" value={s.deathAge || 90} onChange={update("deathAge")} />
              <NumInput label="Die with" hint="today's $" value={s.terminalTargetToday} onChange={update("terminalTargetToday")} prefix="$" step={25000} />
            </PersonBlock>

            <PersonBlock name="Withdrawal tax rates" variant="shared">
              <PctInput label="RRSP/RRIF withdrawal rate" value={s.rrspTaxRate} onChange={update("rrspTaxRate")} hint="marginal rate in retirement" />
              <PctInput label="Non-reg cap-gains rate" value={s.nrCapGainsRate} onChange={update("nrCapGainsRate")} hint="50% inclusion × marginal rate" />
              <PctInput label="CPP + pension + OAS rate" value={s.retirementIncomeTaxRate} onChange={update("retirementIncomeTaxRate")} hint="ordinary income in retirement" />
            </PersonBlock>
          </AccSection>

        </div>
        </div>
      </div>
    </div>
  );
}

