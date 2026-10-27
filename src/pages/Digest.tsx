import { useMemo, useState } from "react";
import { listingHref } from "../components/ListingCard";
import { buildDigest, DigestPart, PriceMove, scrapeDays } from "../lib/digest";
import { Finances, fitForPrice } from "../lib/finance";
import { dayHeading, mln, num } from "../lib/format";
import { currentPrice, isDemo } from "../lib/listings";
import { FINISH_LABELS, Listing } from "../lib/types";

/** ✅ рыночная ипотека проходит · 🔵 только через Отбасы / партнёрскую при условии · ⚠️ дороже всех вариантов */
function mark(l: Listing, price: number, fin: Finances): { icon: string; title: string } {
  const fits = fitForPrice(price, fin, { developer: l.seller?.developer, complex: l.complex });
  if (fits.some((f) => f.ok && !f.condition)) return { icon: "✅", title: "Проходит по рыночной ипотеке" };
  if (fits.some((f) => f.ok && f.condition && !f.program.later)) return { icon: "🔵", title: "Только через Отбасы или партнёрскую программу — при условии" };
  return { icon: "⚠️", title: "Дороже всех доступных вариантов ипотеки" };
}

const SELLER = { owner: "собственник", agent: "агент", developer: "застройщик" } as Record<string, string>;

function Row({ l, fin, move, note }: { l: Listing; fin: Finances; move?: PriceMove; note?: string }) {
  const price = move ? move.to : currentPrice(l);
  const m = mark(l, price, fin);
  const diff = move ? move.to - move.from : 0;
  const meta = [
    l.area && `${l.area} м²`,
    l.floor && `${l.floor}/${l.floors} эт.`,
    l.finish && FINISH_LABELS[l.finish].toLowerCase() + (l.finishSource === "description" ? " (по описанию)" : ""),
    SELLER[l.seller?.type ?? ""],
    l.area && `${num(Math.round(price / l.area / 1000))} тыс/м²`,
  ].filter(Boolean);
  return (
    <a className="digest-row" href={listingHref(l.id)}>
      <div className="digest-main">
        <div className="digest-title">{l.complex ? `ЖК ${l.complex}` : l.address || l.title}</div>
        <div className="listing-meta">{meta.join(" · ")}</div>
        {note && <div className="digest-note">{note}</div>}
      </div>
      <div className="digest-price">
        <div>
          <b>{mln(price, 1)}</b> <span title={m.title}>{m.icon}</span>
        </div>
        {move && (
          <span className={`badge ${diff < 0 ? "green" : "red"}`}>
            {diff < 0 ? "↓" : "↑"} {mln(Math.abs(diff), 1)} · было {mln(move.from, 1)}
          </span>
        )}
      </div>
    </a>
  );
}

function Block({ title, hint, children, count }: { title: string; hint?: string; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <div className="digest-block">
      <h3>{title} <span className="muted small">· {count}</span></h3>
      {hint && <p className="muted small" style={{ margin: "-4px 0 8px" }}>{hint}</p>}
      <div className="card digest-list">{children}</div>
    </div>
  );
}

