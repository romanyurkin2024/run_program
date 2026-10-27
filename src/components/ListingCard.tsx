import { Finances, fitForPrice } from "../lib/finance";
import { mln, num, pct, shortDate } from "../lib/format";
import { currentPrice, isDemo, priceChange, Scored } from "../lib/listings";
import { FINISH_LABELS, Listing } from "../lib/types";
import { findFavorite, toggleFavorite, useFavorites } from "../lib/favorites";

export const SOURCE_NAMES: Record<string, string> = { krisha: "Krisha.kz", olx: "OLX", kn: "kn.kz" };

export function listingHref(id: string) {
  return `${isDemo ? "?demo" : ""}#/listing/${encodeURIComponent(id)}`;
}

export function scoreClass(score: number) {
  return score >= 65 ? "green" : score >= 45 ? "" : "red";
}

/** Отделка: категория (цвет) + исходная формулировка Krisha; «по описанию» — если состояние не указано, а нашли в тексте. */
export function FinishBadge({ l }: { l: Listing }) {
  if (!l.finish) return <span className="badge" title="Krisha не указывает состояние, в описании тоже не нашли">отделка не указана</span>;
  const cls = l.finish === "repair" || l.finish === "clean" ? "green" : l.finish === "rough" || l.finish === "needs_repair" ? "orange" : "";
  const label = l.finishSource === "krisha" && l.condition ? l.condition : FINISH_LABELS[l.finish].toLowerCase();
  return <span className={`badge ${cls}`}>{label}{l.finishSource === "description" ? " (по описанию)" : ""}</span>;
}

/** Звёздочка «в избранное». Внутри карточки-ссылки — поэтому гасим переход по клику. */
export function FavButton({ l, big = false }: { l: Listing; big?: boolean }) {
  const on = !!findFavorite(useFavorites(), l);
  return (
    <button
      type="button"
      className={`fav ${on ? "on" : ""} ${big ? "big" : ""}`}
      aria-pressed={on}
      title={on ? "Убрать из избранного" : "В избранное"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(l);
      }}
    >
      {on ? "★" : "☆"}
      {big && <span>{on ? " В избранном" : " В избранное"}</span>}
    </button>
  );
}

export const PUBLISHED_ESTIMATE_HINT =
  "Krisha не показывает дату публикации в выдаче. Номера объявлений растут со временем, поэтому оцениваем сверху: " +
  "не позже самой ранней даты обновления среди более новых объявлений. Для объявлений, вышедших после начала слежения, дата точная.";

/** Когда объявление появилось: дата на Krisha и с какого дня оно у нас в трекере. */
export function PostedLine({ l }: { l: Listing }) {
  return (
    <div className="listing-meta posted-line">
      {l.published && (
        <span title={l.publishedExact ? "Объявление вышло после прошлого сбора — дата точная" : PUBLISHED_ESTIMATE_HINT}>
          📅 <b>опубликовано {l.publishedExact ? shortDate(l.published) : l.publishedOpen ? `${shortDate(l.published)} или раньше` : `не позже ${shortDate(l.published)}`}</b>
        </span>
      )}
      {l.posted && <span title="Дата последнего обновления/поднятия объявления на Krisha">🔄 обновлено {shortDate(l.posted)}</span>}
    </div>
  );
}

export function ListingCard({ s, fin, others = [] }: { s: Scored; fin: Finances; others?: Listing[] }) {
  const l = s.listing;
  const price = currentPrice(l);
  const change = priceChange(l);
  const all = fitForPrice(price, fin, { developer: l.seller?.developer, complex: l.complex });
  const fits = all.filter((f) => f.ok && !f.condition);
  const comfy = fits.some((f) => f.comfortable);
  // Отбасы под 8,5% при 50% на депозите — показываем отдельно, это самый дешёвый путь
  const otbasy = all.find((f) => f.ok && f.condition && !f.program.later);
  return (
    <a className="card listing-card" href={listingHref(l.id)}>
      <div className="listing-photo" style={{ backgroundImage: l.photos[0] ? `url("${l.photos[0]}")` : undefined }}>
        <div className="badges">
          <span className="badge">{SOURCE_NAMES[l.source] ?? l.source}</span>
          {!l.active && <span className="badge red">Снято</span>}
          {Math.max(l.photos.length, l.photoCount ?? 0) > 1 && (
            <span className="badge">📷 {l.extraSavedAt ? l.photos.length : Math.max(l.photos.length, l.photoCount ?? 0)}</span>
          )}
        </div>
        <div className={`score badge ${scoreClass(s.score)}`} title="Оценка выгодности">{s.score}</div>
        <FavButton l={l} />
      </div>
      <div className="listing-body">
        <div className="listing-price">
          {mln(price, 1)}{" "}
          {change !== 0 && (
            <span className={`badge ${change < 0 ? "green" : "red"}`}>
              {change < 0 ? "↓" : "↑"} {mln(Math.abs(change), 1)}
            </span>
          )}
        </div>
        <div className="listing-meta">
          {[`${num(Math.round(s.ppm2))} ₸/м²`, `${l.area} м²`, l.floor && `${l.floor}/${l.floors} эт.`, l.year].filter(Boolean).join(" · ")}
        </div>
        <div style={{ fontWeight: 600 }}>{l.complex ? `ЖК ${l.complex}` : l.title}</div>
        <div className="listing-meta">{l.address}</div>
        <PostedLine l={l} />
        <div className="badges" style={{ marginTop: 4 }}>
          {fits.length ? (
            <span className={`badge ${comfy ? "green" : "orange"}`}>
              Ипотека: {fits.length} {fits.length === 1 ? "программа" : "программы"}
              {comfy ? "" : " · выше комфорта"}
            </span>
          ) : (
            <span className="badge red">Не проходит по ипотеке</span>
          )}
          {otbasy && <span className="badge blue" title={`Если ${otbasy.condition}`}>Отбасы ~{Math.round(otbasy.payment / 1000)} тыс/мес</span>}
          {s.vsMedian <= -0.25 && <span className="badge orange">Проверить цену</span>}
          {s.vsMedian <= -0.03 && s.vsMedian > -0.25 && <span className="badge blue">−{pct(-s.vsMedian * 100, 0)} к медиане</span>}
          {others.length > 0 && (
            <span className="badge" title="Эту же квартиру продают и другие — в карточке можно сравнить цены">
              ещё {others.length} {others.length === 1 ? "объявление" : others.length < 5 ? "объявления" : "объявлений"}
            </span>
          )}
          {l.seller?.type === "owner" && <span className="badge blue">Собственник</span>}
          {l.seller?.type === "developer" && <span className="badge blue">От застройщика{l.seller.developer ? ` ${l.seller.developer}` : ""}</span>}
          <FinishBadge l={l} />
        </div>
      </div>
    </a>
  );
}
