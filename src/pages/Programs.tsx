import { COMPLEX_DEVELOPERS, MortgageProgram, NOT_FOR_SECONDARY, PROGRAMS, ProgramKind } from "../config/banks";
import { date, mln, pct } from "../lib/format";

const SECTIONS: { kind: ProgramKind; title: string; hint: string }[] = [
  { kind: "partner", title: "Партнёрские (у застройщика)", hint: "Работают, только если квартиру продаёт сам застройщик-партнёр. Низкая ставка обычно субсидируется застройщиком." },
  { kind: "otbasy", title: "Отбасы банк", hint: "Нужны накопления на депозите Отбасы — обычно 50% стоимости." },
  { kind: "market", title: "Рыночные (вторичка у любого продавца)", hint: "Доступны сразу при подтверждённом доходе." },
];

const includesAny = (list: string[] | undefined, value: string) =>
  (list ?? []).some((x) => value.toUpperCase().includes(x.toUpperCase()) || x.toUpperCase().includes(value.toUpperCase()));

function ProgramCard({ p }: { p: MortgageProgram }) {
  return (
    <div className="program">
      <div className="program-head">
        <div>
          <strong>{p.bank}</strong>
          <div className="small muted">{p.name}</div>
        </div>
        <div className="program-pay">{p.rateText ?? pct(p.rate)}</div>
      </div>
      <div className="small muted">
        взнос от {p.minDownPct}% · до {p.maxYears} лет{p.maxLoan ? ` · до ${mln(p.maxLoan, 0)}` : ""}
        {p.commissionPct ? ` · комиссия ${p.commissionPct}%` : ""}
        {p.rateText ? ` · в расчётах ${pct(p.rate)}` : ""}
      </div>
      {p.housing && <div className="small"><b>Что купить:</b> {p.housing}</div>}
      {p.condition && <div className="badges"><span className={`badge ${p.later ? "" : "blue"}`}>{p.later ? "На будущее: " : "Условие: "}{p.condition}</span></div>}
      {p.note && <div className="small muted">{p.note}</div>}
      <div className="small"><a href={p.source} target="_blank" rel="noreferrer">Источник ↗</a> <span className="muted">· проверено {date(p.checkedAt)}</span></div>
    </div>
  );
}

/** Реестр всех найденных ипотечных программ — чтобы не упустить ни одно предложение. */
export function ProgramsPage() {
  return (
    <>
      <section className="hero">
        <h1>Банки и программы</h1>
        <p>
          Все ипотечные программы, которые мы нашли: {PROGRAMS.length} действующих и {NOT_FOR_SECONDARY.length} проверенных, но неподходящих.
          Ставки из открытых источников — перед решением сверяйте в банке.
        </p>
      </section>

      <h2 className="section" style={{ marginTop: 0 }}>Застройщики у MEGA и их программы</h2>
      <div className="card">
        <div className="table-wrap">
          <table className="table stack">
            <thead><tr><th>ЖК</th><th>Застройщик</th><th>Партнёрские программы при покупке у застройщика</th></tr></thead>
            <tbody>
              {COMPLEX_DEVELOPERS.map((c) => {
                const ps = PROGRAMS.filter((p) => includesAny(p.developers, c.developer));
                return (
                  <tr key={c.complex}>
                    <td><strong>{c.complex}</strong></td>
                    <td data-label="Застройщик">
                      <a href={c.source} target="_blank" rel="noreferrer">{c.developer}</a>
                      {!c.confirmed && <span className="badge" style={{ marginLeft: 6 }}>не подтверждено</span>}
                    </td>
                    <td data-label="Программы">
                      {ps.length ? (
                        <div className="badges">
                          {ps.map((p) => {
                            const ok = includesAny(p.confirmedComplexes, c.complex);
                            return (
                              <span key={p.id} className={`badge ${ok ? "green" : "orange"}`} title={ok ? "ЖК есть в списке программы" : "ЖК не найден в опубликованном списке — уточнить"}>
                                {p.bank}: {p.name} — {ok ? "подтверждено" : "уточнить"}
                              </span>
                            );
                          })}
                        </div>
                      ) : <span className="muted">партнёрских программ не найдено</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          «Подтверждено» — ЖК есть в опубликованном списке программы; «уточнить» — застройщик тот же, но участие этого ЖК источником не подтверждено.
          Перепродажи от частных продавцов идут по рыночным программам или через Отбасы; партнёрские — только у застройщика.
          В трекере такие квартиры помечены «От застройщика» (фильтр «Продавец» на странице «Квартиры»).
        </p>
      </div>

      {SECTIONS.map((sec) => (
        <div key={sec.kind}>
          <h2 className="section">{sec.title}</h2>
          <p className="muted" style={{ marginTop: -8 }}>{sec.hint}</p>
          <div className="programs">
            {PROGRAMS.filter((p) => p.kind === sec.kind).map((p) => <ProgramCard key={p.id} p={p} />)}
          </div>
        </div>
      ))}

      <h2 className="section">Проверено — не подходит</h2>
      <div className="card">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {NOT_FOR_SECONDARY.map((p) => (
            <li key={p.name} style={{ marginBottom: 6 }}>
              <a href={p.source} target="_blank" rel="noreferrer">{p.name}</a> ({p.rate}) — <span className="muted">{p.reason}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
