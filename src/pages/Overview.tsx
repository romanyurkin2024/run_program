import { ListingCard } from "../components/ListingCard";
import { Finances, bankPaymentCap, downPayment, programBudgets } from "../lib/finance";
import { mln, money, num, pct } from "../lib/format";
import { currentPrice, dedupe, isDemo, median, pricePerM2, priceChange, sameFlat, scoreListings } from "../lib/listings";
import { Listing } from "../lib/types";

interface Props {
  listings: Listing[];
  fin: Finances;
}

export function Overview({ listings, fin }: Props) {
  const allBudgets = programBudgets(fin);
  // бюджет считаем по программам, доступным сразу; условные (Отбасы) показываем отдельной подсказкой
  const budgets = allBudgets.filter((b) => !b.program.condition);
  const otbasy = allBudgets.find((b) => b.program.id === "otbasy-intermediate");
  const comfortMax = Math.max(0, ...budgets.map((b) => b.comfort.maxPrice));
  const hardMax = Math.max(0, ...budgets.map((b) => b.max.maxPrice));
  const { primaries, groups } = dedupe(listings.filter((l) => l.near !== false));
  const active = primaries.filter((l) => l.active);
  // без отсечения по бюджету: подходит ли квартира по ипотеке, видно по плашке на карточке
  const scored = scoreListings(active).sort((a, b) => b.score - a.score);
  const inBudget = active.filter((l) => currentPrice(l) <= hardMax).length;
  const drops = active.filter((l) => priceChange(l) < 0).length;
  const medPpm2 = median(active.map(pricePerM2).filter(Boolean));
  const cap = bankPaymentCap(fin);
  const search = isDemo ? "?demo" : "";

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Цель</p>
        <h1>Трёхкомнатная квартира рядом с MEGA.</h1>
        <p>
          Estet, Element, Terra и соседние ЖК — вторичка с ремонтом. Каждый день собираем объявления,
          следим за ценами и проверяем, что проходит по ипотеке.
        </p>
      </section>

      <div className="grid grid-4">
        <div className="card">
          <div className="stat-label">Первоначальный взнос</div>
          <div className="stat-value">{mln(downPayment(fin))}</div>
          <div className="stat-sub">к {fin.purchaseDate.split("-").reverse().join(".")}</div>
        </div>
        <div className="card">
          <div className="stat-label">Бюджет при комфортном платеже</div>
          <div className="stat-value">до {mln(comfortMax)}</div>
          <div className="stat-sub">платёж ≤ {mln(fin.comfortPayment, 2)} / мес</div>
        </div>
        <div className="card">
          <div className="stat-label">Максимальный бюджет</div>
          <div className="stat-value">до {mln(hardMax)}</div>
          <div className="stat-sub">банк одобрит платёж до {mln(cap, 2)}</div>
        </div>
        <div className="card">
          <div className="stat-label">Рядом с MEGA в бюджете</div>
          <div className="stat-value">{num(inBudget)}<span className="muted" style={{ fontSize: 17 }}> / {num(active.length)}</span></div>
          <div className="stat-sub">{drops ? `${drops} со снижением цены` : "снижений цены пока нет"}</div>
        </div>
      </div>

      {cap < fin.maxPayment && (
        <div className="card" style={{ marginTop: 16 }}>
          <span className="badge orange">Важно</span>{" "}
          Банки ограничивают платёж 50% официального дохода: при доходе {money(fin.income)} это {money(cap)}.
          Платёж {mln(fin.maxPayment, 1)} одобрят, только если подтверждённый доход будет не меньше {money(fin.maxPayment * 2)}.
        </div>
      )}

      {otbasy && (
        <div className="card" style={{ marginTop: 16 }}>
          <span className="badge blue">Дешевле</span>{" "}
          <b>Отбасы банк, промежуточный заём ~{pct(otbasy.program.rate)}</b>: если {otbasy.program.condition}, квартира до{" "}
          {mln(otbasy.max.maxPrice)} обойдётся в {money(otbasy.max.payment)} в месяц — почти втрое меньше, чем под 20–22% в обычных банках.
          Условия уточнить в отделении.
        </div>
      )}

      <h2 className="section">Лучшие варианты</h2>
      {scored.length === 0 ? (
        <div className="card empty">
          <div className="icon">🔍</div>
          <h3>Объявлений пока нет</h3>
          <p className="muted">Парсер запускается раз в день. После первого запуска здесь появятся квартиры.</p>
          <a href="?demo#/">Посмотреть интерфейс на демо-данных →</a>
        </div>
      ) : (
        <>
          <div className="grid grid-3">
            {scored.slice(0, 9).map((s) => <ListingCard key={s.listing.id} s={s} fin={fin} others={sameFlat(s.listing, groups)} />)}
          </div>
          <p style={{ textAlign: "center", marginTop: 20 }}>
            <a href={`${search}#/listings`}>Все {active.length} квартир рядом с MEGA →</a>
            {medPpm2 > 0 && <span className="muted"> · медиана {num(Math.round(medPpm2))} ₸/м²</span>}
          </p>
        </>
      )}
    </>
  );
}
