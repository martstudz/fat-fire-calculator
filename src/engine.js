// ---------- engine.js ----------
// Pure calculation logic — no React dependencies.
// Imported by FatFireCalculator.jsx (and independently testable).

import { fmt$ } from "./utils";

// ---------- mortgage helpers ----------

// Months remaining on a mortgage given principal, monthly payment, annual rate.
export function monthsToPayoff(principal, monthlyPayment, annualRate) {
  if (principal <= 0) return 0;
  if (monthlyPayment <= 0) return null;
  const r = annualRate / 12;
  if (r <= 0) return principal / monthlyPayment;
  const ratio = (principal * r) / monthlyPayment;
  if (ratio >= 1) return null;
  return -Math.log(1 - ratio) / Math.log(1 + r);
}

export function payoffAgeFromMonths(currentAge, months) {
  if (months === null || !isFinite(months)) return Infinity;
  return currentAge + Math.ceil(months / 12);
}

// ---------- RRIF ----------

// RRIF minimum withdrawal factors by age (CRA schedule)
// Source: CRA prescribed minimums. At 71: 5.28%, rising each year.
const RRIF_FACTORS = {
  71:0.0528,72:0.0540,73:0.0553,74:0.0567,75:0.0582,
  76:0.0598,77:0.0617,78:0.0636,79:0.0658,80:0.0682,
  81:0.0708,82:0.0738,83:0.0771,84:0.0808,85:0.0851,
  86:0.0899,87:0.0955,88:0.1021,89:0.1099,90:0.1099,
  91:0.1120,92:0.1320,93:0.1520,94:0.2000,
};

export function rrifMinimum(balance, age) {
  const factor = RRIF_FACTORS[Math.min(age, 94)] || 0.2;
  return balance * factor;
}

// ---------- core simulation ----------
// Simulate a full life path from currentAge through deathAge, retiring at retirementAge.
//
// DRAWDOWN STRATEGY — Canadian-optimized (RRSP-first):
//
//   Phase 1: Early retirement (FAT FIRE → 65)
//     LOW-TAX window. Draw RRSP first to cover spending gap, then Non-reg, then TFSA.
//
//   Phase 2: CPP/OAS years (65+)
//     CPP + OAS in play. RRIF mandatory minimums enforced at 71+.
//     Draw order: RRSP/RRIF → Non-reg → TFSA (OAS clawback shield).
//
//   TFSA is always the last resort / shock absorber.
//   Non-reg gains taxed at 50% inclusion × retirement marginal rate.
//
export function simulate(p, retirementAge) {
  const years = Math.max(0, p.deathAge - p.currentAge + 1);
  const totalAnnualSpendToday = p.monthlyExpensesTotal * 12;
  // Retirement spend can differ from working-life spend.
  // retirementSpendOverride: user-set annual figure in today's $; falls back to current spend.
  const retirementAnnualSpendToday = (p.retirementSpendOverride && p.retirementSpendOverride > 0)
    ? p.retirementSpendOverride
    : totalAnnualSpendToday;
  const payoffAge = payoffAgeFromMonths(
    p.currentAge,
    monthsToPayoff(p.mortgagePrincipal, p.mortgagePayment, p.mortgageRate)
  );
  const grossIncomeToday =
    p.yourBase + p.spouseBase +
    p.yourBase * p.yourBonusPct + p.spouseBase * p.spouseBonusPct +
    p.yourBase * (p.yourEquityPct || 0) + p.spouseBase * (p.spouseEquityPct || 0);

  let rrspBal = p.rrspStart;
  let tfsaBal = p.tfsaStart;
  let nrBal   = p.nrStart;
  let rrspRoom = p.rrspRoomExisting || 100000;
  let tfsaRoom = p.tfsaRoomExisting || 50000;
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

    rrspRoom += 32490 * inf;
    tfsaRoom += 7000  * inf;

    // Required spend. In retirement, use retirementAnnualSpendToday (mortgage already paid off by then).
    // Pre-retirement: use totalAnnualSpendToday, minus mortgage after payoff.
    let baseSpendToday = age >= retirementAge
      ? retirementAnnualSpendToday
      : (totalAnnualSpendToday - (age >= payoffAge ? p.mortgagePayment * 12 : 0));
    const requiredSpendNom = baseSpendToday * inf;

    const rrspStart = rrspBal, tfsaStart = tfsaBal, nrStart = nrBal;
    const startTotal = rrspStart + tfsaStart + nrStart;

    let cRrsp = 0, cTfsa = 0, cNr = 0;
    let wRrsp = 0, wTfsa = 0, wNr = 0;
    let gRrsp = 0, gTfsa = 0, gNr = 0;
    let cpp = 0, oas = 0, oasClawback = 0, afterTaxInc = 0, totalContrib = 0, totalWd = 0;
    let rowBonusC = 0, rowEquityC = 0, rrspRefund = 0;
    let drawdownPhase = "";

    if (age < retirementAge) {
      // ---- Accumulation ----
      rowBonusC  = baseBonusAfterTax * incGrow;
      rowEquityC = t >= 3 ? baseEquityAfterTax * incGrow : 0;
      const totalAvail = Math.max(0, monthly * 12 + rowBonusC + rowEquityC);

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
      cpp = age >= p.cppStartAge ? p.cppAmountToday * inf : 0;

      // OAS: both spouses eligible at oasStartAge
      const oasGross = age >= p.oasStartAge ? p.oasAmountToday * 2 * inf : 0;
      if (oasGross > 0) {
        const estRrifPerPerson = rrspBal > 0 ? (rrspBal * p.rrspTaxRate) / 2 : 0;
        const estIncomePerPerson = cpp / 2 + oasGross / 2 + estRrifPerPerson;
        const clawbackThresholdNom = p.oasClawbackThreshold * inf;
        const clawbackPerPerson = Math.max(0, (estIncomePerPerson - clawbackThresholdNom) * 0.15);
        oasClawback = Math.min(oasGross, clawbackPerPerson * 2);
        oas = Math.max(0, oasGross - oasClawback);
      }

      // CPP and OAS are taxable as ordinary income
      const guaranteedIncomeAfterTax = (cpp + oas) * (1 - p.retirementIncomeTaxRate);
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
      cpp, oas, oasClawback, afterTaxInc,
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
    mortgagePayoffMonths: monthsToPayoff(p.mortgagePrincipal, p.mortgagePayment, p.mortgageRate),
  };
}

