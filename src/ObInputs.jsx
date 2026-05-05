import React, { useState, useEffect } from "react";

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatWithCommas(n) {
  if (!isFinite(n) || n === "" || n == null) return "";
  return Math.round(n).toLocaleString("en-CA");
}

// ── Dollar input with $ adornment ─────────────────────────────────────────────

export function DollarInput({ value, onChange, placeholder = "0" }) {
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
        onFocus={(e) => { setFocused(true); setRaw(value ? String(value) : ""); e.target.select(); }}
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

// ── Percent input with % adornment ────────────────────────────────────────────

export function PctInput({ value, onChange, placeholder = "0" }) {
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

// ── Vesting date picker (month + year selects) ────────────────────────────────

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function VestDatePicker({ value, onChange }) {
  const parts = value ? value.split("-") : ["", ""];
  const year = parts[0] || "";
  const month = parts[1] || "";
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 15 }, (_, i) => String(currentYear + i));

  function update(newYear, newMonth) {
    onChange(`${newYear || ""}-${newMonth || ""}`);
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select className="input" value={month} onChange={(e) => update(year, e.target.value)} style={{ flex: 1 }}>
        <option value="">Month</option>
        {MONTHS.map((m, i) => (
          <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>
        ))}
      </select>
      <select className="input" value={year} onChange={(e) => update(e.target.value, month)} style={{ flex: 1 }}>
        <option value="">Year</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}

// ── Field wrapper: row (label-left) or stacked (label-above) ─────────────────

export function Field({ label, children, hint, row = false }) {
  if (row) {
    return (
      <div className="inp-row">
        <span>
          {label}
          {hint && <span className="pe-row-sub">{hint}</span>}
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

// ── Two-up button pair ────────────────────────────────────────────────────────

export function BtnPair({ options, value, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {options.map(({ label, sub, val }) => (
        <button key={label} onClick={() => onChange(val)}
          className={`option-tile ${value === val ? "is-active" : ""}`}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>{label}</div>
          {sub && <div className="text-meta" style={{ marginTop: 2 }}>{sub}</div>}
        </button>
      ))}
    </div>
  );
}

// ── % / $ mode toggle ─────────────────────────────────────────────────────────

export function ModeToggle({ mode, onChange }) {
  return (
    <div className="mode-toggle">
      {["%", "$"].map((m) => (
        <button key={m} onClick={() => onChange(m)} className={mode === m ? "is-active" : ""}>{m}</button>
      ))}
    </div>
  );
}

// ── Comp row (bonus / equity / RSU with yes/no + amount) ─────────────────────

export function CompRow({ label, hint, hasKey, modeKey, pctKey, dollarKey, data, onChange, vestDateKey, vestDateLabel }) {
  const has       = data[hasKey]    === true;
  const mode      = data[modeKey]   || "%";
  const pctVal    = data[pctKey]    || 0;
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
            <Field label={vestDateLabel || "Vesting date / cliff"} hint="optional — helps model timing">
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
