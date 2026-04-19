import { useState, useEffect } from "react";

// ---------- province data ----------
const PROVINCES = [
  { code: "ON", name: "Ontario" },
  { code: "BC", name: "British Columbia" },
  { code: "AB", name: "Alberta" },
  { code: "QC", name: "Quebec" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NB", name: "New Brunswick" },
  { code: "MB", name: "Manitoba" },
  { code: "SK", name: "Saskatchewan" },
  { code: "NL", name: "Newfoundland & Labrador" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "NT", name: "Northwest Territories" },
  { code: "YT", name: "Yukon" },
  { code: "NU", name: "Nunavut" },
];

// Life expectancy defaults by province (Statistics Canada)
const LIFE_EXPECTANCY = {
  ON: 87, BC: 88, AB: 87, QC: 87, NS: 85,
  NB: 85, MB: 85, SK: 85, NL: 84, PE: 86,
  NT: 81, YT: 83, NU: 78,
};

// Rough blended Ontario marginal rate on household employment income
function estimateBlendedTax(combinedIncome) {
  if (combinedIncome <= 0) return 0;
  // Very rough blended rate based on combined household income
  // (both earners share the bracket load)
  if (combinedIncome < 100000) return 0.28;
  if (combinedIncome < 180000) return 0.33;
  if (combinedIncome < 260000) return 0.38;
  if (combinedIncome < 400000) return 0.43;
  return 0.46;
}

// ---------- shared input styles ----------
const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white transition-colors";
const labelCls = "block text-xs font-medium text-slate-500 mb-1";
const cardBtn =
  "w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ";
const primaryBtn = cardBtn + "bg-slate-900 text-white hover:bg-slate-700";
const secondaryBtn =
  cardBtn + "border border-slate-300 text-slate-600 hover:bg-slate-50";

function Field({ label, children, hint }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function DollarInput({ value, onChange, placeholder = "0" }) {
  const [raw, setRaw] = useState(value ? String(value) : "");
  useEffect(() => {
    if (document.activeElement?.dataset?.dollar !== "true")
      setRaw(value ? String(value) : "");
  }, [value]);
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
      <input
        data-dollar="true"
        type="text"
        inputMode="numeric"
        className={inputCls + " pl-7"}
        placeholder={placeholder}
        value={raw}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^0-9.]/g, "");
          setRaw(cleaned);
          const n = parseFloat(cleaned);
          if (!isNaN(n)) onChange(n);
          else if (cleaned === "") onChange(0);
        }}
        onBlur={() => {
          const n = parseFloat(raw);
          setRaw(isNaN(n) ? "" : String(n));
        }}
      />
    </div>
  );
}

function PctInput({ value, onChange, placeholder = "0" }) {
  const pctVal = value ? Math.round(value * 100) : "";
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        className={inputCls + " pr-7"}
        placeholder={placeholder}
        value={pctVal === 0 ? "" : pctVal}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^0-9.]/g, "");
          const n = parseFloat(cleaned);
          if (!isNaN(n)) onChange(n / 100);
          else if (cleaned === "") onChange(0);
        }}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
    </div>
  );
}

