import React, { useState, useEffect } from "react";

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
// Lifestyle slider: continuous 0–100 → annual retirement spend
// Exponential-ish curve: $30k at 0, ~$200k at 100
function lifestyleSliderToSpend(val) {
  // val: 0–100
  // Maps smoothly: 0→$30k, 25→$55k, 50→$90k, 75→$135k, 100→$200k
  const min = 30000, max = 200000;
  const t = val / 100;
  return Math.round((min + (max - min) * Math.pow(t, 1.5)) / 1000) * 1000;
}

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

// Field: row=true → label left, input right (matches Plan Editor inp-row)
//        row=false (default) → label above, input below (for selects, text, btn pairs)
function Field({ label, children, hint, row = false }) {
  if (row) {
    return (
      <div className="inp-row" style={{ padding: "6px 0" }}>
        <span style={{ color: "var(--ink-2)", fontSize: "var(--step--1)" }}>
          {label}
          {hint && <span style={{ color: "var(--ink-4)", fontSize: "var(--step--2)" }}> · {hint}</span>}
        </span>
        {children}
      </div>
    );
  }
  return (
    <div className="ob-field">
      {label && <label className="label-xs">{label}</label>}
      {children}
      {hint && <p className="ob-hint">{hint}</p>}
    </div>
  );
}

// Person block matching Plan Editor's coloured-header pill
function PersonBlock({ name, variant = "you", children }) {
  return (
    <div className={`pe-person pe-person--${variant}`} style={{ marginBottom: 12 }}>
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

// Section divider — matches Plan Editor AccSection header weight
function SectionLabel({ children }) {
  return <div className="ob-section-label">{children}</div>;
}

function formatWithCommas(n) {
  if (!isFinite(n) || n === "" || n == null) return "";
  return Math.round(n).toLocaleString("en-CA");
}

// Matches pe-field-wrap + pe-field-adorn exactly as in PlanEditor
function DollarInput({ value, onChange, placeholder = "0" }) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(value ? String(value) : "");
  useEffect(() => {
    if (!focused) setRaw(value ? String(value) : "");
  }, [value, focused]);
  const display = focused ? raw : (value ? formatWithCommas(value) : "");
  return (
    <div className="pe-field-wrap">
      <span className="pe-field-adorn pe-field-adorn--left">$</span>
      <input
        type="text"
        inputMode="numeric"
        className="pe-field-input"
        placeholder={placeholder}
        value={display}
        onFocus={() => { setFocused(true); setRaw(value ? String(value) : ""); }}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^0-9.]/g, "");
          setRaw(cleaned);
          const n = parseFloat(cleaned);
          if (!isNaN(n)) onChange(n);
          else if (cleaned === "") onChange(0);
        }}
        onBlur={() => {
          setFocused(false);
          const n = parseFloat(raw);
          setRaw(isNaN(n) ? "" : String(n));
        }}
      />
    </div>
  );
}

function PctInput({ value, onChange, placeholder = "0" }) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(() => value ? parseFloat((value * 100).toFixed(2)).toString() : "");
  useEffect(() => {
    if (!focused) setRaw(value ? parseFloat((value * 100).toFixed(2)).toString() : "");
  }, [value, focused]);
  return (
    <div className="pe-field-wrap">
      <input
        type="text"
        inputMode="decimal"
        className="pe-field-input"
        placeholder={placeholder}
        value={focused ? raw : (value ? parseFloat((value * 100).toFixed(2)).toString() : "")}
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
      <span className="pe-field-adorn pe-field-adorn--right">%</span>
    </div>
  );
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
    <Card step={1} totalSteps={9} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 28, letterSpacing: "-0.02em", marginBottom: 6 }}>
        {name ? `Nice to meet you, ${name}.` : "Let's start with you."}
      </h2>
      <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 28 }}>Three basics to anchor the plan.</p>
      <Field label="Your name">
        <input className="input" type="text" placeholder="e.g. Alex"
          value={data.yourName || ""}
          onChange={(e) => onChange("yourName", e.target.value)} />
      </Field>
      <Field label={name ? `How old are you, ${name}?` : "Your current age"} row>
        <div className="pe-field-wrap">
          <input className="pe-field-input" type="number" placeholder="35"
            min={18} max={80}
            value={data.currentAge || ""}
            onChange={(e) => onChange("currentAge", parseInt(e.target.value) || 0)} />
        </div>
      </Field>
      <Field label="Province" hint="We'll use this for tax brackets, health premiums, and provincial credits.">
        <select className="input" value={data.province || "ON"}
          onChange={(e) => onChange("province", e.target.value)}>
          {PROVINCES.map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
      </Field>
      <button onClick={onNext} className="btn btn--primary" style={{ width: "100%", marginTop: 10 }}>Continue</button>
    </Card>
  );
}

// ---------- Shared: two-up button pair ----------
function BtnPair({ options, value, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {options.map(({ label, sub, val }) => (
        <button key={label} onClick={() => onChange(val)}
          className={`option-tile ${value === val ? "is-active" : ""}`}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>{label}</div>
          {sub && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{sub}</div>}
        </button>
      ))}
    </div>
  );
}

