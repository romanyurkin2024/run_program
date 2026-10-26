import { useState } from "react";
import { LineChart } from "../components/LineChart";
import { MoneyInput } from "../components/MoneyInput";
import { PROGRAMS } from "../config/banks";
import { Finances, bankPaymentCap, downPayment, programBudgets } from "../lib/finance";
import { duration, mln, money, pct } from "../lib/format";
import { RepaymentType, buildSchedule } from "../lib/mortgage";

interface Props {
  fin: Finances;
  setFin: (p: Partial<Finances>) => void;
}

export function MortgagePage({ fin, setFin }: Props) {
  const [price, setPrice] = useState(95_000_000);
  const [programId, setProgramId] = useState(PROGRAMS[0].id);
  const [rate, setRate] = useState(PROGRAMS[0].rate);
  const [type, setType] = useState<RepaymentType>("annuity");
  const [extra, setExtra] = useState(0);

  const dp = Math.min(downPayment(fin), price);
  const principal = Math.max(0, price - dp);
  const months = fin.years * 12;
  const base = buildSchedule({ principal, annualRate: rate, months, type });
  const withExtra = buildSchedule({ principal, annualRate: rate, months, type, extraMonthly: extra });
  const res = extra > 0 ? withExtra : base;
  const cap = bankPaymentCap(fin);
  const dpPct = price ? (dp / price) * 100 : 0;
  const budgets = programBudgets(fin);

  const pay = base.firstPayment;
  const status =
    pay > cap ? { cls: "red", text: `Выше лимита банка (50% дохода = ${money(cap)})` }
    : pay > fin.maxPayment ? { cls: "red", text: "Выше вашего максимума" }
    : pay > fin.comfortPayment ? { cls: "orange", text: "Выше комфортного платежа" }
    : { cls: "green", text: "Комфортный платёж" };

  const yearly = (s: typeof base) => [{ x: 0, y: principal }, ...s.schedule.filter((r) => r.month % 12 === 0 || r.month === s.months).map((r) => ({ x: r.month / 12, y: r.balance }))];

  return (
    <>
      <section className="hero">
        <h1>Ипотека</h1>
        <p>Сколько будем платить, сколько переплатим и как быстрее закрыть кредит.</p>
      </section>

      <div className="grid grid-2">
        <div className="card">
          <div className="grid grid-2">
            <MoneyInput label="Цена квартиры" value={price} onChange={setPrice} />
            <MoneyInput label="Первоначальный взнос" value={fin.downPaymentTarget} onChange={(v) => setFin({ downPaymentTarget: v })} hint={`${pct(dpPct, 0)} от цены${dpPct < 20 ? " — банкам нужно от 20%" : ""}`} />
            <div className="field">
              <label>Программа</label>
              <select
                value={programId}
                onChange={(e) => {
                  const p = PROGRAMS.find((x) => x.id === e.target.value)!;
                  setProgramId(p.id);
                  setRate(p.rate);
                }}
              >
                {PROGRAMS.map((p) => <option key={p.id} value={p.id}>{p.bank} — {p.name} ({pct(p.rate)}){p.condition ? " · условно" : ""}</option>)}
              </select>
            </div>
            <MoneyInput label="Ставка" suffix="%" value={rate} onChange={setRate} />
            <div className="field">
              <label>Срок: {fin.years} лет</label>
              <input type="range" min={5} max={25} value={fin.years} onChange={(e) => setFin({ years: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Тип платежа</label>
              <div className="segmented">
                <button className={type === "annuity" ? "on" : ""} onClick={() => setType("annuity")}>Аннуитет</button>
                <button className={type === "differentiated" ? "on" : ""} onClick={() => setType("differentiated")}>Дифференц.</button>
              </div>
            </div>
            <MoneyInput label="Досрочно каждый месяц" value={extra} onChange={setExtra} hint="Сверх платежа, на сокращение срока" />
            <MoneyInput label="Доход семьи в месяц" value={fin.income} onChange={(v) => setFin({ income: v })} />
          </div>
        </div>

        <div className="card">
          <div className="stat-label">{type === "annuity" ? "Ежемесячный платёж" : "Первый платёж"}</div>
          <div className="stat-value" style={{ fontSize: 44 }}>{money(pay)}</div>
          {type === "differentiated" && <div className="stat-sub">последний — {money(base.lastPayment)}</div>}
          {extra > 0 && <div className="stat-sub">+ {money(extra)} досрочно = {money(pay + extra)} в месяц</div>}
          <p style={{ margin: "10px 0 20px" }}><span className={`badge ${status.cls}`}>{status.text}</span></p>
          <dl className="kv">
            <dt>Сумма займа</dt><dd>{money(principal)}</dd>
            <dt>Переплата</dt><dd>{money(res.overpayment)}</dd>
            <dt>Всего выплатим</dt><dd>{money(res.totalPaid + dp)}</dd>
            <dt>Срок</dt><dd>{duration(res.months)}</dd>
            <dt>Нагрузка на доход</dt><dd>{pct(((pay + extra) / fin.income) * 100, 0)}</dd>
          </dl>
          {extra > 0 && (
            <p style={{ marginBottom: 0 }}>
              <span className="badge green">
                Досрочка {mln(extra, 2)}/мес: закроем на {duration(base.months - withExtra.months)} раньше и сэкономим {mln(base.overpayment - withExtra.overpayment)}
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Остаток долга по годам</h3>
        <LineChart
          series={[
            { points: yearly(base), fill: extra === 0 },
            ...(extra > 0 ? [{ points: yearly(withExtra), className: "alt" }] : []),
          ]}
          formatX={(x) => (x === 0 ? "сейчас" : `${Math.round(x)} г.`)}
          formatY={(y) => mln(y, 0).replace(" ₸", "")}
        />
        {extra > 0 && (
          <div className="legend">
            <span><i style={{ background: "var(--accent)" }} />Без досрочки</span>
            <span><i style={{ background: "var(--orange)" }} />С досрочкой {mln(extra, 2)}/мес</span>
          </div>
        )}
      </div>

      <h2 className="section">Какую квартиру мы можем себе позволить</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          При взносе {mln(downPayment(fin))}, сроке {fin.years} лет, комфортном платеже {money(fin.comfortPayment)} и максимальном {money(Math.min(fin.maxPayment, cap))}.
        </p>
        <div className="table-wrap">
          <table className="table stack">
            <thead>
              <tr><th>Банк</th><th className="num">Ставка</th><th className="num">Комфортно</th><th className="num">Максимум</th></tr>
            </thead>
            <tbody>
              {budgets.map((b) => (
                <tr key={b.program.id}>
                  <td>
                    <strong>{b.program.bank}</strong><br /><span className="small muted">{b.program.name}</span>
                    {b.program.condition && <><br /><span className="badge blue">условно: {b.program.condition}</span></>}
                  </td>
                  <td className="num" data-label="Ставка">{pct(b.program.rate)}</td>
                  <td className="num" data-label="Комфортно"><strong>{mln(b.comfort.maxPrice)}</strong><br /><span className="small muted">{money(b.comfort.payment)}/мес</span></td>
                  <td className="num" data-label="Максимум"><strong>{mln(b.max.maxPrice)}</strong><br /><span className="small muted">{money(b.max.payment)}/мес</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Ставки по обзорам krisha.kz, kn.kz, profinance.kz за 2026 год; где источники расходятся, взята верхняя граница ставки.
          Перед сделкой сверяйте с банком. Программы 7-20-25, «Наурыз» и партнёрские ипотеки проверены — для вторички в Алматы они не подходят.
        </p>
      </div>
    </>
  );
}