// Progress bar
function ProgressBar({ step, total }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="w-full mb-6">
      <div className="flex justify-between text-xs text-slate-400 mb-1.5">
        <span>Step {step} of {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-slate-800 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// Card shell
function Card({ children, step, totalSteps, onSkip, canExit, onExit, title, subtitle }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Skip / Exit controls */}
        <div className="flex justify-end mb-3">
          {canExit ? (
            <button
              onClick={onExit}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Exit onboarding →
            </button>
          ) : (
            <button
              onClick={onSkip}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Skip for now →
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8">
          <ProgressBar step={step} total={totalSteps} />

          {title && (
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900">{title}</h2>
              {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
            </div>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}

// ---------- individual cards ----------

function CardWelcome({ onNext, onSignIn }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg border border-slate-100 p-10 text-center">
        <div className="text-4xl mb-4">🔥</div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Plan your FAT FIRE</h1>
        <p className="text-slate-500 text-sm mb-8 leading-relaxed">
          A Canadian tax-optimized retirement calculator. We'll build your
          financial picture in a few quick steps — all figures in today's dollars.
        </p>
        <div className="space-y-3">
          <button onClick={onNext} className={primaryBtn}>
            Let's go →
          </button>
          <button onClick={onSignIn} className={secondaryBtn}>
            I already have an account
          </button>
        </div>
      </div>
    </div>
  );
}

function CardAboutYou({ data, onChange, onNext, onSkip }) {
  const canExit = !!(data.yourName && data.yourName.trim().length > 0);
  return (
    <Card step={1} totalSteps={7} onSkip={onSkip} canExit={canExit} onExit={onSkip}
      title="About you" subtitle="Let's start with the basics.">
      <div className="space-y-4">
        <Field label="Your name">
          <input
            type="text"
            className={inputCls}
            placeholder="e.g. Alex"
            value={data.yourName || ""}
            onChange={(e) => onChange("yourName", e.target.value)}
          />
        </Field>
        <Field label="Your current age">
          <input
            type="number"
            className={inputCls}
            placeholder="e.g. 35"
            min={18} max={80}
            value={data.currentAge || ""}
            onChange={(e) => onChange("currentAge", parseInt(e.target.value) || 0)}
          />
        </Field>
        <Field label="Province">
          <select
            className={inputCls}
            value={data.province || "ON"}
            onChange={(e) => onChange("province", e.target.value)}
          >
            {PROVINCES.map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-6 space-y-3">
        <button onClick={onNext} className={primaryBtn}>Continue</button>
      </div>
    </Card>
  );
}

function CardHousehold({ data, onChange, onNext, onSkip }) {
  const canExit = !!(data.yourName && data.yourName.trim().length > 0);
  const partnered = data.partnered === true;
  const hasKids = data.hasKids === true;
  return (
    <Card step={2} totalSteps={7} onSkip={onSkip} canExit={canExit} onExit={onSkip}
      title="Your household" subtitle="Who are we planning for?">
      <div className="space-y-4">
        {/* Relationship status */}
        <Field label="Relationship status">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Single", value: false },
              { label: "Partnered", value: true },
            ].map(({ label, value }) => (
              <button
                key={label}
                onClick={() => onChange("partnered", value)}
                className={
                  "py-2.5 rounded-lg border text-sm font-medium transition-colors " +
                  (partnered === value
                    ? "border-slate-800 bg-slate-900 text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        {/* Spouse fields */}
        {partnered && (
          <>
            <Field label="Spouse / partner's name">
              <input
                type="text"
                className={inputCls}
                placeholder="e.g. Jamie"
                value={data.spouseName || ""}
                onChange={(e) => onChange("spouseName", e.target.value)}
              />
            </Field>
            <Field label="Spouse / partner's current age">
              <input
                type="number"
                className={inputCls}
                placeholder="e.g. 33"
                min={18} max={80}
                value={data.spouseCurrentAge || ""}
                onChange={(e) => onChange("spouseCurrentAge", parseInt(e.target.value) || 0)}
              />
            </Field>
          </>
        )}

        {/* Kids */}
        <Field label="Do you have children under 18?">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Yes", value: true },
              { label: "No", value: false },
            ].map(({ label, value }) => (
              <button
                key={label}
                onClick={() => onChange("hasKids", value)}
                className={
                  "py-2.5 rounded-lg border text-sm font-medium transition-colors " +
                  (hasKids === value
                    ? "border-slate-800 bg-slate-900 text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="mt-6 space-y-3">
        <button onClick={onNext} className={primaryBtn}>Continue</button>
      </div>
    </Card>
  );
}

function CardIncome({ data, onChange, onNext, onSkip }) {
  const canExit = !!(data.yourName && data.yourName.trim().length > 0);
  const partnered = data.partnered === true;
  const combined = (data.yourBase || 0) + (partnered ? (data.spouseBase || 0) : 0);
  const estimatedRate = estimateBlendedTax(combined);
  return (
    <Card step={3} totalSteps={7} onSkip={onSkip} canExit={canExit} onExit={onSkip}
      title="Your income"
      subtitle="Employment income only — we'll account for bonuses and equity too.">
      <div className="space-y-5">
        {/* Your income */}
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            {data.yourName || "You"}
          </div>
          <div className="space-y-3">
            <Field label="Base salary">
              <DollarInput value={data.yourBase} onChange={(v) => onChange("yourBase", v)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Annual bonus" hint="% of base">
                <PctInput value={data.yourBonusPct} onChange={(v) => onChange("yourBonusPct", v)} />
              </Field>
              <Field label="Equity vesting" hint="% of base">
                <PctInput value={data.yourEquityPct} onChange={(v) => onChange("yourEquityPct", v)} />
              </Field>
            </div>
            <Field label="Monthly RRSP contribution">
              <DollarInput value={data.startingMonthly} onChange={(v) => onChange("startingMonthly", v)} placeholder="e.g. 2000" />
            </Field>
            <Field label="Defined-benefit pension (monthly at retirement)" hint="Leave blank if none">
              <DollarInput value={data.pensionMonthly} onChange={(v) => onChange("pensionMonthly", v)} placeholder="0" />
            </Field>
          </div>
        </div>

        {/* Spouse income */}
        {partnered && (
          <div className="border-t border-slate-100 pt-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              {data.spouseName || "Spouse"}
            </div>
            <div className="space-y-3">
              <Field label="Base salary">
                <DollarInput value={data.spouseBase} onChange={(v) => onChange("spouseBase", v)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Annual bonus" hint="% of base">
                  <PctInput value={data.spouseBonusPct} onChange={(v) => onChange("spouseBonusPct", v)} />
                </Field>
                <Field label="Equity vesting" hint="% of base">
                  <PctInput value={data.spouseEquityPct} onChange={(v) => onChange("spouseEquityPct", v)} />
                </Field>
              </div>
              <Field label="Defined-benefit pension (monthly at retirement)" hint="Leave blank if none">
                <DollarInput value={data.spousePensionMonthly} onChange={(v) => onChange("spousePensionMonthly", v)} placeholder="0" />
              </Field>
            </div>
          </div>
        )}

        {/* Estimated tax rate badge */}
        {combined > 0 && (
          <div className="bg-slate-50 rounded-lg p-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">Estimated blended tax rate</span>
            <span className="text-xs font-semibold text-slate-700 bg-slate-200 px-2 py-0.5 rounded-full">
              ~{Math.round(estimatedRate * 100)}% <span className="font-normal text-slate-400">(auto)</span>
            </span>
          </div>
        )}
      </div>
      <div className="mt-6 space-y-3">
        <button onClick={onNext} className={primaryBtn}>Continue</button>
      </div>
    </Card>
  );
}

function CardSavings({ data, onChange, onNext, onSkip }) {
  const canExit = !!(data.yourName && data.yourName.trim().length > 0);
  const partnered = data.partnered === true;
  return (
    <Card step={4} totalSteps={7} onSkip={onSkip} canExit={canExit} onExit={onSkip}
      title="Your savings"
      subtitle="Current balances across your registered and non-registered accounts.">
      <div className="space-y-5">
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            {data.yourName || "You"}
          </div>
          <div className="space-y-3">
            <Field label="RRSP balance">
              <DollarInput value={data.yourRrspStart} onChange={(v) => onChange("yourRrspStart", v)} />
            </Field>
            <Field label="TFSA balance">
              <DollarInput value={data.yourTfsaStart} onChange={(v) => onChange("yourTfsaStart", v)} />
            </Field>
            <Field label="Non-registered investments">
              <DollarInput value={data.yourNrStart} onChange={(v) => onChange("yourNrStart", v)} placeholder="0" />
            </Field>
          </div>
        </div>
        {partnered && (
          <div className="border-t border-slate-100 pt-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              {data.spouseName || "Spouse"}
            </div>
            <div className="space-y-3">
              <Field label="RRSP balance">
                <DollarInput value={data.spouseRrspStart} onChange={(v) => onChange("spouseRrspStart", v)} />
              </Field>
              <Field label="TFSA balance">
                <DollarInput value={data.spouseTfsaStart} onChange={(v) => onChange("spouseTfsaStart", v)} />
              </Field>
              <Field label="Non-registered investments">
                <DollarInput value={data.spouseNrStart} onChange={(v) => onChange("spouseNrStart", v)} placeholder="0" />
              </Field>
            </div>
          </div>
        )}
      </div>
      <div className="mt-6 space-y-3">
        <button onClick={onNext} className={primaryBtn}>Continue</button>
      </div>
    </Card>
  );
}

function CardHome({ data, onChange, onNext, onSkip }) {
  const canExit = !!(data.yourName && data.yourName.trim().length > 0);
  const ownsHome = data.ownsHome === true;
  return (
    <Card step={5} totalSteps={7} onSkip={onSkip} canExit={canExit} onExit={onSkip}
      title="Your home" subtitle="This helps us model when your mortgage will be paid off.">
      <div className="space-y-4">
        <Field label="Do you own your home?">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Yes, I own", value: true },
              { label: "I rent", value: false },
            ].map(({ label, value }) => (
              <button
                key={label}
                onClick={() => onChange("ownsHome", value)}
                className={
                  "py-2.5 rounded-lg border text-sm font-medium transition-colors " +
                  (ownsHome === value
                    ? "border-slate-800 bg-slate-900 text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
        {ownsHome && (
          <>
            <Field label="Mortgage balance remaining">
              <DollarInput value={data.mortgagePrincipal} onChange={(v) => onChange("mortgagePrincipal", v)} />
            </Field>
            <Field label="Monthly mortgage payment">
              <DollarInput value={data.mortgage} onChange={(v) => onChange("mortgage", v)} />
            </Field>
            <Field label="Interest rate" hint="e.g. 3.85 for 3.85%">
              <PctInput value={data.mortgageRate} onChange={(v) => onChange("mortgageRate", v)} />
            </Field>
          </>
        )}
      </div>
      <div className="mt-6 space-y-3">
        <button onClick={onNext} className={primaryBtn}>Continue</button>
      </div>
    </Card>
  );
}

// Spending card with expandable categories
function CardSpending({ data, onChange, onNext, onSkip }) {
  const canExit = !!(data.yourName && data.yourName.trim().length > 0);
  const [expanded, setExpanded] = useState(false);
  const hasKids = data.hasKids === true;

  // Categories — shown when expanded
  const categories = [
    { key: "maintenance", label: "Home maintenance" },
    { key: "propertyTax", label: "Property tax" },
    { key: "utilities", label: "Utilities" },
    { key: "transport", label: "Transport" },
    { key: "groceries", label: "Groceries" },
    { key: "dining", label: "Dining out" },
    { key: "clothing", label: "Clothing" },
    { key: "subscriptions", label: "Subscriptions & tech" },
    { key: "personalCare", label: "Personal care" },
    ...(hasKids ? [{ key: "childcare", label: "Childcare & activities" }] : []),
  ];

  // Compute total from categories when expanded
  const categoryTotal = categories.reduce((sum, c) => sum + (data[c.key] || 0), 0);
  // Add mortgage if they own
  const mortgageInTotal = data.ownsHome ? (data.mortgage || 0) : 0;

  return (
    <Card step={6} totalSteps={7} onSkip={onSkip} canExit={canExit} onExit={onSkip}
      title="Your spending"
      subtitle="Monthly expenses in today's dollars, excluding mortgage (already captured).">
      <div className="space-y-4">
        {!expanded ? (
          <>
            <Field label="Total monthly spend (excluding mortgage)" hint="Your best estimate — you can refine by category below">
              <DollarInput
                value={data.totalMonthlySpend}
                onChange={(v) => onChange("totalMonthlySpend", v)}
                placeholder="e.g. 8000"
              />
            </Field>
            <button
              onClick={() => setExpanded(true)}
              className="text-xs text-slate-500 hover:text-slate-700 underline"
            >
              Break it down by category instead
            </button>
          </>
        ) : (
          <>
            <div className="space-y-3">
              {categories.map((c) => (
                <Field key={c.key} label={c.label}>
                  <DollarInput
                    value={data[c.key]}
                    onChange={(v) => onChange(c.key, v)}
                    placeholder="0"
                  />
                </Field>
              ))}
            </div>
            <div className="bg-slate-50 rounded-lg p-3 flex items-center justify-between">
              <span className="text-xs text-slate-500">Category total</span>
              <span className="text-xs font-semibold text-slate-700">
                ${(categoryTotal).toLocaleString()}/mo
              </span>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="text-xs text-slate-500 hover:text-slate-700 underline"
            >
              ← Use a single total instead
            </button>
          </>
        )}

        {/* Annual travel */}
        <div className="border-t border-slate-100 pt-4">
          <Field label="Annual travel budget" hint="We'll use this as a baseline for retirement travel too">
            <DollarInput value={data.travel} onChange={(v) => onChange("travel", v)} placeholder="e.g. 10000" />
          </Field>
          {hasKids && (
            <div className="mt-3">
              <Field label="Annual RESP contributions" hint="Per year, across all children">
                <DollarInput value={data.resp} onChange={(v) => onChange("resp", v)} placeholder="e.g. 2500" />
              </Field>
            </div>
          )}
        </div>
      </div>
      <div className="mt-6 space-y-3">
        <button onClick={onNext} className={primaryBtn}>Continue</button>
      </div>
    </Card>
  );
}

function CardRetirement({ data, onChange, onNext, onSkip }) {
  const canExit = !!(data.yourName && data.yourName.trim().length > 0);
  const partnered = data.partnered === true;
  return (
    <Card step={7} totalSteps={7} onSkip={onSkip} canExit={canExit} onExit={onSkip}
      title="Your retirement"
      subtitle="When do you want to retire, and what income will you have?">
      <div className="space-y-4">
        <Field label="Target retirement age" hint="Leave blank to find the earliest possible">
          <input
            type="number"
            className={inputCls}
            placeholder="e.g. 55 (or leave blank)"
            min={40} max={75}
            value={data.targetRetirementAge || ""}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              onChange("targetRetirementAge", isNaN(v) ? null : v);
            }}
          />
        </Field>

        <div className="border-t border-slate-100 pt-4 space-y-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            CPP estimates <span className="font-normal normal-case text-slate-400">— pre-filled with Canadian average, adjust if you know yours</span>
          </div>
          <Field label={`${data.yourName || "Your"} estimated CPP (annual)`}>
            <DollarInput
              value={data.cppAmountToday}
              onChange={(v) => onChange("cppAmountToday", v)}
              placeholder="9300"
            />
          </Field>
          {partnered && (
            <Field label={`${data.spouseName || "Spouse"} estimated CPP (annual)`}>
              <DollarInput
                value={data.spouseCppAmountToday}
                onChange={(v) => onChange("spouseCppAmountToday", v)}
                placeholder="9300"
              />
            </Field>
          )}
        </div>
      </div>
      <div className="mt-6 space-y-3">
        <button onClick={onNext} className={primaryBtn}>
          Build my plan →
        </button>
      </div>
    </Card>
  );
}

// ---------- main onboarding orchestrator ----------

const TOTAL_STEPS = 7;

// Translate onboarding answers into calculator state fields
export function onboardingToState(d, baseDefaults) {
  const province = d.province || "ON";
  const deathAge = LIFE_EXPECTANCY[province] || 87;
  const partnered = d.partnered === true;
  const combined = (d.yourBase || 0) + (partnered ? (d.spouseBase || 0) : 0);
  const taxRate = estimateBlendedTax(combined);

  // Spending: use category breakdown if available, else single total
  const hasCategories = [
    "maintenance", "propertyTax", "utilities", "transport",
    "groceries", "dining", "clothing", "subscriptions", "personalCare", "childcare"
  ].some((k) => d[k] > 0);

  const totalMonthlyExMortgage = hasCategories
    ? (d.maintenance || 0) + (d.propertyTax || 0) + (d.utilities || 0) +
      (d.transport || 0) + (d.groceries || 0) + (d.dining || 0) +
      (d.clothing || 0) + (d.subscriptions || 0) + (d.personalCare || 0) +
      (d.childcare || 0)
    : (d.totalMonthlySpend || 0);

  // Split evenly across groceries + utilities + transport + dining if single total
  // (so the calculator shows something reasonable per-line rather than all in one field)
  const spendFields = hasCategories
    ? {
        maintenance:  d.maintenance  || 0,
        propertyTax:  d.propertyTax  || 0,
        utilities:    d.utilities    || 0,
        transport:    d.transport    || 0,
        groceries:    d.groceries    || 0,
        dining:       d.dining       || 0,
        clothing:     d.clothing     || 0,
        subscriptions: d.subscriptions || 0,
        personalCare: d.personalCare || 0,
        childcare:    d.childcare    || 0,
      }
    : {
        // Lump the total into groceries as a catch-all line
        groceries:    totalMonthlyExMortgage,
        maintenance:  0, propertyTax: 0, utilities: 0,
        transport:    0, dining: 0, clothing: 0,
        subscriptions: 0, personalCare: 0, childcare: 0,
      };

  // Retirement travel = working travel (delta $0 until user changes it)
  const retirementTravel = d.travel || 0;
  // Retirement healthcare default
  const retirementHealthcare = 3000;

  // CPP: use per-person fields, default $9,300 if blank
  const cppAmountToday = d.cppAmountToday > 0 ? d.cppAmountToday : 9300;
  const spouseCpp = partnered
    ? (d.spouseCppAmountToday > 0 ? d.spouseCppAmountToday : 9300)
    : 0;
  // Engine uses a single combined CPP field
  const combinedCpp = cppAmountToday + spouseCpp;

  return {
    ...baseDefaults,
    // Names
    yourName:   d.yourName   || baseDefaults.yourName,
    spouseName: partnered ? (d.spouseName || baseDefaults.spouseName) : baseDefaults.spouseName,
    // Ages
    currentAge:       d.currentAge       || baseDefaults.currentAge,
    spouseCurrentAge: partnered ? (d.spouseCurrentAge || baseDefaults.spouseCurrentAge) : baseDefaults.spouseCurrentAge,
    deathAge,
    // Income
    yourBase:       d.yourBase       || 0,
    spouseBase:     partnered ? (d.spouseBase || 0) : 0,
    yourBonusPct:   d.yourBonusPct   || 0,
    spouseBonusPct: partnered ? (d.spouseBonusPct || 0) : 0,
    yourEquityPct:  d.yourEquityPct  || 0,
    spouseEquityPct: partnered ? (d.spouseEquityPct || 0) : 0,
    taxRate,
    // Contributions
    startingMonthly: d.startingMonthly || 0,
    // Pension
    pensionMonthly:      d.pensionMonthly      || 0,
    spousePensionMonthly: partnered ? (d.spousePensionMonthly || 0) : 0,
    pensionStartAge: baseDefaults.pensionStartAge,
    // Savings
    yourRrspStart:   d.yourRrspStart   || 0,
    spouseRrspStart: partnered ? (d.spouseRrspStart || 0) : 0,
    yourTfsaStart:   d.yourTfsaStart   || 0,
    spouseTfsaStart: partnered ? (d.spouseTfsaStart || 0) : 0,
    yourNrStart:     d.yourNrStart     || 0,
    spouseNrStart:   partnered ? (d.spouseNrStart || 0) : 0,
    // Mortgage
    mortgage:         d.ownsHome ? (d.mortgage         || 0) : 0,
    mortgagePrincipal: d.ownsHome ? (d.mortgagePrincipal || 0) : 0,
    mortgageRate:     d.ownsHome ? (d.mortgageRate      || 0) : 0,
    // Spending
    ...spendFields,
    travel:    d.travel || 0,
    resp:      d.resp   || 0,
    oneTimeMisc: baseDefaults.oneTimeMisc || 0,
    // Retirement spending
    retirementTravel,
    retirementHealthcare,
    // Retirement income
    cppAmountToday: combinedCpp,
    cppStartAge:    baseDefaults.cppStartAge || 65,
    oasAmountToday: baseDefaults.oasAmountToday || 8500,
    oasStartAge:    65,
    // Flags for calculator display
    partnered,
    hasKids: d.hasKids === true,
    province,
    onboardingComplete: true,
  };
}

export default function Onboarding({ onComplete, onSignIn, publicDefaults }) {
  const [step, setStep] = useState(0); // 0 = welcome
  const [data, setData] = useState({
    province: "ON",
    partnered: null,
    hasKids: null,
    ownsHome: null,
    cppAmountToday: 9300,
    spouseCppAmountToday: 9300,
  });

  function update(key, value) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function next() {
    setStep((s) => s + 1);
  }

  function skip() {
    // Commit whatever we have so far and exit
    finish();
  }

  function finish() {
    onComplete(onboardingToState(data, publicDefaults));
  }

  if (step === 0) return <CardWelcome onNext={next} onSignIn={onSignIn} />;
  if (step === 1) return <CardAboutYou data={data} onChange={update} onNext={next} onSkip={skip} />;
  if (step === 2) return <CardHousehold data={data} onChange={update} onNext={next} onSkip={skip} />;
  if (step === 3) return <CardIncome data={data} onChange={update} onNext={next} onSkip={skip} />;
  if (step === 4) return <CardSavings data={data} onChange={update} onNext={next} onSkip={skip} />;
  if (step === 5) return <CardHome data={data} onChange={update} onNext={next} onSkip={skip} />;
  if (step === 6) return <CardSpending data={data} onChange={update} onNext={next} onSkip={skip} />;
  if (step === 7) return <CardRetirement data={data} onChange={update} onNext={finish} onSkip={skip} />;

  return null;
}
