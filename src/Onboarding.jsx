import React, { useState, useEffect } from "react";
import { PersonBlock, PersonGroup } from "./SharedComponents";
import { DollarInput, PctInput, VestDatePicker, Field, BtnPair, ModeToggle, CompRow } from "./ObInputs";

// ---------- province data ----------
const PROVINCES = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland & Labrador" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
];

const LIFE_EXPECTANCY = {
  ON: 87, BC: 88, AB: 87, QC: 87, NS: 85,
  NB: 85, MB: 85, SK: 85, NL: 84, PE: 86,
  NT: 81, YT: 83, NU: 78,
};

function estimateBlendedTax(combinedIncome) {
  if (combinedIncome <= 0) return 0;
  if (combinedIncome < 100000) return 0.28;
  if (combinedIncome < 180000) return 0.33;
  if (combinedIncome < 260000) return 0.38;
  if (combinedIncome < 400000) return 0.43;
  return 0.46;
}

// ---------- FIRE vision logic ----------

function lifestyleLabel(spend) {
  if (spend < 50000) return "Lean & simple";
  if (spend < 75000) return "Modest";
  if (spend < 110000) return "Comfortable";
  if (spend < 155000) return "Abundant";
  return "Luxurious";
}

function fmtSpend(n) {
  if (n >= 1000) return "$" + (n / 1000).toFixed(0) + "k";
  return "$" + n.toLocaleString();
}

// Work slider (1–3)
const WORK_LABELS = ["Fully retired", "Part-time / passion project", "Semi-retired (still earning)"];
const WORK_HINTS  = ["No income in retirement", "~$20k/yr from something you love", "Still working, just less"];
const WORK_INCOME = [0, 20000, 40000]; // approximate annual retirement income from work

// lifestyle is now a spend amount (e.g. 90000)
function classifyFire(retirementAge, lifestyleSpend, workLevel) {
  const earlyAge  = retirementAge <= 52;
  const midAge    = retirementAge >= 53 && retirementAge <= 59;
  const tradAge   = retirementAge >= 60;
  const lean      = lifestyleSpend < 75000;
  const fat       = lifestyleSpend >= 110000;
  const hasWork   = workLevel >= 2;
  const semiNow   = workLevel === 3;

  if (semiNow)                          return { label: "Semi-FIRE",           emoji: "🌗", desc: "Dialling back now, building toward full freedom." };
  if (earlyAge && hasWork)              return { label: "Barista FIRE",         emoji: "☕", desc: "Early exit from the grind with a little work you actually enjoy." };
  if (earlyAge && lean)                 return { label: "Lean FIRE",            emoji: "🌿", desc: "Full independence on a lean budget — freedom over luxury." };
  if (earlyAge && fat)                  return { label: "Fat FIRE",             emoji: "🔥", desc: "Early retirement without compromising your lifestyle." };
  if (earlyAge)                         return { label: "FIRE",                 emoji: "✨", desc: "Financial independence, retiring well before traditional age." };
  if (midAge && hasWork)                return { label: "Barista FIRE",         emoji: "☕", desc: "Stepping back in your 50s with some part-time income to bridge the gap." };
  if (midAge && lean)                   return { label: "Lean FIRE",            emoji: "🌿", desc: "A simpler retirement in your mid-50s — intentional living." };
  if (midAge)                           return { label: "FIRE",                 emoji: "✨", desc: "Financial independence on your own timeline." };
  if (tradAge && lean)                  return { label: "Coast FIRE",           emoji: "🌊", desc: "You've done the heavy lifting — coast to a comfortable traditional retirement." };
  if (tradAge && fat)                   return { label: "Traditional Retirement",emoji: "🏡", desc: "A full, abundant retirement at the right time for you." };
  return                                       { label: "Traditional Retirement",emoji: "🏡", desc: "A well-funded retirement at a traditional age." };
}

// Card shell
function Card({ children, step, totalSteps, onSkip, canExit, onExit, onBack }) {
  const pct = Math.round((step / totalSteps) * 100);
  return (
    <div className="ob-scene">
      <div className="ob-card" style={{ maxWidth: 480 }}>
        <div className="ob-card__topnav">
          <TrailheadMark size={22} />
          <div style={{ display: "flex", gap: 4 }}>
            {onBack ? (
              <button onClick={onBack} className="btn btn--ghost btn--sm">← Back</button>
            ) : (
              <span />
            )}
            {canExit ? (
              <button onClick={onExit} className="btn btn--ghost btn--sm">Skip to dashboard →</button>
            ) : (
              <button onClick={onSkip} className="btn btn--ghost btn--sm">Skip to dashboard →</button>
            )}
          </div>
        </div>
        <div className="ob-card__body">
          <div className="progress">
            <div style={{ width: `${pct}%` }} />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------- Card: Welcome ----------
function TrailheadMark({ size = 28 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, justifyContent: "center" }}>
      <div style={{
        width: size, height: size, borderRadius: size * 0.29,
        background: "var(--accent-deep)",
        display: "grid", placeItems: "center",
        flexShrink: 0,
      }}>
        <svg width={size * 0.57} height={size * 0.57} viewBox="0 0 16 16" fill="none">
          <path d="M3 12 L8 4 L13 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M5.5 8.5 L10.5 8.5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
      <span style={{ fontWeight: 600, fontSize: size * 0.64, letterSpacing: "-0.02em", color: "var(--ink)" }}>Trailhead</span>
    </div>
  );
}

