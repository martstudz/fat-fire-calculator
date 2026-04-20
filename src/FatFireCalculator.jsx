import { useState, useMemo, useRef, useEffect, createContext, useContext, useCallback } from "react";
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

// ---------- helpers ----------
const fmt$ = (n, hidden) => {
  if (hidden) return MASK;
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.round(n));
  return sign + "$" + abs.toLocaleString();
};


// Months remaining on a mortgage given principal, monthly payment, annual rate.
function monthsToPayoff(principal, monthlyPayment, annualRate) {
  if (principal <= 0) return 0;
  if (monthlyPayment <= 0) return null;
  const r = annualRate / 12;
  if (r <= 0) return principal / monthlyPayment;
  const ratio = (principal * r) / monthlyPayment;
  if (ratio >= 1) return null;
  return -Math.log(1 - ratio) / Math.log(1 + r);
}

function payoffAgeFromMonths(currentAge, months) {
  if (months === null || !isFinite(months)) return Infinity;
  return currentAge + Math.ceil(months / 12);
}

// RRIF minimum withdrawal factors by age (CRA schedule)
// Source: CRA prescribed minimums. At 71: 5.28%, rising each year.
const RRIF_FACTORS = {
  71:0.0528,72:0.0540,73:0.0553,74:0.0567,75:0.0582,
  76:0.0598,77:0.0617,78:0.0636,79:0.0658,80:0.0682,
  81:0.0708,82:0.0738,83:0.0771,84:0.0808,85:0.0851,
  86:0.0899,87:0.0955,88:0.1021,89:0.1099,90:0.1099,
  91:0.1120,92:0.1320,93:0.1520,94:0.2000,
};
function rrifMinimum(balance, age) {
  const factor = RRIF_FACTORS[Math.min(age, 94)] || 0.2;
  return balance * factor;
}

