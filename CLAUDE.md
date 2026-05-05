# Trailhead Fat FIRE Calculator — Claude working memory

## Project overview
React SPA (Babel-transpiled, no build step) — Canadian Fat FIRE retirement calculator with onboarding, dashboard, plan editor, and settings. Supabase backend with no-op stub fallback.

## File map
| File | Purpose |
|------|---------|
| `src/FatFireCalculator.jsx` | Root component, routing, state, `buildInputs`, `publicDefaults`, `defaults` |
| `src/engine.js` | Pure math: `simulate`, `solveEarliestAge`, `runMonteCarlo`, `solveScenarios`, `solveWindfall`, RRIF table |
| `src/Dashboard.jsx` | Main dashboard: hero, sliders (`LiveSlider`), presets (`PresetToggle`), pressure test, panels. Imports viz from `DashCharts` |
| `src/DashCharts.jsx` | Dashboard viz components: `NetWorthChart`, `AccountMixDonut`, `CashflowBars`, `DrawdownTimeline`, `RoomBar`, `CashRow`, `MiniStat` |
| `src/Onboarding.jsx` | 8-card onboarding flow; `onboardingToState` export. Imports inputs from `ObInputs` |
| `src/ObInputs.jsx` | Shared onboarding input components: `DollarInput`, `PctInput`, `VestDatePicker`, `Field`, `BtnPair`, `ModeToggle`, `CompRow` |
| `src/PlanEditor.jsx` | Plan editor panels: income, spending, savings, housing, assumptions |
| `src/Settings.jsx` | Account settings |
| `src/SharedComponents.jsx` | `PersonBlock`, `PersonGroup` |
| `src/utils.js` | `fmt$`, `formatCommas` |
| `src/trailhead.css` | Full design system: tokens, layout, components, utility classes |

## Design system — key CSS classes

### Utility classes (replaces repeated inline styles)
- `text-meta` — `font-size: step--2; color: ink-3` (captions, sub-labels)
- `text-body` — `font-size: step--1; color: ink-2` (secondary body text)
- `text-pos` — `color: moss-ink` (positive/green values)
- `text-neg` — `color: slate-ink` (negative/red values)
- `text-accent` — `color: accent-ink`
- `ob-heading` — onboarding card h2 (`font-display, 600, 28px, -0.02em, mb:6`)
- `ob-sub` — onboarding subtitle p (`ink-3, 14px, mb:24`)
- `slider-row` — flex row with space-between + baseline align for slider label/value
- `callout-accent` — accent-soft box with border, used in live controls sidebar
- `info-card` — flex row with paper-2 bg + border (fire reveal box, etc.)
- `dot-swatch` — 10×10 coloured legend dot
- `legend-row` — flex row for colour legend items

### Component classes
- `pe-row-group` — card with border/radius; children are `inp-row` (single-line divider rows)
- `inp-row` — label-left, input-right row; use inside `pe-row-group`
- `pe-row-sub` — muted inline descriptor after label text (no dot, e.g. "Tax-free")
- `inp-hint` — dot-prefixed annotation in NumInput/PctInput: ` · lowercase text`
- `pe-field-wrap` / `pe-field-input` / `pe-field-adorn` — fixed-width input wrapper with $ or % adornment
- `PersonBlock` / `PersonGroup` — person-coloured card + wrapper with total footer
- `dash-panel` — dashboard panel card (no default margin — add inline `marginBottom: 16`)
- `scen-card` / `scen-card.is-active` — pressure-test scenario tile
- `btn btn--primary`, `btn btn--accent`, `btn--ghost`, `btn--outline`, `btn--sm`, `btn--lg`
- `label-xs` — small caps label
- `mono` — monospaced number text
- `chip chip--accent` — small badge
- `seg` — segmented toggle button pair
- `slider` — range input
- `ob-card` / `ob-scene` — onboarding card shell
- `ob-field` / `ob-hint` — non-row field (label above, hint below)

## Wording rules — 5 person scenarios
| Scenario | Income heading | Contributions sub | Savings sub |
|----------|---------------|-------------------|-------------|
| Solo, no name | "Your income" | "How much are you putting toward retirement each month?" | "Current balances across your accounts." |
| Solo, named | "Martin's income" | same | same |
| Couple, no names | "Your household income" | "How much are you both putting toward retirement each month?" | "Current balances across both your accounts." |
| Couple, you named only | "Martin & your partner's income" | same couple | "Current balances across both your accounts." |
| Couple, both named | "Martin & Jessica's income" | same couple | "Current balances across Martin and Jessica's accounts." |

## Hint/sub formatting standards
- `pe-row-sub` (spending rows, account types): no dot, no period — just descriptor e.g. `Tax-free`, `Cars, gas, transit`
- `inp-hint` (NumInput/PctInput): ` · lowercase, no period` e.g. ` · annual salary`, ` · annual rate`
- Never: "Annual Salary", "e.g. 3.85%", "~1% of home value/yr" (use "annual rate", "~1% of home value per year")

## State conventions
- `data.yourName` / `data.spouseName` — raw strings, may be empty
- `rawName = data.yourName?.trim()` — use this for display; falsy = no name entered
- `partnered = data.partnered === true` — explicit boolean check
- `showSpouse = partnered && !hideSpouse`
- Spending keys: `transport`, `groceries`, `dining`, `travel`, `personalCare`, `childcare`, `other`
- Account keys: `yourRrspStart`, `yourTfsaStart`, `yourNrStart`, `spouseRrspStart`, `spouseTfsaStart`, `spouseNrStart`
- Monthly contribution keys: `startingMonthly` (your RRSP), `yourTfsaMonthly`, `yourNrMonthly`, `spouseMonthly`, `spouseTfsaMonthly`, `spouseNrMonthly`

## Architecture notes
- `solveScenarios` returns `{ label, return, inflation, color, age, portfolioAtRetirement, rows }` — `rows` added for chart overlay
- `selectedScenarioLabel` in Dashboard drives chart overlay; null = Base/default
- `chartRetireAge` = selected scenario's age when one is active, else `retireAge`
- `activeDisplayRows` priority: scenarioDisplayRows > previewDisplayRows > displayRows
- `userTouchedSlider` ref in CardVision — lifestyle slider auto-follows spending inputs until user moves it
- `pe-row-group` has `border-top` on `ob-section-label` — don't mix them; use `label-xs` + `pe-row-group` instead

## Common patterns
```jsx
// Standard inp-row inside pe-row-group
<div className="pe-row-group">
  <Field label="Label text" hint="optional hint" row>
    <DollarInput value={data.key} onChange={v => onChange("key", v)} />
  </Field>
</div>

// NumInput with hint (PlanEditor)
<NumInput label="Base salary" hint="annual salary" value={s.yourBase} onChange={update("yourBase")} prefix="$" />

// Person-coloured cards
<PersonGroup totalLabel="Total" totalValue={`$${total.toLocaleString()}`}>
  <PersonBlock name={name} variant="you">...</PersonBlock>
  <PersonBlock name={spouseName} variant="spouse">...</PersonBlock>
</PersonGroup>
```

## Do not
- Mix `SectionLabel` (`ob-section-label`) with adjacent `inp-row` — creates double border. Use `<p className="label-xs">` above a `pe-row-group` instead.
- Use `useMemo(() => fn(data), [])` with empty deps when result should update as `data` changes — use a ref to track user intent instead.
- Add `marginBottom` to `dash-panel` via CSS — do it inline per panel so each panel controls its own spacing.
- Forget `travel` in spending sums — it's a spending key added mid-project and easy to miss.