// ---------- Card 2: Household ----------
function CardHousehold({ data, onChange, onNext, onSkip, onBack }) {
  const name = data.yourName?.trim() || "you";
  const canExit = !!(data.yourName?.trim());
  const partnered = data.partnered === true;
  const hasKids = data.hasKids === true;
  const spouseName = data.spouseName?.trim();
  const partnerFillsOwn = data.partnerFillsOwn === true;

  return (
    <Card step={2} totalSteps={9} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 28, letterSpacing: "-0.02em", marginBottom: 6 }}>
        Who are we planning for?
      </h2>
      <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 24 }}>
        {partnered ? "We'll fit the plan around both of you." : `We'll tailor it to ${name}'s full picture.`}
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
        <>
          <Field label="Your partner's name">
            <input className="input" type="text" placeholder="e.g. Jamie"
              value={data.spouseName || ""}
              onChange={(e) => onChange("spouseName", e.target.value)} />
          </Field>
          <Field label={`${spouseName ? spouseName + "'s" : "Their"} current age`} row>
            <div className="pe-field-wrap">
              <input className="pe-field-input" type="number" placeholder="33"
                min={18} max={80}
                value={data.spouseCurrentAge || ""}
                onChange={(e) => onChange("spouseCurrentAge", parseInt(e.target.value) || 0)} />
            </div>
          </Field>
          <Field label={`Will ${spouseName || "your partner"} fill in their own details?`}>
            <p className="ob-hint" style={{ marginBottom: 8 }}>Their income, savings, and pension — you can fill it in for them, or send them a link to do it themselves after you sign in.</p>
            <BtnPair
              value={data.partnerFillsOwn}
              onChange={(v) => onChange("partnerFillsOwn", v)}
              options={[
                { label: "I'll fill it in", val: false },
                { label: "They'll do it", val: true },
              ]}
            />
          </Field>
          {partnerFillsOwn && (
            <div className="ob-notice">
              <strong>Got it.</strong> Once you sign in, you'll get a link to share with{" "}
              {spouseName || "your partner"} — they can join your household and add their details.
            </div>
          )}
        </>
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

// ---------- Card 3: FIRE Vision ----------
function CardVision({ data, onChange, onNext, onSkip, onBack }) {
  const name = data.yourName?.trim() || "you";
  const spouseName = data.spouseName?.trim();
  const partnered = data.partnered === true;
  const canExit = !!(data.yourName?.trim());

  const retAge      = data.visionRetirementAge ?? 55;
  const lifestyleVal = data.visionLifestyleVal  ?? 50;
  const workLevel   = data.visionWorkLevel      ?? 1;

  const spend = lifestyleSliderToSpend(lifestyleVal);
  const fire  = classifyFire(retAge, spend, workLevel);

  const planFor = partnered && spouseName ? `${name} & ${spouseName}` : partnered ? `${name} & your partner` : name;

  return (
    <Card step={3} totalSteps={9} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <div className="chip chip--accent" style={{ marginBottom: 16 }}>Planning for {planFor}</div>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 28, letterSpacing: "-0.02em", marginBottom: 6 }}>
        What does the horizon look like?
      </h2>
      <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 24 }}>Move the sliders until it feels right.</p>

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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span className="label-xs">Lifestyle</span>
            <span className="mono" style={{ fontSize: 14, color: "var(--ink-2)" }}>{fmtSpend(spend)}/yr</span>
          </div>
          <input className="slider" type="range" min={0} max={100} step={1}
            value={lifestyleVal} onChange={(e) => onChange("visionLifestyleVal", parseInt(e.target.value))} />
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

      <button onClick={onNext} className="btn btn--primary" style={{ width: "100%", marginTop: 20 }}>This feels right →</button>
    </Card>
  );
}

// ---------- Card 4: Income ----------
function ModeToggle({ mode, onChange }) {
  return (
    <div className="mode-toggle">
      {["%", "$"].map((m) => (
        <button key={m} onClick={() => onChange(m)} className={mode === m ? "is-active" : ""}>{m}</button>
      ))}
    </div>
  );
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function VestDatePicker({ value, onChange }) {
  // value stored as "YYYY-MM" string, e.g. "2026-06"
  const parts = value ? value.split("-") : ["", ""];
  const year = parts[0] || "";
  const month = parts[1] || "";

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 15 }, (_, i) => String(currentYear + i));

  function update(newYear, newMonth) {
    if (newYear && newMonth) onChange(`${newYear}-${newMonth}`);
    else onChange(`${newYear || ""}-${newMonth || ""}`);
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select
        className="input"
        value={month}
        onChange={(e) => update(year, e.target.value)}
        style={{ flex: 1 }}
      >
        <option value="">Month</option>
        {MONTHS.map((m, i) => (
          <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>
        ))}
      </select>
      <select
        className="input"
        value={year}
        onChange={(e) => update(e.target.value, month)}
        style={{ flex: 1 }}
      >
        <option value="">Year</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}