// ---------- engine ----------
// Simulate a full life path from currentAge through deathAge, retiring at retirementAge.
//
// DRAWDOWN STRATEGY — Canadian-optimized (RRSP-first):
//
//   Phase 1: Early retirement (FAT FIRE – 65)
//     LOW-TAX window. Draw RRSP first to cover spending gap, then Non-reg, then TFSA.
//
//   Phase 2: CPP/OAS years (65+)
//     CPP + pension in play. RRIF mandatory minimums enforced at 71+.
//     Draw order: RRSP/RRIF → Non-reg → TFSA (OAS clawback shield).
//
//   TFSA is always the last resort / shock absorber.
//   Non-reg gains taxed at 50% inclusion × retirement marginal rate.
//
function simulate(p, retirementAge) {
  const years = Math.max(0, p.deathAge - p.currentAge + 1);
  const totalAnnualSpendToday = p.monthlyExpensesTotal * 12 + p.oneTimeAnnualTotal;
  const retirementAnnualSpendToday = totalAnnualSpendToday + (p.retirementSpendDelta || 0);
  const effectiveMortgagePayment = p.mortgagePayment + p.extraMortgagePayment;
  const payoffAge = payoffAgeFromMonths(
    p.currentAge,
    monthsToPayoff(p.mortgagePrincipal, effectiveMortgagePayment, p.mortgageRate)
  );
  const grossIncomeToday =
    p.yourBase + p.spouseBase +
    p.yourBase * p.yourBonusPct + p.spouseBase * p.spouseBonusPct +
    p.yourBase * p.yourEquityPct + p.spouseBase * p.spouseEquityPct;

  let rrspBal = p.rrspStart;
  let tfsaBal = p.tfsaStart;
  let nrBal   = p.nrStart;
  let rrspRoom = p.rrspRoomExisting;
  let tfsaRoom = p.tfsaRoomExisting;
  let monthly  = p.startingMonthly;

  // Bonus and equity are derived from income, not stored separately.
  // bonusAfterTax = (yourBase * yourBonusPct + spouseBase * spouseBonusPct) * (1 - taxRate)
  // equityAfterTax = (yourBase * yourEquityPct + spouseBase * spouseEquityPct) * (1 - taxRate)
  // Both grow with incomeGrowth each year. Equity starts at t=3 (year 4).
  const baseBonusAfterTax =
    (p.yourBase * p.yourBonusPct + p.spouseBase * p.spouseBonusPct) * (1 - p.taxRate);
  const baseEquityAfterTax =
    (p.yourBase * p.yourEquityPct + p.spouseBase * p.spouseEquityPct) * (1 - p.taxRate);

  const rows = [];
  let depleted = false;

  for (let t = 0; t < years; t++) {
    const age      = p.currentAge + t;
    const spouseAge = p.spouseCurrentAge + t;
    const inf      = Math.pow(1 + p.inflation, t);
    const incGrow  = Math.pow(1 + p.incomeGrowth, t);

    rrspRoom += p.rrspRoomAnnual * inf;
    tfsaRoom += p.tfsaRoomAnnual * inf;

    // Required spend. In retirement use retirement-adjusted spend (higher travel, healthcare; no RESP).
    // Mortgage drops off after payoff.
    const baseAnnualSpend = age >= retirementAge ? retirementAnnualSpendToday : totalAnnualSpendToday;
    let baseSpendToday = baseAnnualSpend;
    if (age >= payoffAge) baseSpendToday -= p.mortgagePayment * 12;
    const requiredSpendNom = baseSpendToday * inf;

    const rrspStart = rrspBal, tfsaStart = tfsaBal, nrStart = nrBal;
    const startTotal = rrspStart + tfsaStart + nrStart;

    let cRrsp = 0, cTfsa = 0, cNr = 0;
    let wRrsp = 0, wTfsa = 0, wNr = 0;
    let gRrsp = 0, gTfsa = 0, gNr = 0;
    let cpp = 0, pension = 0, oas = 0, oasClawback = 0, afterTaxInc = 0, totalContrib = 0, totalWd = 0;
    let rowBonusC = 0, rowEquityC = 0, rrspRefund = 0;
    let drawdownPhase = "";

    if (age < retirementAge) {
      // ---- Accumulation ----
      rowBonusC  = baseBonusAfterTax * incGrow;
      rowEquityC = t >= 3 ? baseEquityAfterTax * incGrow : 0;
      const extraMortgageAnnual = age < payoffAge ? p.extraMortgagePayment * 12 : 0;
      const totalAvail = Math.max(0, monthly * 12 + rowBonusC + rowEquityC - extraMortgageAnnual);

      // Waterfall: TFSA → RRSP → NR
      cTfsa = Math.min(totalAvail, Math.max(0, tfsaRoom));
      let remaining = totalAvail - cTfsa;
      cRrsp = Math.min(remaining, Math.max(0, rrspRoom));
      remaining -= cRrsp;
      cNr = remaining;

      tfsaRoom -= cTfsa;
      rrspRoom -= cRrsp;

      // RRSP refund: contributions generate a tax refund at marginal rate.
      // Refund is recycled into TFSA (if room) then non-reg.
      rrspRefund = cRrsp * p.taxRate;
      const refundToTfsa = Math.min(rrspRefund, Math.max(0, tfsaRoom));
      const refundToNr   = rrspRefund - refundToTfsa;
      cTfsa += refundToTfsa;
      cNr   += refundToNr;
      tfsaRoom -= refundToTfsa;

      totalContrib = totalAvail + rrspRefund;

      gTfsa = (tfsaStart + cTfsa / 2) * p.investmentReturn;
      gRrsp = (rrspStart + cRrsp / 2) * p.investmentReturn;
      gNr   = (nrStart   + cNr   / 2) * p.investmentReturn;
      tfsaBal = tfsaStart + cTfsa + gTfsa;
      rrspBal = rrspStart + cRrsp + gRrsp;
      nrBal   = nrStart   + cNr   + gNr;

      afterTaxInc = grossIncomeToday * incGrow * (1 - p.taxRate);

      monthly *= 1 + p.contribGrowth;

    } else {
      // ---- Decumulation ----
      cpp     = age >= p.cppStartAge     ? p.cppAmountToday * inf      : 0;
      pension = age >= p.pensionStartAge ? p.pensionMonthly * 12 * inf : 0;

      // OAS: both spouses eligible at oasStartAge. Amount inflates from today's value.
      // OAS clawback: 15% of net income above clawback threshold (per person).
      // We estimate each person's income as half household RRIF + their own CPP/pension/OAS.
      // For simplicity: apply clawback on household OAS if combined income exceeds 2× threshold.
      const oasGross = age >= p.oasStartAge ? p.oasAmountToday * 2 * inf : 0; // both spouses
      if (oasGross > 0) {
        // Estimate annual income per person for clawback: half of (cpp + pension + estimated RRIF)
        // Use last year's RRSP balance as proxy for RRIF withdrawal size
        const estRrifPerPerson = rrspBal > 0 ? (rrspBal * p.rrspTaxRate) / 2 : 0;
        const estIncomePerPerson = (cpp + pension) / 2 + oasGross / 2 + estRrifPerPerson;
        const clawbackThresholdNom = p.oasClawbackThreshold * inf;
        const clawbackPerPerson = Math.max(0, (estIncomePerPerson - clawbackThresholdNom) * 0.15);
        oasClawback = Math.min(oasGross, clawbackPerPerson * 2);
        oas = Math.max(0, oasGross - oasClawback);
      }

      // CPP, pension, and OAS are all taxable as ordinary income
      const guaranteedIncomeAfterTax = (cpp + pension + oas) * (1 - p.retirementIncomeTaxRate);
      let netNeeded = Math.max(0, requiredSpendNom - guaranteedIncomeAfterTax);

      const isEarlyRetirement = age < 65;
      const isRrif = age >= 71;

      if (isEarlyRetirement) {
        // ── Phase 1: FAT FIRE → 65 — RRSP first (low-tax window) ────────────
        drawdownPhase = "Phase 1";
        if (netNeeded > 0 && rrspStart > 0) {
          const maxNet = rrspStart * (1 - p.rrspTaxRate);
          wRrsp = maxNet >= netNeeded ? netNeeded / (1 - p.rrspTaxRate) : rrspStart;
          netNeeded = Math.max(0, netNeeded - wRrsp * (1 - p.rrspTaxRate));
        }
        if (netNeeded > 0 && nrStart > 0) {
          const maxNet = nrStart * (1 - p.nrCapGainsRate);
          wNr = maxNet >= netNeeded ? netNeeded / (1 - p.nrCapGainsRate) : nrStart;
          netNeeded = Math.max(0, netNeeded - wNr * (1 - p.nrCapGainsRate));
        }
        if (netNeeded > 0 && tfsaStart > 0) {
          wTfsa = Math.min(tfsaStart, netNeeded);
          netNeeded -= wTfsa;
        }
        if (netNeeded > 0) depleted = true;

      } else {
        // ── Phase 2: 65+ — RRIF minimums enforced, then Non-reg, then TFSA ──
        drawdownPhase = "Phase 2";

        // Enforce RRIF minimum at 71+ regardless of spending need
        const rrspMinimum = isRrif ? rrifMinimum(rrspStart, age) : 0;
        const maxNetRrsp  = rrspStart * (1 - p.rrspTaxRate);
        const rrspForSpend = maxNetRrsp >= netNeeded ? netNeeded / (1 - p.rrspTaxRate) : rrspStart;
        wRrsp = Math.min(rrspStart, Math.max(rrspForSpend, rrspMinimum));
        netNeeded = Math.max(0, netNeeded - wRrsp * (1 - p.rrspTaxRate));

        if (netNeeded > 0 && nrStart > 0) {
          const maxNet = nrStart * (1 - p.nrCapGainsRate);
          wNr = maxNet >= netNeeded ? netNeeded / (1 - p.nrCapGainsRate) : nrStart;
          netNeeded = Math.max(0, netNeeded - wNr * (1 - p.nrCapGainsRate));
        }
        if (netNeeded > 0 && tfsaStart > 0) {
          wTfsa = Math.min(tfsaStart, netNeeded);
          netNeeded -= wTfsa;
        }
        if (netNeeded > 0) depleted = true;
      }

      totalWd = wNr + wRrsp + wTfsa;
      afterTaxInc = guaranteedIncomeAfterTax;

      // Half-period growth
      gNr   = Math.max(0, nrStart   - wNr/2)   * p.investmentReturn;
      gRrsp = Math.max(0, rrspStart - wRrsp/2) * p.investmentReturn;
      gTfsa = Math.max(0, tfsaStart - wTfsa/2) * p.investmentReturn;
      nrBal   = Math.max(0, nrStart   + gNr   - wNr);
      rrspBal = Math.max(0, rrspStart + gRrsp - wRrsp);
      tfsaBal = Math.max(0, tfsaStart + gTfsa - wTfsa);
    }

    const endTotal = rrspBal + tfsaBal + nrBal;
    rows.push({
      t, year: t + 1, age, spouseAge,
      phase: age < retirementAge ? "accum" : "decum",
      drawdownPhase,
      infFactor: inf,
      startTotal, endTotal,
      rrspBal, tfsaBal, nrBal,
      cRrsp, cTfsa, cNr,
      wRrsp, wTfsa, wNr,
      gRrsp, gTfsa, gNr,
      totalContrib, totalWd,
      growthTotal: gRrsp + gTfsa + gNr,
      requiredSpend: requiredSpendNom,
      cpp, pension, oas, oasClawback, afterTaxInc,
      bonusC: rowBonusC, equityC: rowEquityC, rrspRefund,
      rrspRoom, tfsaRoom,
      mortgageStillActive: age < payoffAge,
    });
  }

  const terminalBal = rrspBal + tfsaBal + nrBal;
  // Terminal target is expressed in today's dollars; convert to nominal for comparison.
  const terminalTargetNom = p.terminalTargetToday * Math.pow(1 + p.inflation, years - 1);
  return {
    rows,
    sustainable: !depleted && terminalBal >= terminalTargetNom,
    terminalBal,
    terminalTargetNom,
    mortgagePayoffAge: payoffAge,
    mortgagePayoffMonths: monthsToPayoff(
      p.mortgagePrincipal, effectiveMortgagePayment, p.mortgageRate
    ),
  };
}

