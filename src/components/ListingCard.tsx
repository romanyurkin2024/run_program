import { Finances, fitForPrice } from "../lib/finance";
import { mln, num, pct } from "../lib/format";
import { currentPrice, isDemo, priceChange, Scored } from "../lib/listings";
import { Listing } from "../lib/types";

export const SOURCE_NAMES: Record<string, string> = { krisha: "Krisha.kz", olx: "OLX", kn: "kn.kz" };

export function listingHref(id: string) {
  return `${isDemo ? "?demo" : ""}#/listing/${encodeURIComponent(id)}`;
}

export function scoreClass(score: number) {
  return score >= 65 ? "green" : score >= 45 ? "" : "red";
}

export function ListingCard({ s, fin, others = [] }: { s: Scored; fin: Finances; others?: Listing[] }) {
  const l = s.listing;
  const price = currentPrice(l);
  const change = priceChange(l);
  const fits = fitForPrice(price, fin).filter((f) => f.ok);
  const comfy = fits.some((f) => f.comfortable);
  return (
    <a className="card listing-card" href={listingHref(l.id)}>
      <div className="listing-photo" style={{ backgroundImage: l.photos[0] ? `url("${l.photos[0]}")` : undefined }}>
        <div className="badges">
          <span className="badge">{SOURCE_NAMES[l.source] ?? l.source}</span>
          {!l.active && <span className="badge red">Снято</span>}
        </div>
        <div className={`score badge ${scoreClass(s.score)}`} title="Оценка выгодности">{s.score}</div>
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
        <div className="badges" style={{ marginTop: 4 }}>
          {fits.length ? (
            <span className={`badge ${comfy ? "green" : "orange"}`}>
              Ипотека: {fits.length} {fits.length === 1 ? "программа" : "программы"}
              {comfy ? "" : " · выше комфорта"}
            </span>
          ) : (
            <span className="badge red">Не проходит по ипотеке</span>
          )}
          {s.vsMedian <= -0.25 && <span className="badge orange">Проверить цену</span>}
          {s.vsMedian <= -0.03 && s.vsMedian > -0.25 && <span className="badge blue">−{pct(-s.vsMedian * 100, 0)} к медиане</span>}
          {others.length > 0 && (
            <span className="badge" title="Эту же квартиру продают и другие — в карточке можно сравнить цены">
              ещё {others.length} {others.length === 1 ? "объявление" : others.length < 5 ? "объявления" : "объявлений"}
            </span>
          )}
          {l.seller?.type === "owner" && <span className="badge blue">Собственник</span>}
          {l.condition && <span className="badge">{l.condition}</span>}
        </div>
      </div>
    </a>
  );
}
