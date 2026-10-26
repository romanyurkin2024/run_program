import { Fragment, useState } from "react";
import { LineChart } from "../components/LineChart";
import { SOURCE_NAMES, scoreClass } from "../components/ListingCard";
import { Finances, downPayment, fitForPrice } from "../lib/finance";
import { date, mln, money, num, pct } from "../lib/format";
import { currentPrice, dedupe, firstPrice, isDemo, sameFlat, scoreListings } from "../lib/listings";
import { Listing } from "../lib/types";

interface Props {
  listing: Listing | undefined;
  listings: Listing[];
  fin: Finances;
  loading: boolean;
}

const SELLER_TYPES: Record<string, string> = { owner: "Собственник", agent: "Агент", developer: "Застройщик" };

export function ListingDetail({ listing, listings, fin, loading }: Props) {
  const [photo, setPhoto] = useState(0);
  if (loading) return <p className="muted">Загрузка…</p>;
  if (!listing) return <div className="card empty"><h3>Объявление не найдено</h3></div>;

  const l = listing;
  const { primaries, groups } = dedupe(listings);
  const s = scoreListings(primaries.some((p) => p.id === l.id) ? primaries : [...primaries, l]).find((x) => x.listing.id === l.id)!;
  const others = sameFlat(l, groups).sort((a, b) => Number(b.active) - Number(a.active) || currentPrice(a) - currentPrice(b));
  const price = currentPrice(l);
  const change = price - firstPrice(l);
  const fits = fitForPrice(price, fin).sort((a, b) => Number(b.ok) - Number(a.ok) || a.payment - b.payment);
  const dp = downPayment(fin);
  const t = (d: string) => new Date(d).getTime();
  const history = l.history;

  return (
    <>
      <p className="small"><a href={`${isDemo ? "?demo" : ""}#/listings`}>← Все квартиры</a></p>
      <section style={{ margin: "8px 0 24px" }}>
        <div className="badges" style={{ marginBottom: 8 }}>
          <span className="badge">{SOURCE_NAMES[l.source] ?? l.source}</span>
          {l.active ? <span className="badge green">Отслеживаем с {date(l.firstSeen)}</span> : <span className="badge red">Снято</span>}
          <span className={`badge ${scoreClass(s.score)}`}>Оценка {s.score}/100</span>
        </div>
        <h1 style={{ fontSize: "clamp(28px, 4.5vw, 40px)", letterSpacing: "-0.03em", margin: 0, lineHeight: 1.1 }}>
          {l.complex ? `ЖК ${l.complex}` : l.title}
        </h1>
        <p className="muted" style={{ margin: "6px 0 0" }}>{l.title} · {l.address}</p>
      </section>

      {l.photos.length > 0 && (
        <>
          <div className={`gallery ${l.photos.length < 3 ? "single" : ""}`}>
            <div className="main" style={{ backgroundImage: `url("${l.photos[photo]}")` }} />
            <div className="side">
              {l.photos.slice(photo + 1, photo + 3).map((p) => <div key={p} style={{ backgroundImage: `url("${p}")` }} />)}
            </div>
          </div>
          {l.photos.length > 1 && <div className="thumbs">
            {l.photos.map((p, i) => (
              <button key={p} className={i === photo ? "on" : ""} style={{ backgroundImage: `url("${p}")` }} onClick={() => setPhoto(i)} aria-label={`Фото ${i + 1}`} />
            ))}
          </div>}
        </>
      )}

      {l.extraSavedAt ? (
        <p className="small muted" style={{ margin: "10px 0 0" }}>
          ✅ Фото{l.seller?.phones?.length ? ", телефон" : ""} и описание сохранены закладкой {date(l.extraSavedAt)} ·{" "}
          <a href={l.url} target="_blank" rel="noreferrer">обновить с Krisha ↗</a>
        </p>
      ) : (l.photoCount ?? 0) > l.photos.length ? (
        <div className="card tight" style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span>📷 На Krisha {l.photoCount} фото, у нас — {l.photos.length}.</span>
          <span className="muted small">Откройте объявление и нажмите закладку «В трекер» — фото, телефон и описание появятся здесь.</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
            <a href="#/bookmarklet">Как поставить закладку</a>
            <a href={l.url} target="_blank" rel="noreferrer">Открыть на Krisha ↗</a>
          </span>
        </div>
      ) : null}

      <div className="grid grid-2" style={{ marginTop: 24 }}>
        <div className="card">
          <div className="stat-label">Цена</div>
          <div className="stat-value">{money(price)}</div>
          <div className="stat-sub">
            {num(Math.round(s.ppm2))} ₸/м²
            {s.vsMedian !== 0 && ` · ${s.vsMedian < 0 ? "на " + pct(-s.vsMedian * 100, 0) + " дешевле" : "на " + pct(s.vsMedian * 100, 0) + " дороже"} медианы`}
          </div>
          {change !== 0 && (
            <p style={{ margin: "12px 0 0" }}>
              <span className={`badge ${change < 0 ? "green" : "red"}`}>
                {change < 0 ? "Снизили" : "Подняли"} на {mln(Math.abs(change), 1)} с {date(l.history[0].date)}
              </span>
            </p>
          )}
          {s.reasons.filter((r) => !r.includes("медианы")).length > 0 && (
            <p className="small muted" style={{ marginBottom: 0 }}>{s.reasons.filter((r) => !r.includes("медианы")).join(" · ")}</p>
          )}
          <h3 style={{ marginTop: 20 }}>История цены</h3>
          {l.history.length > 1 ? (
            <LineChart
              height={180}
              step
              dots={history.length < 20}
              series={[{ points: history.map((h) => ({ x: t(h.date), y: h.price })), fill: true }]}
              formatX={(x) => new Date(x).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
              formatY={(y) => mln(y, 1).replace(" ₸", "")}
            />
          ) : (
            <p className="muted small" style={{ margin: 0 }}>
              Отслеживаем с {date(l.firstSeen)} — изменения цены появятся здесь, как только продавец её поменяет.
            </p>
          )}
        </div>

        <div className="card">
          <h3>Параметры</h3>
          <dl className="kv">
            <dt>Площадь</dt><dd>{l.area} м²{l.kitchenArea ? ` · кухня ${l.kitchenArea} м²` : ""}</dd>
            {l.floor && <><dt>Этаж</dt><dd>{l.floor} из {l.floors}</dd></>}
            {l.year && <><dt>Год постройки</dt><dd>{l.year}</dd></>}
            {l.buildingType && <><dt>Дом</dt><dd>{l.buildingType}</dd></>}
            {l.condition && <><dt>Состояние</dt><dd>{l.condition}</dd></>}
            {l.bathroom && <><dt>Санузел</dt><dd>{l.bathroom}</dd></>}
            <dt>Адрес</dt><dd>{l.address}</dd>
          </dl>
          <h3 style={{ marginTop: 20 }}>Продавец</h3>
          <dl className="kv">
            {l.seller?.name && <><dt>Имя</dt><dd>{l.seller.name}</dd></>}
            {l.seller?.type && <><dt>Кто</dt><dd>{SELLER_TYPES[l.seller.type] ?? l.seller.type}</dd></>}
            {l.seller?.phones?.map((p) => (
              <Fragment key={p}><dt>Телефон</dt><dd><a href={`tel:${p.replace(/[^\d+]/g, "")}`}>{p}</a></dd></Fragment>
            ))}
            {!l.seller?.phones?.length && <><dt>Телефон</dt><dd className="muted">на сайте объявления</dd></>}
          </dl>
          <p style={{ marginBottom: 0 }}>
            <a className="btn" href={l.url} target="_blank" rel="noreferrer">Открыть на {SOURCE_NAMES[l.source] ?? l.source} ↗</a>
          </p>
          {l.lat && l.lon && (
            <p className="small" style={{ marginBottom: 0 }}>
              <a href={`https://2gis.kz/almaty/geo/${l.lon},${l.lat}`} target="_blank" rel="noreferrer">Показать на 2ГИС ↗</a>
            </p>
          )}
        </div>
      </div>

      {others.length > 0 && (
        <>
          <h2 className="section">Эту же квартиру продают ещё {others.length}</h2>
          <div className="card">
            <p className="muted" style={{ marginTop: 0 }}>
              Совпадают ЖК, площадь и этаж. Разница в цене — это обычно комиссия агента: торгуйтесь от минимальной.
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Продавец</th><th className="num">Цена</th><th className="num">Разница</th><th></th></tr>
                </thead>
                <tbody>
                  {[l, ...others].map((o) => (
                    <tr key={o.id}>
                      <td>
                        {SELLER_TYPES[o.seller?.type ?? ""] ?? "Не указан"}
                        {o.id === l.id && <span className="badge" style={{ marginLeft: 6 }}>это объявление</span>}
                        {!o.active && <span className="badge red" style={{ marginLeft: 6 }}>снято</span>}
                      </td>
                      <td className="num"><strong>{money(currentPrice(o))}</strong></td>
                      <td className="num">{o.id === l.id ? "—" : `${currentPrice(o) >= price ? "+" : "−"}${mln(Math.abs(currentPrice(o) - price), 1)}`}</td>
                      <td className="num"><a href={o.url} target="_blank" rel="noreferrer">Krisha ↗</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <h2 className="section">Ипотека на эту квартиру</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Взнос {mln(dp)} ({pct((dp / price) * 100, 0)}) · заём {mln(Math.max(0, price - dp))} · срок {fin.years} лет
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Банк и программа</th><th className="num">Ставка</th><th className="num">Платёж / мес</th><th>Итог</th></tr>
            </thead>
            <tbody>
              {fits.map((f) => (
                <tr key={f.program.id}>
                  <td><strong>{f.program.bank}</strong><br /><span className="small muted">{f.program.name}</span></td>
                  <td className="num">{pct(f.program.rate)}</td>
                  <td className="num"><strong>{money(f.payment)}</strong></td>
                  <td>
                    {f.ok ? (
                      <span className={`badge ${f.comfortable ? "green" : "orange"}`}>{f.comfortable ? "Подходит" : "Подходит, выше комфорта"}</span>
                    ) : (
                      <span className="badge red">{f.reasons.join(", ")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {l.description && (
        <>
          <h2 className="section">Описание</h2>
          <div className="card" style={{ whiteSpace: "pre-line" }}>{l.description}</div>
        </>
      )}
    </>
  );
}
