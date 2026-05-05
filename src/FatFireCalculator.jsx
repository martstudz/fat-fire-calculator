import { useState, useMemo, useRef, useEffect, createContext, useContext, useCallback } from "react";
import { fmt$ } from "./utils";
import {
  simulate,
  solveEarliestAge,
  runMonteCarlo,
  solvePortfolioForSuccessRate,
  solveScenarios,
  solveWindfall,
  monthsToPayoff,
  payoffAgeFromMonths,
} from "./engine";
import Onboarding, { onboardingToState } from "./Onboarding";
import Dashboard from "./Dashboard";
import PlanEditor from "./PlanEditor";
import Settings from "./Settings";

// Supabase client — falls back to a no-op stub if not configured (e.g. running as artifact)
let supabase;
try {
  supabase = require("./supabaseClient").supabase;
} catch {
  const noop = () => Promise.resolve({ data: null, error: null });
  const noopChain = () => ({ select: noopChain, eq: noopChain, single: noop, insert: noop, update: noopChain, upsert: noop, delete: noopChain });
  supabase = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithOAuth: noop, signOut: noop,
      getUser: () => Promise.resolve({ data: { user: null } }),
    },
    from: () => noopChain(),
  };
}

// ---------- privacy context ----------
export const PrivacyContext = createContext(false);
const MASK = "••••••";


// ---------- defaults ----------
// publicDefaults: blank slate for guests — no personal numbers
const publicDefaults = {
  // Household flags (set by onboarding)
  partnered: true, hasKids: false, province: "ON", onboardingComplete: false,
  // Names
  yourName: "", spouseName: "",
  // Personal
  currentAge: 0, spouseCurrentAge: 0, deathAge: 90,
  // Income & tax
  yourBase: 0, spouseBase: 0,
  yourBonusPct: 0, spouseBonusPct: 0,
  yourEquityPct: 0, spouseEquityPct: 0,
  taxRate: 0, incomeGrowth: 0.03,
  // Expenses: monthly
  mortgage: 0, maintenance: 0, propertyTax: 0,
  utilities: 0, transport: 0, groceries: 0,
  dining: 0, clothing: 0, travel: 0,
  childcare: 0, subscriptions: 0, personalCare: 0,
  // Mortgage amortization
  mortgagePrincipal: 0, mortgageRate: 0,
  // Account balances — per person
  yourRrspStart: 0, spouseRrspStart: 0,
  yourTfsaStart: 0, spouseTfsaStart: 0,
  yourNrStart: 0, spouseNrStart: 0,
  // Contributions — per person per account
  startingMonthly: 0, yourTfsaMonthly: 0, yourNrMonthly: 0,
  spouseMonthly: 0, spouseTfsaMonthly: 0, spouseNrMonthly: 0,
  contribGrowth: 0,
  // Windfalls
  yourWindfallAge: 0, yourWindfallAmount: 0,
  spouseWindfallAge: 0, spouseWindfallAmount: 0,
  // Retirement spending (0 = same as current spend)
  retirementSpendOverride: 0,
  // Terminal target
  terminalTargetToday: 0,
  // Market assumptions
  investmentReturn: 0.07, inflation: 0.03,
  // Retirement income / taxes
  cppAmountToday: 0, cppStartAge: 65,
  oasAmountToday: 0, oasStartAge: 65,
  oasClawbackThreshold: 95323,
  rrspTaxRate: 0.30, nrCapGainsRate: 0.17,
  retirementIncomeTaxRate: 0.22,
};

// defaults: your personal numbers — only loaded from Supabase when signed in
const defaults = {
  // Household flags
  partnered: true, hasKids: false, province: "ON", onboardingComplete: true,
  // Names
  yourName: "Martin", spouseName: "Jessica",
  // Personal
  currentAge: 40, spouseCurrentAge: 39, deathAge: 90,
  // Income & tax
  yourBase: 220000, spouseBase: 177000,
  yourBonusPct: 0.2, spouseBonusPct: 0.17,
  yourEquityPct: 0, spouseEquityPct: 0,
  taxRate: 0.43, incomeGrowth: 0.05,
  // Expenses: monthly
  mortgage: 4350, maintenance: 1000, propertyTax: 500,
  utilities: 400, transport: 350, groceries: 1500,
  dining: 1500, clothing: 400, travel: 500,
  childcare: 0, subscriptions: 300, personalCare: 400,
  // Mortgage amortization
  mortgagePrincipal: 872000, mortgageRate: 0.0385,
  // Account balances — per person
  yourRrspStart: 220000, spouseRrspStart: 344000,
  yourTfsaStart: 109000, spouseTfsaStart: 139000,
  yourNrStart: 5000, spouseNrStart: 0,
  // Contributions — per person per account
  startingMonthly: 3000, yourTfsaMonthly: 1000, yourNrMonthly: 0,
  spouseMonthly: 2000, spouseTfsaMonthly: 1000, spouseNrMonthly: 0,
  contribGrowth: 0.05,
  // Windfalls
  yourWindfallAge: 50, yourWindfallAmount: 0,
  spouseWindfallAge: 50, spouseWindfallAmount: 0,
  // Retirement spending (0 = same as current spend)
  retirementSpendOverride: 0,
  // Terminal target
  terminalTargetToday: 250000,
  // Market assumptions
  investmentReturn: 0.07, inflation: 0.03,
  // Retirement income / taxes
  cppAmountToday: 18600, cppStartAge: 70,
  oasAmountToday: 8500, oasStartAge: 70,
  oasClawbackThreshold: 95323,
  rrspTaxRate: 0.37, nrCapGainsRate: 0.21,
  retirementIncomeTaxRate: 0.25,
};

