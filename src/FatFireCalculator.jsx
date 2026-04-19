import { useState, useMemo, useRef, useEffect, createContext, useContext, useCallback } from "react";
import { supabase } from "./supabaseClient";

// ---------- privacy context ----------
const PrivacyContext = createContext(false);
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
    { label: "Base",         return: 0.07,  inflation: 0.03,  color: "text-emerald-700" },
    { label: "Conservative", return: 0.055, inflation: 0.035, color: "text-amber-600"   },
    { label: "Stress",       return: 0.04,  inflation: 0.04,  color: "text-red-600"     },
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
  // Names
  yourName: "You", spouseName: "Spouse",
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
  cppAmountToday: 40000, cppStartAge: 70,
  pensionMonthly: 650, pensionStartAge: 60,
  oasAmountToday: 8500, oasStartAge: 65,
  oasClawbackThreshold: 95323,
  rrspTaxRate: 0.37, nrCapGainsRate: 0.21,
  retirementIncomeTaxRate: 0.37,
};

function buildInputs(s) {
  return {
    ...s,
    monthlyExpensesTotal:
      s.mortgage + s.maintenance + s.propertyTax + s.utilities +
      s.transport + s.groceries + s.dining + s.clothing +
      (s.childcare || 0) + (s.subscriptions || 0) + (s.personalCare || 0),
    oneTimeAnnualTotal: s.travel + s.oneTimeMisc + (s.resp || 0),
    // Retirement-specific: swap travel for retirementTravel, add healthcare
    retirementMonthlyExtra: 0, // placeholder — retirement spend adjustment handled in engine via retirementSpendDelta
    retirementSpendDelta: (s.retirementTravel || 0) - (s.travel || 0) + (s.retirementHealthcare || 0) - (s.resp || 0),
    mortgagePayment: s.mortgage,
    // Combine per-person balances for the engine (engine models household as one unit)
    rrspStart: (s.yourRrspStart || 0) + (s.spouseRrspStart || 0),
    tfsaStart: (s.yourTfsaStart || 0) + (s.spouseTfsaStart || 0),
    nrStart:   (s.yourNrStart   || 0) + (s.spouseNrStart   || 0),
    // Combine household room for engine (engine uses single rrspRoom / tfsaRoom totals)
    rrspRoomExisting: s.yourRrspRoomExisting + s.spouseRrspRoomExisting,
    tfsaRoomExisting: s.yourTfsaRoomExisting + s.spouseTfsaRoomExisting,
    rrspRoomAnnual: s.yourRrspRoomAnnual + s.spouseRrspRoomAnnual,
    tfsaRoomAnnual: s.yourTfsaRoomAnnual + s.spouseTfsaRoomAnnual,
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
    <label className="flex items-center justify-between gap-2 text-sm py-0.5">
      <span className="text-slate-700 flex-1">
        {label}
        {hint && <span className="text-slate-400 text-xs ml-1">{hint}</span>}
      </span>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-slate-500 text-xs">{prefix}</span>}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={displayValue}
          onFocus={handleFocus}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={"border border-slate-300 rounded px-2 py-1 text-right text-sm " + (small ? "w-20" : "w-28")}
        />
        {suffix && <span className="text-slate-500 text-xs">{suffix}</span>}
      </div>
    </label>
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
    <div className="flex items-center justify-between gap-2 text-sm py-0.5">
      <span className="text-slate-700 flex-1">{label}</span>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-slate-500 text-xs">$</span>
          <input
            type="text"
            inputMode="numeric"
            value={displayValue}
            onFocus={handleFocus}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="border border-slate-300 rounded px-2 py-1 text-right text-sm w-24"
          />
          <span className="text-slate-400 text-xs w-7">{freq === "monthly" ? "/mo" : "/yr"}</span>
        </div>
        <span className="text-slate-500 text-xs w-20 text-right font-mono">
          {freq === "monthly" ? "= " + (hidden ? MASK : fmt$(annualized)) + "/yr" : ""}
        </span>
      </div>
    </div>
  );
}

function Section({ title, children, defaultOpen = true }) {
  return (
    <details open={defaultOpen} className="bg-white rounded-lg shadow-sm border border-slate-200">
      <summary className="px-3 py-2 font-semibold text-slate-800 cursor-pointer select-none text-sm">
        {title}
      </summary>
      <div className="px-3 py-2 space-y-1 border-t border-slate-100">
        {children}
      </div>
    </details>
  );
}

function InfoBox({ children }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-slate-700 mt-1">
      {children}
    </div>
  );
}

// ---------- main ----------
const STORAGE_KEY = "fatfire_inputs_v2";

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