function solveEarliestAge(inputs) {
  const lo = inputs.currentAge;
  const hi = inputs.deathAge;
  for (let R = lo; R <= hi; R++) {
    const res = simulate(inputs, R);
    if (res.sustainable) return { age: R, ...res };
  }
  const fallback = simulate(inputs, hi);
  return { age: null, notReachable: true, ...fallback };
}

// ---------- Monte Carlo ----------
// Box-Muller transform: two uniform random numbers → standard normal sample.
function randNormal() {
  let u, v;
  do { u = Math.random(); } while (u === 0);
  do { v = Math.random(); } while (v === 0);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Core MC runner. portfolioOverride (optional): replace starting balances with a fixed
// total split proportionally across RRSP/TFSA/NR at retirement, used by the reverse solver.
// Returns: { successRate, p10, p25, p50, p75, p90 } terminal balances in today's $.
function runMonteCarlo(inputs, retirementAge, runs = 1000, annualVolatility = 0.14, portfolioOverride = null) {
  if (!retirementAge) return null;
  const years = Math.max(0, inputs.deathAge - inputs.currentAge + 1);
  const mu = Math.log(1 + inputs.investmentReturn) - (annualVolatility ** 2) / 2;

  const terminals = [];
  let successes = 0;

  for (let run = 0; run < runs; run++) {
    // Pre-generate a random return sequence for this path
    const returnSeq = Array.from({ length: years }, () =>
      Math.exp(mu + annualVolatility * randNormal()) - 1
    );

    // Simulate using the same engine logic but with year-specific returns
    const p = inputs;
    const effectiveMortgagePayment = p.mortgagePayment + p.extraMortgagePayment;
    const payoffAge = payoffAgeFromMonths(
      p.currentAge,
      monthsToPayoff(p.mortgagePrincipal, effectiveMortgagePayment, p.mortgageRate)
    );
    const totalAnnualSpendToday = p.monthlyExpensesTotal * 12 + p.oneTimeAnnualTotal;
    const retirementAnnualSpendToday = totalAnnualSpendToday + (p.retirementSpendDelta || 0);
    const baseBonusAfterTax =
      (p.yourBase * p.yourBonusPct + p.spouseBase * p.spouseBonusPct) * (1 - p.taxRate);
    const baseEquityAfterTax =
      (p.yourBase * p.yourEquityPct + p.spouseBase * p.spouseEquityPct) * (1 - p.taxRate);

    // If portfolioOverride is set, skip accumulation and start drawdown directly
    // with the override total split in the same ratio as the base starting balances.
    // If all starting balances are 0, split equally across RRSP/TFSA/NR.
    let startRrsp = p.rrspStart, startTfsa = p.tfsaStart, startNr = p.nrStart;
    if (portfolioOverride !== null) {
      const baseTotal = p.rrspStart + p.tfsaStart + p.nrStart;
      if (baseTotal > 0) {
        startRrsp = portfolioOverride * (p.rrspStart / baseTotal);
        startTfsa = portfolioOverride * (p.tfsaStart / baseTotal);
        startNr   = portfolioOverride * (p.nrStart   / baseTotal);
      } else {
        startRrsp = portfolioOverride / 3;
        startTfsa = portfolioOverride / 3;
        startNr   = portfolioOverride / 3;
      }
    }

    let rrspBal = startRrsp, tfsaBal = startTfsa, nrBal = startNr;
    let rrspRoom = p.rrspRoomExisting, tfsaRoom = p.tfsaRoomExisting;
    let monthly = p.startingMonthly;
    let depleted = false;

    for (let t = 0; t < years; t++) {
      const age   = p.currentAge + t;
      const inf   = Math.pow(1 + p.inflation, t);
      const ret   = returnSeq[t];
      const incGrow = Math.pow(1 + p.incomeGrowth, t);

      rrspRoom += p.rrspRoomAnnual * inf;
      tfsaRoom += p.tfsaRoomAnnual * inf;

      const baseAnnualSpendMC = age >= retirementAge ? retirementAnnualSpendToday : totalAnnualSpendToday;
      let baseSpendToday = baseAnnualSpendMC;
      if (age >= payoffAge) baseSpendToday -= p.mortgagePayment * 12;
      const requiredSpendNom = baseSpendToday * inf;

      const rrspStart = rrspBal, tfsaStart = tfsaBal, nrStart = nrBal;

      if (portfolioOverride !== null && age < retirementAge) {
        // Skip accumulation when using portfolio override — go straight to drawdown
        continue;
      }

      if (age < retirementAge) {
        const bonusC  = baseBonusAfterTax * incGrow;
        const equityC = t >= 3 ? baseEquityAfterTax * incGrow : 0;
        const extraMortgageAnnual = age < payoffAge ? p.extraMortgagePayment * 12 : 0;
        const totalAvail = Math.max(0, monthly * 12 + bonusC + equityC - extraMortgageAnnual);

        let mcTfsa = Math.min(totalAvail, Math.max(0, tfsaRoom));
        let rem = totalAvail - mcTfsa;
        const mcRrsp = Math.min(rem, Math.max(0, rrspRoom));
        rem -= mcRrsp;
        let mcNr = rem;

        tfsaRoom -= mcTfsa; rrspRoom -= mcRrsp;

        // RRSP refund recycled into TFSA then non-reg
        const mcRrspRefund = mcRrsp * p.taxRate;
        const mcRefundToTfsa = Math.min(mcRrspRefund, Math.max(0, tfsaRoom));
        mcTfsa += mcRefundToTfsa;
        mcNr   += mcRrspRefund - mcRefundToTfsa;
        tfsaRoom -= mcRefundToTfsa;

        tfsaBal = tfsaStart + mcTfsa + (tfsaStart + mcTfsa / 2) * ret;
        rrspBal = rrspStart + mcRrsp + (rrspStart + mcRrsp / 2) * ret;
        nrBal   = nrStart   + mcNr   + (nrStart   + mcNr   / 2) * ret;
        monthly *= 1 + p.contribGrowth;

      } else {
        const cpp     = age >= p.cppStartAge     ? p.cppAmountToday * inf      : 0;
        const pension = age >= p.pensionStartAge ? p.pensionMonthly * 12 * inf : 0;
        // OAS + clawback
        const oasGross = age >= p.oasStartAge ? p.oasAmountToday * 2 * inf : 0;
        let oasNet = 0;
        if (oasGross > 0) {
          const estRrifPerPerson = rrspBal > 0 ? (rrspBal * p.rrspTaxRate) / 2 : 0;
          const estIncomePerPerson = (cpp + pension) / 2 + oasGross / 2 + estRrifPerPerson;
          const clawbackThresholdNom = p.oasClawbackThreshold * inf;
          const clawbackPerPerson = Math.max(0, (estIncomePerPerson - clawbackThresholdNom) * 0.15);
          oasNet = Math.max(0, oasGross - Math.min(oasGross, clawbackPerPerson * 2));
        }
        const guaranteedIncomeAfterTax = (cpp + pension + oasNet) * (1 - p.retirementIncomeTaxRate);
        let netNeeded = Math.max(0, requiredSpendNom - guaranteedIncomeAfterTax);

        const isRrif = age >= 71;
        let wRrsp = 0, wNr = 0, wTfsa = 0;

        if (age < 65) {
          // Phase 1: RRSP → NR → TFSA
          if (netNeeded > 0 && rrspStart > 0) {
            const maxNet = rrspStart * (1 - p.rrspTaxRate);
            wRrsp = maxNet >= netNeeded ? netNeeded / (1 - p.rrspTaxRate) : rrspStart;
            netNeeded = Math.max(0, netNeeded - wRrsp * (1 - p.rrspTaxRate));
          }
          if (netNeeded > 0 && nrStart > 0) {
            const maxNet = nrStart * (1 - p.nrCapGainsRate);
            wNr = maxNet >= netNeeded ? netNeeded / (1 - p.nrCapGainsRate) : nrStart;
            netNeeded = Math.max(0, netNeeded - wNr * (1 - p.nrCapGainsRate));
          }
          if (netNeeded > 0 && tfsaStart > 0) { wTfsa = Math.min(tfsaStart, netNeeded); netNeeded -= wTfsa; }
        } else {
          // Phase 2: RRIF minimum enforced
          const rrspMinimum = isRrif ? rrifMinimum(rrspStart, age) : 0;
          const maxNetRrsp  = rrspStart * (1 - p.rrspTaxRate);
          const rrspForSpend = maxNetRrsp >= netNeeded ? netNeeded / (1 - p.rrspTaxRate) : rrspStart;
          wRrsp = Math.min(rrspStart, Math.max(rrspForSpend, rrspMinimum));
          netNeeded = Math.max(0, netNeeded - wRrsp * (1 - p.rrspTaxRate));
          if (netNeeded > 0 && nrStart > 0) {
            const maxNet = nrStart * (1 - p.nrCapGainsRate);
            wNr = maxNet >= netNeeded ? netNeeded / (1 - p.nrCapGainsRate) : nrStart;
            netNeeded = Math.max(0, netNeeded - wNr * (1 - p.nrCapGainsRate));
          }
          if (netNeeded > 0 && tfsaStart > 0) { wTfsa = Math.min(tfsaStart, netNeeded); netNeeded -= wTfsa; }
        }

        if (netNeeded > 0) depleted = true;

        rrspBal = Math.max(0, rrspStart + Math.max(0, rrspStart - wRrsp / 2) * ret - wRrsp);
        nrBal   = Math.max(0, nrStart   + Math.max(0, nrStart   - wNr   / 2) * ret - wNr);
        tfsaBal = Math.max(0, tfsaStart + Math.max(0, tfsaStart - wTfsa / 2) * ret - wTfsa);
      }
    }

    const terminal = rrspBal + tfsaBal + nrBal;
    const terminalReal = terminal / Math.pow(1 + p.inflation, years - 1);
    const terminalTarget = p.terminalTargetToday;
    if (!depleted && terminalReal >= terminalTarget) successes++;
    terminals.push(terminalReal);
  }

  terminals.sort((a, b) => a - b);
  const pct = (p) => terminals[Math.floor(p * runs / 100)];

  return {
    successRate: successes / runs,
    p10: pct(10), p25: pct(25), p50: pct(50), p75: pct(75), p90: pct(90),
  };
}

// Reverse solver: binary search over starting portfolio to find the minimum value that
// achieves targetSuccessRate (e.g. 0.80) across 1,000 MC paths from retirementAge.
// Returns { portfolio, successRate } or null if retirementAge is null.
function solvePortfolioForSuccessRate(inputs, retirementAge, targetSuccessRate = 0.8, annualVolatility = 0.14) {
  if (!retirementAge) return null;

  let lo = 500000;
  let hi = 20000000;

  // Binary search — ~20 iterations, each running 500 paths for speed
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const result = runMonteCarlo(inputs, retirementAge, 500, annualVolatility, mid);
    if (result.successRate >= targetSuccessRate) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  const finalPortfolio = Math.ceil((lo + hi) / 2 / 50000) * 50000; // round to nearest $50K
  const verify = runMonteCarlo(inputs, retirementAge, 1000, annualVolatility, finalPortfolio);
  return { portfolio: finalPortfolio, successRate: verify.successRate };
}

// Run base + conservative + stress scenarios, returning retirement age and portfolio at retirement.
function solveScenarios(inputs) {
  const scenarios = [
    { label: "Base",         return: 0.07,  inflation: 0.03,  color: "var(--accent-deep)" },
    { label: "Conservative", return: 0.055, inflation: 0.035, color: "var(--slate)"   },
    { label: "Stress",       return: 0.04,  inflation: 0.04,  color: "var(--slate)"     },
  ];
  return scenarios.map(sc => {
    const overridden = { ...inputs, investmentReturn: sc.return, inflation: sc.inflation };
    const result = solveEarliestAge(overridden);
    const retRow = result.rows && result.age !== null
      ? result.rows.find(r => r.age === result.age)
      : null;
    const portfolioAtRetirement = retRow ? retRow.endTotal / retRow.infFactor : null;
    return { ...sc, age: result.age, portfolioAtRetirement };
  });
}

// ---------- windfall advisor ----------
// For a given windfall amount, simulate four alternative allocations and compare
// the resulting retirement age + portfolio at retirement against the base case.
// The windfall is applied as a one-time lump sum at the windfall age:
//   • Mortgage: reduces outstanding principal (shortens amortization → lower spend at retirement)
//   • TFSA: added directly to tfsaStart (tax-free compounding)
//   • RRSP: added to rrspStart (tax-sheltered compounding, taxed on withdrawal)
//   • Non-reg: added to nrStart (taxable returns)
// Returns an array of { label, description, age, portfolioAtRetirement, ageDiff, portDiff }
// sorted best → worst by retirement age (tie-break: portfolio size).
function solveWindfall(inputs, windfallAmount, windfallAge) {
  if (!windfallAmount || windfallAmount <= 0) return null;

  // Helper: run solver and extract key outputs
  function run(overrides) {
    const inp = { ...inputs, ...overrides };
    const result = solveEarliestAge(inp);
    const retRow = result.rows && result.age !== null
      ? result.rows.find(r => r.age === result.age) : null;
    return {
      age: result.age,
      portfolioAtRetirement: retRow ? retRow.endTotal / retRow.infFactor : null,
    };
  }

  const base = run({});

  // How much TFSA / RRSP room is available at windfall age?
  // Estimate by projecting forward from today.
  const yearsToWindfall = Math.max(0, windfallAge - inputs.currentAge);
  const infAtWindfall = Math.pow(1 + inputs.inflation, yearsToWindfall);
  const projectedTfsaRoom = inputs.tfsaRoomExisting + inputs.tfsaRoomAnnual * infAtWindfall * yearsToWindfall;
  const projectedRrspRoom = inputs.rrspRoomExisting + inputs.rrspRoomAnnual * infAtWindfall * yearsToWindfall;

  // Mortgage: reduce principal. New payoff schedule changes retirement spending.
  const newPrincipal = Math.max(0, inputs.mortgagePrincipal - windfallAmount);

  // TFSA: cap at projected room, remainder spills to non-reg
  const tfsaAlloc = Math.min(windfallAmount, projectedTfsaRoom);
  const tfsaOverflow = windfallAmount - tfsaAlloc;

  // RRSP: cap at projected room, remainder spills to non-reg
  const rrspAlloc = Math.min(windfallAmount, projectedRrspRoom);
  const rrspOverflow = windfallAmount - rrspAlloc;

  const alternatives = [
    {
      label: "Pay down mortgage",
      description: `Reduces principal by ${fmt$(windfallAmount)} → earlier payoff, lower retirement spend`,
      result: run({ mortgagePrincipal: newPrincipal }),
    },
    {
      label: "Max TFSA",
      description: tfsaOverflow > 0
        ? `${fmt$(tfsaAlloc)} → TFSA (room limit), ${fmt$(tfsaOverflow)} → non-reg`
        : `${fmt$(tfsaAlloc)} → TFSA (tax-free growth)`,
      result: run({ tfsaStart: inputs.tfsaStart + tfsaAlloc, nrStart: inputs.nrStart + tfsaOverflow }),
    },
    {
      label: "Max RRSP",
      description: rrspOverflow > 0
        ? `${fmt$(rrspAlloc)} → RRSP (room limit), ${fmt$(rrspOverflow)} → non-reg`
        : `${fmt$(rrspAlloc)} → RRSP (tax-sheltered, taxed on withdrawal)`,
      result: run({ rrspStart: inputs.rrspStart + rrspAlloc, nrStart: inputs.nrStart + rrspOverflow }),
    },
    {
      label: "Non-registered",
      description: `${fmt$(windfallAmount)} → non-reg (flexible, gains taxed at ${Math.round(inputs.nrCapGainsRate * 100)}%)`,
      result: run({ nrStart: inputs.nrStart + windfallAmount }),
    },
  ];

  // Score: earlier retirement age wins; tie-break on larger portfolio
  const scored = alternatives.map(a => ({
    label: a.label,
    description: a.description,
    age: a.result.age,
    portfolioAtRetirement: a.result.portfolioAtRetirement,
    ageDiff: a.result.age !== null && base.age !== null ? a.result.age - base.age : null,
    portDiff: a.result.portfolioAtRetirement !== null && base.portfolioAtRetirement !== null
      ? a.result.portfolioAtRetirement - base.portfolioAtRetirement : null,
  })).sort((a, b) => {
    if (a.age === null) return 1;
    if (b.age === null) return -1;
    if (a.age !== b.age) return a.age - b.age;
    return (b.portfolioAtRetirement ?? 0) - (a.portfolioAtRetirement ?? 0);
  });

  return { base, alternatives: scored };
}

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
  taxRate: 0, incomeGrowth: 0,
  // Expenses: monthly
  mortgage: 0, maintenance: 0, propertyTax: 0,
  utilities: 0, transport: 0, groceries: 0,
  dining: 0, clothing: 0,
  childcare: 0, subscriptions: 0, personalCare: 0,
  // Expenses: annual
  travel: 0, oneTimeMisc: 0,
  resp: 0,
  // Retirement-specific spend
  retirementTravel: 0, retirementHealthcare: 0,
  // Mortgage amortization
  mortgagePrincipal: 0, mortgageRate: 0,
  extraMortgagePayment: 0,
  // Account balances — per person
  yourRrspStart: 0, spouseRrspStart: 0,
  yourTfsaStart: 0, spouseTfsaStart: 0,
  yourNrStart: 0, spouseNrStart: 0,
  // Contributions
  startingMonthly: 0,
  contribGrowth: 0,
  // Contribution room
  yourRrspRoomExisting: 0, spouseRrspRoomExisting: 0,
  yourTfsaRoomExisting: 0, spouseTfsaRoomExisting: 0,
  yourRrspRoomAnnual: 0, spouseRrspRoomAnnual: 0,
  yourTfsaRoomAnnual: 0, spouseTfsaRoomAnnual: 0,
  // Windfalls
  yourWindfallAge: 0, yourWindfallAmount: 0,
  spouseWindfallAge: 0, spouseWindfallAmount: 0,
  // Terminal target
  terminalTargetToday: 0,
  // Market assumptions
  investmentReturn: 0, inflation: 0,
  // Retirement income / taxes
  cppAmountToday: 0, cppStartAge: 0,
  pensionMonthly: 0, pensionStartAge: 0,
  oasAmountToday: 0, oasStartAge: 0,
  oasClawbackThreshold: 0,
  rrspTaxRate: 0, nrCapGainsRate: 0,
  retirementIncomeTaxRate: 0,
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
  yourEquityPct: 0.355, spouseEquityPct: 0.085,
  taxRate: 0.43, incomeGrowth: 0.05,
  // Expenses: monthly
  mortgage: 4350, maintenance: 1000, propertyTax: 500,
  utilities: 400, transport: 350, groceries: 1500,
  dining: 1500, clothing: 400,
  childcare: 0, subscriptions: 300, personalCare: 400,
  // Expenses: annual
  travel: 20000, oneTimeMisc: 20000,
  resp: 5000,
  // Retirement-specific spend
  retirementTravel: 40000, retirementHealthcare: 8000,
  // Mortgage amortization
  mortgagePrincipal: 872000, mortgageRate: 0.0385,
  extraMortgagePayment: 800,
  // Account balances — per person
  yourRrspStart: 220000, spouseRrspStart: 344000,
  yourTfsaStart: 109000, spouseTfsaStart: 139000,
  yourNrStart: 5000, spouseNrStart: 0,
  // Contributions
  startingMonthly: 4500,
  contribGrowth: 0.05,
  // Contribution room
  yourRrspRoomExisting: 80000, spouseRrspRoomExisting: 46000,
  yourTfsaRoomExisting: 25000, spouseTfsaRoomExisting: 39000,
  yourRrspRoomAnnual: 32490, spouseRrspRoomAnnual: 32490,
  yourTfsaRoomAnnual: 7000, spouseTfsaRoomAnnual: 7000,
  // Windfalls
  yourWindfallAge: 50, yourWindfallAmount: 0,
  spouseWindfallAge: 50, spouseWindfallAmount: 0,
  // Terminal target
  terminalTargetToday: 250000,
  // Market assumptions
  investmentReturn: 0.07, inflation: 0.03,
  // Retirement income / taxes
  cppAmountToday: 36000, cppStartAge: 65, yourCppAmount: 18000, spouseCppAmount: 18000,
  pensionMonthly: 650, pensionStartAge: 60,
  oasAmountToday: 8500, oasStartAge: 65,
  oasClawbackThreshold: 95323,
  rrspTaxRate: 0.37, nrCapGainsRate: 0.21,
  retirementIncomeTaxRate: 0.37,
};