// Canadian combined (federal + provincial) marginal tax rate on employment income.
// Uses the top bracket each person's income falls into — a reasonable blended approximation.
function canadianMarginalRate(income, province = "ON") {
  if (income <= 0) return 0;
  // Federal 2024 brackets
  const fed =
    income > 246752 ? 0.33 :
    income > 165430 ? 0.29 :
    income > 111733 ? 0.26 :
    income > 55867  ? 0.205 : 0.15;
  // Provincial surtax (approximate top marginal, simplified)
  const prov = {
    AB: income > 355845 ? 0.15 : income > 250000 ? 0.135 : income > 150000 ? 0.12 : income > 131220 ? 0.10 : 0.10,
    BC: income > 252752 ? 0.205 : income > 240716 ? 0.205 : income > 110000 ? 0.1670 : income > 100392 ? 0.1650 : 0.1270,
    ON: income > 220000 ? 0.1316 : income > 150000 ? 0.1316 : income > 102135 ? 0.1116 : income > 51446 ? 0.0915 : 0.0505,
    QC: income > 119910 ? 0.2575 : income > 51780 ? 0.20  : 0.14,
    AB_surtax: 0,
    MB: income > 100000 ? 0.174 : income > 36842 ? 0.1275 : 0.108,
    SK: income > 142058 ? 0.145 : income > 49720 ? 0.125 : 0.105,
    NS: income > 150000 ? 0.21  : income > 93000 ? 0.1900 : income > 29590 ? 0.1495 : 0.0879,
    NB: income > 185064 ? 0.195 : income > 176756 ? 0.195 : income > 44887  ? 0.1482 : 0.094,
    PE: income > 105000 ? 0.167 : income > 32656  ? 0.1370 : 0.095,
    NL: income > 1000000? 0.215 : income > 250000 ? 0.215  : income > 135973 ? 0.158 : 0.087,
    YT: income > 500000 ? 0.15  : income > 150000 ? 0.15   : income > 102135 ? 0.12 : 0.064,
    NT: income > 157139 ? 0.1405: income > 112291 ? 0.14   : income > 61353  ? 0.12 : 0.059,
    NU: income > 173205 ? 0.115 : income > 100000 ? 0.11   : income > 53268  ? 0.09 : 0.04,
  }[province] ?? 0.1316;
  return Math.min(0.54, fed + prov);
}

// Effective (blended) household tax rate: weighted average of each person's marginal rate.
function householdBlendedRate(yourBase, spouseBase, yourBonusPct, spouseBonusPct, partnered, province) {
  const yourIncome  = yourBase  * (1 + (yourBonusPct  || 0));
  const spouseIncome = partnered ? spouseBase * (1 + (spouseBonusPct || 0)) : 0;
  const total = yourIncome + spouseIncome;
  if (total <= 0) return 0;
  const yourRate   = canadianMarginalRate(yourIncome,   province);
  const spouseRate = partnered ? canadianMarginalRate(spouseIncome, province) : 0;
  return (yourRate * yourIncome + spouseRate * spouseIncome) / total;
}

function buildInputs(s) {
  // Resolve per-person CPP to combined figure the engine expects
  const cppAmountToday = s.yourCppAmount != null && s.spouseCppAmount != null
    ? (s.yourCppAmount || 0) + (s.partnered !== false ? (s.spouseCppAmount || 0) : 0)
    : (s.cppAmountToday || 0);

  // Blended tax rate: derive from Canadian brackets if not manually set
  const taxRate = (s.taxRate && s.taxRate > 0)
    ? s.taxRate
    : householdBlendedRate(
        s.yourBase || 0, s.spouseBase || 0,
        s.yourBonusPct || 0, s.spouseBonusPct || 0,
        s.partnered !== false, s.province || "ON"
      );

  const monthlyExpensesTotal =
      (s.mortgage || 0) + (s.rent || 0) + (s.maintenance || 0) + (s.propertyTax || 0) +
      (s.utilities || 0) + (s.homeInsurance || 0) +
      (s.transport || 0) + (s.groceries || 0) + (s.dining || 0) + (s.clothing || 0) +
      (s.travel || 0) + (s.entertainment || 0) + (s.childcare || 0) + (s.subscriptions || 0) + (s.personalCare || 0) +
      (s.carPayment || 0) + (s.carGas || 0) + (s.carInsurance || 0) + (s.carParking || 0);

  // Retirement spend: default to current spend if not explicitly overridden
  const retirementSpendOverride = (s.retirementSpendOverride && s.retirementSpendOverride > 0)
    ? s.retirementSpendOverride
    : monthlyExpensesTotal * 12;

  return {
    ...s,
    taxRate,
    retirementSpendOverride,
    cppAmountToday,
    monthlyExpensesTotal,
    investmentReturn:          s.investmentReturn          ?? 0.07,
    inflation:                 s.inflation                 ?? 0.03,
    rrspTaxRate:               s.rrspTaxRate               ?? 0.30,
    nrCapGainsRate:            s.nrCapGainsRate            ?? 0.17,
    retirementIncomeTaxRate:   s.retirementIncomeTaxRate   ?? 0.22,
    mortgagePayment: s.mortgage || 0,
    // Combine per-person balances for the engine
    rrspStart: (s.yourRrspStart || 0) + (s.spouseRrspStart || 0),
    tfsaStart: (s.yourTfsaStart || 0) + (s.spouseTfsaStart || 0),
    nrStart:   (s.yourNrStart   || 0) + (s.spouseNrStart   || 0),
    // Total household monthly contributions (all account types, both persons)
    startingMonthly: (s.startingMonthly || 0)
      + (s.yourTfsaMonthly || 0) + (s.yourNrMonthly || 0)
      + (s.spouseMonthly || 0) + (s.spouseTfsaMonthly || 0) + (s.spouseNrMonthly || 0),
  };
}