function Part({ title, p, fin }: { title: string; p: DigestPart; fin: Finances }) {
  const [showOld, setShowOld] = useState(false);
  const relistedNote = (l: Listing) => {
    const r = p.relisted.find((x) => x.fresh.id === l.id);
    return r && `👀 Та же площадь и этаж, что у пропавшего объявления за ${mln(currentPrice(r.gone), 1)} — возможно, та же квартира (проверить по фото)`;
  };
  const changes = p.fresh.length + p.drops.length + p.rises.length + p.missing.length + p.removed.length;
  return (
    <section className="digest-part">
      <h2>{title}</h2>
      {changes === 0 && <p className="muted">Без изменений.</p>}
      <Block title="🆕 Новые объявления" count={p.fresh.length} hint="Вышли после прошлого сбора">
        {p.fresh.map((l) => <Row key={l.id} l={l} fin={fin} note={relistedNote(l)} />)}
      </Block>
      <Block title="↓ Подешевели" count={p.drops.length}>
        {p.drops.map((m) => <Row key={m.listing.id} l={m.listing} fin={fin} move={m} />)}
      </Block>
      <Block title="↑ Подорожали" count={p.rises.length}>
        {p.rises.map((m) => <Row key={m.listing.id} l={m.listing} fin={fin} move={m} />)}
      </Block>
      <Block title="❌ Сняты" count={p.removed.length}>
        {p.removed.map((l) => <Row key={l.id} l={l} fin={fin} />)}
      </Block>
      <Block title="❔ Не нашлись в выдаче" count={p.missing.length} hint="Были в прошлом сборе, в этом — нет. Снятыми считаем, если их нет 2 дня подряд.">
        {p.missing.map((l) => <Row key={l.id} l={l} fin={fin} />)}
      </Block>
      {p.firstTracked.length > 0 && (
        <div className="digest-block">
          <button className="btn ghost inline" onClick={() => setShowOld(!showOld)}>
            {showOld ? "Скрыть" : "Показать"} объявления, впервые попавшие в трекер, но опубликованные раньше · {p.firstTracked.length}
          </button>
          {showOld && <div className="card digest-list" style={{ marginTop: 8 }}>{p.firstTracked.map((l) => <Row key={l.id} l={l} fin={fin} />)}</div>}
        </div>
      )}
    </section>
  );
}

export function DigestPage({ listings, fin, loading, day }: { listings: Listing[]; fin: Finances; loading: boolean; day?: string }) {
  const days = useMemo(() => scrapeDays(listings), [listings]);
  const current = day && days.includes(day) ? day : days[0];
  const d = useMemo(() => (current ? buildDigest(listings, current) : null), [listings, current]);
  if (loading) return <p className="muted">Загрузка…</p>;
  if (!d) return <div className="card">Данных пока нет.</div>;

  const both = (k: "fresh" | "drops" | "rises" | "missing" | "removed") => d.near[k].length + d.rest[k].length;
  const dropSum = [...d.near.drops, ...d.rest.drops].reduce((s, m) => s + (m.from - m.to), 0);
  const stats = [
    { label: "Новые", v: both("fresh"), near: d.near.fresh.length },
    { label: "Подешевели", v: both("drops"), near: d.near.drops.length, sub: dropSum ? `на ${mln(dropSum, 1)} в сумме` : undefined },
    { label: "Подорожали", v: both("rises"), near: d.near.rises.length },
    { label: "Пропали", v: both("missing") + both("removed"), near: d.near.missing.length + d.near.removed.length },
  ];
  const search = isDemo ? "?demo" : "";

  return (
    <>
      <section className="hero">
        <h1>Сводка дня</h1>
        <p>Что изменилось за день по сравнению с прошлым сбором: новые объявления, цены, пропавшие.</p>
      </section>
      <div className="digest-days" role="tablist">
        {days.slice(0, 14).map((x) => (
          <a key={x} role="tab" aria-selected={x === current} className={`chip ${x === current ? "on" : ""}`} href={`${search}#/digest/${x}`}>
            {dayHeading(x).replace(/^(Сегодня|Вчера), .*/, "$1")}
          </a>
        ))}
      </div>
      {d.firstDay ? (
        <div className="card">Первый день наблюдения — сравнивать пока не с чем.</div>
      ) : (
        <>
          <p className="muted small">{dayHeading(d.day)} по сравнению с {dayHeading(d.prev!).replace(/^(Сегодня|Вчера), /, "")}. ✅ рыночная ипотека проходит · 🔵 только через Отбасы/партнёрскую · ⚠️ дороже</p>
          <div className="grid grid-4 digest-stats">
            {stats.map((s) => (
              <div key={s.label} className="card stat">
                <div className="stat-label">{s.label}</div>
                <div className="stat-value">{s.v}</div>
                <div className="stat-sub">рядом с MEGA — {s.near}{s.sub ? ` · ${s.sub}` : ""}</div>
              </div>
            ))}
          </div>
          <Part title="📍 Рядом с MEGA" p={d.near} fin={fin} />
          <Part title="🗺 Остальной Бостандыкский район" p={d.rest} fin={fin} />
        </>
      )}
    </>
  );
}