function CompRow({ label, hint, hasKey, modeKey, pctKey, dollarKey, data, onChange, vestDateKey, vestDateLabel }) {
  const has      = data[hasKey]    === true;
  const mode     = data[modeKey]   || "%";
  const pctVal   = data[pctKey]    || 0;
  const dollarVal = data[dollarKey] || 0;
  return (
    <div style={{ marginBottom: 16 }}>
      <p className="label-xs" style={{ marginBottom: 8 }}>{label}</p>
      <BtnPair value={has} onChange={(v) => onChange(hasKey, v)}
        options={[{ label: "Yes", val: true }, { label: "No", val: false }]} />
      {has && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <label className="label-xs">{hint}</label>
            <ModeToggle mode={mode} onChange={(m) => onChange(modeKey, m)} />
          </div>
          {mode === "%" ? (
            <PctInput value={pctVal} onChange={(v) => onChange(pctKey, v)} placeholder="e.g. 15" />
          ) : (
            <DollarInput value={dollarVal} onChange={(v) => onChange(dollarKey, v)} placeholder="e.g. 25,000" />
          )}
          {vestDateKey && (
            <Field label={vestDateLabel || "Vesting date / cliff"} hint="Optional — helps model timing">
              <VestDatePicker
                value={data[vestDateKey] || ""}
                onChange={(v) => onChange(vestDateKey, v)}
              />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

function PersonIncome({ prefix, personName, data, onChange }) {
  return (
    <div>
      <Field label="Annual base salary" row>
        <DollarInput value={data[`${prefix}Base`]} onChange={(v) => onChange(`${prefix}Base`, v)} />
      </Field>
      <CompRow label={`Does ${personName} get a performance bonus?`} hint="Typical annual bonus"
        hasKey={`${prefix}HasBonus`} modeKey={`${prefix}BonusMode`}
        pctKey={`${prefix}BonusPct`} dollarKey={`${prefix}BonusDollar`}
        data={data} onChange={onChange} />
      <CompRow label="Any stock options or equity grants?" hint="Annual equity value vesting"
        hasKey={`${prefix}HasEquity`} modeKey={`${prefix}EquityMode`}
        pctKey={`${prefix}EquityPct`} dollarKey={`${prefix}EquityDollar`}
        data={data} onChange={onChange}
        vestDateKey={`${prefix}EquityVestDate`} vestDateLabel="Vesting date / cliff" />
      <CompRow label="What about RSUs?" hint="Annual RSU value vesting"
        hasKey={`${prefix}HasRsu`} modeKey={`${prefix}RsuMode`}
        pctKey={`${prefix}RsuPct`} dollarKey={`${prefix}RsuAnnual`}
        data={data} onChange={onChange}
        vestDateKey={`${prefix}RsuVestDate`} vestDateLabel="Next vesting date / cliff" />
      <CompRow label="Commission or variable pay?" hint="Typical annual commission"
        hasKey={`${prefix}HasCommission`} modeKey={`${prefix}CommissionMode`}
        pctKey={`${prefix}CommissionPct`} dollarKey={`${prefix}CommissionDollar`}
        data={data} onChange={onChange} />
      <CompRow label="Profit sharing or DPSP?" hint="Annual profit sharing amount"
        hasKey={`${prefix}HasProfitShare`} modeKey={`${prefix}ProfitShareMode`}
        pctKey={`${prefix}ProfitSharePct`} dollarKey={`${prefix}ProfitShareDollar`}
        data={data} onChange={onChange} />
    </div>
  );
}

function CardIncome({ data, onChange, onNext, onSkip, onBack, hideSpouse = false }) {
  const name = data.yourName?.trim() || "You";
  const spouseName = data.spouseName?.trim() || "Spouse";
  const canExit = !!(data.yourName?.trim());
  const partnered = data.partnered === true;
  const showSpouse = partnered && !hideSpouse;
  const combined = (data.yourBase || 0) + (showSpouse ? (data.spouseBase || 0) : 0);
  const estimatedRate = estimateBlendedTax(combined);

  return (
    <Card step={4} totalSteps={9} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 28, letterSpacing: "-0.02em", marginBottom: 6 }}>
        {showSpouse ? `${name} & ${spouseName}'s income` : `${name}'s income`}
      </h2>
      <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 24 }}>Start with base salary — we'll layer in the rest.</p>

      <PersonBlock name={name} variant="you">
        <PersonIncome prefix="your" personName="you" data={data} onChange={onChange} />
      </PersonBlock>

      {showSpouse && (
        <PersonBlock name={spouseName} variant="spouse">
          <PersonIncome prefix="spouse" personName={spouseName} data={data} onChange={onChange} />
        </PersonBlock>
      )}
      {partnered && hideSpouse && (
        <div className="ob-notice" style={{ marginTop: 12 }}>
          {spouseName}'s income will be added when they join via the invite link.
        </div>
      )}
      {combined > 0 && (
        <div className="ob-summary">
          <div className="ob-summary-row">
            <span className="label-xs">Est. blended tax rate</span>
            <span className="mono" style={{ fontSize: 14 }}>~{Math.round(estimatedRate * 100)}%</span>
          </div>
        </div>
      )}
      <button onClick={onNext} className="btn btn--primary" style={{ width: "100%", marginTop: 20 }}>Continue</button>
    </Card>
  );
}

function PersonContributions({ monthlyRrspKey, monthlyTfsaKey, monthlyNrKey, annualRrspKey, annualTfsaKey, annualNrKey, data, onChange }) {
  return (
    <div>
      <SectionLabel>Monthly contributions</SectionLabel>
      <Field label="RRSP" row>
        <DollarInput value={data[monthlyRrspKey]} onChange={(v) => onChange(monthlyRrspKey, v)} placeholder="0" />
      </Field>
      <Field label="TFSA" row>
        <DollarInput value={data[monthlyTfsaKey]} onChange={(v) => onChange(monthlyTfsaKey, v)} placeholder="0" />
      </Field>
      <Field label="Non-registered" row>
        <DollarInput value={data[monthlyNrKey]} onChange={(v) => onChange(monthlyNrKey, v)} placeholder="0" />
      </Field>
      <SectionLabel>Annual lump-sum top-ups</SectionLabel>
      <p className="ob-hint" style={{ marginBottom: 8 }}>Enter any you already plan to make — the model will suggest more based on available cash.</p>
      <Field label="RRSP" row>
        <DollarInput value={data[annualRrspKey]} onChange={(v) => onChange(annualRrspKey, v)} placeholder="0" />
      </Field>
      <Field label="TFSA" row>
        <DollarInput value={data[annualTfsaKey]} onChange={(v) => onChange(annualTfsaKey, v)} placeholder="0" />
      </Field>
      <Field label="Non-registered" row>
        <DollarInput value={data[annualNrKey]} onChange={(v) => onChange(annualNrKey, v)} placeholder="0" />
      </Field>
    </div>
  );
}

// ---------- Card 5: Retirement contributions ----------
function CardContributions({ data, onChange, onNext, onSkip, onBack, hideSpouse = false }) {
  const name = data.yourName?.trim() || "You";
  const spouseName = data.spouseName?.trim() || "Spouse";
  const canExit = !!(data.yourName?.trim());
  const partnered = data.partnered === true;
  const showSpouse = partnered && !hideSpouse;
  const hasKids = data.hasKids === true;

  return (
    <Card step={5} totalSteps={9} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 28, letterSpacing: "-0.02em", marginBottom: 6 }}>
        Retirement saving
      </h2>
      <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 24 }}>
        {showSpouse
          ? `How much are ${name} and ${spouseName} putting toward retirement — monthly and as lump sums?`
          : "How much are you putting toward retirement — monthly and as annual lump sums?"}
      </p>

      <PersonBlock name={name} variant="you">
        <PersonContributions
          monthlyRrspKey="startingMonthly" monthlyTfsaKey="yourTfsaMonthly" monthlyNrKey="yourNrMonthly"
          annualRrspKey="rrspTopUp" annualTfsaKey="tfsaTopUp" annualNrKey="nrTopUp"
          data={data} onChange={onChange}
        />
      </PersonBlock>

      {showSpouse && (
        <PersonBlock name={spouseName} variant="spouse">
          <PersonContributions
            monthlyRrspKey="spouseMonthly" monthlyTfsaKey="spouseTfsaMonthly" monthlyNrKey="spouseNrMonthly"
            annualRrspKey="spouseRrspTopUp" annualTfsaKey="spouseTfsaTopUp" annualNrKey="spouseNrTopUp"
            data={data} onChange={onChange}
          />
        </PersonBlock>
      )}

      {hasKids && (
        <PersonBlock name="Children" variant="shared">
          <Field label="Annual RESP contributions" hint="Per year, across all children" row>
            <DollarInput value={data.resp} onChange={(v) => onChange("resp", v)} placeholder="0" />
          </Field>
        </PersonBlock>
      )}
      {partnered && hideSpouse && (
        <div className="ob-notice" style={{ marginTop: 12 }}>
          {spouseName}'s contributions will be added when they join via the invite link.
        </div>
      )}
      <button onClick={onNext} className="btn btn--primary" style={{ width: "100%", marginTop: 20 }}>Continue</button>
    </Card>
  );
}