// ---------- small input components ----------
function formatWithCommas(num) {
  if (num === null || num === undefined || num === "") return "";
  const n = Number(num);
  if (!isFinite(n)) return String(num);
  // Preserve decimals if present
  const parts = n.toString().split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

function NumInput({ label, value, onChange, step = 1, prefix, suffix, small, hint }) {
  const hidden = useContext(PrivacyContext);
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(String(value));
  const inputRef = useRef(null);

  // Sync raw when external value changes (e.g. reset) but only when not focused
  useEffect(() => {
    if (!focused) setRaw(String(value));
  }, [value, focused]);

  const displayValue = hidden && !focused ? MASK : focused ? raw : formatWithCommas(value);

  function handleFocus() {
    setRaw(value === 0 ? "" : String(value));
    setFocused(true);
  }

  function handleChange(e) {
    // Allow digits, minus, dot only
    const cleaned = e.target.value.replace(/[^0-9.\-]/g, "");
    setRaw(cleaned);
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed)) onChange(parsed);
  }

  function handleBlur() {
    setFocused(false);
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      onChange(parsed);
      setRaw(String(parsed));
    } else {
      setRaw(String(value));
    }
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = (parseFloat(raw) || 0) + step;
      onChange(next);
      setRaw(String(next));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = (parseFloat(raw) || 0) - step;
      onChange(next);
      setRaw(String(next));
    }
  }

  return (
    <div className="inp-row">
      <span style={{ flex: 1, color: "var(--ink-2)" }}>
        {label}
        {hint && <span className="inp-suffix" style={{ marginLeft: 4 }}>{hint}</span>}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {prefix && <span className="inp-prefix">{prefix}</span>}
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onFocus={handleFocus}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={small ? "--sm" : ""}
        />
        {suffix && <span className="inp-suffix">{suffix}</span>}
      </div>
    </div>
  );
}

function PctInput({ label, value, onChange, hint }) {
  const pct = Number((value * 100).toFixed(3));
  return (
    <NumInput
      label={label}
      value={pct}
      onChange={(v) => onChange(v / 100)}
      step={0.1}
      suffix="%"
      small
      hint={hint}
    />
  );
}

function ExpenseRow({ label, value, onChange, freq, step = 50 }) {
  const hidden = useContext(PrivacyContext);
  const annualized = freq === "monthly" ? value * 12 : value;
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(String(value));

  useEffect(() => {
    if (!focused) setRaw(String(value));
  }, [value, focused]);

  const displayValue = hidden && !focused ? MASK : focused ? raw : formatWithCommas(value);

  function handleFocus() { setRaw(value === 0 ? "" : String(value)); setFocused(true); }
  function handleChange(e) {
    const cleaned = e.target.value.replace(/[^0-9.\-]/g, "");
    setRaw(cleaned);
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed)) onChange(parsed);
  }
  function handleBlur() {
    setFocused(false);
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) { onChange(parsed); setRaw(String(parsed)); }
    else setRaw(String(value));
  }
  function handleKeyDown(e) {
    if (e.key === "ArrowUp") { e.preventDefault(); const n = (parseFloat(raw)||0)+step; onChange(n); setRaw(String(n)); }
    else if (e.key === "ArrowDown") { e.preventDefault(); const n = (parseFloat(raw)||0)-step; onChange(n); setRaw(String(n)); }
  }

  return (
    <div className="inp-row">
      <span style={{ flex: 1, color: "var(--ink-2)" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span className="inp-prefix">$</span>
        <input
          type="text"
          inputMode="numeric"
          value={displayValue}
          onFocus={handleFocus}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="--sm"
        />
        <span className="inp-suffix" style={{ minWidth: 24 }}>{freq === "monthly" ? "/mo" : "/yr"}</span>
        {freq === "monthly" && (
          <span className="mono inp-suffix" style={{ minWidth: 72, textAlign: "right" }}>
            {hidden ? MASK : fmt$(annualized)}/yr
          </span>
        )}
      </div>
    </div>
  );
}

function Section({ title, children, defaultOpen = true }) {
  return (
    <details open={defaultOpen} className="inp-section">
      <summary>{title}</summary>
      <div className="inp-section__body">
        {children}
      </div>
    </details>
  );
}

function InfoBox({ children }) {
  return (
    <div className="info-box" style={{ marginTop: 6 }}>
      {children}
    </div>
  );
}

// ---------- main ----------
const STORAGE_KEY = "fatfire_inputs_v2";
const ONBOARDING_KEY = "fatfire_onboarding_done";

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    // Merge with defaults so new fields always have a value
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

function saveToStorage(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable (e.g. private browsing) — fail silently
  }
}