function CardWelcome({ onNext, onSignIn }) {
  return (
    <div className="ob-scene">
      <div className="ob-card">
        <div className="ob-card__body" style={{ textAlign: "center", padding: "48px 48px 56px" }}>
          <div style={{ marginBottom: 32 }}>
            <TrailheadMark size={36} />
          </div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontWeight: 600,
            fontSize: 42, lineHeight: 1.05, letterSpacing: "-0.03em"
          }}>
            Let's find the day<br />you can stop working 🔥
          </h1>
          <p style={{
            color: "var(--ink-2)", fontSize: 15, lineHeight: 1.55,
            marginTop: 20, maxWidth: 360, marginLeft: "auto", marginRight: "auto"
          }}>
            Answer a few quick questions. We'll handle the Canadian tax math — RRSP, TFSA, CPP,
            provincial brackets — and show you the exact age when the numbers work.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 32, maxWidth: 320, marginLeft: "auto", marginRight: "auto" }}>
            <button onClick={onNext} className="btn btn--accent btn--lg" style={{ width: "100%" }}>Let's go →</button>
            <button onClick={onSignIn} className="btn btn--ghost" style={{ width: "100%" }}>I already have an account</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Card 1: About you ----------
function CardAboutYou({ data, onChange, onNext, onSkip, onBack }) {
  const name = data.yourName?.trim();
  const canExit = !!name;
  return (
    <Card step={1} totalSteps={8} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <h2 className="ob-heading">
        {name ? `Nice to meet you, ${name}. 👋` : "Let's start with you. 👋"}
      </h2>
      <p className="ob-sub" style={{ marginBottom: 28 }}>Three basics to anchor the plan.</p>
      <div className="pe-row-group">
        <Field label="Name" row>
          <div className="pe-field-wrap">
            <input className="pe-field-input" type="text" placeholder="e.g. Alex"
              value={data.yourName || ""}
              onChange={(e) => onChange("yourName", e.target.value)} />
          </div>
        </Field>
        <Field label="Current age" row>
          <div className="pe-field-wrap">
            <input className="pe-field-input" type="text" inputMode="numeric" placeholder="35"
              value={data.currentAge || ""}
              onFocus={(e) => { if (!data.currentAge) e.target.value = ""; e.target.select(); }}
              onChange={(e) => { const n = parseInt(e.target.value); onChange("currentAge", isNaN(n) ? 0 : n); }} />
          </div>
        </Field>
        <Field label="Province" row>
          <div className="pe-field-wrap">
            <select className="pe-field-input" style={{ textAlign: "right", cursor: "pointer" }}
              value={data.province || "ON"}
              onChange={(e) => onChange("province", e.target.value)}>
              {PROVINCES.map((p) => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </select>
          </div>
        </Field>
      </div>
      <button onClick={onNext} className="btn btn--primary" style={{ width: "100%", marginTop: 10 }}>Continue</button>
    </Card>
  );
}

// ---------- Card 2: Household ----------
function CardHousehold({ data, onChange, onNext, onSkip, onBack }) {
  const rawName = data.yourName?.trim();
  const name = rawName || "you";
  const yourPossessive = rawName ? `${rawName}'s` : "your";
  const canExit = !!rawName;
  const partnered = data.partnered === true;
  const hasKids = data.hasKids === true;
  const spouseName = data.spouseName?.trim();
  const partnerFillsOwn = data.partnerFillsOwn === true;

  return (
    <Card step={2} totalSteps={8} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <h2 className="ob-heading">
        Who are we planning for? 🏡
      </h2>
      <p className="ob-sub">
        {partnered ? "We'll fit the plan around both of you." : `We'll tailor it to ${yourPossessive} full picture.`}
      </p>

      <Field label="Relationship">
        <BtnPair
          value={data.partnered}
          onChange={(v) => onChange("partnered", v)}
          options={[
            { label: "Just me", sub: "Solo plan", val: false },
            { label: "Me & a partner", sub: "Shared household", val: true },
          ]}
        />
      </Field>

      {partnered && (
        <div className="pe-row-group" style={{ marginBottom: 16 }}>
          <Field label="Partner's name" row>
            <div className="pe-field-wrap">
              <input className="pe-field-input" type="text" placeholder="e.g. Jamie"
                value={data.spouseName || ""}
                onChange={(e) => onChange("spouseName", e.target.value)} />
            </div>
          </Field>
          <Field label="Partner's age" row>
            <div className="pe-field-wrap">
              <input className="pe-field-input" type="text" inputMode="numeric" placeholder="33"
                value={data.spouseCurrentAge || ""}
                onFocus={(e) => { if (!data.spouseCurrentAge) e.target.value = ""; e.target.select(); }}
                onChange={(e) => { const n = parseInt(e.target.value); onChange("spouseCurrentAge", isNaN(n) ? 0 : n); }} />
            </div>
          </Field>
          <Field label="They'll fill in their own details" hint="send them a link after sign-in" row>
            <div className="seg">
              <button onClick={() => onChange("partnerFillsOwn", false)} className={!partnerFillsOwn ? "is-active" : ""}>No</button>
              <button onClick={() => onChange("partnerFillsOwn", true)} className={partnerFillsOwn ? "is-active" : ""}>Yes</button>
            </div>
          </Field>
        </div>
      )}

      <Field label="Kids at home (or on the way)">
        <BtnPair
          value={data.hasKids}
          onChange={(v) => onChange("hasKids", v)}
          options={[
            { label: "Yes", val: true },
            { label: "No", val: false },
          ]}
        />
      </Field>

      <button onClick={onNext} className="btn btn--primary" style={{ width: "100%", marginTop: 8 }}>Continue</button>
    </Card>
  );
}

// ---------- Card 8 (last): FIRE Vision ----------
// Lifestyle spend is suggested from income & spending data collected in prior cards.
// Returns suggested annual retirement spend in dollars, derived from onboarding inputs.
function suggestLifestyleSpend(data) {
  const partnered = data.partnered === true;
  const hasKids   = data.hasKids === true;

  // Monthly non-housing spend buckets entered in CardSpending
  const monthlySpend =
    (data.transport    || 0) +
    (data.groceries    || 0) +
    (data.dining       || 0) +
    (data.travel       || 0) +
    (data.personalCare || 0) +
    (hasKids ? (data.childcare || 0) : 0) +
    (data.other        || 0);

  // Monthly housing costs
  const housing = data.ownsHome
    ? (data.mortgage || 0) + (data.propertyTax || 0) + (data.homeInsurance || 0) + (data.maintenance || 0) + (data.utilities || 0)
    : (data.rent || 0) + (data.utilities || 0) + (data.homeInsurance || 0);

  const totalMonthly = monthlySpend + housing;

  if (totalMonthly > 0) {
    return Math.round((totalMonthly * 12) / 1000) * 1000;
  }

  // Fallback: estimate from net income if no spend entered yet
  const combined = (data.yourBase || 0) + (partnered ? (data.spouseBase || 0) : 0);
  if (combined > 0) {
    const taxRate = estimateBlendedTax(combined);
    const netAnnual = combined * (1 - taxRate);
    return Math.round((netAnnual * 0.6) / 1000) * 1000;
  }

  return 90000; // absolute fallback
}

function CardVision({ data, onChange, onNext, onSkip, onBack }) {
  const name = data.yourName?.trim() || "you";
  const spouseName = data.spouseName?.trim();
  const partnered = data.partnered === true;
  const canExit = !!(data.yourName?.trim());

  const retAge    = data.visionRetirementAge ?? 55;
  const workLevel = data.visionWorkLevel ?? 1;

  // Lifestyle: computed from spending/income inputs as the midpoint; slider range is ±50%.
  // userTouchedSlider tracks whether the user has moved it — if not, the midpoint stays live.
  const userTouchedSlider = React.useRef(data.visionLifestyleVal != null);
  const suggestedSpend = suggestLifestyleSpend(data);
  const sliderMin = Math.round(suggestedSpend * 0.5 / 1000) * 1000;
  const sliderMax = Math.round(suggestedSpend * 1.5 / 1000) * 1000;
  const spend = userTouchedSlider.current
    ? Math.max(sliderMin, Math.min(sliderMax, data.visionLifestyleVal ?? suggestedSpend))
    : suggestedSpend;

  // Keep state in sync so onboardingToState sees the latest
  useEffect(() => {
    if (!userTouchedSlider.current) {
      onChange("visionLifestyleVal", suggestedSpend);
    }
  });

  const fire = classifyFire(retAge, spend, workLevel);

  const planFor = partnered && spouseName ? `${name} & ${spouseName}` : partnered ? `${name} & your partner` : name;

  return (
    <Card step={8} totalSteps={8} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <div className="chip chip--accent" style={{ marginBottom: 16 }}>Planning for {planFor}</div>
      <h2 className="ob-heading">
        What does the horizon look like? 🔥
      </h2>
      <p className="ob-sub">Fine-tune your vision — we've pre-filled from your numbers.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Retirement age */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span className="label-xs">Retire at</span>
            <span className="mono" style={{ fontSize: 14, color: "var(--ink-2)" }}>age {retAge}</span>
          </div>
          <input className="slider" type="range" min={40} max={70} step={1}
            value={retAge} onChange={(e) => onChange("visionRetirementAge", parseInt(e.target.value))} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
            <span>As soon as possible</span><span>Traditional (65+)</span>
          </div>
        </div>

        {/* Lifestyle */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <span className="label-xs">Lifestyle in retirement</span>
            <span className="mono" style={{ fontSize: 14, color: "var(--ink-2)" }}>{fmtSpend(spend)}/yr</span>
          </div>
          <p style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 8, marginTop: 0 }}>
            Based on your current spending — adjust if retirement looks different.
          </p>
          <input className="slider" type="range"
            min={sliderMin} max={sliderMax} step={1000}
            value={spend}
            onChange={(e) => {
              userTouchedSlider.current = true;
              onChange("visionLifestyleVal", parseInt(e.target.value));
            }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
            <span>{fmtSpend(sliderMin)}</span>
            <span>{fmtSpend(suggestedSpend)} today</span>
            <span>{fmtSpend(sliderMax)}</span>
          </div>
          <div style={{ marginTop: 10, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 24, color: "var(--accent-deep)", letterSpacing: "-0.02em" }}>
            {lifestyleLabel(spend)}
          </div>
        </div>

        {/* Work level */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span className="label-xs">Work after retirement</span>
            <span className="mono" style={{ fontSize: 14, color: "var(--ink-2)" }}>{WORK_HINTS[workLevel - 1]}</span>
          </div>
          <input className="slider" type="range" min={1} max={3} step={1}
            value={workLevel} onChange={(e) => onChange("visionWorkLevel", parseInt(e.target.value))} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
            <span>Fully retired</span><span>Part-time</span><span>Semi-retired</span>
          </div>
          <div style={{ marginTop: 10, fontWeight: 500, fontSize: 16 }}>{WORK_LABELS[workLevel - 1]}</div>
        </div>
      </div>

      {/* FIRE type reveal */}
      <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: "var(--paper-2)", borderRadius: 12, border: "1px solid var(--line)" }}>
        <div style={{ fontSize: 28 }}>{fire.emoji}</div>
        <div>
          <div className="label-xs" style={{ marginBottom: 2 }}>Looks like you're aiming for</div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{fire.label}</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>{fire.desc}</div>
        </div>
      </div>

      <button onClick={onNext} className="btn btn--accent" style={{ width: "100%", marginTop: 20 }}>Build my plan →</button>
    </Card>
  );
}

function PersonIncome({ prefix, data, onChange }) {
  return (
    <div>
      <Field label="Base pay" hint="annual salary" row>
        <DollarInput value={data[`${prefix}Base`]} onChange={(v) => onChange(`${prefix}Base`, v)} />
      </Field>
      <Field label="Bonus" hint="annual average" row>
        <DollarInput value={data[`${prefix}BonusDollar`]} onChange={(v) => onChange(`${prefix}BonusDollar`, v)} placeholder="0" />
      </Field>
    </div>
  );
}

function CardIncome({ data, onChange, onNext, onSkip, onBack, hideSpouse = false }) {
  const rawName = data.yourName?.trim();
  const name = rawName || "You";
  const spouseName = data.spouseName?.trim() || "Spouse";
  const canExit = !!rawName;
  const partnered = data.partnered === true;
  const showSpouse = partnered && !hideSpouse;
  const combined =
    (data.yourBase || 0) + (data.yourBonusDollar || 0) +
    (showSpouse ? (data.spouseBase || 0) + (data.spouseBonusDollar || 0) : 0);

  // Possessive: "Alex's" or "Your" (never "You's")
  const yourPossessive = rawName ? `${rawName}'s` : "Your";

  const spouseFirst = data.spouseName?.trim();
  const heading = showSpouse
    ? (rawName && spouseFirst
        ? `${rawName} & ${spouseFirst}'s income`      // Martin & Jessica's income
        : rawName
          ? `${rawName} & your partner's income`      // Martin & your partner's income
          : spouseFirst
            ? `Your & ${spouseFirst}'s income`        // Your & Jessica's income
            : "Your household income")                 // Your household income
    : `${yourPossessive} income`;                      // Martin's income / Your income

  return (
    <Card step={3} totalSteps={8} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <h2 className="ob-heading">
        {heading} 💼
      </h2>
      <p className="ob-sub">Start with base salary — we'll layer in the rest.</p>

      <PersonGroup
        totalLabel={showSpouse ? "Total Household Income" : "Total Income"}
        totalValue={`$${combined.toLocaleString()}`}
      >
        <PersonBlock name={name} variant="you">
          <PersonIncome prefix="your" data={data} onChange={onChange} />
        </PersonBlock>
        {showSpouse && (
          <PersonBlock name={spouseName} variant="spouse">
            <PersonIncome prefix="spouse" data={data} onChange={onChange} />
          </PersonBlock>
        )}
      </PersonGroup>
      {partnered && hideSpouse && (
        <div className="ob-notice" style={{ marginTop: 12 }}>
          {spouseName}'s income will be added when they join via the invite link.
        </div>
      )}
      <button onClick={onNext} className="btn btn--primary" style={{ width: "100%", marginTop: 20 }}>Continue</button>
    </Card>
  );
}

function PersonContributions({ monthlyRrspKey, monthlyTfsaKey, monthlyNrKey, data, onChange }) {
  const rows = [
    { key: monthlyRrspKey, label: "RRSP",    sub: "tax-deferred" },
    { key: monthlyTfsaKey, label: "TFSA",    sub: "tax-free" },
    { key: monthlyNrKey,   label: "Non-reg", sub: "taxable" },
  ];
  return (
    <>
      {rows.map((r) => (
        <div key={r.key} className="inp-row">
          <span>{r.label} <span className="pe-row-sub">{r.sub}</span></span>
          <DollarInput value={data[r.key]} onChange={(v) => onChange(r.key, v)} placeholder="0" />
        </div>
      ))}
    </>
  );
}

// ---------- Card 4: Retirement contributions ----------
function CardContributions({ data, onChange, onNext, onSkip, onBack, hideSpouse = false }) {
  const name = data.yourName?.trim() || "You";
  const spouseName = data.spouseName?.trim() || "Spouse";
  const canExit = !!(data.yourName?.trim());
  const partnered = data.partnered === true;
  const showSpouse = partnered && !hideSpouse;
  const hasKids = data.hasKids === true;

  return (
    <Card step={4} totalSteps={8} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <h2 className="ob-heading">
        Monthly savings 📈
      </h2>
      <p className="ob-sub">
        {showSpouse
          ? "How much are you both putting away each month?"
          : "How much are you putting away each month?"}
      </p>

      {(() => {
        const total = (data.startingMonthly||0)+(data.yourTfsaMonthly||0)+(data.yourNrMonthly||0)
          +(showSpouse ? (data.spouseMonthly||0)+(data.spouseTfsaMonthly||0)+(data.spouseNrMonthly||0) : 0);
        return (
          <PersonGroup
            totalLabel="Total Monthly Savings"
            totalValue={total > 0 ? `$${total.toLocaleString()}` : "$0"}
          >
            <PersonBlock name={name} variant="you">
              <PersonContributions
                monthlyRrspKey="startingMonthly" monthlyTfsaKey="yourTfsaMonthly" monthlyNrKey="yourNrMonthly"
                data={data} onChange={onChange}
              />
            </PersonBlock>
            {showSpouse && (
              <PersonBlock name={spouseName} variant="spouse">
                <PersonContributions
                  monthlyRrspKey="spouseMonthly" monthlyTfsaKey="spouseTfsaMonthly" monthlyNrKey="spouseNrMonthly"
                  data={data} onChange={onChange}
                />
              </PersonBlock>
            )}
          </PersonGroup>
        );
      })()}
      {partnered && hideSpouse && (
        <div className="ob-notice" style={{ marginTop: 12 }}>
          {spouseName}'s contributions will be added when they join via the invite link.
        </div>
      )}
      <button onClick={onNext} className="btn btn--primary" style={{ width: "100%", marginTop: 20 }}>Continue</button>
    </Card>
  );
}

// ---------- Card 5: Existing balances ----------
function CardSavings({ data, onChange, onNext, onSkip, onBack, hideSpouse = false }) {
  const rawName = data.yourName?.trim();
  const name = rawName || "You";
  const spouseName = data.spouseName?.trim() || "Spouse";
  const canExit = !!(data.yourName?.trim());
  const partnered = data.partnered === true;
  const showSpouse = partnered && !hideSpouse;

  return (
    <Card step={5} totalSteps={8} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <h2 className="ob-heading">
        What's already saved? 🏦
      </h2>
      <p className="ob-sub">
        {showSpouse
          ? (rawName && data.spouseName?.trim()
              ? `Current balances across ${rawName} and ${data.spouseName.trim()}'s accounts. A round number is fine.`
              : "Current balances across both your accounts. A round number is fine.")
          : "Current balances across your accounts. A round number is fine."}
      </p>

      {(() => {
        const total = (data.yourRrspStart||0)+(data.yourTfsaStart||0)+(data.yourNrStart||0)
          +(showSpouse ? (data.spouseRrspStart||0)+(data.spouseTfsaStart||0)+(data.spouseNrStart||0) : 0);
        return (
          <PersonGroup
            totalLabel="Total Nest Egg"
            totalValue={`$${total.toLocaleString()}`}
          >
            <PersonBlock name={name} variant="you">
              <div className="inp-row"><span>RRSP <span className="pe-row-sub">tax-deferred</span></span><DollarInput value={data.yourRrspStart} onChange={(v) => onChange("yourRrspStart", v)} placeholder="0" /></div>
              <div className="inp-row"><span>TFSA <span className="pe-row-sub">tax-free</span></span><DollarInput value={data.yourTfsaStart} onChange={(v) => onChange("yourTfsaStart", v)} placeholder="0" /></div>
              <div className="inp-row"><span>Non-reg <span className="pe-row-sub">taxable</span></span><DollarInput value={data.yourNrStart} onChange={(v) => onChange("yourNrStart", v)} placeholder="0" /></div>
            </PersonBlock>
            {showSpouse && (
              <PersonBlock name={spouseName} variant="spouse">
                <div className="inp-row"><span>RRSP <span className="pe-row-sub">tax-deferred</span></span><DollarInput value={data.spouseRrspStart} onChange={(v) => onChange("spouseRrspStart", v)} placeholder="0" /></div>
                <div className="inp-row"><span>TFSA <span className="pe-row-sub">tax-free</span></span><DollarInput value={data.spouseTfsaStart} onChange={(v) => onChange("spouseTfsaStart", v)} placeholder="0" /></div>
                <div className="inp-row"><span>Non-reg <span className="pe-row-sub">taxable</span></span><DollarInput value={data.spouseNrStart} onChange={(v) => onChange("spouseNrStart", v)} placeholder="0" /></div>
              </PersonBlock>
            )}
          </PersonGroup>
        );
      })()}
      {partnered && hideSpouse && (
        <div className="ob-notice" style={{ marginTop: 12 }}>
          {spouseName}'s savings will be added when they join via the invite link.
        </div>
      )}
      <button onClick={onNext} className="btn btn--primary" style={{ width: "100%", marginTop: 20 }}>Continue</button>
    </Card>
  );
}

// ---------- Card 6: Housing ----------
function CardHome({ data, onChange, onNext, onSkip, onBack, hideSpouse = false }) {
  const rawName = data.yourName?.trim();
  const name = rawName || "You";
  const spouseName = data.spouseName?.trim() || "Spouse";
  const canExit = !!(data.yourName?.trim());
  const partnered = data.partnered === true;
  const showSpouse = partnered && !hideSpouse;
  const ownsHome = data.ownsHome === true;
  const rents    = data.ownsHome === false;

  return (
    <Card step={6} totalSteps={8} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <h2 className="ob-heading">
        Housing 🏠
      </h2>
      <p className="ob-sub">
        {showSpouse
          ? (rawName && data.spouseName?.trim()
              ? `${rawName} and ${data.spouseName.trim()}'s housing costs — mortgage, rent, and running costs.`
              : "Your household housing costs — mortgage, rent, and running costs.")
          : "Your housing picture — mortgage, rent, and running costs."}
      </p>

      <Field label="Do you own or rent?">
        <BtnPair value={data.ownsHome} onChange={(v) => onChange("ownsHome", v)}
          options={[
            { label: partnered ? "We own" : "I own", val: true },
            { label: partnered ? "We rent" : "I rent", val: false },
          ]} />
      </Field>

      {ownsHome && (
        <>
          <div className="pe-row-group" style={{ marginBottom: 16 }}>
            <Field label="Mortgage balance remaining" row>
              <DollarInput value={data.mortgagePrincipal} onChange={(v) => onChange("mortgagePrincipal", v)} />
            </Field>
            <Field label="Monthly payment" row>
              <DollarInput value={data.mortgage} onChange={(v) => onChange("mortgage", v)} />
            </Field>
            <Field label="Interest rate" hint="annual rate" row>
              <PctInput value={data.mortgageRate} onChange={(v) => onChange("mortgageRate", v)} />
            </Field>
          </div>
          <p className="label-xs" style={{ marginBottom: 8 }}>Monthly housing costs</p>
          <div className="pe-row-group">
            <Field label="Property tax" row>
              <DollarInput value={data.propertyTax} onChange={(v) => onChange("propertyTax", v)} placeholder="0" />
            </Field>
            <Field label="Home insurance" row>
              <DollarInput value={data.homeInsurance} onChange={(v) => onChange("homeInsurance", v)} placeholder="0" />
            </Field>
            <Field label="Maintenance & repairs" hint="~1% of home value per year" row>
              <DollarInput value={data.maintenance} onChange={(v) => onChange("maintenance", v)} placeholder="0" />
            </Field>
            <Field label="Utilities" row>
              <DollarInput value={data.utilities} onChange={(v) => onChange("utilities", v)} placeholder="0" />
            </Field>
          </div>
        </>
      )}

      {rents && (
        <div className="pe-row-group">
          <Field label="Monthly rent" row>
            <DollarInput value={data.rent} onChange={(v) => onChange("rent", v)} placeholder="0" />
          </Field>
          <Field label="Utilities" row>
            <DollarInput value={data.utilities} onChange={(v) => onChange("utilities", v)} placeholder="0" />
          </Field>
          <Field label="Tenant insurance" row>
            <DollarInput value={data.homeInsurance} onChange={(v) => onChange("homeInsurance", v)} placeholder="0" />
          </Field>
        </div>
      )}

      <button onClick={onNext} className="btn btn--primary" style={{ width: "100%", marginTop: 20 }}>Continue</button>
    </Card>
  );
}

// ---------- Card 7: Spending ----------
// Canadian average monthly household spending benchmarks (Statistics Canada, rounded to $50)
// Source: Survey of Household Spending — adapted per-person for solo, scaled for couples.
// Kids add ~$1,000/mo to childcare when present.
function spendingDefaults(partnered, hasKids) {
  const scale = partnered ? 1.5 : 1.0; // couples spend ~50% more, not 2×
  return {
    transport:    Math.round(650  * scale / 50) * 50,   // ~$650 solo, $975 couple
    groceries:    Math.round(600  * scale / 50) * 50,   // ~$600 solo, $900 couple
    dining:       Math.round(450  * scale / 50) * 50,   // ~$450 solo, $675 couple
    travel:       Math.round(300  * scale / 50) * 50,   // ~$300 solo, $450 couple (~$3.6k–$5.4k/yr)
    personalCare: Math.round(200  * scale / 50) * 50,   // ~$200 solo, $300 couple
    childcare:    hasKids ? 1000 : 0,                   // ~$1,000/mo with kids
    other:        Math.round(400  * scale / 50) * 50,   // ~$400 solo, $600 couple
  };
}

function CardSpending({ data, onChange, onNext, onSkip, onBack, hideSpouse = false }) {
  const rawName = data.yourName?.trim();
  const name = rawName || "You";
  const spouseName = data.spouseName?.trim() || "Spouse";
  const partnered = data.partnered === true;
  const showSpouse = partnered && !hideSpouse;
  const hasKids = data.hasKids === true;

  const defaults = spendingDefaults(partnered, hasKids);
  const monthlyKeys = Object.keys(defaults).filter(k => defaults[k] > 0);
  const allEmpty = monthlyKeys.every(k => !data[k]);

  useEffect(() => {
    if (!allEmpty) return;
    monthlyKeys.forEach(k => {
      if (defaults[k] > 0) onChange(k, defaults[k]);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const monthlyRows = [
    { key: "transport",    label: "Transport",    sub: "cars, gas, transit" },
    { key: "groceries",    label: "Groceries",    sub: "food in" },
    { key: "dining",       label: "Dining & fun", sub: "eating out, delivery, entertainment" },
    { key: "travel",       label: "Travel",       sub: "flights, hotels, trips" },
    { key: "personalCare", label: "Health",       sub: "insurance, gym, chiro" },
    ...(hasKids ? [{ key: "childcare", label: "Childcare", sub: "daycare, activities" }] : []),
    { key: "other",        label: "Other",        sub: "subscriptions, gifts" },
  ];

  const totalMonthly = monthlyRows.reduce((s, c) => s + (data[c.key] || 0), 0);

  return (
    <Card step={7} totalSteps={8} onSkip={onSkip} canExit={false} onExit={onSkip} onBack={onBack}>
      <h2 className="ob-heading">
        {showSpouse
          ? (rawName && data.spouseName?.trim()
              ? `How do ${rawName} & ${data.spouseName.trim()} spend today? 🛒`
              : "How does your household spend today? 🛒")
          : rawName ? `How does ${rawName} spend today? 🛒` : "How do you spend today? 🛒"}
      </h2>
      <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 8 }}>
        Monthly, in today's dollars — housing excluded.
      </p>
      <div style={{ fontSize: 12, color: "var(--accent-ink)", background: "var(--accent-soft)", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
        Pre-filled with Canadian averages — adjust to match your reality.
      </div>

      <div className="pe-row-group">
        {monthlyRows.map(c => (
          <div key={c.key} className="inp-row">
            <span>{c.label} <span className="pe-row-sub">{c.sub}</span></span>
            <DollarInput value={data[c.key]} onChange={v => onChange(c.key, v)} placeholder="0" />
          </div>
        ))}
        {totalMonthly > 0 && (
          <div className="pe-row-group__total">
            <span>Total Monthly Spending</span>
            <span className="mono">${totalMonthly.toLocaleString()}</span>
          </div>
        )}
      </div>

      <button onClick={onNext} className="btn btn--primary" style={{ width: "100%", marginTop: 20 }}>Continue</button>
    </Card>
  );
}

// ---------- onboardingToState ----------
export function onboardingToState(d, baseDefaults) {
  const province = d.province || "ON";
  const deathAge = LIFE_EXPECTANCY[province] || 87;
  const partnered = d.partnered === true;
  const combined = (d.yourBase || 0) + (partnered ? (d.spouseBase || 0) : 0);
  const taxRate = estimateBlendedTax(combined);

  // Retirement vision — use synced suggestion if user never touched the slider
  const lifestyleVal = d.visionLifestyleVal ?? suggestLifestyleSpend(d);
  const workLevel = d.visionWorkLevel ?? 1;
  const retirementWorkIncome = WORK_INCOME[workLevel - 1];

  const yourBase   = d.yourBase   || 0;
  const spouseBase = partnered ? (d.spouseBase || 0) : 0;

  // Monthly contributions: RRSP + TFSA + non-reg per person
  const startingMonthly = (d.startingMonthly || 0)
    + (d.yourTfsaMonthly || 0)
    + (d.yourNrMonthly   || 0);

  // Spending — 7 monthly buckets; "other" maps to clothing+subscriptions
  const spendFields = {
    transport:     d.transport    || 0,
    groceries:     d.groceries    || 0,
    dining:        d.dining       || 0,
    travel:        d.travel       || 0,
    personalCare:  d.personalCare || 0,
    childcare:     d.childcare    || 0,
    clothing:      Math.round((d.other || 0) * 0.4),
    subscriptions: Math.round((d.other || 0) * 0.6),
    entertainment: 0,
    propertyTax:   d.propertyTax  || 0,
    maintenance:   d.maintenance  || 0,
    utilities:     d.utilities    || 0,
    carPayment: 0, carGas: 0, carInsurance: 0, carParking: 0,
    carMaintenance: 0, carRegistration: 0,
  };

  // CPP defaults — use Canadian average per person
  const cppPerPerson = 9300;
  const combinedCpp  = cppPerPerson + (partnered ? cppPerPerson : 0);

  return {
    ...baseDefaults,
    yourName:         d.yourName   || baseDefaults.yourName,
    spouseName:       partnered ? (d.spouseName || baseDefaults.spouseName) : baseDefaults.spouseName,
    currentAge:       d.currentAge       || baseDefaults.currentAge,
    spouseCurrentAge: partnered ? (d.spouseCurrentAge || baseDefaults.spouseCurrentAge) : baseDefaults.spouseCurrentAge,
    deathAge,
    // Income
    yourBase,
    spouseBase,
    yourBonusPct:   yourBase > 0 ? (d.yourBonusDollar || 0) / yourBase : 0,
    spouseBonusPct: partnered && spouseBase > 0 ? (d.spouseBonusDollar || 0) / spouseBase : 0,
    yourEquityPct:  0,
    spouseEquityPct: 0,
    taxRate,
    // Contributions
    startingMonthly,
    yourTfsaMonthly:    d.yourTfsaMonthly    || 0,
    yourNrMonthly:      d.yourNrMonthly      || 0,
    spouseMonthly:      partnered ? (d.spouseMonthly      || 0) : 0,
    spouseTfsaMonthly:  partnered ? (d.spouseTfsaMonthly  || 0) : 0,
    spouseNrMonthly:    partnered ? (d.spouseNrMonthly    || 0) : 0,
    // Existing balances
    yourRrspStart:   d.yourRrspStart  || 0,
    spouseRrspStart: partnered ? (d.spouseRrspStart || 0) : 0,
    yourTfsaStart:   d.yourTfsaStart  || 0,
    spouseTfsaStart: partnered ? (d.spouseTfsaStart || 0) : 0,
    yourNrStart:     d.yourNrStart    || 0,
    spouseNrStart:   partnered ? (d.spouseNrStart   || 0) : 0,
    // Housing
    mortgage:          d.ownsHome ? (d.mortgage          || 0) : 0,
    mortgagePrincipal: d.ownsHome ? (d.mortgagePrincipal  || 0) : 0,
    mortgageRate:      d.ownsHome ? (d.mortgageRate        || 0) : 0,
    rent:              !d.ownsHome ? (d.rent || 0) : 0,
    homeInsurance:     d.homeInsurance || 0,
    // Spending
    ...spendFields,
    // Retirement income defaults
    cppAmountToday: combinedCpp,
    cppStartAge:    baseDefaults.cppStartAge  || 65,
    oasAmountToday: baseDefaults.oasAmountToday || 8500,
    oasStartAge:    65,
    // Vision
    visionRetirementAge: d.visionRetirementAge ?? 55,
    visionLifestyleVal:  lifestyleVal,
    visionWorkLevel:     workLevel,
    retirementWorkIncome,
    partnered,
    hasKids:  d.hasKids === true,
    province,
    onboardingComplete: true,
  };
}

// ---------- Orchestrator ----------
export default function Onboarding({ onComplete, onSignIn, publicDefaults }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    province: "ON",
    partnered: null,
    hasKids: null,
    ownsHome: null,
    visionRetirementAge: 55,
    visionLifestyleVal: null,
    visionWorkLevel: 1,
    cppAmountToday: 9300,
    spouseCppAmountToday: 9300,
  });

  function update(key, value) { setData((prev) => ({ ...prev, [key]: value })); }
  function next() { setStep((s) => s + 1); }
  function back() { setStep((s) => Math.max(1, s - 1)); }
  function skip() { onComplete(onboardingToState(data, publicDefaults)); }

  // When partner fills their own details, pass a flag so income/savings cards
  // know to hide spouse fields
  const partnerFillsOwn = data.partnerFillsOwn === true;

  if (step === 0)  return <CardWelcome       onNext={next} onSignIn={onSignIn} />;
  if (step === 1)  return <CardAboutYou      data={data} onChange={update} onNext={next} onSkip={skip} onBack={null} />;
  if (step === 2)  return <CardHousehold     data={data} onChange={update} onNext={next} onSkip={skip} onBack={back} />;
  if (step === 3)  return <CardIncome        data={data} onChange={update} onNext={next} onSkip={skip} onBack={back} hideSpouse={partnerFillsOwn} />;
  if (step === 4)  return <CardContributions data={data} onChange={update} onNext={next} onSkip={skip} onBack={back} hideSpouse={partnerFillsOwn} />;
  if (step === 5)  return <CardSavings       data={data} onChange={update} onNext={next} onSkip={skip} onBack={back} hideSpouse={partnerFillsOwn} />;
  if (step === 6)  return <CardHome          data={data} onChange={update} onNext={next} onSkip={skip} onBack={back} hideSpouse={partnerFillsOwn} />;
  if (step === 7)  return <CardSpending      data={data} onChange={update} onNext={next} onSkip={skip} onBack={back} hideSpouse={partnerFillsOwn} />;
  if (step === 8)  return <CardVision        data={data} onChange={update} onNext={skip} onSkip={skip} onBack={back} />;
  return null;
}
