import { NOT_FOR_SECONDARY } from "../config/banks";
import { ProgramFit } from "../lib/finance";
import { money, pct } from "../lib/format";

/** Сначала доступные с комфортным платежом, затем условные (Отбасы — самый дешёвый путь), затем остальные. */
function rank(f: ProgramFit): number {
  if (!f.ok) return 4;
  if (f.program.later) return 3;
  if (f.condition) return f.comfortable ? 0 : 1;
  return f.comfortable ? 0 : 2;
}

function Status({ f }: { f: ProgramFit }) {
  if (!f.ok) return <>{f.reasons.map((r) => <span key={r} className="badge red">{r}</span>)}</>;
  if (f.program.later) return <span className="badge">На будущее: {f.condition}</span>;
  if (f.condition) return <span className="badge blue">Возможно, если {f.condition}</span>;
  return f.comfortable ? <span className="badge green">Подходит</span> : <span className="badge orange">Подходит, платёж выше комфортного</span>;
}

/** Список ипотечных программ для конкретной цены — карточками, удобно и на телефоне. */
const NOT_PARTNER = "только у застройщика-партнёра";

export function ProgramFits({ fits, years }: { fits: ProgramFit[]; years: number }) {
  // партнёрские программы, которые к этой квартире не применимы (продаёт не их застройщик), сворачиваем в одну строку
  const hidden = fits.filter((f) => f.reasons.includes(NOT_PARTNER));
  const sorted = fits.filter((f) => !hidden.includes(f)).sort((a, b) => rank(a) - rank(b) || a.payment - b.payment);
  return (
    <>
      <div className="programs">
        {sorted.map((f) => (
          <div key={f.program.id} className={`program ${f.ok ? "" : "dim"}`}>
            <div className="program-head">
              <div>
                <strong>{f.program.bank}</strong>
                <div className="small muted">{f.program.name}</div>
              </div>
              <div className="program-pay">
                {money(f.payment)}
                <span className="small muted"> /мес</span>
              </div>
            </div>
            <div className="small muted">
              {pct(f.program.rate)} · до {Math.min(years, f.program.maxYears)} лет · взнос от {f.program.minDownPct}%
              {f.program.commissionPct ? ` · комиссия ${f.program.commissionPct}% (${money((f.loan * f.program.commissionPct) / 100)})` : ""}
            </div>
            <div className="badges"><Status f={f} /></div>
            {f.program.note && <div className="small muted">{f.program.note}</div>}
          </div>
        ))}
      </div>
      {hidden.length > 0 && (
        <p className="small muted" style={{ margin: "12px 0 0" }}>
          Партнёрские программы ({hidden.map((f) => `${f.program.bank}`).filter((v, i, a) => a.indexOf(v) === i).join(", ")}) к этой квартире не применимы:
          они работают только при покупке у застройщика-партнёра. <a href="#/programs">Все программы и партнёры →</a>
        </p>
      )}
      <details className="small" style={{ marginTop: 14 }}>
        <summary className="muted">Ещё проверили — для вторички в Алматы не подходят ({NOT_FOR_SECONDARY.length})</summary>
        <ul className="muted" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {NOT_FOR_SECONDARY.map((p) => (
            <li key={p.name}>
              <a href={p.source} target="_blank" rel="noreferrer">{p.name}</a> ({p.rate}) — {p.reason}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