// Returns the raw browser-saved inputs if they contain any real (non-zero) data,
// otherwise null. Used to detect whether an unauthenticated user made real edits.
function getBrowserInputsIfReal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Check if any numeric field is non-zero (i.e. user actually typed something)
    const hasAnyValue = Object.values(parsed).some(
      v => typeof v === "number" && v !== 0
    );
    return hasAnyValue ? parsed : null;
  } catch {
    return null;
  }
}

export default function FatFireCalculator() {
  const [s, setS] = useState(loadSaved);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("saved"); // "saved" | "saving" | "error"
  const [household, setHousehold] = useState(null); // { id, join_code, created_by }
  const [householdMembers, setHouseholdMembers] = useState([]); // [{ user_id, email, avatar_url, name }]
  const [showHouseholdPanel, setShowHouseholdPanel] = useState(false);
  const [joinInput, setJoinInput] = useState("");
  const [joinError, setJoinError] = useState("");
  const [showJoinBox, setShowJoinBox] = useState(false);
  const [copied, setCopied] = useState(false);
  const householdPanelRef = useRef(null);
  const saveTimerRef = useRef(null);

  // ── Two-plan state ────────────────────────────────────────────────────────
  // activePlan: "personal" | "household" | null (null = not yet determined)
  const [activePlan, setActivePlan] = useState(null);
  const [personalPlanId, setPersonalPlanId] = useState(null);
  const [showPlanPicker, setShowPlanPicker] = useState(false);

  // ── Merge conflict: browser inputs vs cloud ───────────────────────────────
  // When both exist, we pause and ask the user which to keep.
  // { cloudInputs, planType: "personal"|"household" }
  const [mergeConflict, setMergeConflict] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // ── Onboarding ────────────────────────────────────────────────────────────
  // Show onboarding if:
  //   - not signed in AND localStorage has no onboarding flag
  //   - OR signed in but plan has onboardingComplete !== true
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem(ONBOARDING_KEY)
  );

  // ── Page routing ──────────────────────────────────────────────────────────
  // "dashboard" | "editor" | "settings"
  const [page, setPage] = useState(() => {
    const saved = localStorage.getItem("trailhead_page");
    return ["dashboard", "editor", "settings"].includes(saved) ? saved : "dashboard";
  });
  const [pageKey, setPageKey] = useState(0);
  const [pageAnimClass, setPageAnimClass] = useState("page-enter");

  function navigateTo(newPage) {
    setPage(newPage);
    setPageKey(k => k + 1);
    setPageAnimClass("page-enter");
    localStorage.setItem("trailhead_page", newPage);
  }

  // ── Check URL for ?join=CODE on load ──────────────────────────────────────
  const pendingJoinCode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("join") || null;
  }, []);

  // ── Auth: listen for session changes ──────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (session?.user) initPlans(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUser = session?.user ?? null;
      setUser(newUser);
      if (newUser) initPlans(newUser.id);
    });
    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Plans init: load personal plan + check household membership ───────────
  // Returns true if a plan inputs object has meaningful saved data
  function hasRealData(inputs) {
    return inputs && Object.keys(inputs).length > 0;
  }

  // Load cloud inputs — but if the browser also has real data, pause and ask.
  // planType tells the conflict UI which plan this is ("personal" or "household").
  function loadCloudInputs(cloudInputs, planType) {
    const browserInputs = getBrowserInputsIfReal();
    const cloudHasData = hasRealData(cloudInputs);

    if (browserInputs && cloudHasData) {
      // Both have data — ask the user
      setMergeConflict({ cloudInputs, planType });
    } else if (browserInputs && !cloudHasData) {
      // Cloud is empty, browser has data — silently keep browser inputs
      // (they'll get saved to cloud on next autosave)
    } else {
      // Browser empty or cloud wins — load cloud
      setS({ ...publicDefaults, ...(cloudInputs || {}) });
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  async function initPlans(userId) {
    // 1. Check if user belongs to a household
    const { data: membership } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .single();

    const hasHousehold = !!membership?.household_id;

    // 2. Handle pending join code (only if not already in a household)
    if (!hasHousehold && pendingJoinCode) {
      // Load personal plan first so we know if picker is needed after joining
      const { data: existingPersonal } = await supabase
        .from("personal_plans")
        .select("id, inputs")
        .eq("user_id", userId)
        .single();
      if (existingPersonal) setPersonalPlanId(existingPersonal.id);

      await joinHouseholdByCode(userId, pendingJoinCode, existingPersonal);
      return;
    }

    if (hasHousehold) {
      // Load household
      await loadHousehold(membership.household_id);

      // Check if user also has a personal plan with real data
      const { data: existingPersonal } = await supabase
        .from("personal_plans")
        .select("id, inputs")
        .eq("user_id", userId)
        .single();

      if (existingPersonal && hasRealData(existingPersonal.inputs)) {
        // User has both — show picker
        setPersonalPlanId(existingPersonal.id);
        setShowPlanPicker(true);
      } else {
        // No meaningful personal plan — go straight to household
        if (existingPersonal) setPersonalPlanId(existingPersonal.id);
        await switchPlanData("household");
      }
    } else {
      // No household — load or create personal plan
      const { data: existingPersonal } = await supabase
        .from("personal_plans")
        .select("id, inputs")
        .eq("user_id", userId)
        .single();

      if (existingPersonal) {
        setPersonalPlanId(existingPersonal.id);
        if (hasRealData(existingPersonal.inputs)) {
          loadCloudInputs(existingPersonal.inputs, "personal");
        }
        // If cloud is empty, browser inputs (already in state from loadSaved) win silently
      } else {
        // Brand new user — create personal plan
        // If browser has real data, use that as the seed; otherwise use defaults
        const browserInputs = getBrowserInputsIfReal();
        const seed = browserInputs ? { ...defaults, ...browserInputs } : defaults;
        const { data: newPlan } = await supabase
          .from("personal_plans")
          .insert({ user_id: userId, inputs: seed })
          .select("id")
          .single();
        if (newPlan) setPersonalPlanId(newPlan.id);
        if (browserInputs) {
          setS({ ...publicDefaults, ...seed });
        } else {
          setS(defaults);
        }
        localStorage.removeItem(STORAGE_KEY);
      }
      setActivePlan("personal");
    }
  }

  async function loadHousehold(householdId) {
    const { data, error } = await supabase
      .from("households")
      .select("id, join_code, inputs, created_by")
      .eq("id", householdId)
      .single();
    if (!error && data) {
      setHousehold({ id: data.id, join_code: data.join_code, created_by: data.created_by });
      // Don't set S here — let the plan picker / switchPlan handle it
      fetchMembers(householdId);
      return data;
    }
    return null;
  }

  // Internal: load the data for a plan without touching picker state.
  // checkConflict=true on initial sign-in load; false when user manually switches tabs.
  // Takes an optional householdOverride for cases where household state isn't set yet.
  async function switchPlanData(plan, householdOverride, checkConflict = true) {
    setActivePlan(plan);
    const hh = householdOverride || household;
    if (plan === "household" && hh) {
      const { data } = await supabase
        .from("households")
        .select("inputs")
        .eq("id", hh.id)
        .single();
      const cloudInputs = data?.inputs || {};
      if (checkConflict) {
        loadCloudInputs(cloudInputs, "household");
      } else {
        setS(hasRealData(cloudInputs) ? { ...publicDefaults, ...cloudInputs } : defaults);
      }
    } else if (plan === "personal" && personalPlanId) {
      const { data } = await supabase
        .from("personal_plans")
        .select("inputs")
        .eq("id", personalPlanId)
        .single();
      const cloudInputs = data?.inputs || {};
      if (checkConflict) {
        loadCloudInputs(cloudInputs, "personal");
      } else {
        setS(hasRealData(cloudInputs) ? { ...publicDefaults, ...cloudInputs } : defaults);
      }
    }
  }

  // User-facing: called from tab toggle or plan picker (no conflict check — always load cloud)
  async function switchPlan(plan) {
    setShowPlanPicker(false);
    await switchPlanData(plan, null, false);
  }

  async function fetchMembers(householdId) {
    const { data } = await supabase
      .from("household_members")
      .select("user_id, email, name, avatar_url")
      .eq("household_id", householdId);
    if (data) setHouseholdMembers(data);
  }

  async function removeMember(userId) {
    if (!household) return;
    // Owner cannot be removed
    if (userId === household.created_by) return;
    // Only the owner or the member themselves can remove
    const isOwner = user?.id === household.created_by;
    const isSelf = user?.id === userId;
    if (!isOwner && !isSelf) return;
    const msg = isSelf
      ? "Leave this household? You'll lose access to the shared data."
      : "Remove this member from the household?";
    if (!window.confirm(msg)) return;
    await supabase
      .from("household_members")
      .delete()
      .eq("user_id", userId)
      .eq("household_id", household.id);
    setHouseholdMembers(prev => prev.filter(m => m.user_id !== userId));
    if (isSelf) {
      setHousehold(null);
      setHouseholdMembers([]);
      // Switch back to personal plan
      await switchPlanData("personal");
    }
  }

  // Convert personal plan into a household. Seeded with current inputs (s).
  // Called when user clicks "Add to household" for the first time.
  async function createHousehold(userId, currentInputs) {
    const { data: sessionData } = await supabase.auth.getUser();
    const meta = sessionData?.user?.user_metadata || {};
    const { data, error } = await supabase
      .from("households")
      .insert({ created_by: userId, inputs: currentInputs })
      .select("id, join_code")
      .single();
    if (!error && data) {
      const hhObj = { id: data.id, join_code: data.join_code, created_by: userId };
      setHousehold(hhObj);
      await supabase.from("household_members").insert({
        user_id: userId,
        household_id: data.id,
        email: sessionData?.user?.email || "",
        name: meta.full_name || meta.name || "",
        avatar_url: meta.avatar_url || "",
      });
      await fetchMembers(data.id);
      // Switch to household plan (personal plan becomes dormant)
      setActivePlan("household");
      // Copy the share URL to clipboard immediately
      const url = `${window.location.origin}${window.location.pathname}?join=${data.join_code}`;
      navigator.clipboard.writeText(url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // existingPersonal: the personal_plans row (if any) — passed in from initPlans or fetched here
  async function joinHouseholdByCode(userId, code, existingPersonal) {
    const { data: hh } = await supabase
      .from("households")
      .select("id, join_code, inputs, created_by")
      .eq("join_code", code.toUpperCase())
      .single();
    if (!hh) { setJoinError("Code not found — double-check and try again."); return false; }
    const { data: sessionData } = await supabase.auth.getUser();
    const meta = sessionData?.user?.user_metadata || {};
    await supabase.from("household_members").insert({
      user_id: userId,
      household_id: hh.id,
      email: sessionData?.user?.email || "",
      name: meta.full_name || meta.name || "",
      avatar_url: meta.avatar_url || "",
    });
    const hhObj = { id: hh.id, join_code: hh.join_code, created_by: hh.created_by };
    setHousehold(hhObj);
    await fetchMembers(hh.id);
    window.history.replaceState({}, "", window.location.pathname);
    setShowJoinBox(false);

    // If the joining user already has a personal plan with real data, let them choose
    // Otherwise go straight to the household plan (still checking for browser conflict)
    if (existingPersonal && hasRealData(existingPersonal.inputs)) {
      setShowPlanPicker(true);
    } else {
      setActivePlan("household");
      loadCloudInputs(hh.inputs || {}, "household");
    }
    return true;
  }

  async function handleJoinSubmit() {
    if (!user) { signInWithGoogle(); return; }
    setJoinError("");
    const { data: existingPersonal } = await supabase
      .from("personal_plans")
      .select("id, inputs")
      .eq("user_id", user.id)
      .single();
    if (existingPersonal) setPersonalPlanId(existingPersonal.id);
    await joinHouseholdByCode(user.id, joinInput.trim(), existingPersonal);
  }

  const shareUrl = household
    ? `${window.location.origin}${window.location.pathname}?join=${household.join_code}`
    : null;

  function copyShareUrl() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const saveToCloud = useCallback(async (state, plan, householdId, planId) => {
    setSaveStatus("saving");
    let error = null;
    if (plan === "household" && householdId) {
      ({ error } = await supabase
        .from("households")
        .update({ inputs: state, updated_at: new Date().toISOString() })
        .eq("id", householdId));
    } else if (plan === "personal" && planId) {
      ({ error } = await supabase
        .from("personal_plans")
        .update({ inputs: state, updated_at: new Date().toISOString() })
        .eq("id", planId));
    }
    setSaveStatus(error ? "error" : "saved");
  }, []);

  function handleOnboardingComplete(computedState) {
    setS(computedState);
    localStorage.setItem(ONBOARDING_KEY, "1");
    setShowOnboarding(false);
    setPage("dashboard");
    setPageKey(k => k + 1);
    setPageAnimClass("page-reveal");
    localStorage.setItem("trailhead_page", "dashboard");
  }

  function handleOnboardingSignIn() {
    // Skip onboarding, go straight to sign-in
    localStorage.setItem(ONBOARDING_KEY, "1");
    setShowOnboarding(false);
    signInWithGoogle();
  }

  async function signInWithGoogle() {
    // Preserve join code through the OAuth redirect
    const redirectTo = pendingJoinCode
      ? `${window.location.origin}${window.location.pathname}?join=${pendingJoinCode}`
      : window.location.href;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setHousehold(null);
    setHouseholdMembers([]);
    setActivePlan(null);
    setPersonalPlanId(null);
    setShowPlanPicker(false);
    localStorage.removeItem(STORAGE_KEY);
    setS(publicDefaults);
  }

  const inputs   = useMemo(() => buildInputs(s), [s]);
  const solved    = useMemo(() => solveEarliestAge(inputs), [inputs]);
  const scenarios = useMemo(() => solveScenarios(inputs), [inputs]);
  const yourWindfallAdvice   = useMemo(() => solveWindfall(inputs, s.yourWindfallAmount,   s.yourWindfallAge),   [inputs, s.yourWindfallAmount, s.yourWindfallAge]);
  const spouseWindfallAdvice = useMemo(() => solveWindfall(inputs, s.spouseWindfallAmount, s.spouseWindfallAge), [inputs, s.spouseWindfallAmount, s.spouseWindfallAge]);
  const [hidden, setHidden] = useState(false);
  const fmtMoney = (n) => fmt$(n, hidden);
  const [mc, setMc] = useState(null);
  const [mcRunning, setMcRunning] = useState(false);
  const [mcTargetRate, setMcTargetRate] = useState(80); // percent
  const [mcReverse, setMcReverse] = useState(null);

  function runMC() {
    setMcRunning(true);
    setMc(null);
    setMcReverse(null);
    setTimeout(() => {
      const result   = runMonteCarlo(inputs, solved.age);
      const reverse  = solvePortfolioForSuccessRate(inputs, solved.age, mcTargetRate / 100);
      setMc(result);
      setMcReverse(reverse);
      setMcRunning(false);
    }, 30);
  }

  // Close household panel when clicking outside
  useEffect(() => {
    if (!showHouseholdPanel) return;
    function handleClick(e) {
      if (householdPanelRef.current && !householdPanelRef.current.contains(e.target)) {
        setShowHouseholdPanel(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showHouseholdPanel]);

  // Clear MC results whenever inputs change (they're stale)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => { setMc(null); setMcReverse(null); }, [inputs]);

  // Autosave: localStorage always; cloud save (debounced 1.5s) when signed in and on a plan
  useEffect(() => {
    saveToStorage(s);
    if (activePlan && (household || personalPlanId)) {
      setSaveStatus("saving");
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(
        () => saveToCloud(s, activePlan, household?.id, personalPlanId),
        1500
      );
    }
  }, [s, activePlan, household, personalPlanId, saveToCloud]);

  const update = (k) => (v) => setS((prev) => ({ ...prev, [k]: v }));

  function resetToDefaults() {
    setShowResetConfirm(true);
  }

  function confirmReset() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ONBOARDING_KEY);
    setShowResetConfirm(false);
    setS(publicDefaults);
    setActivePlan(null);
    setShowOnboarding(true);
  }

  // Always show in today's dollars (real)
  const displayRows = useMemo(() => {
    if (!solved.rows) return [];
    return solved.rows.map((r) => ({
      ...r,
      rrspDisp: r.rrspBal / r.infFactor,
      tfsaDisp: r.tfsaBal / r.infFactor,
      nrDisp:   r.nrBal   / r.infFactor,
      endDisp:  r.endTotal / r.infFactor,
      contribDisp: r.totalContrib / r.infFactor,
      wdDisp:   r.totalWd / r.infFactor,
      spendDisp: r.requiredSpend / r.infFactor,
      cppDisp:  r.cpp / r.infFactor,
      oasDisp: r.oas / r.infFactor,
      oasClawbackDisp: r.oasClawback / r.infFactor,
      bonusCDisp: r.bonusC / r.infFactor,
    }));
  }, [solved]);

  const grandAnnual = inputs.monthlyExpensesTotal * 12;
  const postMortgageAnnual = grandAnnual - s.mortgage * 12;
  const mortgagePayoff = solved.mortgagePayoffAge;

  // Contributions summary
  const bonusAfterTax = (s.yourBase * s.yourBonusPct + s.spouseBase * s.spouseBonusPct) * (1 - s.taxRate);
  const totalMonthlyContrib = (s.startingMonthly || 0)
    + (s.yourTfsaMonthly || 0) + (s.yourNrMonthly || 0)
    + (s.spouseMonthly || 0) + (s.spouseTfsaMonthly || 0) + (s.spouseNrMonthly || 0);
  const startingAnnualContrib = totalMonthlyContrib * 12 + bonusAfterTax;

  // Income summary
  const yourBonusAmt = s.yourBase * s.yourBonusPct;
  const spouseBonusAmt = s.spouseBase * s.spouseBonusPct;
  const householdGross = s.yourBase + s.spouseBase + yourBonusAmt + spouseBonusAmt;

  // ── Show onboarding instead of calculator ────────────────────────────────
  if (showOnboarding) {
    return (
      <Onboarding
        onComplete={handleOnboardingComplete}
        onSignIn={handleOnboardingSignIn}
        publicDefaults={publicDefaults}
      />
    );
  }

  // ── Modals (shared across all pages) ─────────────────────────────────────
  const modals = (
    <>
      {showResetConfirm && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h2>Start over?</h2>
            <p>This will clear all your inputs and take you back to the beginning. Any unsaved changes will be lost — this can't be undone.</p>
            <button onClick={confirmReset} className="btn btn--primary" style={{ width: "100%", marginBottom: 10, background: "oklch(42% 0.14 25)", justifyContent: "center" }}>
              Yes, clear everything and start over
            </button>
            <button onClick={() => setShowResetConfirm(false)} className="btn btn--outline" style={{ width: "100%", justifyContent: "center" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {mergeConflict && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h2>You have unsaved inputs</h2>
            <p>Your browser has inputs from before you signed in. Your {mergeConflict.planType === "household" ? "household" : "saved"} plan also has data. Which would you like to keep?</p>
            <button onClick={() => setMergeConflict(null)} className="modal-choice-btn">
              <span className="modal-choice-btn__icon">💻</span>
              <div>
                <div className="modal-choice-btn__title">Keep browser inputs</div>
                <div className="modal-choice-btn__desc">Use what you just entered — this will overwrite your saved plan</div>
              </div>
            </button>
            <button onClick={() => { setS({ ...publicDefaults, ...mergeConflict.cloudInputs }); localStorage.removeItem(STORAGE_KEY); setMergeConflict(null); }} className="modal-choice-btn">
              <span className="modal-choice-btn__icon">☁️</span>
              <div>
                <div className="modal-choice-btn__title">Load saved plan</div>
                <div className="modal-choice-btn__desc">Restore your previously saved {mergeConflict.planType === "household" ? "household" : "personal"} plan — browser inputs will be discarded</div>
              </div>
            </button>
          </div>
        </div>
      )}
      {showPlanPicker && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h2>Which plan would you like to open?</h2>
            <p>You have a personal plan and a shared household plan. You can switch between them anytime.</p>
            <button onClick={() => switchPlan("personal")} className="modal-choice-btn">
              <span className="modal-choice-btn__icon">👤</span>
              <div>
                <div className="modal-choice-btn__title">My Personal Plan</div>
                <div className="modal-choice-btn__desc">Your private projections — only you can see and edit this</div>
              </div>
            </button>
            <button onClick={() => switchPlan("household")} className="modal-choice-btn">
              <span className="modal-choice-btn__icon">🏠</span>
              <div>
                <div className="modal-choice-btn__title">Household Plan</div>
                <div className="modal-choice-btn__desc">Shared with {householdMembers.length > 1 ? `${householdMembers.length} members` : "your household"} — changes sync for everyone</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <PrivacyContext.Provider value={hidden}>
    <div className="dash-frame" style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

      {/* ── Top nav ── */}
      <div className="dash-top">
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* Wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: "var(--accent-deep)",
              display: "grid", placeItems: "center",
              flexShrink: 0,
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 12 L8 4 L13 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5.5 8.5 L10.5 8.5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="dash-top__brand">Trailhead</div>
          </div>

          {/* Page tabs */}
          <nav style={{ display: "flex", gap: 0, borderLeft: "1px solid var(--line)", paddingLeft: 20 }}>
            {[
              { id: "dashboard", label: "Dashboard" },
              { id: "editor", label: "Plan Editor" },
              { id: "settings", label: "Settings" },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => navigateTo(tab.id)}
                style={{
                  padding: "5px 14px",
                  fontSize: "var(--step--1)",
                  fontWeight: page === tab.id ? 600 : 400,
                  color: page === tab.id ? "var(--accent-deep)" : "var(--ink-3)",
                  background: "none",
                  border: "none",
                  borderBottom: page === tab.id ? "2px solid var(--accent-deep)" : "2px solid transparent",
                  borderRadius: 0,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  marginBottom: -1,
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="dash-top__actions">
          {/* Hide toggle */}
          <button
            onClick={() => setHidden(h => !h)}
            className={"btn btn--sm btn--outline " + (hidden ? "is-active" : "")}
            style={hidden ? { background: "var(--sun-soft)", borderColor: "var(--sun)", color: "var(--sun-ink)" } : {}}
          >
            {hidden ? "🙈 Hidden" : "👁 Hide"}
          </button>

          {/* Auth status */}
          {authLoading ? null : user ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {user.user_metadata?.avatar_url && (
                <img src={user.user_metadata.avatar_url} alt="" style={{ width: 26, height: 26, borderRadius: "50%" }} />
              )}
              <span style={{ fontSize: "var(--step--1)", color: "var(--ink-2)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</span>
            </div>
          ) : (
            <button onClick={signInWithGoogle} className="btn btn--outline btn--sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Sign in
            </button>
          )}

          {/* Save status */}
          {activePlan && (
            <span style={{ fontSize: "var(--step--2)", color: "var(--ink-3)" }}>
              {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "⚠ Error" : "Saved"}
            </span>
          )}
        </div>
      </div>

      {/* Pending join code banner */}
      {!user && pendingJoinCode && (
        <div className="callout" style={{ margin: "0 24px 12px", borderRadius: "var(--r-2)" }}>
          You've been invited to join a household. Sign in with Google to accept.
        </div>
      )}

      {modals}

      {/* ── Page content ── */}
      {/* Editor gets its own scroll context so the ToC sidebar can be sticky */}
      {page === "editor" && (
        <div key={pageKey} className={pageAnimClass} style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <PlanEditor
            s={s}
            update={update}
            solved={solved}
            inputs={inputs}
            saveStatus={saveStatus}
            onNavigate={(p) => navigateTo(p)}
          />
        </div>
      )}
      <div key={page !== "editor" ? pageKey : undefined} className={page !== "editor" ? pageAnimClass : undefined} style={{ flex: 1, overflowY: "auto", display: page === "editor" ? "none" : "block" }}>
        {page === "dashboard" && (
          <Dashboard
            s={s}
            inputs={inputs}
            solved={solved}
            scenarios={scenarios}
            mc={mc}
            mcRunning={mcRunning}
            mcTargetRate={mcTargetRate}
            mcReverse={mcReverse}
            setMcTargetRate={setMcTargetRate}
            runMC={runMC}
            displayRows={displayRows}
            update={update}
            totalMonthlyContrib={totalMonthlyContrib}
            solveWithOverrides={(overrideInputs, forceAge) => {
              // overrideInputs.startingMonthly is already the full household total
              // (Dashboard sums all per-person/per-account fields before passing).
              const merged = { ...inputs, ...overrideInputs };
              if (forceAge != null) {
                const res = simulate(merged, forceAge);
                return { age: forceAge, ...res };
              }
              return solveEarliestAge(merged);
            }}
          />
        )}
        {page === "settings" && (
          <Settings
            user={user}
            authLoading={authLoading}
            household={household}
            householdMembers={householdMembers}
            householdPanelRef={householdPanelRef}
            activePlan={activePlan}
            personalPlanId={personalPlanId}
            copied={copied}
            joinInput={joinInput}
            setJoinInput={setJoinInput}
            joinError={joinError}
            signInWithGoogle={signInWithGoogle}
            signOut={signOut}
            switchPlan={switchPlan}
            createHousehold={createHousehold}
            removeMember={removeMember}
            copyShareUrl={copyShareUrl}
            handleJoinSubmit={handleJoinSubmit}
            resetToDefaults={resetToDefaults}
            s={s}
            saveStatus={saveStatus}
          />
        )}
      </div>

    </div>
    </PrivacyContext.Provider>
  );
}
