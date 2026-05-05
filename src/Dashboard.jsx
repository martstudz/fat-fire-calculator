import React, { useContext, useState, useMemo } from "react";
import { PrivacyContext } from "./FatFireCalculator";
import { fmt$, fmtK } from "./utils";
import { NetWorthChart, AccountMixDonut, RoomBar, CashflowBars, DrawdownTimeline, CashRow, MiniStat } from "./DashCharts";

// ── Panel wrapper ─────────────────────────────────────────────────────────────

function Panel({ children, style }) {
  return <div className="dash-panel" style={style}>{children}</div>;
}

function PanelHead({ label, title, aside }) {
  return (
    <div className="dash-panel__head">
      <div>
        {label && <div className="label-xs">{label}</div>}
        {title && <h3 style={{ fontSize: "var(--step-2)", fontWeight: 600, marginTop: 4 }}>{title}</h3>}
      </div>
      {aside}
    </div>
  );
}

// ── LiveSlider ────────────────────────────────────────────────────────────────

function LiveSlider({ label, value, min, max, step, format, tone, sub, onChange }) {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  const toneColor = tone === "green" ? "var(--moss)" : tone === "sun" ? "var(--sun)" : "var(--dusk)";
  const toneInk   = tone === "green" ? "var(--moss-ink)" : tone === "sun" ? "var(--sun-ink)" : "var(--dusk-ink, var(--accent-deep))";
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="slider-row">
        <span className="text-meta" style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{label}</span>
        <span className="mono" style={{ fontSize: "var(--step-0)", fontWeight: 600, color: toneInk }}>{format(value)}</span>
      </div>
      {sub && <div className="text-meta" style={{ marginBottom: 6 }}>{sub}</div>}
      <div style={{ position: "relative", height: 6, background: "var(--paper-3)", borderRadius: 3, cursor: "pointer" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: toneColor, borderRadius: 3 }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", margin: 0 }} />
        <div style={{
          position: "absolute", top: "50%", left: `${pct}%`, transform: "translate(-50%, -50%)",
          width: 14, height: 14, borderRadius: "50%",
          background: toneColor, border: "2px solid var(--paper)", boxShadow: "var(--shadow-2)", pointerEvents: "none",
        }} />
      </div>
    </div>
  );
}

// ── PresetToggle ──────────────────────────────────────────────────────────────