export default function FatFireCalculator() {
  const [s, setS] = useState(loadSaved);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("saved"); // "saved" | "saving" | "error"
  const [household, setHousehold] = useState(null); // { id, join_code }
  const [joinInput, setJoinInput] = useState("");
  const [joinError, setJoinError] = useState("");
  const [showJoinBox, setShowJoinBox] = useState(false);
  const [copied, setCopied] = useState(false);
  const saveTimerRef = useRef(null);

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
      if (session?.user) initHousehold(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUser = session?.user ?? null;
      setUser(newUser);
      if (newUser) initHousehold(newUser.id);
    });
    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Household init: join via URL code, load existing, or create new ───────
  async function initHousehold(userId) {
    // 1. Check if user already belongs to a household
    const { data: membership } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .single();

    if (membership?.household_id) {
      await loadHousehold(membership.household_id);
      // If there's a pending join code in URL but user already has a household, ignore it
      return;
    }

    // 2. If there's a join code in the URL, try to join that household
    if (pendingJoinCode) {
      const joined = await joinHouseholdByCode(userId, pendingJoinCode);
      if (joined) return;
    }

    // 3. No household — create one
    await createHousehold(userId);
  }

  async function loadHousehold(householdId) {
    const { data, error } = await supabase
      .from("households")
      .select("id, join_code, inputs")
      .eq("id", householdId)
      .single();
    if (!error && data) {
      setHousehold({ id: data.id, join_code: data.join_code });
      if (data.inputs && Object.keys(data.inputs).length > 0) {
        setS({ ...publicDefaults, ...data.inputs });
      } else {
        setS(defaults);
      }
    }
  }

  async function createHousehold(userId) {
    const { data, error } = await supabase
      .from("households")
      .insert({ created_by: userId, inputs: defaults })
      .select("id, join_code")
      .single();
    if (!error && data) {
      setHousehold({ id: data.id, join_code: data.join_code });
      await supabase.from("household_members").insert({ user_id: userId, household_id: data.id });
      setS(defaults);
    }
  }

  async function joinHouseholdByCode(userId, code) {
    const { data: hh } = await supabase
      .from("households")
      .select("id, join_code, inputs")
      .eq("join_code", code.toUpperCase())
      .single();
    if (!hh) { setJoinError("Code not found — double-check and try again."); return false; }
    await supabase.from("household_members").insert({ user_id: userId, household_id: hh.id });
    setHousehold({ id: hh.id, join_code: hh.join_code });
    if (hh.inputs && Object.keys(hh.inputs).length > 0) {
      setS({ ...publicDefaults, ...hh.inputs });
    }
    // Clean up the URL
    window.history.replaceState({}, "", window.location.pathname);
    setShowJoinBox(false);
    return true;
  }

  async function handleJoinSubmit() {
    if (!user) { signInWithGoogle(); return; }
    setJoinError("");
    await joinHouseholdByCode(user.id, joinInput.trim());
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

  const saveToCloud = useCallback(async (state, householdId) => {
    setSaveStatus("saving");
    const { error } = await supabase
      .from("households")
      .update({ inputs: state, updated_at: new Date().toISOString() })
      .eq("id", householdId);
    setSaveStatus(error ? "error" : "saved");
  }, []);

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

  // Clear MC results whenever inputs change (they're stale)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => { setMc(null); setMcReverse(null); }, [inputs]);

  // Autosave: localStorage always; cloud save (debounced 1.5s) when in a household
  useEffect(() => {
    saveToStorage(s);
    if (household) {
      setSaveStatus("saving");
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveToCloud(s, household.id), 1500);
    }
  }, [s, household, saveToCloud]);

  const update = (k) => (v) => setS((prev) => ({ ...prev, [k]: v }));

  function resetToDefaults() {
    if (window.confirm("Reset all inputs to defaults? This cannot be undone.")) {
      localStorage.removeItem(STORAGE_KEY);
      setS(household ? defaults : publicDefaults);
    }
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
  // Year 1 total: monthly only (equity starts yr 4, bonus starts yr 1)
  const startingAnnualContrib = s.startingMonthly * 12 + bonusAfterTax;
  // Year 4+ total (when equity kicks in)
  const fullAnnualContrib = s.startingMonthly * 12 + bonusAfterTax + equityAfterTax;

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

  return (
    <PrivacyContext.Provider value={hidden}>
    <div className="min-h-screen bg-slate-50 p-4 text-slate-900" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">FAT FIRE Calculator</h1>
              <p className="text-sm text-slate-600">
                Canadian tax-optimized · RRSP meltdown strategy · All figures in today's dollars
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs flex-wrap justify-end">

              {/* Save status */}
              {household && (
                <span className={
                  saveStatus === "saved" ? "text-emerald-600" :
                  saveStatus === "saving" ? "text-slate-400 italic" :
                  "text-red-500"
                }>
                  {saveStatus === "saved" ? "✓ Cloud saved" :
                   saveStatus === "saving" ? "Saving…" :
                   "Save failed"}
                </span>
              )}
              {!user && <span className="text-slate-400">Auto-saved locally</span>}

              {/* Share / invite link */}
              {household && (
                <div className="relative">
                  <button
                    onClick={copyShareUrl}
                    className="flex items-center gap-1 px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
                    title={shareUrl}
                  >
                    🔗 {copied ? "Copied!" : "Share"}
                  </button>
                </div>
              )}

              {/* Join a household */}
              {user && !household && (
                <button
                  onClick={() => setShowJoinBox(j => !j)}
                  className="px-2 py-1 rounded border border-slate-300 text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  Join household
                </button>
              )}
              {!user && pendingJoinCode && (
                <span className="text-amber-600 font-medium">Sign in to join household</span>
              )}

              {/* Auth */}
              {authLoading ? null : user ? (
                <div className="flex items-center gap-2">
                  {user.user_metadata?.avatar_url && (
                    <img src={user.user_metadata.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                  )}
                  <span className="text-slate-600 max-w-[140px] truncate">{user.email}</span>
                  <button
                    onClick={signOut}
                    className="px-2 py-1 rounded border border-slate-300 text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <button
                  onClick={signInWithGoogle}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors font-medium shadow-sm"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Sign in with Google
                </button>
              )}

              <button
                onClick={() => setHidden(h => !h)}
                className={"px-2 py-1 rounded border transition-colors font-medium " + (hidden ? "border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100" : "border-slate-300 text-slate-500 hover:bg-slate-100 hover:text-slate-700")}
              >
                {hidden ? "🙈 Hidden" : "👁 Hide"}
              </button>
              <button
                onClick={resetToDefaults}
                className="px-2 py-1 rounded border border-slate-300 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                Reset
              </button>
            </div>

            {/* Join box */}
            {showJoinBox && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Enter join code"
                  value={joinInput}
                  onChange={e => setJoinInput(e.target.value.toUpperCase())}
                  className="border border-slate-300 rounded px-2 py-1 text-sm w-36 font-mono tracking-wider"
                />
                <button
                  onClick={handleJoinSubmit}
                  className="px-3 py-1 rounded bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700"
                >
                  Join
                </button>
                {joinError && <span className="text-red-500 text-xs">{joinError}</span>}
              </div>
            )}

            {/* Pending join code banner for signed-out users */}
            {!user && pendingJoinCode && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                You've been invited to join a household. Sign in with Google to accept.
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* ── Inputs panel ── */}
          <div className="col-span-12 lg:col-span-4 space-y-3">

            <Section title="Personal">
              <label className="flex items-center justify-between gap-2 text-sm py-0.5">
                <span className="text-slate-700">Your name</span>
                <input
                  type="text"
                  value={s.yourName}
                  onChange={(e) => update("yourName")(e.target.value)}
                  className="border border-slate-300 rounded px-2 py-1 text-sm w-28 text-right"
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm py-0.5">
                <span className="text-slate-700">Spouse's name</span>
                <input
                  type="text"
                  value={s.spouseName}
                  onChange={(e) => update("spouseName")(e.target.value)}
                  className="border border-slate-300 rounded px-2 py-1 text-sm w-28 text-right"
                />
              </label>
              <NumInput label={`${s.yourName}'s current age`} value={s.currentAge} onChange={update("currentAge")} small />
              <NumInput label={`${s.spouseName}'s current age`} value={s.spouseCurrentAge} onChange={update("spouseCurrentAge")} small />
              <NumInput label="End-of-plan age" value={s.deathAge} onChange={update("deathAge")} small />
            </Section>

            <Section title="Income & tax (working years)">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1 pb-0.5">{s.yourName}</div>
              <NumInput label="Base pay" value={s.yourBase} onChange={update("yourBase")} prefix="$" step={1000} />
              <PctInput label="Bonus (% of base)" value={s.yourBonusPct} onChange={update("yourBonusPct")} />
              <PctInput label="Equity vesting (% of base)" value={s.yourEquityPct} onChange={update("yourEquityPct")} hint="invested as vested" />

              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-2 pb-0.5">{s.spouseName}</div>
              <NumInput label="Base pay" value={s.spouseBase} onChange={update("spouseBase")} prefix="$" step={1000} />
              <PctInput label="Bonus (% of base)" value={s.spouseBonusPct} onChange={update("spouseBonusPct")} />
              <PctInput label="Equity vesting (% of base)" value={s.spouseEquityPct} onChange={update("spouseEquityPct")} hint="invested as vested" />

              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-2 pb-0.5">Tax</div>
              <PctInput label="Blended tax rate" value={s.taxRate} onChange={update("taxRate")} />
              <PctInput label="Income growth (real)" value={s.incomeGrowth} onChange={update("incomeGrowth")} />

              <div className="pt-2 mt-1 border-t border-slate-200 space-y-0.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>{s.yourName}'s total comp (base + bonus + equity)</span>
                  <span className="font-mono">{fmtMoney(s.yourBase + yourBonusAmt + yourEquityAmt)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>{s.spouseName}'s total comp</span>
                  <span className="font-mono">{fmtMoney(s.spouseBase + spouseBonusAmt + spouseEquityAmt)}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-800 pt-1 border-t border-slate-100">
                  <span>Household gross</span>
                  <span className="font-mono">{fmtMoney(householdGross)}</span>
                </div>
              </div>
            </Section>

            <Section title="Expenses (today's $)">
              <ExpenseRow label="Mortgage" value={s.mortgage} onChange={update("mortgage")} freq="monthly" />
              <div className="pl-4 pb-1 border-l-2 border-slate-100 ml-1 space-y-0.5">
                <NumInput label="Principal remaining" value={s.mortgagePrincipal} onChange={update("mortgagePrincipal")} prefix="$" step={1000} />
                <PctInput label="Interest rate" value={s.mortgageRate} onChange={update("mortgageRate")} />
                <NumInput label="Extra payment / mo" value={s.extraMortgagePayment} onChange={update("extraMortgagePayment")} prefix="$" step={100} hint="reduces contributions by same amount" />
                <div className="text-xs text-slate-600 flex justify-between pt-1">
                  <span>Projected payoff</span>
                  <span className="font-mono">
                    {isFinite(mortgagePayoff)
                      ? `age ${mortgagePayoff} (${Math.round(solved.mortgagePayoffMonths)} mo)`
                      : "payment doesn't cover interest"}
                  </span>
                </div>
                {yearsSaved > 0 && (
                  <div className="text-xs text-emerald-700 flex justify-between">
                    <span>vs. no extra payment</span>
                    <span className="font-mono font-semibold">{yearsSaved} yr{yearsSaved !== 1 ? "s" : ""} earlier</span>
                  </div>
                )}
              </div>
              <ExpenseRow label="Maintenance / condo" value={s.maintenance} onChange={update("maintenance")} freq="monthly" />
              <ExpenseRow label="Property tax" value={s.propertyTax} onChange={update("propertyTax")} freq="monthly" />
              <ExpenseRow label="Utilities / insurance" value={s.utilities} onChange={update("utilities")} freq="monthly" />
              <ExpenseRow label="Transportation" value={s.transport} onChange={update("transport")} freq="monthly" />
              <ExpenseRow label="Groceries" value={s.groceries} onChange={update("groceries")} freq="monthly" />
              <ExpenseRow label="Dining / entertainment" value={s.dining} onChange={update("dining")} freq="monthly" />
              <ExpenseRow label="Clothing / misc" value={s.clothing} onChange={update("clothing")} freq="monthly" />
              <ExpenseRow label="Childcare / kids' activities" value={s.childcare} onChange={update("childcare")} freq="monthly" step={100} />
              <ExpenseRow label="Subscriptions / tech / phones" value={s.subscriptions} onChange={update("subscriptions")} freq="monthly" step={50} />
              <ExpenseRow label="Personal care / gym" value={s.personalCare} onChange={update("personalCare")} freq="monthly" step={50} />
              <ExpenseRow label="Travel" value={s.travel} onChange={update("travel")} freq="annual" step={1000} />
              <ExpenseRow label="RESP contributions" value={s.resp} onChange={update("resp")} freq="annual" step={500} />
              <ExpenseRow label="Gifts / misc (annual)" value={s.oneTimeMisc} onChange={update("oneTimeMisc")} freq="annual" step={1000} />
              <div className="pt-2 mt-1 border-t border-slate-200 space-y-0.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Monthly (×12)</span>
                  <span className="font-mono">{fmtMoney(inputs.monthlyExpensesTotal * 12)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>One-time annual (incl. RESP)</span>
                  <span className="font-mono">{fmtMoney(inputs.oneTimeAnnualTotal)}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-800 pt-1 border-t border-slate-100">
                  <span>Working years total / yr</span>
                  <span className="font-mono">{fmtMoney(grandAnnual)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>After mortgage payoff</span>
                  <span className="font-mono">{fmtMoney(postMortgageAnnual)}</span>
                </div>
                <div className="flex justify-between font-semibold text-emerald-700 pt-1 border-t border-slate-100">
                  <span>Retirement spend / yr</span>
                  <span className="font-mono">{fmtMoney(grandAnnual + (inputs.retirementSpendDelta || 0))}</span>
                </div>
                <div className="text-slate-400 text-xs">Retirement spend swaps travel for snowbird budget, adds healthcare, removes RESP.</div>
              </div>
            </Section>

            <Section title="Retirement-specific spend" defaultOpen={false}>
              <div className="text-xs text-slate-500 mb-2">These replace or supplement your working-years budget once retired. The model uses these figures during decumulation.</div>
              <ExpenseRow label="Snowbird / extended travel" value={s.retirementTravel} onChange={update("retirementTravel")} freq="annual" step={1000} />
              <ExpenseRow label="Private health / dental / vision" value={s.retirementHealthcare} onChange={update("retirementHealthcare")} freq="annual" step={500} />
              <div className="pt-2 mt-1 border-t border-slate-100 space-y-0.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Working-years travel budget</span>
                  <span className="font-mono">{fmtMoney(s.travel)}/yr</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>RESP (drops off in retirement)</span>
                  <span className="font-mono">−{fmtMoney(s.resp || 0)}/yr</span>
                </div>
                <div className={`flex justify-between font-semibold pt-1 border-t border-slate-100 ${(inputs.retirementSpendDelta || 0) > 0 ? "text-rose-600" : "text-emerald-700"}`}>
                  <span>Net retirement spend change</span>
                  <span className="font-mono">{(inputs.retirementSpendDelta || 0) > 0 ? "+" : ""}{fmtMoney(inputs.retirementSpendDelta || 0)}/yr</span>
                </div>
              </div>
            </Section>

            <Section title="Starting portfolio (by person)">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1 pb-0.5">{s.yourName}</div>
              <NumInput label="RRSP" value={s.yourRrspStart} onChange={update("yourRrspStart")} prefix="$" step={10000} />
              <NumInput label="TFSA" value={s.yourTfsaStart} onChange={update("yourTfsaStart")} prefix="$" step={10000} />
              <NumInput label="Non-registered" value={s.yourNrStart} onChange={update("yourNrStart")} prefix="$" step={10000} />
              <div className="text-xs text-slate-500 flex justify-between pb-1">
                <span>{s.yourName}'s subtotal</span>
                <span className="font-mono">{fmtMoney((s.yourRrspStart||0) + (s.yourTfsaStart||0) + (s.yourNrStart||0))}</span>
              </div>

              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-2 pb-0.5 border-t border-slate-100 mt-1">{s.spouseName}</div>
              <NumInput label="RRSP" value={s.spouseRrspStart} onChange={update("spouseRrspStart")} prefix="$" step={10000} />
              <NumInput label="TFSA" value={s.spouseTfsaStart} onChange={update("spouseTfsaStart")} prefix="$" step={10000} />
              <NumInput label="Non-registered" value={s.spouseNrStart} onChange={update("spouseNrStart")} prefix="$" step={10000} />
              <div className="text-xs text-slate-500 flex justify-between pb-1">
                <span>{s.spouseName}'s subtotal</span>
                <span className="font-mono">{fmtMoney((s.spouseRrspStart||0) + (s.spouseTfsaStart||0) + (s.spouseNrStart||0))}</span>
              </div>

              <div className="pt-1 mt-1 border-t border-slate-200 text-xs text-slate-600 flex justify-between">
                <span className="font-semibold text-slate-800">Household total</span>
                <span className="font-mono font-semibold text-slate-800">{fmtMoney((s.yourRrspStart||0)+(s.yourTfsaStart||0)+(s.yourNrStart||0)+(s.spouseRrspStart||0)+(s.spouseTfsaStart||0)+(s.spouseNrStart||0))}</span>
              </div>
            </Section>

            <Section title="Contributions">
              <NumInput label="Monthly (starting)" value={s.startingMonthly} onChange={update("startingMonthly")} prefix="$" step={100} />
              <PctInput label="Monthly contrib growth" value={s.contribGrowth} onChange={update("contribGrowth")} />

              {/* Computed read-only lines */}
              <div className="pt-2 mt-1 border-t border-slate-100 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>
                    Bonus / yr <span className="text-slate-400">(after-tax, from yr 1)</span>
                  </span>
                  <span className="font-mono">{fmtMoney(bonusAfterTax)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>
                    Equity / yr <span className="text-slate-400">(after-tax, from yr 4)</span>
                  </span>
                  <span className="font-mono">{equityAfterTax > 0 ? fmtMoney(equityAfterTax) : "—"}</span>
                </div>
                <div className="text-slate-400 text-xs">Both grow with income growth rate. Set % in Income section.</div>
              </div>

              <div className="pt-2 mt-1 border-t border-slate-200 space-y-1 text-xs">
                {s.extraMortgagePayment > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>Extra mortgage payment / yr</span>
                    <span className="font-mono">−{fmtMoney(s.extraMortgagePayment * 12)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-700">
                  <span>Net annual contribution (yrs 1–3)</span>
                  <span className="font-mono font-semibold">{fmtMoney(Math.max(0, startingAnnualContrib - s.extraMortgagePayment * 12))}</span>
                </div>
                {equityAfterTax > 0 && (
                  <div className="flex justify-between font-semibold text-slate-800">
                    <span>Net annual contribution (yr 4+)</span>
                    <span className="font-mono">{fmtMoney(Math.max(0, fullAnnualContrib - s.extraMortgagePayment * 12))}</span>
                  </div>
                )}
                <div className="text-slate-500 mt-1">Waterfall: TFSA room → RRSP room → Non-reg overflow.</div>
              </div>
            </Section>

            <Section title="Contribution room (registered plans)">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1 pb-0.5">Existing carry-forward room</div>
              <div className="text-xs text-slate-500 mb-1">{s.yourName}</div>
              <NumInput label="RRSP room" value={s.yourRrspRoomExisting} onChange={update("yourRrspRoomExisting")} prefix="$" step={1000} hint="(carry-forward)" />
              <NumInput label="TFSA room" value={s.yourTfsaRoomExisting} onChange={update("yourTfsaRoomExisting")} prefix="$" step={1000} hint="(carry-forward)" />
              <div className="text-xs text-slate-500 mt-1.5 mb-1">{s.spouseName}</div>
              <NumInput label="RRSP room" value={s.spouseRrspRoomExisting} onChange={update("spouseRrspRoomExisting")} prefix="$" step={1000} hint="(carry-forward)" />
              <NumInput label="TFSA room" value={s.spouseTfsaRoomExisting} onChange={update("spouseTfsaRoomExisting")} prefix="$" step={1000} hint="(carry-forward)" />

              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-2 pb-0.5 border-t border-slate-100 mt-2">Annual new room (today's $)</div>
              <div className="text-xs text-slate-500 mb-1">{s.yourName}</div>
              <NumInput label="RRSP room / yr" value={s.yourRrspRoomAnnual} onChange={update("yourRrspRoomAnnual")} prefix="$" step={500} />
              <NumInput label="TFSA room / yr" value={s.yourTfsaRoomAnnual} onChange={update("yourTfsaRoomAnnual")} prefix="$" step={500} />
              <div className="text-xs text-slate-500 mt-1.5 mb-1">{s.spouseName}</div>
              <NumInput label="RRSP room / yr" value={s.spouseRrspRoomAnnual} onChange={update("spouseRrspRoomAnnual")} prefix="$" step={500} />
              <NumInput label="TFSA room / yr" value={s.spouseTfsaRoomAnnual} onChange={update("spouseTfsaRoomAnnual")} prefix="$" step={500} />

              <div className="pt-2 mt-2 border-t border-slate-100 space-y-0.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Total existing RRSP room</span>
                  <span className="font-mono">{fmtMoney(s.yourRrspRoomExisting + s.spouseRrspRoomExisting)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Total existing TFSA room</span>
                  <span className="font-mono">{fmtMoney(s.yourTfsaRoomExisting + s.spouseTfsaRoomExisting)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Total new RRSP room / yr</span>
                  <span className="font-mono">{fmtMoney(s.yourRrspRoomAnnual + s.spouseRrspRoomAnnual)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Total new TFSA room / yr</span>
                  <span className="font-mono">{fmtMoney(s.yourTfsaRoomAnnual + s.spouseTfsaRoomAnnual)}</span>
                </div>
              </div>
              <div className="pt-1 mt-1 text-xs text-slate-500">
                Annual new room inflates with inflation (CRA indexes limits).
              </div>
            </Section>

            <Section title="Market assumptions">
              <PctInput label="Nominal return" value={s.investmentReturn} onChange={update("investmentReturn")} />
              <PctInput label="Inflation" value={s.inflation} onChange={update("inflation")} />
              <div className="pt-1 mt-1 border-t border-slate-100" />
              <NumInput label="Terminal target (age 90)" value={s.terminalTargetToday} onChange={update("terminalTargetToday")} prefix="$" step={25000} hint="(today's $)" />
              <div className="text-xs text-slate-500">
                Solver finds the earliest age where spending is fully covered <em>and</em> portfolio ends at or above this amount. Lower = earlier retirement.
              </div>
            </Section>

            <Section title="Retirement income">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1 pb-0.5">CPP</div>
              <NumInput label="Combined CPP (today's $/yr)" value={s.cppAmountToday} onChange={update("cppAmountToday")} prefix="$" step={1000} />
              <NumInput label="CPP start age" value={s.cppStartAge} onChange={update("cppStartAge")} small hint="(70 = optimal)" />
              <InfoBox>
                Delaying CPP to 70 is typically optimal with sufficient assets — it becomes a guaranteed inflation-linked bond and reduces portfolio pressure late in retirement.
              </InfoBox>

              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-2 pb-0.5">OAS (Old Age Security)</div>
              <NumInput label="OAS per person (today's $/yr)" value={s.oasAmountToday} onChange={update("oasAmountToday")} prefix="$" step={100} />
              <NumInput label="OAS start age" value={s.oasStartAge} onChange={update("oasStartAge")} small hint="(65 or 70)" />
              <NumInput label="Clawback threshold / person" value={s.oasClawbackThreshold} onChange={update("oasClawbackThreshold")} prefix="$" step={1000} hint="(2026: $95,323)" />
              <InfoBox>
                OAS is taxable as ordinary income and subject to a 15% clawback on net income above ~$95,323/person (2026). Deferring to 70 increases OAS by 36% and avoids early clawback if RRIF income is high. The model estimates clawback based on projected RRIF + CPP + pension income.
              </InfoBox>

              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-2 pb-0.5">Defined Benefit Pension</div>
              <NumInput label="Monthly pension amount" value={s.pensionMonthly} onChange={update("pensionMonthly")} prefix="$" step={100} hint="(today's $)" />
              <NumInput label="Pension start age" value={s.pensionStartAge} onChange={update("pensionStartAge")} small />
              {s.pensionMonthly > 0 && (
                <div className="text-xs text-slate-600 flex justify-between pt-0.5">
                  <span>Annual pension (today's $)</span>
                  <span className="font-mono font-semibold">{fmtMoney(s.pensionMonthly * 12)}</span>
                </div>
              )}
            </Section>

            <Section title="Windfalls" defaultOpen={false}>
              <div className="text-xs text-slate-500 mb-2">Enter an expected lump sum (inheritance, property sale, RSU cliff, etc.). The model will recommend the optimal allocation to minimize your retirement age.</div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1 pb-0.5">{s.yourName}</div>
              <NumInput label="Windfall amount" value={s.yourWindfallAmount} onChange={update("yourWindfallAmount")} prefix="$" step={25000} />
              <NumInput label={`${s.yourName}'s age at receipt`} value={s.yourWindfallAge} onChange={update("yourWindfallAge")} small />
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-2 pb-0.5">{s.spouseName}</div>
              <NumInput label="Windfall amount" value={s.spouseWindfallAmount} onChange={update("spouseWindfallAmount")} prefix="$" step={25000} />
              <NumInput label={`${s.spouseName}'s age at receipt`} value={s.spouseWindfallAge} onChange={update("spouseWindfallAge")} small />
              <div className="text-xs text-slate-400 mt-2">Windfall does not alter the main simulation — recommendations appear below.</div>
            </Section>

            {/* Windfall advisor — inline below inputs */}
            {(yourWindfallAdvice || spouseWindfallAdvice) && (() => {
              function WindfallTable({ advice, label, age, amount }) {
                if (!advice) return null;
                const { base, alternatives } = advice;
                const best = alternatives[0];
                return (
                  <div>
                    <div className="text-xs font-semibold text-slate-700 mb-1">
                      {label} — {fmtMoney(amount)} at age {age}
                    </div>
                    <div className="text-xs text-slate-500 mb-2">
                      Base (no windfall): retire age <span className="font-semibold">{base.age ?? "—"}</span>,
                      portfolio <span className="font-semibold">{fmtMoney(base.portfolioAtRetirement)}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Allocation</th>
                            <th className="px-2 py-1.5 text-right font-semibold text-slate-600">Retire age</th>
                            <th className="px-2 py-1.5 text-right font-semibold text-slate-600">vs. base</th>
                            <th className="px-2 py-1.5 text-right font-semibold text-slate-600">Portfolio</th>
                            <th className="px-2 py-1.5 text-right font-semibold text-slate-600">vs. base</th>
                          </tr>
                        </thead>
                        <tbody>
                          {alternatives.map((a, i) => {
                            const isBest = i === 0;
                            return (
                              <tr key={a.label} className={"border-t border-slate-100 " + (isBest ? "bg-emerald-50" : "")}>
                                <td className="px-2 py-1.5">
                                  <div className="font-semibold">
                                    {isBest && <span className="text-emerald-600 mr-1">★</span>}
                                    {a.label}
                                  </div>
                                  <div className="text-slate-400 text-xs leading-tight">{a.description}</div>
                                </td>
                                <td className="px-2 py-1.5 text-right font-mono">{a.age ?? "—"}</td>
                                <td className="px-2 py-1.5 text-right font-mono">
                                  {a.ageDiff === null ? "—" : a.ageDiff === 0
                                    ? <span className="text-slate-400">—</span>
                                    : <span className={a.ageDiff < 0 ? "text-emerald-600 font-semibold" : "text-red-500"}>
                                        {a.ageDiff > 0 ? "+" : ""}{a.ageDiff}yr
                                      </span>
                                  }
                                </td>
                                <td className="px-2 py-1.5 text-right font-mono">{fmtMoney(a.portfolioAtRetirement)}</td>
                                <td className="px-2 py-1.5 text-right font-mono">
                                  {a.portDiff === null ? "—" : (
                                    <span className={a.portDiff >= 0 ? "text-emerald-600" : "text-red-500"}>
                                      {a.portDiff >= 0 ? "+" : ""}{fmtMoney(a.portDiff)}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-1.5 text-xs text-slate-500">
                      ★ Recommended: <span className="font-semibold text-emerald-700">{best.label}</span>
                      {best.ageDiff !== null && best.ageDiff < 0 && (
                        <span> — retires <span className="font-semibold">{Math.abs(best.ageDiff)} yr{Math.abs(best.ageDiff) !== 1 ? "s" : ""} earlier</span></span>
                      )}
                      {best.ageDiff === 0 && <span> — same retirement age, largest portfolio</span>}
                    </div>
                  </div>
                );
              }

              return (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3">
                  <div className="text-sm font-semibold text-slate-800 mb-1">Windfall Allocation Advisor</div>
                  <div className="text-xs text-slate-500 mb-3">
                    ★ = option that minimises retirement age. Ties broken by largest portfolio. Not included in main simulation.
                  </div>
                  <div className="space-y-5">
                    <WindfallTable advice={yourWindfallAdvice}   label={`${s.yourName}'s windfall`}   age={s.yourWindfallAge}   amount={s.yourWindfallAmount} />
                    <WindfallTable advice={spouseWindfallAdvice} label={`${s.spouseName}'s windfall`} age={s.spouseWindfallAge} amount={s.spouseWindfallAmount} />
                  </div>
                </div>
              );
            })()}

            <Section title="Withdrawal tax rates">
              <PctInput label="RRSP/RRIF tax rate" value={s.rrspTaxRate} onChange={update("rrspTaxRate")} hint="(on withdrawals)" />
              <PctInput label="NR cap-gains effective rate" value={s.nrCapGainsRate} onChange={update("nrCapGainsRate")} hint="(50% inclusion × marginal)" />
              <PctInput label="CPP + pension tax rate" value={s.retirementIncomeTaxRate} onChange={update("retirementIncomeTaxRate")} hint="(ordinary income)" />
              <InfoBox>
                <strong>CPP, OAS &amp; DB pension are fully taxable</strong> as ordinary income. The model deducts this tax before netting against spending — your portfolio covers the remainder. RRSP refunds are automatically reinvested (TFSA first, then non-reg).
              </InfoBox>
            </Section>
          </div>

          {/* ── Results panel ── */}
          <div className="col-span-12 lg:col-span-8 space-y-3">

            {/* Dashboard cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 md:col-span-2">
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Earliest sustainable retirement age</div>
                {solved.age !== null ? (() => {
                  const retRow = solved.rows.find(r => r.age === solved.age);
                  const portfolioAtRetirement = retRow ? retRow.endTotal / retRow.infFactor : null;
                  // Per-person retirement ages — offset from household retirement year
                  const yourRetireAge = solved.age;
                  const spouseRetireAge = solved.age + (s.spouseCurrentAge - s.currentAge);
                  return (
                    <div>
                      <div className="flex items-baseline gap-4 flex-wrap">
                        <div className="text-5xl font-bold text-emerald-700">{solved.age}</div>
                        <div className="text-sm text-slate-700">
                          <div>{solved.age - s.currentAge} year{solved.age - s.currentAge === 1 ? "" : "s"} away.</div>
                          <div className="text-slate-600">
                            Portfolio reaches{" "}
                            <span className="font-semibold">{fmtMoney(solved.terminalBal / Math.pow(1 + s.inflation, s.deathAge - s.currentAge))}</span>{" "}
                            at age {s.deathAge} (today's $). Target: {fmtMoney(s.terminalTargetToday)}.
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-4 text-sm flex-wrap">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xs text-slate-500">{s.yourName}:</span>
                          <span className="font-semibold text-emerald-700">age {yourRetireAge}</span>
                          <span className="text-xs text-slate-400">({yourRetireAge - s.currentAge} yrs)</span>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xs text-slate-500">{s.spouseName}:</span>
                          <span className="font-semibold text-emerald-700">age {spouseRetireAge}</span>
                          <span className="text-xs text-slate-400">({spouseRetireAge - s.spouseCurrentAge} yrs)</span>
                        </div>
                      </div>
                      {portfolioAtRetirement !== null && (
                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-baseline gap-3">
                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-500 mb-0.5">Portfolio at retirement</div>
                            <div className="text-2xl font-bold text-slate-700">{fmtMoney(portfolioAtRetirement)}</div>
                          </div>
                          <div className="text-xs text-slate-500">(today's $, end of age {solved.age})</div>
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <div>
                    <div className="text-3xl font-bold text-red-600">Not reachable</div>
                    <div className="text-sm text-slate-600">No retirement age draws the portfolio down to {fmtMoney(s.terminalTargetToday)} (today's $) by age {s.deathAge} while covering all spending.</div>
                  </div>
                )}
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Mortgage payoff</div>
                {isFinite(mortgagePayoff) ? (
                  <>
                    <div className="text-3xl font-bold text-slate-800">age {mortgagePayoff}</div>
                    <div className="text-xs text-slate-500 mt-1 flex gap-3 flex-wrap">
                      <span>{s.yourName}: <span className="font-semibold text-slate-700">age {mortgagePayoff}</span></span>
                      <span>{s.spouseName}: <span className="font-semibold text-slate-700">age {mortgagePayoff + (s.spouseCurrentAge - s.currentAge)}</span></span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      {mortgagePayoff - s.currentAge} yrs ({Math.round(solved.mortgagePayoffMonths)} mo).
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      Retirement spend drops from{" "}
                      <span className="font-mono">{fmtMoney(grandAnnual + (inputs.retirementSpendDelta || 0))}</span> →{" "}
                      <span className="font-mono">{fmtMoney(grandAnnual + (inputs.retirementSpendDelta || 0) - s.mortgage * 12)}</span>/yr after payoff.
                    </div>
                    {yearsSaved > 0 && (
                      <div className="text-xs text-emerald-700 mt-1 font-semibold">
                        Extra ${s.extraMortgagePayment.toLocaleString()}/mo saves {yearsSaved} yr{yearsSaved !== 1 ? "s" : ""}.
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-lg font-bold text-red-600">Never</div>
                    <div className="text-xs text-slate-600">Payment doesn't cover interest.</div>
                  </>
                )}
              </div>
            </div>

            {/* Drawdown strategy legend */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-800 mb-2">Drawdown Strategy — Canadian Tax-Optimized</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="font-semibold text-amber-700 mb-1">Phase 1: FAT FIRE → 65 (lowest-tax window)</div>
                  <div className="space-y-0.5 text-slate-700">
                    <div>① <strong>RRSP first</strong> — draw down before CPP/OAS arrives</div>
                    <div>② Non-registered — capital gains only 50% taxable</div>
                    <div>③ TFSA last — preserve the tax-free shield</div>
                  </div>
                  <div className="text-slate-500 mt-1">Uses the lowest-tax window to deplete RRSP before forced RRIF withdrawals and guaranteed income stack up.</div>
                </div>
                <div>
                  <div className="font-semibold text-blue-700 mb-1">Phase 2: 65+ (CPP / OAS / Pension in play)</div>
                  <div className="space-y-0.5 text-slate-700">
                    <div>① <strong>RRSP/RRIF</strong> — mandatory minimums enforced at 71+</div>
                    <div>② RRIF surplus above spending → TFSA → Non-reg</div>
                    <div>③ Remaining gap → Non-reg → <strong>TFSA</strong> (OAS clawback shield)</div>
                  </div>
                  <div className="text-slate-500 mt-1">OAS clawback ~$95k/person (2026). TFSA fills gaps tax-free.</div>
                </div>
              </div>
              {s.pensionMonthly > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-700">
                  <span className="font-semibold text-emerald-700">DB Pension:</span>{" "}
                  {fmtMoney(s.pensionMonthly)}/mo starting at age {s.pensionStartAge} reduces portfolio withdrawal pressure.
                  Pension + CPP combined = {fmtMoney((s.pensionMonthly * 12 + s.cppAmountToday))} /yr (today's $) from age {Math.max(s.pensionStartAge, s.cppStartAge)}.
                </div>
              )}
            </div>

            {/* Scenario comparison */}
            {(() => {
              const base = scenarios.find(sc => sc.label === "Base");
              return (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-800 mb-3">Scenario Pressure Test</div>
                  <div className="grid grid-cols-3 gap-3">
                    {scenarios.map(sc => {
                      const ageDiff = base && base.age !== null && sc.age !== null
                        ? sc.age - base.age : null;
                      const portDiff = base && base.portfolioAtRetirement !== null && sc.portfolioAtRetirement !== null
                        ? sc.portfolioAtRetirement - base.portfolioAtRetirement : null;
                      const isBase = sc.label === "Base";
                      return (
                        <div key={sc.label} className={"rounded-lg border p-3 " + (isBase ? "border-slate-300 bg-slate-50" : "border-slate-200")}>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{sc.label}</div>
                          <div className="text-xs text-slate-500 mb-2">{(sc.return * 100).toFixed(1)}% return · {(sc.inflation * 100).toFixed(1)}% inflation</div>
                          <div className="mb-2">
                            <div className="text-xs text-slate-500">Retirement age</div>
                            {sc.age !== null ? (
                              <div className="flex items-baseline gap-1.5 flex-wrap">
                                <span className={"text-2xl font-bold " + sc.color}>{sc.age}</span>
                                {!isBase && ageDiff !== null && (
                                  <span className={"text-sm font-semibold " + (ageDiff > 0 ? "text-red-500" : "text-emerald-600")}>
                                    {ageDiff > 0 ? "+" : ""}{ageDiff} yr{Math.abs(ageDiff) !== 1 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm font-bold text-red-600">Not reachable</span>
                            )}
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">Portfolio at retirement</div>
                            {sc.portfolioAtRetirement !== null ? (
                              <div className="flex items-baseline gap-1.5 flex-wrap">
                                <span className="text-sm font-semibold text-slate-700">{fmtMoney(sc.portfolioAtRetirement)}</span>
                                {!isBase && portDiff !== null && (
                                  <span className={"text-xs font-semibold " + (portDiff < 0 ? "text-red-500" : "text-emerald-600")}>
                                    {portDiff > 0 ? "+" : ""}{fmtMoney(portDiff)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-500">—</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    All other inputs held constant. Differences shown relative to Base scenario.
                  </div>
                </div>
              );
            })()}

            {/* Mortgage extra-payment sensitivity */}
            {(() => {
              const base = mortgageSensitivity[0]; // $0 extra
              return (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-800 mb-1">Mortgage Extra-Payment Sensitivity</div>
                  <div className="text-xs text-slate-500 mb-3">
                    Each extra $/mo accelerates payoff and reduces retirement spend, but also reduces annual contributions. Shows the net effect on retirement age and portfolio size.
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Extra / mo</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Extra / yr</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Mortgage payoff</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Retire age</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600">vs. $0 extra</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600">Portfolio at retirement</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600">vs. $0 extra</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mortgageSensitivity.map((row, i) => {
                          const isActive = row.extra === s.extraMortgagePayment;
                          const ageDiff = base.retirementAge !== null && row.retirementAge !== null
                            ? row.retirementAge - base.retirementAge : null;
                          const portDiff = base.portfolioAtRetirement !== null && row.portfolioAtRetirement !== null
                            ? row.portfolioAtRetirement - base.portfolioAtRetirement : null;
                          return (
                            <tr key={row.extra} className={"border-t border-slate-100 " + (isActive ? "bg-amber-50 font-semibold" : i % 2 === 0 ? "" : "bg-slate-50/50")}>
                              <td className="px-3 py-2 font-mono">
                                {isActive && <span className="mr-1 text-amber-600">▶</span>}
                                ${row.extra.toLocaleString()}
                              </td>
                              <td className="px-3 py-2 font-mono text-rose-600">
                                {row.extra > 0 ? `−${fmtMoney(row.extra * 12)}` : "—"}
                              </td>
                              <td className="px-3 py-2 font-mono">
                                {isFinite(row.payoffAge) ? `age ${row.payoffAge}` : "never"}
                              </td>
                              <td className="px-3 py-2 font-mono">
                                {row.retirementAge !== null ? row.retirementAge : "—"}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {i === 0 ? (
                                  <span className="text-slate-400">baseline</span>
                                ) : ageDiff !== null ? (
                                  <span className={ageDiff < 0 ? "text-emerald-600 font-semibold" : ageDiff > 0 ? "text-red-500" : "text-slate-400"}>
                                    {ageDiff === 0 ? "no change" : (ageDiff > 0 ? "+" : "") + ageDiff + " yr" + (Math.abs(ageDiff) !== 1 ? "s" : "")}
                                  </span>
                                ) : "—"}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {row.portfolioAtRetirement !== null ? fmtMoney(row.portfolioAtRetirement) : "—"}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {i === 0 ? (
                                  <span className="text-slate-400">baseline</span>
                                ) : portDiff !== null ? (
                                  <span className={portDiff >= 0 ? "text-emerald-600" : "text-red-500"}>
                                    {portDiff >= 0 ? "+" : ""}{fmtMoney(portDiff)}
                                  </span>
                                ) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Amber row = your current setting. Portfolio figures in today's dollars. All other inputs held constant.
                  </div>
                </div>
              );
            })()}

            {/* Monte Carlo */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-800">Monte Carlo Simulation</div>
                  <div className="text-xs text-slate-500">1,000 random return paths · 14% annual volatility · retiring at age {solved.age ?? "—"}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <span>Target success rate</span>
                    <div className="flex items-center gap-0.5">
                      <input
                        type="number"
                        min={50} max={99} step={5}
                        value={mcTargetRate}
                        onChange={(e) => setMcTargetRate(parseFloat(e.target.value) || 80)}
                        className="border border-slate-300 rounded px-2 py-1 text-right text-xs w-16"
                      />
                      <span className="text-slate-500">%</span>
                    </div>
                  </label>
                  <button
                    onClick={runMC}
                    disabled={mcRunning || solved.age === null}
                    className="px-3 py-1.5 text-xs font-semibold rounded bg-slate-800 text-white disabled:opacity-40 hover:bg-slate-700 transition-colors"
                  >
                    {mcRunning ? "Running…" : mc ? "Re-run" : "Run simulation"}
                  </button>
                </div>
              </div>

              {!mc && !mcRunning && (
                <div className="text-xs text-slate-400 italic">
                  Click "Run simulation" to stress-test your plan across 1,000 randomised market paths. Each path uses the same mean return as your base assumption but with realistic year-to-year volatility — capturing sequence-of-returns risk that the deterministic model misses.
                </div>
              )}

              {mcRunning && (
                <div className="text-xs text-slate-500 italic">Running 1,000 simulations…</div>
              )}

              {mc && (() => {
                const pct = Math.round(mc.successRate * 100);
                const barColor = pct >= 90 ? "bg-emerald-500" : pct >= 75 ? "bg-amber-400" : "bg-red-500";
                const labelColor = pct >= 90 ? "text-emerald-700" : pct >= 75 ? "text-amber-600" : "text-red-600";
                return (
                  <div className="space-y-4">
                    {/* Success rate hero */}
                    <div>
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className={"text-4xl font-bold " + labelColor}>{pct}%</span>
                        <span className="text-sm text-slate-600">of paths succeed</span>
                        <span className="text-xs text-slate-400">(portfolio ≥ {fmtMoney(inputs.terminalTargetToday)} at age {s.deathAge})</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3">
                        <div className={"h-3 rounded-full transition-all " + barColor} style={{ width: pct + "%" }} />
                      </div>
                      <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                        <span>0%</span>
                        <span className="text-amber-500">75% target</span>
                        <span className="text-emerald-600">90% target</span>
                        <span>100%</span>
                      </div>
                    </div>

                    {/* Terminal balance distribution */}
                    <div>
                      <div className="text-xs font-semibold text-slate-600 mb-2">Terminal portfolio distribution at age {s.deathAge} (today's $)</div>
                      <div className="grid grid-cols-5 gap-1.5 text-center">
                        {[
                          { label: "Worst 10%", val: mc.p10, color: "bg-red-50 border-red-200 text-red-700" },
                          { label: "25th pct",  val: mc.p25, color: "bg-amber-50 border-amber-200 text-amber-700" },
                          { label: "Median",    val: mc.p50, color: "bg-slate-50 border-slate-300 text-slate-800" },
                          { label: "75th pct",  val: mc.p75, color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
                          { label: "Best 10%",  val: mc.p90, color: "bg-emerald-50 border-emerald-300 text-emerald-800" },
                        ].map(({ label, val, color }) => (
                          <div key={label} className={"rounded border px-1.5 py-2 " + color}>
                            <div className="text-xs font-medium mb-1 leading-tight">{label}</div>
                            <div className="text-sm font-bold font-mono leading-tight">{fmtMoney(val)}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Reverse solver result */}
                    {mcReverse && (
                      <div className="bg-slate-50 rounded border border-slate-200 p-3">
                        <div className="text-xs font-semibold text-slate-700 mb-1">
                          Minimum portfolio for {mcTargetRate}% success rate
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-bold text-slate-800">{fmtMoney(mcReverse.portfolio)}</span>
                          <span className="text-xs text-slate-500">needed at retirement (age {solved.age})</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Achieved {Math.round(mcReverse.successRate * 100)}% success in verification run.
                        </div>
                        {(() => {
                          const retRow = solved.rows && solved.age ? solved.rows.find(r => r.age === solved.age) : null;
                          const projectedPortfolio = retRow ? retRow.endTotal / retRow.infFactor : null;
                          if (projectedPortfolio !== null) {
                            const gap = mcReverse.portfolio - projectedPortfolio;
                            return (
                              <div className={`text-xs mt-1 font-semibold ${gap > 0 ? "text-red-600" : "text-emerald-600"}`}>
                                Your projected portfolio: {fmtMoney(projectedPortfolio)} →{" "}
                                {gap > 0
                                  ? `${fmtMoney(gap)} short of target`
                                  : `${fmtMoney(-gap)} above target ✓`}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}

                    <div className="text-xs text-slate-400">
                      Returns drawn from a log-normal distribution (μ = {(inputs.investmentReturn * 100).toFixed(1)}% geometric mean, σ = 14%/yr). Inflation, spending, contributions and tax treatment are held at your base inputs. Re-run to get a fresh set of paths.
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Year-by-year table */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-200 flex justify-between items-center text-sm">
                <span className="font-semibold">Year-by-year projection</span>
                <span className="text-slate-500 text-xs">Today's $ (real)</span>
              </div>
              <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: "70vh" }}>
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold">Yr</th>
                      <th className="px-2 py-2 text-left font-semibold">Age</th>
                      <th className="px-2 py-2 text-left font-semibold">Phase</th>
                      <th className="px-2 py-2 text-right font-semibold">RRSP</th>
                      <th className="px-2 py-2 text-right font-semibold">TFSA</th>
                      <th className="px-2 py-2 text-right font-semibold">Non-reg</th>
                      <th className="px-2 py-2 text-right font-semibold">Total</th>
                      <th className="px-2 py-2 text-right font-semibold">Contrib</th>
                      <th className="px-2 py-2 text-right font-semibold">Withdraw</th>
                      <th className="px-2 py-2 text-right font-semibold">Spend</th>
                      <th className="px-2 py-2 text-right font-semibold">Guar. Income</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((r) => {
                      const isRetYr = r.age === solved.age;
                      const isDecum = r.phase === "decum";
                      const rowClass = isRetYr
                        ? "bg-amber-50 font-semibold"
                        : isDecum
                        ? "bg-slate-50"
                        : "";
                      const combinedIncome = r.cppDisp + r.pensionDisp + (r.oasDisp || 0);
                      const incomeTooltip = [
                        r.cppDisp > 0    ? `CPP: ${fmtMoney(r.cppDisp)}` : null,
                        r.pensionDisp > 0 ? `Pension: ${fmtMoney(r.pensionDisp)}` : null,
                        r.oasDisp > 0    ? `OAS: ${fmtMoney(r.oasDisp)}${r.oasClawbackDisp > 0 ? ` (clawback: −${fmtMoney(r.oasClawbackDisp)})` : ""}` : null,
                      ].filter(Boolean).join(" · ");
                      return (
                        <tr key={r.t} className={"border-t border-slate-100 " + rowClass}>
                          <td className="px-2 py-1 text-left">{r.year}</td>
                          <td className="px-2 py-1 text-left whitespace-nowrap">{r.age}/{r.spouseAge}</td>
                          <td className="px-2 py-1 text-left">
                            {isDecum ? (
                              <span className={r.drawdownPhase === "Phase 1" ? "text-amber-600" : "text-blue-600"}>
                                {r.drawdownPhase}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-2 py-1 text-right font-mono">{fmtMoney(r.rrspDisp)}</td>
                          <td className="px-2 py-1 text-right font-mono">{fmtMoney(r.tfsaDisp)}</td>
                          <td className="px-2 py-1 text-right font-mono">{fmtMoney(r.nrDisp)}</td>
                          <td className={"px-2 py-1 text-right font-mono font-semibold " + (r.endTotal <= 0 ? "text-red-600" : "text-slate-800")}>
                            {fmtMoney(r.endDisp)}
                          </td>
                          <td className="px-2 py-1 text-right font-mono text-emerald-700">
                            {r.totalContrib > 0 ? fmtMoney(r.contribDisp) : "—"}
                          </td>
                          <td className="px-2 py-1 text-right font-mono text-rose-700">
                            {r.totalWd > 0 ? fmtMoney(r.wdDisp) : "—"}
                          </td>
                          <td className="px-2 py-1 text-right font-mono">{fmtMoney(r.spendDisp)}</td>
                          <td className="px-2 py-1 text-right font-mono">
                            {combinedIncome > 0
                              ? <span title={incomeTooltip} className="cursor-help border-b border-dotted border-slate-400">{fmtMoney(combinedIncome)}</span>
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-3 py-2 text-xs text-slate-500 border-t border-slate-200 flex gap-4 flex-wrap">
                <span>Amber row = solved retirement year.</span>
                <span>Light grey = retirement years.</span>
                <span className="text-amber-600">Phase 1 = RRSP-first (pre-65).</span>
                <span className="text-blue-600">Phase 2 = CPP/OAS years (65+).</span>
                <span className="text-emerald-700">Green = contributions.</span>
                <span className="text-rose-700">Red = gross withdrawals.</span>
              </div>
            </div>

            {/* Model notes */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-slate-700">
              <div className="font-semibold text-slate-800 mb-1">Model notes</div>
              <div className="space-y-0.5">
                <div>• Working-years spend = {fmtMoney(grandAnnual)}/yr. Retirement spend = {fmtMoney(grandAnnual + (inputs.retirementSpendDelta || 0))}/yr (higher travel, healthcare; no RESP). Mortgage ({fmtMoney(s.mortgage * 12)}/yr) drops off after payoff — {s.yourName}: age {isFinite(mortgagePayoff) ? mortgagePayoff : "N/A"} / {s.spouseName}: age {isFinite(mortgagePayoff) ? mortgagePayoff + (s.spouseCurrentAge - s.currentAge) : "N/A"}.</div>
                <div>• Bonus ({fmtMoney(bonusAfterTax)}/yr after-tax) contributes from year 1. Equity ({fmtMoney(equityAfterTax)}/yr after-tax) contributes from year 4. Both grow with the income growth rate.</div>
                <div>• Contribution waterfall: TFSA → RRSP → Non-reg. Room inflates annually.</div>
                <div>• Drawdown: Phase 1 (pre-65) RRSP → NR → TFSA. Phase 2 (65+) RRSP/RRIF → NR → TFSA.</div>
                {s.pensionMonthly > 0 && <div>• DB Pension: {fmtMoney(s.pensionMonthly)}/mo ({fmtMoney(s.pensionMonthly * 12)}/yr today's $) from age {s.pensionStartAge}, inflation-indexed.</div>}
                <div>• CPP start age {s.cppStartAge}. Delaying to 70 maximizes the guaranteed inflation-protected income stream.</div>
                <div>• CPP ({fmtMoney(s.cppAmountToday)}/yr), OAS ({fmtMoney(s.oasAmountToday * 2)}/yr combined, from age {s.oasStartAge}), and DB pension ({fmtMoney(s.pensionMonthly * 12)}/yr) are all taxed at {Math.round(s.retirementIncomeTaxRate * 100)}%. OAS subject to 15% clawback above {fmtMoney(s.oasClawbackThreshold)}/person. Net after-tax combined at peak: {fmtMoney((s.cppAmountToday + s.oasAmountToday * 2 + s.pensionMonthly * 12) * (1 - s.retirementIncomeTaxRate))}/yr.</div>
                <div>• RRSP tax refunds (at {Math.round(s.taxRate * 100)}% marginal rate) are recycled into TFSA (if room available) then non-reg each accumulation year.</div>
                <div>• Single deterministic return path, no full CRA marginal brackets.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </PrivacyContext.Provider>
  );
}
