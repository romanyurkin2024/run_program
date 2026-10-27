import { useEffect, useRef, useState } from "react";

export interface Option {
  value: string;
  label: string;
}

/** Выпадающий список с галочками: можно выбрать несколько вариантов. Пустой выбор — «все». */
export function MultiSelect({ label, allLabel, options, value, onChange }: {
  label: string;
  allLabel: string;
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const picked = options.filter((o) => value.includes(o.value));
  const summary = picked.length === 0 ? allLabel : picked.length <= 2 ? picked.map((o) => o.label).join(", ") : `Выбрано: ${picked.length}`;
  const shown = query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options;
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <div className="field multi" ref={ref}>
      <label>{label}</label>
      <button type="button" className={`multi-button ${picked.length ? "on" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{summary}</span>
      </button>
      {open && (
        <div className="multi-panel card" role="listbox" aria-multiselectable>
          {options.length > 10 && (
            <input className="multi-search" placeholder="Поиск" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          )}
          <div className="multi-list">
            {shown.map((o) => (
              <label key={o.value}>
                <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} /> {o.label}
              </label>
            ))}
            {shown.length === 0 && <span className="muted small">Ничего не найдено</span>}
          </div>
          <div className="multi-actions">
            <button type="button" className="btn ghost" onClick={() => onChange([])} disabled={!value.length}>Сбросить</button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>Готово</button>
          </div>
        </div>
      )}
    </div>
  );
}