function PresetToggle({ icon, title, sub, active, ageDelta, onToggle }) {
  const hasDelta = ageDelta !== null && ageDelta !== undefined && isFinite(ageDelta) && ageDelta !== 0;
  const deltaLabel = hasDelta
    ? (ageDelta < 0 ? `${Math.abs(ageDelta)} yr${Math.abs(ageDelta) === 1 ? "" : "s"} earlier` : `${ageDelta} yr${ageDelta === 1 ? "" : "s"} later`)
    : null;
  const deltaColor = hasDelta && ageDelta < 0 ? "var(--moss-ink)" : "var(--slate-ink)";
  return (
    <button onClick={onToggle} style={{
      display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px",
      background: active ? "var(--accent-soft)" : "var(--paper-2)",
      border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
      borderRadius: 10, cursor: "pointer", width: "100%", textAlign: "left",
      transition: "background 0.12s, border-color 0.12s",
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 1,
        border: `2px solid ${active ? "var(--accent-deep)" : "var(--line-2, var(--ink-3))"}`,
        background: active ? "var(--accent-deep)" : "transparent",
        display: "grid", placeItems: "center", transition: "all 0.12s",
      }}>
        {active && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--step--1)", fontWeight: 600, color: active ? "var(--accent-ink, var(--accent-deep))" : "var(--ink)" }}>{title}</div>
        <div className="text-meta" style={{ marginTop: 1 }}>{sub}</div>
        {active && deltaLabel && (
          <div className="mono text-meta" style={{ color: deltaColor, marginTop: 3, fontWeight: 600 }}>
            {ageDelta < 0 ? "▲ " : "▼ "}{deltaLabel}
          </div>
        )}
      </div>
      <span style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }}>{icon}</span>
    </button>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard({
  s,
  inputs,
  solved,
  scenarios,
  mc,
  mcRunning,
  mcTargetRate,
  mcReverse,
  setMcTargetRate,
  runMC,
  displayRows,
  update,
  totalMonthlyContrib: totalMonthlyContribProp,
  solveWithOverrides,
}) {
  const hidden = useContext(PrivacyContext);
  const fmt = (n) => fmt$(n, hidden);
  const fmtk = (n) => fmtK(n, hidden);

  // ── Live controls: base values from real plan ────────────────────────────
  const baseTotalMonthly = totalMonthlyContribProp || (
    (s.startingMonthly || 0) + (s.yourTfsaMonthly || 0) + (s.yourNrMonthly || 0)
    + (s.spouseMonthly || 0) + (s.spouseTfsaMonthly || 0) + (s.spouseNrMonthly || 0)
  );
  const baseAnnualSpend = inputs.monthlyExpensesTotal * 12;
  const baseRetirementSpend = (s.retirementSpendOverride && s.retirementSpendOverride > 0)
    ? s.retirementSpendOverride
    : baseAnnualSpend;

  // Slider state — defaults mirror real plan values
  const [sliderMonthly, setSliderMonthly] = useState(() => Math.min(6000, Math.max(0, baseTotalMonthly)));
  const [sliderSpend, setSliderSpend] = useState(() => Math.min(180000, Math.max(24000, Math.round(baseRetirementSpend / 1000) * 1000)));
  const [sliderAge, setSliderAge] = useState(() => solved.age ? Math.min(70, Math.max(40, solved.age)) : 55);
  const [liveActive, setLiveActive] = useState(false);

  // Quick preset toggles
  const [activePresets, setActivePresets] = useState(new Set());

  // Selected pressure-test scenario (null = Base / default chart)
  const [selectedScenarioLabel, setSelectedScenarioLabel] = useState(null);

  const previewActive = liveActive || activePresets.size > 0;

  // Sync sliders back to plan when nothing is overridden and plan changes
  React.useEffect(() => {
    if (!liveActive) {
      setSliderMonthly(Math.min(6000, Math.max(0, baseTotalMonthly)));
      setSliderSpend(Math.min(180000, Math.max(24000, Math.round(baseRetirementSpend / 1000) * 1000)));
      if (solved.age) setSliderAge(Math.min(70, Math.max(40, solved.age)));
    }
  }, [baseTotalMonthly, baseRetirementSpend, solved.age]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preset deltas applied to sliders so they visually reflect the preset
  const PRESET_MONTHLY_DELTA = 1000;
  const PRESET_SPEND_MULT    = 0.9;
  const PRESET_AGE_DELTA     = 10;

  function togglePreset(key) {
    setActivePresets(prev => {
      const next = new Set(prev);
      const adding = !next.has(key);
      if (adding) next.add(key); else next.delete(key);

      // Nudge the relevant slider so it visually reflects the preset
      if (key === "saveMore") {
        setSliderMonthly(m => Math.min(6000, m + (adding ? PRESET_MONTHLY_DELTA : -PRESET_MONTHLY_DELTA)));
        setLiveActive(true);
      }
      if (key === "spendLess") {
        setSliderSpend(sp => {
          const base = adding ? sp : sp / PRESET_SPEND_MULT;
          return Math.round(Math.min(180000, Math.max(24000, base * (adding ? PRESET_SPEND_MULT : 1))) / 1000) * 1000;
        });
        setLiveActive(true);
      }
      if (key === "delayRetirement") {
        setSliderAge(a => Math.min(70, Math.max(40, a + (adding ? PRESET_AGE_DELTA : -PRESET_AGE_DELTA))));
        setLiveActive(true);
      }

      return next;
    });
  }

  function resetAll() {
    setLiveActive(false);
    setActivePresets(new Set());
    setSliderMonthly(Math.min(6000, Math.max(0, baseTotalMonthly)));
    setSliderSpend(Math.min(180000, Math.max(24000, Math.round(baseRetirementSpend / 1000) * 1000)));
    if (solved.age) setSliderAge(Math.min(70, Math.max(40, solved.age)));
  }

  // ── Unified preview inputs ─────────────────────────────────────────────────
  // Combines slider overrides + active preset overrides into one inputs object,
  // then re-solves. The real `s` / `inputs` / `solved` are NEVER mutated.
  const previewInputs = useMemo(() => {
    if (!previewActive) return inputs;

    // --- Slider: monthly savings ---
    // Scale each contribution account proportionally so the ratios are preserved
    const contribScale = baseTotalMonthly > 0 ? sliderMonthly / baseTotalMonthly : 0;
    const scaledMonthly = {
      startingMonthly:   Math.round((s.startingMonthly   || 0) * contribScale),
      yourTfsaMonthly:   Math.round((s.yourTfsaMonthly   || 0) * contribScale),
      yourNrMonthly:     Math.round((s.yourNrMonthly     || 0) * contribScale),
      spouseMonthly:     Math.round((s.spouseMonthly     || 0) * contribScale),
      spouseTfsaMonthly: Math.round((s.spouseTfsaMonthly || 0) * contribScale),
      spouseNrMonthly:   Math.round((s.spouseNrMonthly   || 0) * contribScale),
    };
    const scaledStartingMonthly = Object.values(scaledMonthly).reduce((a, b) => a + b, 0);

    // --- Slider: retirement spend ---
    const sliderRetirementSpend = sliderSpend; // annual, today's $

    // --- Preset: save more (+$1k/mo RRSP) ---
    const presetSaveMoreDelta = activePresets.has("saveMore") ? 1000 : 0;

    // --- Preset: spend less (−10% retirement spend) ---
    const presetSpendMultiplier = activePresets.has("spendLess") ? 0.9 : 1;

    // Final startingMonthly (sliders + preset stacked)
    const finalStartingMonthly = scaledStartingMonthly + presetSaveMoreDelta;

    // Final retirement spend (slider × preset multiplier)
    const finalRetirementSpend = sliderRetirementSpend * presetSpendMultiplier;

    return {
      ...inputs,
      ...scaledMonthly,
      startingMonthly: finalStartingMonthly,
      retirementSpendOverride: finalRetirementSpend,
    };
  }, [previewActive, inputs, s, sliderMonthly, sliderSpend, activePresets, baseTotalMonthly]);

  // Re-solve with preview inputs
  const previewSolved = useMemo(() => {
    if (!previewActive || !solveWithOverrides) return solved;
    const overrides = {
      startingMonthly: previewInputs.startingMonthly,
      retirementSpendOverride: previewInputs.retirementSpendOverride,
      ...Object.fromEntries(
        ["yourTfsaMonthly","yourNrMonthly","spouseMonthly","spouseTfsaMonthly","spouseNrMonthly"]
          .map(k => [k, previewInputs[k]])
      ),
    };
    let result = solveWithOverrides(overrides);
    // Preset: delay retirement — enforce minimum age floor
    if (activePresets.has("delayRetirement") && result.age !== null) {
      const floor = Math.min(70, (solved.age || s.currentAge) + 10);
      if (result.age < floor) result = { ...result, age: floor };
    }
    return result;
  }, [previewActive, solveWithOverrides, previewInputs, activePresets, solved, s.currentAge]);

  // Preview display rows (today's $ projections for the chart)
  const previewDisplayRows = useMemo(() => {
    if (!previewActive || !previewSolved.rows) return displayRows;
    return previewSolved.rows.map(r => ({
      ...r,
      rrspDisp: r.rrspBal / r.infFactor,
      tfsaDisp: r.tfsaBal / r.infFactor,
      nrDisp:   r.nrBal   / r.infFactor,
      endDisp:  r.endTotal / r.infFactor,
      contribDisp: r.totalContrib / r.infFactor,
      wdDisp:   r.totalWd / r.infFactor,
      spendDisp: r.requiredSpend / r.infFactor,
      cppDisp:  r.cpp / r.infFactor,
      oasDisp:  r.oas / r.infFactor,
    }));
  }, [previewActive, previewSolved, displayRows]);

  // Delta vs real plan (for sidebar callout)
  const previewAgeDelta = previewActive && previewSolved.age !== null && solved.age !== null
    ? previewSolved.age - solved.age
    : null;

  // ── All downstream derived values use preview when active ─────────────────
  const activeSolved     = previewActive ? previewSolved     : solved;
  const activeInputs     = previewActive ? previewInputs     : inputs;

  // If a scenario is selected, convert its raw rows to today's-$ display rows for the chart
  const scenarioDisplayRows = useMemo(() => {
    if (!selectedScenarioLabel || !scenarios) return null;
    const sc = scenarios.find(s => s.label === selectedScenarioLabel);
    if (!sc || !sc.rows || sc.rows.length === 0) return null;
    return sc.rows.map(r => ({
      ...r,
      rrspDisp: r.rrspBal / r.infFactor,
      tfsaDisp: r.tfsaBal / r.infFactor,
      nrDisp:   r.nrBal   / r.infFactor,
      endDisp:  r.endTotal / r.infFactor,
      cppDisp:  r.cpp  / r.infFactor,
      oasDisp:  r.oas  / r.infFactor,
    }));
  }, [selectedScenarioLabel, scenarios]);

  const activeDisplayRows = scenarioDisplayRows
    ? scenarioDisplayRows
    : (previewActive ? previewDisplayRows : displayRows);

  const grandAnnual = activeInputs.monthlyExpensesTotal * 12;
  const retirementAnnual = (activeInputs.retirementSpendOverride && activeInputs.retirementSpendOverride > 0)
    ? activeInputs.retirementSpendOverride
    : grandAnnual;
  const retireAge = activeSolved.age;
  const retRow = retireAge && activeSolved.rows ? activeSolved.rows.find(r => r.age === retireAge) : null;
  // Chart retire-age marker follows the selected scenario when one is chosen
  const chartRetireAge = selectedScenarioLabel && scenarios
    ? (scenarios.find(sc => sc.label === selectedScenarioLabel)?.age ?? retireAge)
    : retireAge;
  const portfolioAtRetirement = retRow ? retRow.endTotal / retRow.infFactor : null;
  const yearsToRetirement = retireAge ? retireAge - s.currentAge : null;
  const mortgagePayoff = activeSolved.mortgagePayoffAge;

  const startPortfolio = (s.yourRrspStart||0) + (s.yourTfsaStart||0) + (s.yourNrStart||0)
    + (s.partnered !== false ? (s.spouseRrspStart||0) + (s.spouseTfsaStart||0) + (s.spouseNrStart||0) : 0);

  const retRrsp = retRow ? retRow.rrspBal / retRow.infFactor : 0;
  const retTfsa = retRow ? retRow.tfsaBal / retRow.infFactor : 0;
  const retNr   = retRow ? retRow.nrBal   / retRow.infFactor : 0;

  // Cashflow / excess — uses active monthly savings
  const activeTotalMonthly = previewActive
    ? (previewInputs.startingMonthly || 0)
    : ((s.startingMonthly || 0) + (s.yourTfsaMonthly || 0) + (s.yourNrMonthly || 0)
      + (s.spouseMonthly || 0) + (s.spouseTfsaMonthly || 0) + (s.spouseNrMonthly || 0));

  const partnered = s.partnered !== false;
  const yourEquityAmt   = s.yourBase   * (s.yourEquityPct   || 0);
  const spouseEquityAmt = s.spouseBase * (s.spouseEquityPct || 0);
  const yourNetIncome   = (s.yourBase   + s.yourBase   * (s.yourBonusPct   || 0) + yourEquityAmt)   * (1 - (s.taxRate || 0));
  const spouseNetIncome = (s.spouseBase + s.spouseBase * (s.spouseBonusPct || 0) + spouseEquityAmt) * (1 - (s.taxRate || 0));
  const totalNet = yourNetIncome + (partnered ? spouseNetIncome : 0);
  const yourShare   = totalNet > 0 ? yourNetIncome   / totalNet : 1;
  const spouseShare = totalNet > 0 ? spouseNetIncome / totalNet : 0;

  const yourAnnualExpenses   = grandAnnual * yourShare;
  const spouseAnnualExpenses = grandAnnual * spouseShare;

  // Per-person savings split (approximate from active inputs)
  const previewSaveMoreDelta = activePresets.has("saveMore") ? 1000 : 0;
  const yourContribScale  = baseTotalMonthly > 0 ? sliderMonthly / baseTotalMonthly : (previewActive ? 0 : 1);
  const yourAnnualSavings = previewActive
    ? (Math.round((s.startingMonthly || 0) * yourContribScale)
      + Math.round((s.yourTfsaMonthly  || 0) * yourContribScale)
      + Math.round((s.yourNrMonthly    || 0) * yourContribScale) + previewSaveMoreDelta) * 12
    : (((s.startingMonthly || 0) + (s.yourTfsaMonthly || 0) + (s.yourNrMonthly || 0)) * 12
      + (s.rrspTopUp || 0) + (s.tfsaTopUp || 0) + (s.nrTopUp || 0));
  const spouseAnnualSavings = previewActive
    ? (Math.round((s.spouseMonthly     || 0) * yourContribScale)
      + Math.round((s.spouseTfsaMonthly || 0) * yourContribScale)
      + Math.round((s.spouseNrMonthly   || 0) * yourContribScale)) * 12
    : ((s.spouseMonthly || 0) + (s.spouseTfsaMonthly || 0) + (s.spouseNrMonthly || 0)) * 12;

  const yourExcess      = yourNetIncome   - yourAnnualExpenses   - yourAnnualSavings;
  const spouseExcess    = spouseNetIncome - spouseAnnualExpenses - spouseAnnualSavings;
  const householdExcess = yourExcess + (partnered ? spouseExcess : 0);

  // Scenario base (always from real plan — not affected by preview)
  const baseScenario = scenarios ? scenarios.find(sc => sc.label === "Base") : null;

  // Per-preset age delta (combined, shown on each active tile)
  const presetAgeDelta = activePresets.size > 0 ? previewAgeDelta : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>

      {/* ── Preview banner — spans full width above both columns ── */}
      {previewActive && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, flexShrink: 0,
          padding: "11px 20px",
          background: "var(--sun-soft)",
          borderBottom: "1px solid var(--sun)",
          fontSize: "var(--step--2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>🔮</span>
            <span style={{ fontWeight: 600, color: "var(--sun-ink)" }}>Scenario preview</span>
            <span style={{ color: "var(--ink-2)" }}>
              — numbers below reflect your adjustments, not your saved plan
              {previewAgeDelta !== null && previewAgeDelta !== 0 && (
                <span className="mono" style={{
                  marginLeft: 8, fontWeight: 700,
                  color: previewAgeDelta < 0 ? "var(--moss-ink)" : "var(--slate-ink)",
                }}>
                  {previewAgeDelta < 0 ? `▲ ${Math.abs(previewAgeDelta)} yr${Math.abs(previewAgeDelta)===1?"":"s"} earlier` : `▼ ${previewAgeDelta} yr${previewAgeDelta===1?"":"s"} later`}
                </span>
              )}
            </span>
          </div>
          <button
            onClick={resetAll}
            className="btn btn--outline btn--sm"
            style={{ borderColor: "var(--sun)", color: "var(--sun-ink)", whiteSpace: "nowrap" }}
          >
            ↺ Reset
          </button>
        </div>
      )}

    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

      {/* ── Left: Live Controls sidebar ── */}
      <div style={{
        width: 276, flexShrink: 0,
        borderRight: "1px solid var(--line)",
        overflowY: "auto",
        padding: "24px 20px 40px",
        background: "var(--paper)",
      }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div className="label-xs" style={{ letterSpacing: "0.1em", marginBottom: 4 }}>LIVE CONTROLS</div>
          <div className="text-meta">Move the sliders until it feels right</div>
        </div>

        {/* Slider: Monthly savings */}
        <LiveSlider
          label="Monthly savings"
          value={sliderMonthly}
          min={0} max={6000} step={100}
          format={v => `$${v.toLocaleString("en-CA")}`}
          tone="green"
          sub="Across all accounts"
          onChange={v => { setSliderMonthly(v); setLiveActive(true); }}
        />

        {/* Slider: Retirement spending */}
        <LiveSlider
          label="Retirement spending"
          value={sliderSpend}
          min={24000} max={180000} step={1000}
          format={v => `$${Math.round(v / 1000)}k`}
          tone="sun"
          sub="Annual, today's dollars after tax"
          onChange={v => { setSliderSpend(v); setLiveActive(true); }}
        />

        {/* Slider: Retirement age */}
        <div style={{ marginBottom: 4 }}>
          <LiveSlider
            label="Retirement age"
            value={sliderAge}
            min={40} max={70} step={1}
            format={v => `age ${v}`}
            tone="dusk"
            sub="When you stop working"
            onChange={v => { setSliderAge(v); setLiveActive(true); }}
          />
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 18, marginTop: 4, marginBottom: 16 }}>
          <div className="label-xs" style={{ letterSpacing: "0.1em", marginBottom: 4 }}>QUICK PRESETS</div>
          <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginBottom: 12 }}>Toggle to explore. Combine multiple.</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <PresetToggle
            icon="📈"
            title="Save more aggressively"
            sub="+$1,000/mo savings"
            active={activePresets.has("saveMore")}
            ageDelta={activePresets.has("saveMore") ? presetAgeDelta : null}
            onToggle={() => togglePreset("saveMore")}
          />
          <PresetToggle
            icon="✂️"
            title="Spend less in retirement"
            sub="−10% lifestyle"
            active={activePresets.has("spendLess")}
            ageDelta={activePresets.has("spendLess") ? presetAgeDelta : null}
            onToggle={() => togglePreset("spendLess")}
          />
          <PresetToggle
            icon="⏳"
            title="Delay retirement"
            sub="+10 years later"
            active={activePresets.has("delayRetirement")}
            ageDelta={activePresets.has("delayRetirement") ? presetAgeDelta : null}
            onToggle={() => togglePreset("delayRetirement")}
          />
        </div>

      </div>

      {/* ── Right: Main dashboard content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 60px" }}>


      {/* ── Panel 1: FI Hero ── */}
      <div className="dash-hero" style={{ marginBottom: 24 }}>
        <div className="dash-hero__moment dot-bg">
          <div className="label-xs">Years until financial independence</div>
          {retireAge !== null ? (
            <>
              <div style={{ display: "flex", alignItems: "stretch", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 72, lineHeight: 1, letterSpacing: "-0.04em", color: "var(--accent-deep)", display: "flex", alignItems: "center" }}>
                  {yearsToRetirement}
                </div>
                <div style={{ fontSize: "var(--step-0)", color: "var(--ink-2)", maxWidth: 220 }}>
                  year{yearsToRetirement === 1 ? "" : "s"} from today.
                  <div style={{ color: "var(--ink-3)", fontSize: "var(--step--1)", marginTop: 4 }}>
                    {s.yourName || "You"} age {retireAge}
                    {s.partnered !== false && ` · ${s.spouseName || "Spouse"} age ${retireAge + (s.spouseCurrentAge - s.currentAge)}`}
                  </div>
                </div>
              </div>
              {portfolioAtRetirement !== null && (
                <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span className="label-xs">Portfolio at retirement</span>
                  <span className="mono" style={{ fontSize: "var(--step-2)", color: "var(--ink)", fontWeight: 500 }}>{fmt(portfolioAtRetirement)}</span>
                  <span className="text-meta">today's $</span>
                </div>
              )}
              {/* Narrative sentence */}
              <div style={{ marginTop: 16, fontSize: "var(--step--1)", color: "var(--ink-2)", lineHeight: 1.6, maxWidth: 420 }}>
                {s.yourName || "You"}'s path crosses independence at {retireAge}.
                {portfolioAtRetirement !== null && ` At today's savings pace, you reach ${fmtk(portfolioAtRetirement)} and can hold ${fmtk(retirementAnnual)}/year in retirement through age ${s.deathAge}.`}
              </div>
              <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="chip chip--sun">Fat FIRE</span>
                {s.partnered !== false && <span className="chip">Partnered</span>}
                <span className="chip">RRSP-first drawdown</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: "var(--step-5)", fontWeight: 700, color: "var(--slate)", marginTop: 12 }}>Not reachable</div>
              <div style={{ fontSize: "var(--step--1)", color: "var(--ink-3)", marginTop: 8 }}>
                No retirement age leaves {fmt(s.terminalTargetToday)} at age {s.deathAge} while covering all spending.
              </div>
            </>
          )}
        </div>

        {/* ── Hero aside: 3 Trailhead V2 stat cards ── */}
        <div className="dash-hero__aside">
          {/* Sustainable Spend — what you can pull after-tax each year */}
          <div className="hero-stat">
            <div className="hero-stat__label">Sustainable spend</div>
            <div className="hero-stat__value" style={{ color: "var(--accent-ink)" }}>
              {retirementAnnual ? fmt(retirementAnnual) : "—"}
            </div>
            <div className="hero-stat__sub">
              After tax, ${Math.round((s.terminalTargetToday || 0) / 1000)}k at age {s.deathAge}
            </div>
          </div>

          {/* Portfolio Target — what you need saved at retirement */}
          {(() => {
            // 4% rule target: spend / 0.04
            const portfolioTarget = retirementAnnual ? Math.round(retirementAnnual / 0.04) : null;
            const effectiveTaxPct = s.rrspTaxRate
              ? Math.round(((s.rrspTaxRate || 0.37) * (retRrsp / (portfolioAtRetirement || 1))
                  + (s.nrCapGainsRate || 0.21) * (retNr / (portfolioAtRetirement || 1))) * 100)
              : 8;
            return (
              <div className="hero-stat">
                <div className="hero-stat__label">Portfolio target</div>
                <div className="hero-stat__value" style={{ color: "var(--sun-ink)" }}>
                  {portfolioTarget ? fmt(portfolioTarget) : "—"}
                </div>
                <div className="hero-stat__sub">
                  4% withdrawal · ~{effectiveTaxPct}% est. effective tax
                </div>
              </div>
            );
          })()}

          {/* Saved today — current portfolio total */}
          {(() => {
            const pctToGoal = portfolioAtRetirement && startPortfolio > 0
              ? Math.round((startPortfolio / portfolioAtRetirement) * 100)
              : null;
            return (
              <div className="hero-stat">
                <div className="hero-stat__label">Saved today</div>
                <div className="hero-stat__value">
                  {fmt(startPortfolio)}
                </div>
                <div className="hero-stat__sub">
                  {pctToGoal !== null ? `${pctToGoal}% toward your goal` : "Across all accounts"}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Panel 2b: Annual excess cash ── */}
      <div className="dash-panel" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <div>
            <div className="label-xs">Annual excess cash</div>
            <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 3 }}>
              Take-home minus spending and planned contributions — this year
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span className="mono" style={{
              fontSize: "var(--step-3)",
              fontWeight: 700,
              color: householdExcess >= 0 ? "var(--moss-ink)" : "var(--slate-ink)",
            }}>
              {fmt(householdExcess)}
            </span>
            <span className="text-meta">/yr household</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 0, borderTop: "1px solid var(--line)" }}>
          {/* Your column */}
          <div style={{ flex: 1, paddingTop: 14, paddingRight: 24 }}>
            <div className="label-xs" style={{ marginBottom: 10 }}>{s.yourName || "You"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <CashRow label="Take-home" value={yourNetIncome} fmt={fmt} />
              <CashRow label="Spending (share)" value={-yourAnnualExpenses} fmt={fmt} />
              <CashRow label="Savings contributions" value={-yourAnnualSavings} fmt={fmt} />
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 6, marginTop: 2, display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                <span style={{ fontSize: "var(--step--1)", color: "var(--ink)" }}>Excess</span>
                <span className="mono" style={{
                  fontSize: "var(--step-1)",
                  fontWeight: 700,
                  color: yourExcess >= 0 ? "var(--moss-ink)" : "var(--slate-ink)",
                }}>{fmt(yourExcess)}</span>
              </div>
            </div>
          </div>

          {/* Spouse column — only shown if partnered */}
          {partnered && (
            <>
              <div style={{ width: 1, background: "var(--line)", margin: "14px 0 0" }} />
              <div style={{ flex: 1, paddingTop: 14, paddingLeft: 24 }}>
                <div className="label-xs" style={{ marginBottom: 10 }}>{s.spouseName || "Spouse"}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <CashRow label="Take-home" value={spouseNetIncome} fmt={fmt} />
                  <CashRow label="Spending (share)" value={-spouseAnnualExpenses} fmt={fmt} />
                  <CashRow label="Savings contributions" value={-spouseAnnualSavings} fmt={fmt} />
                  <div style={{ borderTop: "1px solid var(--line)", paddingTop: 6, marginTop: 2, display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                    <span style={{ fontSize: "var(--step--1)", color: "var(--ink)" }}>Excess</span>
                    <span className="mono" style={{
                      fontSize: "var(--step-1)",
                      fontWeight: 700,
                      color: spouseExcess >= 0 ? "var(--moss-ink)" : "var(--slate-ink)",
                    }}>{fmt(spouseExcess)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Panel 3: Scenario pressure test ── */}
      {scenarios && (
        <Panel style={{ marginBottom: 16 }}>
          <PanelHead label="Pressure test" title="What if markets disappoint?" />
          <div className="dash-scenario-grid" style={{ marginTop: 16 }}>
            {scenarios.map(sc => {
              const ageDiff = baseScenario && baseScenario.age !== null && sc.age !== null ? sc.age - baseScenario.age : null;
              const portDiff = baseScenario && baseScenario.portfolioAtRetirement !== null && sc.portfolioAtRetirement !== null
                ? sc.portfolioAtRetirement - baseScenario.portfolioAtRetirement : null;
              const isBase = sc.label === "Base";
              const effectiveSelected = selectedScenarioLabel ?? "Base";
              const isSelected = sc.label === effectiveSelected;
              return (
                <div
                  key={sc.label}
                  className={"scen-card" + (isSelected ? " is-active" : "")}
                  onClick={() => setSelectedScenarioLabel(sc.label === "Base" ? null : sc.label)}
                >
                  <div className="label-xs">{sc.label}</div>
                  <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", margin: "4px 0 0" }}>{(sc.return * 100).toFixed(1)}% ret · {(sc.inflation * 100).toFixed(1)}% inf</div>
                  <div style={{ flex: 1 }} />
                  {sc.age !== null ? (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <div className="mono" style={{ fontSize: "var(--step-3)", fontWeight: 500, color: isSelected ? "var(--accent)" : "var(--ink)" }}>{sc.age}</div>
                      {!isBase && ageDiff !== null && (
                        <div className="mono" style={{ fontSize: "var(--step--1)", color: ageDiff > 0 ? "var(--slate-ink)" : "var(--moss-ink)" }}>
                          {ageDiff > 0 ? "+" : ""}{ageDiff}y
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: "var(--step-0)", fontWeight: 600, color: "var(--slate)" }}>—</div>
                  )}
                  {sc.portfolioAtRetirement !== null && (
                    <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 4 }}>
                      {fmt(sc.portfolioAtRetirement)}
                      {!isBase && portDiff !== null && (
                        <span style={{ marginLeft: 4, color: portDiff < 0 ? "var(--slate-ink)" : "var(--moss-ink)" }}>
                          {portDiff > 0 ? "+" : ""}{fmt(portDiff)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 12 }}>
            All other inputs held constant. Differences relative to Base.
          </div>
        </Panel>
      )}

      {/* ── Net worth chart + Account mix — side by side ── */}
      <div style={{ display: "grid", gridTemplateColumns: retRow ? "1.6fr 1fr" : "1fr", gap: 16, alignItems: "stretch", marginBottom: 16 }}>

        {/* Chart panel */}
        <Panel style={{ margin: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
            <PanelHead label="Net worth · Projected" title={retireAge ? `Financial independence at ${retireAge} · ${fmt$(s.terminalTargetToday || 0, false)} at ${s.deathAge}` : "Your net worth over time."} />
            <div style={{ display: "flex", gap: 16, fontSize: "var(--step--2)", color: "var(--ink-3)", alignItems: "center", flexShrink: 0 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="20" height="2" style={{ display: "inline-block" }}><line x1="0" y1="1" x2="20" y2="1" stroke="var(--accent)" strokeWidth="2" /></svg>
                Accumulation
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="20" height="2" style={{ display: "inline-block" }}><line x1="0" y1="1" x2="20" y2="1" stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 3" opacity="0.55" /></svg>
                Drawdown
              </span>
            </div>
          </div>
          <NetWorthChart displayRows={activeDisplayRows} retireAge={chartRetireAge} />
          <div style={{ fontSize: "var(--step--2)", color: "var(--ink-3)", marginTop: 4 }}>
            Values in today's dollars.
          </div>
        </Panel>

        {/* Account mix panel */}
        {retRow && (
          <Panel style={{ margin: 0 }}>
            <PanelHead label="Account mix" title="Portfolio at retirement." />
            <div style={{ marginTop: 16 }}>
              <AccountMixDonut rrsp={retRrsp} tfsa={retTfsa} nr={retNr} hidden={hidden} />
            </div>
            <div style={{ marginTop: 16, fontSize: "var(--step--2)", color: "var(--ink-3)" }}>
              Snapshot at age {retireAge}. RRSP-first drawdown depletes registered accounts first.
            </div>
          </Panel>
        )}
      </div>

      </div>
    </div>
    </div>
  );
}