export function solveEarliestAge(inputs) {
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
export function runMonteCarlo(inputs, retirementAge, runs = 1000, annualVolatility = 0.14, portfolioOverride = null) {
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
    const payoffAge = payoffAgeFromMonths(
      p.currentAge,
      monthsToPayoff(p.mortgagePrincipal, p.mortgagePayment, p.mortgageRate)
    );
    const totalAnnualSpendToday = p.monthlyExpensesTotal * 12;
    const retirementAnnualSpendToday = (p.retirementSpendOverride && p.retirementSpendOverride > 0)
      ? p.retirementSpendOverride
      : totalAnnualSpendToday;
    const baseBonusAfterTax =
      (p.yourBase * p.yourBonusPct + p.spouseBase * p.spouseBonusPct) * (1 - p.taxRate);
    const baseEquityAfterTax =
      (p.yourBase * (p.yourEquityPct || 0) + p.spouseBase * (p.spouseEquityPct || 0)) * (1 - p.taxRate);

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
    let rrspRoom = 100000, tfsaRoom = 50000;
    let monthly = p.startingMonthly;
    let depleted = false;

    for (let t = 0; t < years; t++) {
      const age   = p.currentAge + t;
      const inf   = Math.pow(1 + p.inflation, t);
      const ret   = returnSeq[t];
      const incGrow = Math.pow(1 + p.incomeGrowth, t);

      rrspRoom += 32490 * inf;
      tfsaRoom += 7000  * inf;

      let baseSpendToday = age >= retirementAge
        ? retirementAnnualSpendToday
        : (totalAnnualSpendToday - (age >= payoffAge ? p.mortgagePayment * 12 : 0));
      const requiredSpendNom = baseSpendToday * inf;

      const rrspStart = rrspBal, tfsaStart = tfsaBal, nrStart = nrBal;

      if (portfolioOverride !== null && age < retirementAge) {
        continue;
      }

      if (age < retirementAge) {
        const bonusC  = baseBonusAfterTax * incGrow;
        const equityC = t >= 3 ? baseEquityAfterTax * incGrow : 0;
        const totalAvail = Math.max(0, monthly * 12 + bonusC + equityC);

        let mcTfsa = Math.min(totalAvail, Math.max(0, tfsaRoom));
        let rem = totalAvail - mcTfsa;
        const mcRrsp = Math.min(rem, Math.max(0, rrspRoom));
        rem -= mcRrsp;
        let mcNr = rem;

        tfsaRoom -= mcTfsa; rrspRoom -= mcRrsp;

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
        const cpp = age >= p.cppStartAge ? p.cppAmountToday * inf : 0;
        // OAS + clawback
        const oasGross = age >= p.oasStartAge ? p.oasAmountToday * 2 * inf : 0;
        let oasNet = 0;
        if (oasGross > 0) {
          const estRrifPerPerson = rrspBal > 0 ? (rrspBal * p.rrspTaxRate) / 2 : 0;
          const estIncomePerPerson = cpp / 2 + oasGross / 2 + estRrifPerPerson;
          const clawbackThresholdNom = p.oasClawbackThreshold * inf;
          const clawbackPerPerson = Math.max(0, (estIncomePerPerson - clawbackThresholdNom) * 0.15);
          oasNet = Math.max(0, oasGross - Math.min(oasGross, clawbackPerPerson * 2));
        }
        const guaranteedIncomeAfterTax = (cpp + oasNet) * (1 - p.retirementIncomeTaxRate);
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
export function solvePortfolioForSuccessRate(inputs, retirementAge, targetSuccessRate = 0.8, annualVolatility = 0.14) {
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
export function solveScenarios(inputs) {
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
    return { ...sc, age: result.age, portfolioAtRetirement, rows: result.rows || [] };
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
export function solveWindfall(inputs, windfallAmount, windfallAge) {
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
  const projectedTfsaRoom = 50000 + 7000 * yearsToWindfall;
  const projectedRrspRoom = 100000 + 32490 * yearsToWindfall;

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
