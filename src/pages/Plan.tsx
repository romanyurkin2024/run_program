import { LineChart } from "../components/LineChart";
import { MoneyInput } from "../components/MoneyInput";
import { Finances, bankPaymentCap, monthsUntil, programBudgets } from "../lib/finance";
import { mln, money, pct } from "../lib/format";

interface Props {
  fin: Finances;
  setFin: (p: Partial<Finances>) => void;
  resetFin: () => void;
}

export function PlanPage({ fin, setFin, resetFin }: Props) {
  const months = monthsUntil(fin.purchaseDate);
  const projected = fin.savingsNow + fin.monthlySavings * months;
  const gap = fin.downPaymentTarget - projected;
  const needMonthly = months > 0 ? Math.max(0, (fin.downPaymentTarget - fin.savingsNow) / months) : 0;
  const progress = fin.downPaymentTarget ? Math.min(100, (fin.savingsNow / fin.downPaymentTarget) * 100) : 0;
  const cap = bankPaymentCap(fin);
  const budgets = programBudgets(fin);
  const best = budgets.reduce((a, b) => (b.comfort.maxPrice > a.comfort.maxPrice ? b : a), budgets[0]);

  const now = new Date();
  const points = Array.from({ length: months + 1 }, (_, i) => ({
    x: new Date(now.getFullYear(), now.getMonth() + i, 1).getTime(),
    y: fin.savingsNow + fin.monthlySavings * i,
  }));
  const target = points.map((p) => ({ x: p.x, y: fin.downPaymentTarget }));

  return (
    <>
      <section className="hero">
        <h1>План</h1>
        <p>Накопления до покупки и финансовые ограничения. Цифры сохраняются только в этом браузере.</p>
      </section>

      <div className="grid grid-2">
        <div className="card">
          <div className="grid grid-2">
            <MoneyInput label="Накоплено сейчас" value={fin.savingsNow} onChange={(v) => setFin({ savingsNow: v })} />
            <MoneyInput label="Откладываем в месяц" value={fin.monthlySavings} onChange={(v) => setFin({ monthlySavings: v })} />
            <MoneyInput label="Цель по взносу" value={fin.downPaymentTarget} onChange={(v) => setFin({ downPaymentTarget: v })} />
            <div className="field">
              <label>Дата покупки</label>
              <input type="month" value={fin.purchaseDate} onChange={(e) => setFin({ purchaseDate: e.target.value })} />
            </div>
            <MoneyInput label="Резерв (не во взнос)" value={fin.reserve} onChange={(v) => setFin({ reserve: v })} hint="Подушка, нотариус, страховка, оценка, переезд" />
            <MoneyInput label="Доход семьи в месяц" value={fin.income} onChange={(v) => setFin({ income: v })} hint="Официальный — его видит банк" />
            <MoneyInput label="Комфортный платёж" value={fin.comfortPayment} onChange={(v) => setFin({ comfortPayment: v })} />
            <MoneyInput label="Максимальный платёж" value={fin.maxPayment} onChange={(v) => setFin({ maxPayment: v })} />
            <MoneyInput label="Другие кредиты в месяц" value={fin.otherDebtPayments} onChange={(v) => setFin({ otherDebtPayments: v })} />
          </div>
          <p style={{ marginBottom: 0 }}><button className="btn ghost" onClick={resetFin}>Сбросить к значениям по умолчанию</button></p>
        </div>

        <div className="grid" style={{ alignContent: "start" }}>
          <div className="card">
            <div className="stat-label">Прогресс к взносу</div>
            <div className="stat-value">{mln(fin.savingsNow)} <span className="muted" style={{ fontSize: 17 }}>из {mln(fin.downPaymentTarget)}</span></div>
            <div className="progress" style={{ margin: "12px 0" }}><div style={{ width: `${progress}%` }} /></div>
            <div className="stat-sub">
              {months} мес до покупки ·{" "}
              {fin.monthlySavings > 0 || fin.savingsNow > 0
                ? gap > 0
                  ? `не хватит ${mln(gap)} — нужно откладывать ${money(needMonthly)} в месяц`
                  : `накопим ${mln(projected)}, цель достигнута`
                : "заполните накопления, чтобы увидеть прогноз"}
            </div>
          </div>
          <div className="card">
            <div className="stat-label">Лимит банка по платежу</div>
            <div className="stat-value">{money(cap)}</div>
            <div className="stat-sub">
              50% от {money(fin.income)}
              {fin.otherDebtPayments ? ` минус ${money(fin.otherDebtPayments)} других кредитов` : ""}.
              {fin.comfortPayment > 0 && ` Комфортный платёж — ${pct((fin.comfortPayment / fin.income) * 100, 0)} дохода.`}
            </div>
          </div>
          {best && (
            <div className="card">
              <div className="stat-label">Ориентир по цене квартиры</div>
              <div className="stat-value">до {mln(best.comfort.maxPrice)}</div>
              <div className="stat-sub">комфортно, {best.program.bank} · максимум до {mln(best.max.maxPrice)}</div>
            </div>
          )}
        </div>
      </div>

      {months > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Накопления до даты покупки</h3>
          <LineChart
            series={[{ points, fill: true }, { points: target, className: "alt" }]}
            formatX={(x) => new Date(x).toLocaleDateString("ru-RU", { month: "short", year: "2-digit" })}
            formatY={(y) => mln(y, 0).replace(" ₸", "")}
          />
          <div className="legend">
            <span><i style={{ background: "var(--accent)" }} />Прогноз накоплений</span>
            <span><i style={{ background: "var(--orange)" }} />Цель {mln(fin.downPaymentTarget)}</span>
          </div>
        </div>
      )}
    </>
  );
}