function buildInputs(s) {
  // Resolve per-person CPP to combined figure the engine expects
  const cppAmountToday = s.yourCppAmount != null && s.spouseCppAmount != null
    ? (s.yourCppAmount || 0) + (s.partnered !== false ? (s.spouseCppAmount || 0) : 0)
    : (s.cppAmountToday || 0);

  return {
    ...s,
    cppAmountToday,
    monthlyExpensesTotal:
      (s.mortgage || 0) + (s.rent || 0) + (s.maintenance || 0) + (s.propertyTax || 0) +
      (s.utilities || 0) + (s.homeInsurance || 0) +
      (s.transport || 0) + (s.groceries || 0) + (s.dining || 0) + (s.clothing || 0) +
      (s.entertainment || 0) + (s.childcare || 0) + (s.subscriptions || 0) + (s.personalCare || 0),
    oneTimeAnnualTotal: (s.travel || 0) + (s.oneTimeMisc || 0) + (s.resp || 0),
    // Retirement-specific: swap travel for retirementTravel, add healthcare
    retirementMonthlyExtra: 0,
    retirementSpendDelta: (s.retirementTravel || 0) - (s.travel || 0) + (s.retirementHealthcare || 0) - (s.resp || 0),
    mortgagePayment: s.mortgage,
    // Combine per-person balances for the engine
    rrspStart: (s.yourRrspStart || 0) + (s.spouseRrspStart || 0),
    tfsaStart: (s.yourTfsaStart || 0) + (s.spouseTfsaStart || 0),
    nrStart:   (s.yourNrStart   || 0) + (s.spouseNrStart   || 0),
    // Combine household contribution room for engine
    rrspRoomExisting: (s.yourRrspRoomExisting || 0) + (s.spouseRrspRoomExisting || 0),
    tfsaRoomExisting: (s.yourTfsaRoomExisting || 0) + (s.spouseTfsaRoomExisting || 0),
    rrspRoomAnnual: (s.yourRrspRoomAnnual || 0) + (s.spouseRrspRoomAnnual || 0),
    tfsaRoomAnnual: (s.yourTfsaRoomAnnual || 0) + (s.spouseTfsaRoomAnnual || 0),
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
    if (!raw) return publicDefaults;
    const parsed = JSON.parse(raw);
    // Merge with publicDefaults so new fields always have a value
    return { ...publicDefaults, ...parsed };
  } catch {
    return publicDefaults;
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
  const [page, setPage] = useState("dashboard");

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
      pensionDisp: r.pension / r.infFactor,
      oasDisp: r.oas / r.infFactor,
      oasClawbackDisp: r.oasClawback / r.infFactor,
      bonusCDisp: r.bonusC / r.infFactor,
      equityCDisp: r.equityC / r.infFactor,
    }));
  }, [solved]);

  const grandAnnual = inputs.monthlyExpensesTotal * 12 + inputs.oneTimeAnnualTotal;
  const postMortgageAnnual = grandAnnual - s.mortgage * 12;
  const mortgagePayoff = solved.mortgagePayoffAge;

  // Base mortgage payoff (no extra payment) for comparison
  const baseMortgageMonths = monthsToPayoff(s.mortgagePrincipal, s.mortgage, s.mortgageRate);
  const baseMortgagePayoffAge = payoffAgeFromMonths(s.currentAge, baseMortgageMonths);
  const extraMortgageMonths = s.extraMortgagePayment > 0 ? solved.mortgagePayoffMonths : null;
  const yearsSaved = s.extraMortgagePayment > 0 && isFinite(baseMortgagePayoffAge) && isFinite(mortgagePayoff)
    ? baseMortgagePayoffAge - mortgagePayoff
    : 0;

  // Contributions summary (year 1 = t=0, equity hasn't started yet)
  const bonusAfterTax = (s.yourBase * s.yourBonusPct + s.spouseBase * s.spouseBonusPct) * (1 - s.taxRate);
  const equityAfterTax = (s.yourBase * s.yourEquityPct + s.spouseBase * s.spouseEquityPct) * (1 - s.taxRate);
  // Total household monthly contributions across all account types and persons
  const totalMonthlyContrib = (s.startingMonthly || 0)
    + (s.yourTfsaMonthly || 0) + (s.yourNrMonthly || 0)
    + (s.spouseMonthly || 0) + (s.spouseTfsaMonthly || 0) + (s.spouseNrMonthly || 0);
  const annualTopUps = (s.rrspTopUp || 0) + (s.tfsaTopUp || 0) + (s.nrTopUp || 0);
  // Year 1 total: monthly + bonus + top-ups (equity starts yr 4)
  const startingAnnualContrib = totalMonthlyContrib * 12 + bonusAfterTax + annualTopUps;
  // Year 4+ total (when equity kicks in)
  const fullAnnualContrib = totalMonthlyContrib * 12 + bonusAfterTax + equityAfterTax + annualTopUps;

  // Mortgage extra-payment sensitivity table
  const mortgageSensitivity = useMemo(() => {
    const steps = [0, 500, 1000, 1500, 2000, 2500, 3000];
    return steps.map(extra => {
      const overridden = buildInputs({ ...s, extraMortgagePayment: extra });
      const result = solveEarliestAge(overridden);
      const retRow = result.rows && result.age !== null
        ? result.rows.find(r => r.age === result.age)
        : null;
      const portfolioAtRetirement = retRow ? retRow.endTotal / retRow.infFactor : null;
      const payoffAge = payoffAgeFromMonths(
        s.currentAge,
        monthsToPayoff(s.mortgagePrincipal, s.mortgage + extra, s.mortgageRate)
      );
      return { extra, retirementAge: result.age, portfolioAtRetirement, payoffAge };
    });
  }, [s]);

  // Income summary
  const yourEquityAmt = s.yourBase * s.yourEquityPct;
  const spouseEquityAmt = s.spouseBase * s.spouseEquityPct;
  const yourBonusAmt = s.yourBase * s.yourBonusPct;
  const spouseBonusAmt = s.spouseBase * s.spouseBonusPct;
  const householdGross = s.yourBase + s.spouseBase + yourBonusAmt + spouseBonusAmt + yourEquityAmt + spouseEquityAmt;

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
    <div className="dash-frame" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>

      {/* ── Top nav ── */}
      <div className="dash-top">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <div className="dash-top__brand">Trailhead</div>
          </div>
          {/* Page tabs */}
          <nav style={{ display: "flex", gap: 2 }}>
            {[
              { id: "dashboard", label: "Dashboard" },
              { id: "editor", label: "Plan Editor" },
              { id: "settings", label: "Settings" },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setPage(tab.id)}
                style={{
                  padding: "5px 14px",
                  fontSize: "var(--step--1)",
                  fontWeight: page === tab.id ? 600 : 400,
                  color: page === tab.id ? "var(--ink)" : "var(--ink-3)",
                  background: page === tab.id ? "var(--paper-2)" : "none",
                  border: "1px solid " + (page === tab.id ? "var(--line)" : "transparent"),
                  borderRadius: "var(--r-2)",
                  cursor: "pointer",
                  transition: "all 0.15s",
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
      <div style={{ flex: 1, overflowY: "auto" }}>
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
          />
        )}
        {page === "editor" && (
          <PlanEditor
            s={s}
            update={update}
            solved={solved}
            inputs={inputs}
            saveStatus={saveStatus}
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