// ---------- Card 6: Existing balances ----------
function CardSavings({ data, onChange, onNext, onSkip, onBack, hideSpouse = false }) {
  const name = data.yourName?.trim() || "You";
  const spouseName = data.spouseName?.trim() || "Spouse";
  const canExit = !!(data.yourName?.trim());
  const partnered = data.partnered === true;
  const showSpouse = partnered && !hideSpouse;

  return (
    <Card step={6} totalSteps={9} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 28, letterSpacing: "-0.02em", marginBottom: 6 }}>
        What's already saved?
      </h2>
      <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 24 }}>
        {showSpouse
          ? `Current balances across ${name} and ${spouseName}'s accounts. A round number is fine — you can refine later.`
          : `Current balances across your accounts. A round number is fine — you can refine later.`}
      </p>

      <PersonBlock name={name} variant="you">
        <Field label="RRSP" row>
          <DollarInput value={data.yourRrspStart} onChange={(v) => onChange("yourRrspStart", v)} />
        </Field>
        <Field label="TFSA" row>
          <DollarInput value={data.yourTfsaStart} onChange={(v) => onChange("yourTfsaStart", v)} />
        </Field>
        <Field label="Non-registered" row>
          <DollarInput value={data.yourNrStart} onChange={(v) => onChange("yourNrStart", v)} placeholder="0" />
        </Field>
      </PersonBlock>

      {showSpouse && (
        <PersonBlock name={spouseName} variant="spouse">
          <Field label="RRSP" row>
            <DollarInput value={data.spouseRrspStart} onChange={(v) => onChange("spouseRrspStart", v)} />
          </Field>
          <Field label="TFSA" row>
            <DollarInput value={data.spouseTfsaStart} onChange={(v) => onChange("spouseTfsaStart", v)} />
          </Field>
          <Field label="Non-registered" row>
            <DollarInput value={data.spouseNrStart} onChange={(v) => onChange("spouseNrStart", v)} placeholder="0" />
          </Field>
        </PersonBlock>
      )}
      {partnered && hideSpouse && (
        <div className="ob-notice" style={{ marginTop: 12 }}>
          {spouseName}'s savings will be added when they join via the invite link.
        </div>
      )}
      <button onClick={onNext} className="btn btn--primary" style={{ width: "100%", marginTop: 20 }}>Continue</button>
    </Card>
  );
}

// ---------- Card 7: Pension ----------
function CardPension({ data, onChange, onNext, onSkip, onBack, hideSpouse = false }) {
  const name = data.yourName?.trim() || "You";
  const spouseName = data.spouseName?.trim() || "Spouse";
  const canExit = !!(data.yourName?.trim());
  const partnered = data.partnered === true;
  const showSpouse = partnered && !hideSpouse;
  const yourHasPension   = data.yourHasPension   === true;
  const spouseHasPension = data.spouseHasPension === true;

  return (
    <Card step={7} totalSteps={9} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 28, letterSpacing: "-0.02em", marginBottom: 6 }}>
        Any defined-benefit pensions?
      </h2>
      <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 24 }}>
        A DB pension pays a guaranteed monthly amount in retirement — government, teachers, or union plans.
      </p>

      <PersonBlock name={name} variant="you">
        <Field label="Defined-benefit pension?">
          <BtnPair value={data.yourHasPension} onChange={(v) => onChange("yourHasPension", v)}
            options={[{ label: "Yes", val: true }, { label: "No", val: false }]} />
        </Field>
        {yourHasPension && (
          <>
            <Field label="Monthly pension at retirement" row>
              <DollarInput value={data.pensionMonthly} onChange={(v) => onChange("pensionMonthly", v)} placeholder="0" />
            </Field>
            <Field label="Pension start age" hint="60–65" row>
              <div className="pe-field-wrap">
                <input className="pe-field-input" type="number" placeholder="65" min={50} max={75}
                  value={data.pensionStartAge || ""}
                  onChange={(e) => onChange("pensionStartAge", parseInt(e.target.value) || 0)} />
              </div>
            </Field>
          </>
        )}
      </PersonBlock>

      {showSpouse && (
        <PersonBlock name={spouseName} variant="spouse">
          <Field label="Defined-benefit pension?">
            <BtnPair value={data.spouseHasPension} onChange={(v) => onChange("spouseHasPension", v)}
              options={[{ label: "Yes", val: true }, { label: "No", val: false }]} />
          </Field>
          {spouseHasPension && (
            <>
              <Field label="Monthly pension at retirement" row>
                <DollarInput value={data.spousePensionMonthly} onChange={(v) => onChange("spousePensionMonthly", v)} placeholder="0" />
              </Field>
              <Field label="Pension start age" hint="60–65" row>
                <div className="pe-field-wrap">
                  <input className="pe-field-input" type="number" placeholder="65" min={50} max={75}
                    value={data.spousePensionStartAge || ""}
                    onChange={(e) => onChange("spousePensionStartAge", parseInt(e.target.value) || 0)} />
                </div>
              </Field>
            </>
          )}
        </PersonBlock>
      )}
      {partnered && hideSpouse && (
        <div className="ob-notice" style={{ marginTop: 12 }}>
          {spouseName}'s pension will be added when they join via the invite link.
        </div>
      )}
      <button onClick={onNext} className="btn btn--primary" style={{ width: "100%", marginTop: 20 }}>Continue</button>
    </Card>
  );
}

