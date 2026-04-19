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

// ---------- shared styles ----------
const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white transition-colors";
const labelCls = "block text-xs font-medium text-slate-500 mb-1";
const primaryBtn = "w-full py-2.5 rounded-lg text-sm font-semibold transition-colors bg-slate-900 text-white hover:bg-slate-700";
const secondaryBtn = "w-full py-2.5 rounded-lg text-sm font-semibold transition-colors border border-slate-300 text-slate-600 hover:bg-slate-50";

function Field({ label, children, hint }) {
  return (
    <div>
      {label && <label className={labelCls}>{label}</label>}
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

// Progress bar — no numbers, just the bar
function ProgressBar({ step, total }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="w-full mb-6">
      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-slate-800 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// Card shell
function Card({ children, step, totalSteps, onSkip, canExit, onExit, onBack }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Top nav row: back on left, skip/exit on right */}
        <div className="flex justify-between items-center mb-3 h-5">
          {onBack ? (
            <button onClick={onBack} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              ← Back
            </button>
          ) : (
            <span />
          )}
          {canExit ? (
            <button onClick={onExit} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              Skip to the dashboard →
            </button>
          ) : (
            <button onClick={onSkip} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              Skip for now →
            </button>
          )}
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8">
          <ProgressBar step={step} total={totalSteps} />
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------- Card: Welcome ----------
function CardWelcome({ onNext, onSignIn }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg border border-slate-100 p-10 text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Let's get you to financial independence 🔥</h1>
        <p className="text-slate-500 text-sm mb-8 leading-relaxed">
          A Canadian optimized financial independence calculator. We'll build your
          financial picture in a few quick steps and figure out how quickly you can retire.
        </p>
        <div className="space-y-3">
          <button onClick={onNext} className={primaryBtn}>Let's go →</button>
          <button onClick={onSignIn} className={secondaryBtn}>I already have an account</button>
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
    <Card step={1} totalSteps={10} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">
          {name ? `Nice to meet you, ${name}!` : "Let's start with you."}
        </h2>
        <p className="text-sm text-slate-500 mt-1">Just a few basics to get started.</p>
      </div>
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
        <Field label={name ? `How old are you, ${name}?` : "Your current age"}>
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
      <div className="mt-6">
        <button onClick={onNext} className={primaryBtn}>Continue</button>
      </div>
    </Card>
  );
}

// ---------- Card 2: Household ----------
function CardHousehold({ data, onChange, onNext, onSkip, onBack }) {
  const name = data.yourName?.trim() || "you";
  const canExit = !!(data.yourName?.trim());
  const partnered = data.partnered === true;
  const hasKids = data.hasKids === true;
  const spouseName = data.spouseName?.trim();
  // partnerFillsOwn: true = they'll fill it out themselves, false/null = fill together now
  const partnerFillsOwn = data.partnerFillsOwn === true;

  return (
    <Card step={2} totalSteps={10} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Who are we planning for?</h2>
        <p className="text-sm text-slate-500 mt-1">
          {partnered
            ? `We'll make sure the plan fits both of your pictures.`
            : `We'll make sure the plan fits ${name}'s full picture.`}
        </p>
      </div>
      <div className="space-y-4">

        {/* Single vs partnered */}
        <Field label="Relationship status">
          <div className="grid grid-cols-2 gap-2">
            {[{ label: "Just me", value: false }, { label: "Me & a partner", value: true }].map(({ label, value }) => (
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

        {/* Partner details */}
        {partnered && (
          <>
            <Field label="Their name">
              <input
                type="text"
                className={inputCls}
                placeholder="e.g. Jamie"
                value={data.spouseName || ""}
                onChange={(e) => onChange("spouseName", e.target.value)}
              />
            </Field>
            <Field label={`${spouseName ? spouseName + "'s" : "Their"} current age`}>
              <input
                type="number"
                className={inputCls}
                placeholder="e.g. 33"
                min={18} max={80}
                value={data.spouseCurrentAge || ""}
                onChange={(e) => onChange("spouseCurrentAge", parseInt(e.target.value) || 0)}
              />
            </Field>

            {/* Who fills in their details? */}
            <Field
              label={`Will ${spouseName || "your partner"} fill in their own financial details?`}
            >
              <p className="text-xs text-slate-400 mb-2">Their income, savings, and pension — you can fill it in for them, or send them a link to do it themselves after you sign in.</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "I'll fill it in", value: false },
                  { label: "They'll do it", value: true },
                ].map(({ label, value }) => (
                  <button
                    key={label}
                    onClick={() => onChange("partnerFillsOwn", value)}
                    className={
                      "py-2.5 rounded-lg border text-sm font-medium transition-colors " +
                      (partnerFillsOwn === value
                        ? "border-slate-800 bg-slate-900 text-white"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>

            {/* If partner fills own — reassurance note */}
            {partnerFillsOwn && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <span className="font-semibold">Got it.</span> Once you sign in, you'll get a link to share with{" "}
                {spouseName || "your partner"} — they'll be able to join your household and add their details.
              </div>
            )}
          </>
        )}

        {/* Kids */}
        <Field label="Do you have children under 18?">
          <div className="grid grid-cols-2 gap-2">
            {[{ label: "Yes", value: true }, { label: "No", value: false }].map(({ label, value }) => (
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
      <div className="mt-6">
        <button onClick={onNext} className={primaryBtn}>Continue</button>
      </div>
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

  // Who this plan is for — shown prominently
  const planFor = partnered && spouseName
    ? `${name} & ${spouseName}`
    : partnered
      ? `${name} & your partner`
      : name;

  function setField(key, val) { onChange(key, val); }

  return (
    <Card step={3} totalSteps={10} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <div className="mb-6">
        {/* Who this is for */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex -space-x-1.5">
            {(partnered ? [name, spouseName || "?"] : [name]).map((n, i) => (
              <div
                key={i}
                className="w-7 h-7 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center ring-2 ring-white"
              >
                {(n || "?")[0].toUpperCase()}
              </div>
            ))}
          </div>
          <span className="text-sm font-medium text-slate-600">{planFor}</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900">
          What does retirement look like?
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Drag the sliders — we'll tailor the plan to your vision.
        </p>
      </div>

      <div className="space-y-7">
        {/* Slider 1: Retirement age */}
        <div>
          <div className="flex justify-between items-baseline mb-2">
            <span className="text-sm font-medium text-slate-700">When do you want to retire?</span>
            <span className="text-lg font-bold text-slate-900">Age {retAge}</span>
          </div>
          <input
            type="range" min={40} max={70} step={1}
            value={retAge}
            onChange={(e) => setField("visionRetirementAge", parseInt(e.target.value))}
            className="w-full accent-slate-800"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>As soon as possible</span>
            <span>Traditional (65+)</span>
          </div>
        </div>

        {/* Slider 2: Lifestyle — continuous */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-sm font-medium text-slate-700">What lifestyle do you want?</span>
            <span className="text-sm font-semibold text-slate-900">{lifestyleLabel(spend)}</span>
          </div>
          {/* Spend amount with explanation */}
          <p className="text-xs text-slate-500 mb-2">
            <span className="font-semibold text-slate-700">{fmtSpend(spend)}/yr</span>
            {" "}in today's dollars — what you'd spend each year in retirement
          </p>
          <input
            type="range" min={0} max={100} step={1}
            value={lifestyleVal}
            onChange={(e) => setField("visionLifestyleVal", parseInt(e.target.value))}
            className="w-full accent-slate-800"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>Lean & simple</span>
            <span>Luxurious</span>
          </div>
        </div>

        {/* Slider 3: Work */}
        <div>
          <div className="flex justify-between items-baseline mb-2">
            <span className="text-sm font-medium text-slate-700">Will you work in retirement?</span>
          </div>
          <input
            type="range" min={1} max={3} step={1}
            value={workLevel}
            onChange={(e) => setField("visionWorkLevel", parseInt(e.target.value))}
            className="w-full accent-slate-800"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>Fully retired</span>
            <span>Semi-retired</span>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            <span className="font-medium text-slate-700">{WORK_LABELS[workLevel - 1]}.</span>{" "}
            {WORK_HINTS[workLevel - 1]}
          </p>
        </div>
      </div>

      {/* FIRE type reveal */}
      <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
        <div className="text-2xl">{fire.emoji}</div>
        <div>
          <div className="text-xs text-slate-500 mb-0.5">Looks like you're aiming for</div>
          <div className="text-base font-bold text-slate-900">{fire.label}</div>
          <div className="text-xs text-slate-500 mt-0.5">{fire.desc}</div>
        </div>
      </div>

      <div className="mt-4">
        <button onClick={onNext} className={primaryBtn}>This feels right →</button>
      </div>
    </Card>
  );
}

// ---------- Card 4: Income ----------
// Small toggle for switching between % and $ input modes
function ModeToggle({ mode, onChange }) {
  return (
    <div className="flex rounded-md overflow-hidden border border-slate-200 w-fit">
      {["%", "$"].map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={"px-2.5 py-1 text-xs font-medium transition-colors " +
            (mode === m ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50")}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

// A comp row: yes/no toggle, then amount with % / $ switcher
function CompRow({ label, hint, hasKey, modeKey, pctKey, dollarKey, data, onChange, vestDateKey, vestDateLabel }) {
  const has     = data[hasKey]  === true;
  const mode    = data[modeKey] || "%";
  const pctVal  = data[pctKey]  || 0;
  const dollarVal = data[dollarKey] || 0;

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {[{ label: "Yes", value: true }, { label: "No", value: false }].map(({ label: l, value }) => (
          <button key={l} onClick={() => onChange(hasKey, value)}
            className={"py-2 rounded-lg border text-xs font-medium transition-colors " +
              (has === value ? "border-slate-800 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
            {l}
          </button>
        ))}
      </div>
      {has && (
        <div className="pt-1 space-y-2">
          <div className="flex items-center justify-between">
            <label className={labelCls + " mb-0"}>{hint}</label>
            <ModeToggle mode={mode} onChange={(m) => onChange(modeKey, m)} />
          </div>
          {mode === "%" ? (
            <PctInput value={pctVal} onChange={(v) => onChange(pctKey, v)} placeholder="e.g. 15" />
          ) : (
            <DollarInput value={dollarVal} onChange={(v) => onChange(dollarKey, v)} placeholder="e.g. 25,000" />
          )}
          {vestDateKey && (
            <Field label={vestDateLabel || "Vesting date / cliff"} hint="Optional — helps model timing">
              <input type="text" className={inputCls} placeholder="e.g. Jun 2026"
                value={data[vestDateKey] || ""}
                onChange={(e) => onChange(vestDateKey, e.target.value)} />
            </Field>
          )}
        </div>
      )}
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

  function PersonIncome({ prefix, personName }) {
    return (
      <div className="space-y-4">
        <Field label="Annual base salary">
          <DollarInput value={data[`${prefix}Base`]} onChange={(v) => onChange(`${prefix}Base`, v)} />
        </Field>

        <CompRow
          label={`Does ${personName} get a performance bonus?`}
          hint="Typical annual bonus"
          hasKey={`${prefix}HasBonus`} modeKey={`${prefix}BonusMode`}
          pctKey={`${prefix}BonusPct`} dollarKey={`${prefix}BonusDollar`}
          data={data} onChange={onChange}
        />

        <CompRow
          label="Any stock options or equity grants?"
          hint="Annual equity value vesting"
          hasKey={`${prefix}HasEquity`} modeKey={`${prefix}EquityMode`}
          pctKey={`${prefix}EquityPct`} dollarKey={`${prefix}EquityDollar`}
          data={data} onChange={onChange}
          vestDateKey={`${prefix}EquityVestDate`} vestDateLabel="Vesting date / cliff"
        />

        <CompRow
          label="What about RSUs?"
          hint="Annual RSU value vesting"
          hasKey={`${prefix}HasRsu`} modeKey={`${prefix}RsuMode`}
          pctKey={`${prefix}RsuPct`} dollarKey={`${prefix}RsuAnnual`}
          data={data} onChange={onChange}
          vestDateKey={`${prefix}RsuVestDate`} vestDateLabel="Next vesting date / cliff"
        />

        <CompRow
          label="Commission or variable pay?"
          hint="Typical annual commission"
          hasKey={`${prefix}HasCommission`} modeKey={`${prefix}CommissionMode`}
          pctKey={`${prefix}CommissionPct`} dollarKey={`${prefix}CommissionDollar`}
          data={data} onChange={onChange}
        />

        <CompRow
          label="Profit sharing or DPSP?"
          hint="Annual profit sharing amount"
          hasKey={`${prefix}HasProfitShare`} modeKey={`${prefix}ProfitShareMode`}
          pctKey={`${prefix}ProfitSharePct`} dollarKey={`${prefix}ProfitShareDollar`}
          data={data} onChange={onChange}
        />
      </div>
    );
  }

  return (
    <Card step={4} totalSteps={10} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">
          {showSpouse ? `${name} & ${spouseName}'s income` : `${name}'s income`}
        </h2>
        <p className="text-sm text-slate-500 mt-1">Start with base salary — we'll layer in the rest.</p>
      </div>

      <div className="space-y-5">
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{name}</div>
          <PersonIncome prefix="your" personName="you" />
        </div>

        {showSpouse && (
          <div className="border-t border-slate-100 pt-5">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{spouseName}</div>
            <PersonIncome prefix="spouse" personName={spouseName} />
          </div>
        )}
        {partnered && hideSpouse && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-500">
            {spouseName}'s income will be added when they join via the invite link.
          </div>
        )}

        {combined > 0 && (
          <div className="bg-slate-50 rounded-lg p-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">Estimated blended tax rate</span>
            <span className="text-xs font-semibold text-slate-700 bg-slate-200 px-2 py-0.5 rounded-full">
              ~{Math.round(estimatedRate * 100)}% <span className="font-normal text-slate-400">(auto)</span>
            </span>
          </div>
        )}
      </div>

      <div className="mt-6">
        <button onClick={onNext} className={primaryBtn}>Continue</button>
      </div>
    </Card>
  );
}

// ---------- Card 5: Retirement contributions (monthly + annual) ----------
function CardContributions({ data, onChange, onNext, onSkip, onBack, hideSpouse = false }) {
  const name = data.yourName?.trim() || "You";
  const spouseName = data.spouseName?.trim() || "Spouse";
  const canExit = !!(data.yourName?.trim());
  const partnered = data.partnered === true;
  const showSpouse = partnered && !hideSpouse;
  const hasKids = data.hasKids === true;

  function PersonContributions({ prefix, monthlyRrspKey, monthlyTfsaKey, monthlyNrKey, annualRrspKey, annualTfsaKey, annualNrKey }) {
    return (
      <div className="space-y-4">
        <div>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Monthly</div>
          <div className="space-y-2">
            <Field label="RRSP">
              <DollarInput value={data[monthlyRrspKey]} onChange={(v) => onChange(monthlyRrspKey, v)} placeholder="e.g. 2,000" />
            </Field>
            <Field label="TFSA">
              <DollarInput value={data[monthlyTfsaKey]} onChange={(v) => onChange(monthlyTfsaKey, v)} placeholder="e.g. 500" />
            </Field>
            <Field label="Non-registered" hint="Taxable brokerage, ETFs, etc.">
              <DollarInput value={data[monthlyNrKey]} onChange={(v) => onChange(monthlyNrKey, v)} placeholder="0" />
            </Field>
          </div>
        </div>
        <div className="border-t border-slate-100 pt-3">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Annual lump-sum top-ups</div>
          <div className="space-y-2">
            <Field label="RRSP" hint="e.g. year-end bonus contribution">
              <DollarInput value={data[annualRrspKey]} onChange={(v) => onChange(annualRrspKey, v)} placeholder="0" />
            </Field>
            <Field label="TFSA">
              <DollarInput value={data[annualTfsaKey]} onChange={(v) => onChange(annualTfsaKey, v)} placeholder="0" />
            </Field>
            <Field label="Non-registered">
              <DollarInput value={data[annualNrKey]} onChange={(v) => onChange(annualNrKey, v)} placeholder="0" />
            </Field>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card step={5} totalSteps={10} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Retirement saving</h2>
        <p className="text-sm text-slate-500 mt-1">
          {showSpouse
            ? `How much are ${name} and ${spouseName} putting toward retirement — both monthly and as lump sums?`
            : `How much are you putting toward retirement — both monthly and as annual lump sums?`}
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{name}</div>
          <PersonContributions
            prefix="your"
            monthlyRrspKey="startingMonthly" monthlyTfsaKey="yourTfsaMonthly" monthlyNrKey="yourNrMonthly"
            annualRrspKey="rrspTopUp" annualTfsaKey="tfsaTopUp" annualNrKey="nrTopUp"
          />
        </div>

        {showSpouse && (
          <div className="border-t border-slate-100 pt-5">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{spouseName}</div>
            <PersonContributions
              prefix="spouse"
              monthlyRrspKey="spouseMonthly" monthlyTfsaKey="spouseTfsaMonthly" monthlyNrKey="spouseNrMonthly"
              annualRrspKey="spouseRrspTopUp" annualTfsaKey="spouseTfsaTopUp" annualNrKey="spouseNrTopUp"
            />
          </div>
        )}

        {hasKids && (
          <div className="border-t border-slate-100 pt-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Children</div>
            <Field label="Annual RESP contributions" hint="Per year, across all children">
              <DollarInput value={data.resp} onChange={(v) => onChange("resp", v)} placeholder="e.g. 2,500" />
            </Field>
          </div>
        )}

        {partnered && hideSpouse && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-500">
            {spouseName}'s contributions will be added when they join via the invite link.
          </div>
        )}
      </div>

      <div className="mt-6">
        <button onClick={onNext} className={primaryBtn}>Continue</button>
      </div>
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
    <Card step={6} totalSteps={10} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">What's already saved?</h2>
        <p className="text-sm text-slate-500 mt-1">
          {showSpouse
            ? `Current balances across ${name} and ${spouseName}'s registered and non-registered accounts.`
            : `Current balances across ${name}'s registered and non-registered accounts.`}
        </p>
      </div>
      <div className="space-y-5">
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{name}</div>
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
        {showSpouse && (
          <div className="border-t border-slate-100 pt-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{spouseName}</div>
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
        {partnered && hideSpouse && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-500">
            {spouseName}'s savings will be added when they join via the invite link.
          </div>
        )}
      </div>
      <div className="mt-6">
        <button onClick={onNext} className={primaryBtn}>Continue</button>
      </div>
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
  const yourHasPension    = data.yourHasPension    === true;
  const spouseHasPension  = data.spouseHasPension  === true;

  return (
    <Card step={7} totalSteps={10} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Any defined-benefit pensions?</h2>
        <p className="text-sm text-slate-500 mt-1">
          A DB pension pays a guaranteed monthly amount in retirement — think government, teachers, or union plans.
        </p>
      </div>

      <div className="space-y-5">
        {/* Your pension */}
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{name}</div>
          <div>
            <p className="text-xs text-slate-500 mb-1.5">Do you have a defined-benefit pension?</p>
            <div className="grid grid-cols-2 gap-2">
              {[{ label: "Yes", value: true }, { label: "No", value: false }].map(({ label, value }) => (
                <button key={label} onClick={() => onChange("yourHasPension", value)}
                  className={"py-2.5 rounded-lg border text-sm font-medium transition-colors " +
                    (yourHasPension === value ? "border-slate-800 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {yourHasPension && (
            <div className="mt-3 space-y-3">
              <Field label="Expected monthly pension at retirement">
                <DollarInput value={data.pensionMonthly} onChange={(v) => onChange("pensionMonthly", v)} placeholder="e.g. 3,000" />
              </Field>
              <Field label="Pension start age" hint="Usually 60–65">
                <input type="number" className={inputCls} placeholder="65" min={50} max={75}
                  value={data.pensionStartAge || ""}
                  onChange={(e) => onChange("pensionStartAge", parseInt(e.target.value) || 0)} />
              </Field>
            </div>
          )}
        </div>

        {/* Spouse pension */}
        {showSpouse && (
          <div className="border-t border-slate-100 pt-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{spouseName}</div>
            <div>
              <p className="text-xs text-slate-500 mb-1.5">Does {spouseName} have a defined-benefit pension?</p>
              <div className="grid grid-cols-2 gap-2">
                {[{ label: "Yes", value: true }, { label: "No", value: false }].map(({ label, value }) => (
                  <button key={label} onClick={() => onChange("spouseHasPension", value)}
                    className={"py-2.5 rounded-lg border text-sm font-medium transition-colors " +
                      (spouseHasPension === value ? "border-slate-800 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {spouseHasPension && (
              <div className="mt-3 space-y-3">
                <Field label={`${spouseName}'s expected monthly pension`}>
                  <DollarInput value={data.spousePensionMonthly} onChange={(v) => onChange("spousePensionMonthly", v)} placeholder="e.g. 3,000" />
                </Field>
                <Field label="Pension start age" hint="Usually 60–65">
                  <input type="number" className={inputCls} placeholder="65" min={50} max={75}
                    value={data.spousePensionStartAge || ""}
                    onChange={(e) => onChange("spousePensionStartAge", parseInt(e.target.value) || 0)} />
                </Field>
              </div>
            )}
          </div>
        )}
        {partnered && hideSpouse && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-500">
            {spouseName}'s pension will be added when they join via the invite link.
          </div>
        )}
      </div>

      <div className="mt-6">
        <button onClick={onNext} className={primaryBtn}>Continue</button>
      </div>
    </Card>
  );
}

// ---------- Card 8: Home & housing costs ----------
function CardHome({ data, onChange, onNext, onSkip, onBack, hideSpouse = false }) {
  const name = data.yourName?.trim() || "You";
  const spouseName = data.spouseName?.trim() || "Spouse";
  const canExit = !!(data.yourName?.trim());
  const partnered = data.partnered === true;
  const showSpouse = partnered && !hideSpouse;
  const ownsHome = data.ownsHome === true;
  const rents    = data.ownsHome === false;

  return (
    <Card step={8} totalSteps={10} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Housing</h2>
        <p className="text-sm text-slate-500 mt-1">
          {showSpouse
            ? `Let's capture ${name} and ${spouseName}'s housing picture — mortgage, rent, and running costs.`
            : `Let's capture your housing picture — mortgage, rent, and running costs.`}
        </p>
      </div>

      <div className="space-y-4">
        {/* Own vs rent */}
        <Field label="Do you own or rent?">
          <div className="grid grid-cols-2 gap-2 mt-1">
            {[{ label: partnered ? "We own" : "I own", value: true }, { label: partnered ? "We rent" : "I rent", value: false }].map(({ label, value }) => (
              <button key={label} onClick={() => onChange("ownsHome", value)}
                className={"py-2.5 rounded-lg border text-sm font-medium transition-colors " +
                  (data.ownsHome === value ? "border-slate-800 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                {label}
              </button>
            ))}
          </div>
        </Field>

        {/* Owner fields */}
        {ownsHome && (
          <div className="space-y-3 pt-1">
            <Field label="Mortgage balance remaining">
              <DollarInput value={data.mortgagePrincipal} onChange={(v) => onChange("mortgagePrincipal", v)} />
            </Field>
            <Field label="Monthly mortgage payment">
              <DollarInput value={data.mortgage} onChange={(v) => onChange("mortgage", v)} />
            </Field>
            <Field label="Interest rate" hint="e.g. 3.85 for 3.85%">
              <PctInput value={data.mortgageRate} onChange={(v) => onChange("mortgageRate", v)} />
            </Field>
            <div className="pt-1 border-t border-slate-100">
              <p className="text-xs text-slate-400 mb-2 mt-2">Monthly housing costs (separate from mortgage)</p>
              <div className="space-y-2">
                <Field label="Property tax" hint="Per month">
                  <DollarInput value={data.propertyTax} onChange={(v) => onChange("propertyTax", v)} placeholder="e.g. 500" />
                </Field>
                <Field label="Home insurance" hint="Per month">
                  <DollarInput value={data.homeInsurance} onChange={(v) => onChange("homeInsurance", v)} placeholder="e.g. 150" />
                </Field>
                <Field label="Maintenance & repairs" hint="Per month — typically 1% of home value per year">
                  <DollarInput value={data.maintenance} onChange={(v) => onChange("maintenance", v)} placeholder="e.g. 400" />
                </Field>
                <Field label="Utilities (hydro, gas, water)" hint="Per month">
                  <DollarInput value={data.utilities} onChange={(v) => onChange("utilities", v)} placeholder="e.g. 300" />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* Renter fields */}
        {rents && (
          <div className="space-y-3 pt-1">
            <Field label="Monthly rent">
              <DollarInput value={data.rent} onChange={(v) => onChange("rent", v)} placeholder="e.g. 3,000" />
            </Field>
            <Field label="Utilities (hydro, gas, internet)" hint="Per month">
              <DollarInput value={data.utilities} onChange={(v) => onChange("utilities", v)} placeholder="e.g. 200" />
            </Field>
            <Field label="Tenant insurance" hint="Per month">
              <DollarInput value={data.homeInsurance} onChange={(v) => onChange("homeInsurance", v)} placeholder="e.g. 30" />
            </Field>
          </div>
        )}
      </div>

      <div className="mt-6">
        <button onClick={onNext} className={primaryBtn}>Continue</button>
      </div>
    </Card>
  );
}

// ---------- Card 9: Spending ----------
function CardSpending({ data, onChange, onNext, onSkip, onBack, hideSpouse = false }) {
  const name = data.yourName?.trim() || "You";
  const spouseName = data.spouseName?.trim() || "Spouse";
  const canExit = !!(data.yourName?.trim());
  const partnered = data.partnered === true;
  const showSpouse = partnered && !hideSpouse;
  const hasKids = data.hasKids === true;

  // Non-discretionary monthly (excluding housing which was card 8)
  const nonDiscMonthly = [
    { key: "groceries",    label: "Groceries" },
    { key: "transport",    label: "Transport & transit" },
    { key: "childcare",    label: "Childcare", kidsOnly: true },
    { key: "personalCare", label: "Personal care & health" },
  ].filter((c) => !c.kidsOnly || hasKids);

  // Discretionary monthly
  const discMonthly = [
    { key: "dining",         label: "Dining & takeout" },
    { key: "clothing",       label: "Clothing & shopping" },
    { key: "subscriptions",  label: "Subscriptions & tech" },
    { key: "entertainment",  label: "Entertainment & hobbies" },
  ];

  const totalMonthly = [...nonDiscMonthly, ...discMonthly].reduce((s, c) => s + (data[c.key] || 0), 0);

  return (
    <Card step={9} totalSteps={10} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">
          {showSpouse ? `How do ${name} & ${spouseName} spend today?` : `How does ${name} spend today?`}
        </h2>
        <p className="text-sm text-slate-500 mt-1">Monthly figures in today's dollars — housing excluded (already captured).</p>
      </div>

      <div className="space-y-5">
        {/* Non-discretionary */}
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Essentials (monthly)</div>
          <div className="space-y-3">
            {nonDiscMonthly.map((c) => (
              <Field key={c.key} label={c.label}>
                <DollarInput value={data[c.key]} onChange={(v) => onChange(c.key, v)} placeholder="0" />
              </Field>
            ))}
          </div>
        </div>

        {/* Discretionary */}
        <div className="border-t border-slate-100 pt-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Lifestyle (monthly)</div>
          <div className="space-y-3">
            {discMonthly.map((c) => (
              <Field key={c.key} label={c.label}>
                <DollarInput value={data[c.key]} onChange={(v) => onChange(c.key, v)} placeholder="0" />
              </Field>
            ))}
          </div>
        </div>

        {/* Running total */}
        {totalMonthly > 0 && (
          <div className="bg-slate-50 rounded-lg p-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">Monthly total (ex. housing)</span>
            <span className="text-xs font-semibold text-slate-700">${totalMonthly.toLocaleString()}/mo</span>
          </div>
        )}

        {/* Annual */}
        <div className="border-t border-slate-100 pt-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Annual commitments</div>
          <div className="space-y-3">
            <Field label="Travel & holidays" hint="Annual budget">
              <DollarInput value={data.travel} onChange={(v) => onChange("travel", v)} placeholder="e.g. 10,000" />
            </Field>
            <Field label="Other annual expenses" hint="Insurance premiums, gifts, subscriptions billed annually, etc.">
              <DollarInput value={data.otherAnnual} onChange={(v) => onChange("otherAnnual", v)} placeholder="0" />
            </Field>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <button onClick={onNext} className={primaryBtn}>Continue</button>
      </div>
    </Card>
  );
}

// ---------- Card 10: Retirement income ----------
function CardRetirement({ data, onChange, onNext, onSkip, onBack, hideSpouse = false }) {
  const name = data.yourName?.trim() || "You";
  const spouseName = data.spouseName?.trim() || "Spouse";
  const canExit = !!(data.yourName?.trim());
  const partnered = data.partnered === true;
  const showSpouse = partnered && !hideSpouse;

  return (
    <Card step={10} totalSteps={10} onSkip={onSkip} canExit={canExit} onExit={onSkip} onBack={onBack}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Almost there!</h2>
        <p className="text-sm text-slate-500 mt-1">
          {showSpouse
            ? `Last thing — ${name} and ${spouseName}'s CPP estimates. We've pre-filled the Canadian average.`
            : `Last thing — ${name}'s CPP estimate. We've pre-filled the Canadian average.`}
        </p>
      </div>
      <div className="space-y-4">
        <Field label={`${name}'s estimated CPP (annual)`} hint="Adjust if you have a My Service Canada estimate">
          <DollarInput value={data.cppAmountToday ?? 9300} onChange={(v) => onChange("cppAmountToday", v)} placeholder="9300" />
        </Field>
        {showSpouse && (
          <Field label={`${spouseName}'s estimated CPP (annual)`}>
            <DollarInput value={data.spouseCppAmountToday ?? 9300} onChange={(v) => onChange("spouseCppAmountToday", v)} placeholder="9300" />
          </Field>
        )}
        {partnered && !showSpouse && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-500">
            {spouseName}'s CPP will be added when they join via the invite link.
          </div>
        )}
      </div>
      <div className="mt-6">
        <button onClick={onNext} className={primaryBtn}>Build my plan →</button>
      </div>
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
    spouseBonusPct:   partnered ? resolveCompPct(spouseBase, d.spouseHasBonus, d.spouseHasBonus, d.spouseBonusPct, d.spouseBonusDollar) : 0,
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
    oneTimeMisc:       baseDefaults.oneTimeMisc || 0,
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
  if (step === 9)  return <CardSpending      data={data} onChange={update} onNext={next} onSkip={skip} onBack={back} hideSpouse={partnerFillsOwn} />;
  if (step === 10) return <CardRetirement    data={data} onChange={update} onNext={skip} onSkip={skip} onBack={back} hideSpouse={partnerFillsOwn} />;
  return null;
}
