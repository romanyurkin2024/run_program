import { useEffect, useState } from "react";

interface Props {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  suffix?: string;
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString("ru-RU") : "");

/** Числовое поле с разбиением на разряды: «45 000 000». */
export function MoneyInput({ label, value, onChange, hint, suffix = "₸" }: Props) {
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value]);
  return (
    <div className="field">
      <label>{label}{suffix ? `, ${suffix}` : ""}</label>
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value.replace(/\s/g, "").replace(",", "."));
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => setText(fmt(value))}
      />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