// ---------- Card 8: Housing ----------
function CardHome({ data, onChange, onNext, onSkip, onBack, hideSpouse = false }) {
  const name = data.yourName?.trim() || "You";
  const spouseName = data.spouseName?.trim() || "Spouse";
  const canExit = !!(data.yourName?.trim());
  const partnered = data.partnered === true;
  const showSpouse = partnered && !hideSpouse;
  const ownsHome = data.ownsHome === true;
  const rents    = data.ownsHome === false;

  return (
    <Card step={8} totalSteps={9} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 28, letterSpacing: "-0.02em", marginBottom: 6 }}>
        Housing
      </h2>
      <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 24 }}>
        {showSpouse
          ? `${name} and ${spouseName}'s housing picture — mortgage, rent, and running costs.`
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
          <Field label="Mortgage balance remaining" row>
            <DollarInput value={data.mortgagePrincipal} onChange={(v) => onChange("mortgagePrincipal", v)} />
          </Field>
          <Field label="Monthly payment" row>
            <DollarInput value={data.mortgage} onChange={(v) => onChange("mortgage", v)} />
          </Field>
          <Field label="Interest rate" hint="e.g. 3.85%" row>
            <PctInput value={data.mortgageRate} onChange={(v) => onChange("mortgageRate", v)} />
          </Field>
          <SectionLabel>Monthly housing costs</SectionLabel>
          <Field label="Property tax" row>
            <DollarInput value={data.propertyTax} onChange={(v) => onChange("propertyTax", v)} placeholder="0" />
          </Field>
          <Field label="Home insurance" row>
            <DollarInput value={data.homeInsurance} onChange={(v) => onChange("homeInsurance", v)} placeholder="0" />
          </Field>
          <Field label="Maintenance & repairs" hint="~1% of home value/yr" row>
            <DollarInput value={data.maintenance} onChange={(v) => onChange("maintenance", v)} placeholder="0" />
          </Field>
          <Field label="Utilities" row>
            <DollarInput value={data.utilities} onChange={(v) => onChange("utilities", v)} placeholder="0" />
          </Field>
        </>
      )}

      {rents && (
        <>
          <Field label="Monthly rent" row>
            <DollarInput value={data.rent} onChange={(v) => onChange("rent", v)} placeholder="0" />
          </Field>
          <Field label="Utilities" row>
            <DollarInput value={data.utilities} onChange={(v) => onChange("utilities", v)} placeholder="0" />
          </Field>
          <Field label="Tenant insurance" row>
            <DollarInput value={data.homeInsurance} onChange={(v) => onChange("homeInsurance", v)} placeholder="0" />
          </Field>
        </>
      )}

      <button onClick={onNext} className="btn btn--primary" style={{ width: "100%", marginTop: 20 }}>Continue</button>
    </Card>
  );
}

// ---------- Card 9: Spending ----------
function CardSpending({ data, onChange, onNext, onSkip, onBack, hideSpouse = false }) {
  const name = data.yourName?.trim() || "You";
  const spouseName = data.spouseName?.trim() || "Spouse";
  const partnered = data.partnered === true;
  const showSpouse = partnered && !hideSpouse;
  const hasKids = data.hasKids === true;

  // Car toggle — hidden by default, shown if any car field already has a value
  const CAR_KEYS = ["carPayment","carGas","carInsurance","carParking","carMaintenance","carRegistration"];
  const [showCars, setShowCars] = useState(() => CAR_KEYS.some(k => data[k] > 0));

  function toggleCars(on) {
    setShowCars(on);
    if (!on) {
      // Clear car values when hiding
      CAR_KEYS.forEach(k => onChange(k, 0));
    }
  }

  // Pre-fill from retirement vision spend if fields are all empty
  const lifestyleVal = data.visionLifestyleVal ?? 50;
  const retirementAnnual = lifestyleSliderToSpend(lifestyleVal);

  // Budget allocation:
  // Monthly essentials + lifestyle = 60% of annual retirement target (housing ~25% + cars ~15% excluded)
  // Annual commitments = 20% of annual retirement target
  // Total pre-fill ≈ 80% of target, leaving room for housing already captured
  const MONTHLY_POOL = retirementAnnual * 0.60; // distributed across monthly rows
  const ANNUAL_POOL  = retirementAnnual * 0.20; // distributed across annual rows

  // Monthly split weights (must sum to 1.0 — these share MONTHLY_POOL, not childcare-adjusted)
  const MONTHLY_WEIGHTS = {
    groceries:    0.26,
    utilities:    0.08,
    transport:    0.10,
    personalCare: 0.07,
    childcare:    hasKids ? 0.10 : 0,
    dining:       0.17,
    clothing:     0.08,
    subscriptions:0.06,
    entertainment:0.10,
    carGas:       0.08,
  };
  const ANNUAL_WEIGHTS = {
    travel:      0.60,
    resp:        hasKids ? 0.15 : 0,
    oneTimeMisc: 0.25,
  };

  const monthlyKeys = Object.keys(MONTHLY_WEIGHTS).filter(k => MONTHLY_WEIGHTS[k] > 0);
  const annualKeys  = Object.keys(ANNUAL_WEIGHTS).filter(k => ANNUAL_WEIGHTS[k] > 0);
  const allEmpty = [...monthlyKeys, ...annualKeys].every(k => !data[k]);

  const mWeightTotal = Object.values(MONTHLY_WEIGHTS).reduce((a, b) => a + b, 0);
  const aWeightTotal = Object.values(ANNUAL_WEIGHTS).reduce((a, b) => a + b, 0);

  useEffect(() => {
    if (!allEmpty) return;
    monthlyKeys.forEach(k => {
      const v = Math.round((MONTHLY_WEIGHTS[k] / mWeightTotal) * MONTHLY_POOL / 12 / 50) * 50;
      if (v > 0) onChange(k, v);
    });
    annualKeys.forEach(k => {
      const v = Math.round((ANNUAL_WEIGHTS[k] / aWeightTotal) * ANNUAL_POOL / 100) * 100;
      if (v > 0) onChange(k, v);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const essentialRows = [
    { key: "groceries",    label: "Groceries" },
    { key: "utilities",    label: "Utilities (hydro, gas, water)" },
    { key: "transport",    label: "Transport & transit" },
    { key: "personalCare", label: "Personal care & health" },
    { key: "childcare",    label: "Childcare & activities", kidsOnly: true },
  ].filter(c => !c.kidsOnly || hasKids);

  const lifestyleRows = [
    { key: "dining",        label: "Dining & takeout" },
    { key: "clothing",      label: "Clothing & shopping" },
    { key: "subscriptions", label: "Subscriptions & tech" },
    { key: "entertainment", label: "Entertainment & hobbies" },
  ];

  const carMonthlyRows = [
    { key: "carPayment",   label: "Car payment / lease" },
    { key: "carGas",       label: "Gas & charging" },
    { key: "carInsurance", label: "Car insurance" },
    { key: "carParking",   label: "Parking & tolls" },
  ];

  const annualRows = [
    { key: "travel",      label: "Travel & holidays" },
    { key: "resp",        label: "RESP contributions", kidsOnly: true },
    { key: "oneTimeMisc", label: "Other annual expenses", hint: "Gifts, insurance premiums, etc." },
  ].filter(c => !c.kidsOnly || hasKids);

  const carAnnualRows = [
    { key: "carMaintenance",  label: "Car maintenance & repairs" },
    { key: "carRegistration", label: "Car registration & licensing" },
  ];

  const baseMonthlyRows = [...essentialRows, ...lifestyleRows];
  const allMonthlyRows  = showCars ? [...baseMonthlyRows, ...carMonthlyRows] : baseMonthlyRows;
  const totalMonthly = allMonthlyRows.reduce((s, c) => s + (data[c.key] || 0), 0);
  const allAnnualRows = showCars ? [...annualRows, ...carAnnualRows] : annualRows;
  const totalAnnual  = allAnnualRows.reduce((s, c) => s + (data[c.key] || 0), 0);
  const grandTotal   = totalMonthly * 12 + totalAnnual;

  return (
    <Card step={9} totalSteps={9} onSkip={onSkip} canExit={false} onExit={onSkip} onBack={onBack}>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 28, letterSpacing: "-0.02em", marginBottom: 6 }}>
        {showSpouse ? `How do ${name} & ${spouseName} spend today?` : `How does ${name} spend today?`}
      </h2>
      <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 8 }}>
        Monthly figures in today's dollars — housing excluded (already captured).
      </p>
      {!allEmpty && (
        <div style={{ fontSize: 12, color: "var(--accent-ink)", background: "var(--accent-soft)", borderRadius: 8, padding: "8px 12px", marginBottom: 16 }}>
          Pre-filled from your {fmtSpend(retirementAnnual)}/yr retirement target — adjust to match today's spending.
        </div>
      )}

      <SectionLabel>Essentials — monthly</SectionLabel>
      {essentialRows.map(c => (
        <Field key={c.key} label={c.label} row>
          <DollarInput value={data[c.key]} onChange={v => onChange(c.key, v)} placeholder="0" />
        </Field>
      ))}

      <SectionLabel>Lifestyle — monthly</SectionLabel>
      {lifestyleRows.map(c => (
        <Field key={c.key} label={c.label} row>
          <DollarInput value={data[c.key]} onChange={v => onChange(c.key, v)} placeholder="0" />
        </Field>
      ))}

      {/* Cars — opt-in toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 0", borderTop: "1px solid var(--line)", marginTop: 4 }}>
        <span style={{ fontSize: "var(--step--2)", letterSpacing: "0.07em", textTransform: "uppercase", fontWeight: 600, color: "var(--ink-3)" }}>Cars — monthly</span>
        <button
          onClick={() => toggleCars(!showCars)}
          style={{
            fontSize: 12, fontWeight: 500, color: showCars ? "var(--accent-deep)" : "var(--ink-3)",
            background: showCars ? "var(--accent-soft)" : "var(--paper-2)",
            border: "1px solid " + (showCars ? "oklch(80% 0.07 150)" : "var(--line)"),
            borderRadius: 20, padding: "3px 12px", cursor: "pointer", transition: "all 0.15s",
          }}
        >
          {showCars ? "Remove" : "+ Add"}
        </button>
      </div>
      {showCars && (
        <div style={{ paddingTop: 8 }}>
          {carMonthlyRows.map(c => (
            <Field key={c.key} label={c.label} row>
              <DollarInput value={data[c.key]} onChange={v => onChange(c.key, v)} placeholder="0" />
            </Field>
          ))}
        </div>
      )}

      {totalMonthly > 0 && (
        <div className="ob-summary">
          <div className="ob-summary-row">
            <span className="label-xs">Monthly total (ex. housing)</span>
            <span className="mono" style={{ fontSize: 14 }}>${totalMonthly.toLocaleString()}/mo</span>
          </div>
        </div>
      )}

      <SectionLabel>Annual commitments</SectionLabel>
      {annualRows.map(c => (
        <Field key={c.key} label={c.label} hint={c.hint} row>
          <DollarInput value={data[c.key]} onChange={v => onChange(c.key, v)} placeholder="0" />
        </Field>
      ))}
      {showCars && carAnnualRows.map(c => (
        <Field key={c.key} label={c.label} row>
          <DollarInput value={data[c.key]} onChange={v => onChange(c.key, v)} placeholder="0" />
        </Field>
      ))}

      {grandTotal > 0 && (
        <div className="ob-summary">
          <div className="ob-summary-row">
            <span className="label-xs">Est. annual total (ex. housing)</span>
            <span className="mono" style={{ fontSize: 14 }}>${Math.round(grandTotal).toLocaleString()}/yr</span>
          </div>
          <div className="ob-summary-row" style={{ marginTop: 4 }}>
            <span className="label-xs" style={{ color: "var(--ink-4)" }}>Retirement target</span>
            <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>{fmtSpend(retirementAnnual)}/yr</span>
          </div>
        </div>
      )}

      <button onClick={onNext} className="btn btn--accent" style={{ width: "100%", marginTop: 20 }}>Build my plan →</button>
    </Card>
  );
}

// ---------- Card 10: CPP / Retirement income ----------
function CardRetirement({ data, onChange, onNext, onSkip, onBack, hideSpouse = false }) {
  const name = data.yourName?.trim() || "You";
  const spouseName = data.spouseName?.trim() || "Spouse";
  const canExit = !!(data.yourName?.trim());
  const partnered = data.partnered === true;
  const showSpouse = partnered && !hideSpouse;

  return (
    <Card step={10} totalSteps={10} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 28, letterSpacing: "-0.02em", marginBottom: 6 }}>
        Almost there!
      </h2>
      <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 24 }}>
        {showSpouse
          ? `Last thing — ${name} and ${spouseName}'s CPP estimates. We've pre-filled the Canadian average.`
          : `Last thing — ${name}'s CPP estimate. We've pre-filled the Canadian average.`}
      </p>
      <Field label={`${name}'s CPP (annual)`} hint="My Service Canada estimate" row>
        <DollarInput value={data.cppAmountToday ?? 9300} onChange={(v) => onChange("cppAmountToday", v)} placeholder="9300" />
      </Field>
      {showSpouse && (
        <Field label={`${spouseName}'s CPP (annual)`} row>
          <DollarInput value={data.spouseCppAmountToday ?? 9300} onChange={(v) => onChange("spouseCppAmountToday", v)} placeholder="9300" />
        </Field>
      )}
      {partnered && !showSpouse && (
        <div className="ob-notice" style={{ marginTop: 12 }}>
          {spouseName}'s CPP will be added when they join via the invite link.
        </div>
      )}
      <button onClick={onNext} className="btn btn--accent btn--lg" style={{ width: "100%", marginTop: 20 }}>Build my plan →</button>
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

  // Retirement vision
  const lifestyleVal = d.visionLifestyleVal ?? 50;
  const retirementSpendTarget = lifestyleSliderToSpend(lifestyleVal);
  const workLevel = d.visionWorkLevel ?? 1;
  const retirementWorkIncome = WORK_INCOME[workLevel - 1];
  const retirementTravel = retirementSpendTarget > 0
    ? Math.max(d.travel || 0, retirementSpendTarget * 0.15)
    : (d.travel || 0);
  const retirementHealthcare = 3000;

  // Helper: resolve a comp field that can be entered as % or $, returning a % of base
  function resolveCompPct(base, hasFlag, mode, pctVal, dollarVal) {
    if (!hasFlag) return 0;
    if (mode === "$") return base > 0 ? (dollarVal || 0) / base : 0;
    return pctVal || 0;
  }
  // Helper: resolve to absolute $ amount
  function resolveCompDollar(base, hasFlag, mode, pctVal, dollarVal) {
    if (!hasFlag) return 0;
    if (mode === "$") return dollarVal || 0;
    return base * (pctVal || 0);
  }

  const yourBase   = d.yourBase   || 0;
  const spouseBase = partnered ? (d.spouseBase || 0) : 0;

  // Equity: stock options/grants + RSUs combined into a single % of base
  const yourEquityPct = resolveCompPct(yourBase, d.yourHasEquity, d.yourEquityMode, d.yourEquityPct, d.yourEquityDollar)
    + resolveCompPct(yourBase, d.yourHasRsu, d.yourRsuMode, d.yourRsuPct, d.yourRsuAnnual);
  const spouseEquityPct = partnered
    ? resolveCompPct(spouseBase, d.spouseHasEquity, d.spouseEquityMode, d.spouseEquityPct, d.spouseEquityDollar)
      + resolveCompPct(spouseBase, d.spouseHasRsu, d.spouseRsuMode, d.spouseRsuPct, d.spouseRsuAnnual)
    : 0;

  // Pension
  const pensionMonthly       = d.yourHasPension    ? (d.pensionMonthly       || 0) : 0;
  const spousePensionMonthly = partnered && d.spouseHasPension ? (d.spousePensionMonthly || 0) : 0;
  const pensionStartAge      = d.pensionStartAge      || baseDefaults.pensionStartAge || 65;

  // Monthly contributions: RRSP + TFSA + non-reg combined into startingMonthly for backward compat
  // The calculator uses startingMonthly as the primary monthly savings figure
  const startingMonthly = (d.startingMonthly || 0)
    + (d.yourTfsaMonthly || 0)
    + (d.yourNrMonthly   || 0);

  // Spending — housing-specific costs stored separately; spending card captures the rest
  const spendFields = {
    groceries:     d.groceries     || 0,
    transport:     d.transport     || 0,
    dining:        d.dining        || 0,
    clothing:      d.clothing      || 0,
    subscriptions: d.subscriptions || 0,
    personalCare:  d.personalCare  || 0,
    childcare:     d.childcare     || 0,
    entertainment: d.entertainment || 0,
    // Housing costs captured from CardHome
    propertyTax:   d.propertyTax   || 0,
    maintenance:   d.maintenance   || 0,
    utilities:     d.utilities     || 0,
    // Cars — monthly
    carPayment:    d.carPayment    || 0,
    carGas:        d.carGas        || 0,
    carInsurance:  d.carInsurance  || 0,
    carParking:    d.carParking    || 0,
    // Cars — annual
    carMaintenance:  d.carMaintenance  || 0,
    carRegistration: d.carRegistration || 0,
  };

  // Annual lump-sum additions into oneTimeMisc / separate fields
  const annualTopUps = (d.rrspTopUp || 0) + (d.tfsaTopUp || 0) + (d.nrTopUp || 0)
    + (partnered ? (d.spouseRrspTopUp || 0) + (d.spouseTfsaTopUp || 0) + (d.spouseNrTopUp || 0) : 0);

  const cppAmountToday = d.cppAmountToday > 0 ? d.cppAmountToday : 9300;
  const spouseCpp      = partnered ? (d.spouseCppAmountToday > 0 ? d.spouseCppAmountToday : 9300) : 0;
  const combinedCpp    = cppAmountToday + spouseCpp;

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
    yourBonusPct:     resolveCompPct(yourBase, d.yourHasBonus, d.yourBonusMode, d.yourBonusPct, d.yourBonusDollar),
    spouseBonusPct:   partnered ? resolveCompPct(spouseBase, d.spouseHasBonus, d.spouseBonusMode, d.spouseBonusPct, d.spouseBonusDollar) : 0,
    yourEquityPct,
    spouseEquityPct,
    // Commission and profit sharing folded into bonus for calculator compat (additive)
    yourCommissionPct:   resolveCompPct(yourBase, d.yourHasCommission, d.yourCommissionMode, d.yourCommissionPct, d.yourCommissionDollar),
    yourProfitSharePct:  resolveCompPct(yourBase, d.yourHasProfitShare, d.yourProfitShareMode, d.yourProfitSharePct, d.yourProfitShareDollar),
    spouseCommissionPct: partnered ? resolveCompPct(spouseBase, d.spouseHasCommission, d.spouseCommissionMode, d.spouseCommissionPct, d.spouseCommissionDollar) : 0,
    spouseProfitSharePct: partnered ? resolveCompPct(spouseBase, d.spouseHasProfitShare, d.spouseProfitShareMode, d.spouseProfitSharePct, d.spouseProfitShareDollar) : 0,
    taxRate,
    // Contributions
    startingMonthly,
    // Pension
    pensionMonthly,
    spousePensionMonthly,
    pensionStartAge,
    // Existing balances
    yourRrspStart:    d.yourRrspStart   || 0,
    spouseRrspStart:  partnered ? (d.spouseRrspStart || 0) : 0,
    yourTfsaStart:    d.yourTfsaStart   || 0,
    spouseTfsaStart:  partnered ? (d.spouseTfsaStart || 0) : 0,
    yourNrStart:      d.yourNrStart     || 0,
    spouseNrStart:    partnered ? (d.spouseNrStart || 0) : 0,
    // Housing
    mortgage:          d.ownsHome ? (d.mortgage          || 0) : 0,
    mortgagePrincipal: d.ownsHome ? (d.mortgagePrincipal || 0) : 0,
    mortgageRate:      d.ownsHome ? (d.mortgageRate       || 0) : 0,
    rent:              !d.ownsHome ? (d.rent || 0) : 0,
    homeInsurance:     d.homeInsurance || 0,
    // Spending
    ...spendFields,
    travel:            d.travel || 0,
    resp:              d.resp   || 0,
    otherAnnual:       (d.otherAnnual || 0) + annualTopUps,
    oneTimeMisc:       d.oneTimeMisc || baseDefaults.oneTimeMisc || 0,
    // Retirement
    retirementTravel,
    retirementHealthcare,
    cppAmountToday:   combinedCpp,
    cppStartAge:      baseDefaults.cppStartAge || 65,
    oasAmountToday:   baseDefaults.oasAmountToday || 8500,
    oasStartAge:      65,
    // Vision
    visionRetirementAge: d.visionRetirementAge ?? 55,
    visionLifestyleVal:  lifestyleVal,
    visionWorkLevel:     workLevel,
    retirementWorkIncome,
    partnered,
    hasKids:          d.hasKids === true,
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
    visionLifestyleVal: 50,
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
  if (step === 3)  return <CardVision        data={data} onChange={update} onNext={next} onSkip={skip} onBack={back} />;
  if (step === 4)  return <CardIncome        data={data} onChange={update} onNext={next} onSkip={skip} onBack={back} hideSpouse={partnerFillsOwn} />;
  if (step === 5)  return <CardContributions data={data} onChange={update} onNext={next} onSkip={skip} onBack={back} hideSpouse={partnerFillsOwn} />;
  if (step === 6)  return <CardSavings       data={data} onChange={update} onNext={next} onSkip={skip} onBack={back} hideSpouse={partnerFillsOwn} />;
  if (step === 7)  return <CardPension       data={data} onChange={update} onNext={next} onSkip={skip} onBack={back} hideSpouse={partnerFillsOwn} />;
  if (step === 8)  return <CardHome          data={data} onChange={update} onNext={next} onSkip={skip} onBack={back} hideSpouse={partnerFillsOwn} />;
  if (step === 9)  return <CardSpending      data={data} onChange={update} onNext={skip} onSkip={skip} onBack={back} hideSpouse={partnerFillsOwn} />;
  return null;
}
