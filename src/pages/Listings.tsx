import { useEffect, useMemo, useState } from "react";
import { ListingCard } from "../components/ListingCard";
import { MultiSelect } from "../components/MultiSelect";
import { Finances, fitForPrice } from "../lib/finance";
import { currentPrice, dedupe, postedDate, priceChange, sameFlat, scoreListings } from "../lib/listings";
import { dayHeading } from "../lib/format";
import { FINISH_LABELS, Finish, Listing } from "../lib/types";

type Sort = "score" | "price" | "ppm2" | "published" | "updated" | "drop";

type SellerKind = "owner" | "agent" | "developer";
type FinishKey = Finish | "unknown";

interface Filters {
  complex: string[]; // несколько ЖК; пусто — все
  sort: Sort;
  onlyBudget: boolean;
  showInactive: boolean;
  nearOnly: boolean;
  seller: SellerKind[];
  finish: FinishKey[];
  // ещё фильтры: пустая строка — без ограничения
  priceFrom: string; // млн
  priceTo: string;
  areaFrom: string;
  areaTo: string;
  yearFrom: string;
  publishedDays: string; // опубликовано за N дней
  notFirst: boolean;
  notLast: boolean;
  onlyDrops: boolean;
  more: boolean; // панель «Ещё фильтры» раскрыта
}

const DEFAULT_FILTERS: Filters = {
  complex: [], sort: "score", onlyBudget: false, showInactive: false, nearOnly: true, seller: [], finish: [],
  priceFrom: "", priceTo: "", areaFrom: "", areaTo: "", yearFrom: "", publishedDays: "", notFirst: false, notLast: false, onlyDrops: false, more: false,
};
const MORE_KEYS: (keyof Filters)[] = ["priceFrom", "priceTo", "areaFrom", "areaTo", "yearFrom", "publishedDays", "notFirst", "notLast", "onlyDrops"];
const FILTERS_KEY = "kt.filters.v1";
const SELLER_LABELS: Record<SellerKind, string> = { owner: "Собственник", agent: "Агент", developer: "Застройщик (партнёрская ипотека)" };

/** Старые сохранённые фильтры хранили один вариант строкой — переводим в список. */
function migrate(saved: Record<string, unknown>): Partial<Filters> {
  const out = { ...saved } as Record<string, unknown>;
  const list = (v: unknown, map: Record<string, string[]> = {}) =>
    Array.isArray(v) ? v : typeof v === "string" && v ? map[v] ?? [v] : [];
  out.complex = list(saved.complex);
  out.seller = list(saved.seller, { resale: ["owner", "agent"] });
  out.finish = list(saved.finish, { ready: ["repair", "clean"] });
  if (saved.sort === "new") out.sort = "published";
  return out as Partial<Filters>;
}

const numOr = (s: string, fallback: number) => (s.trim() === "" || isNaN(Number(s.replace(",", "."))) ? fallback : Number(s.replace(",", ".")));
const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Фильтры переживают перезагрузку страницы (localStorage), пока их не сбросят кнопкой. */
function useFilters(): [Filters, (patch: Partial<Filters>) => void, () => void] {
  const [filters, setFilters] = useState<Filters>(() => {
    try {
      const raw = localStorage.getItem(FILTERS_KEY);
      if (raw) return { ...DEFAULT_FILTERS, ...migrate(JSON.parse(raw)) };
    } catch {
      /* private mode / blocked storage */
    }
    return DEFAULT_FILTERS;
  });
  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
    } catch {
      /* ignore */
    }
  }, [filters]);
  return [filters, (patch) => setFilters((f) => ({ ...f, ...patch })), () => setFilters(DEFAULT_FILTERS)];
}

/** Порядок в ленте по дате публикации: точные даты выше оценок, «или раньше» — в самом конце. */
function pubRank(l: Listing): string {
  if (!l.published) return "0";
  return `${l.publishedOpen ? "1" : "2"}${l.published}${l.publishedExact ? "1" : "0"}`;
}

function dayTitle(key: string, sort: Sort): string {
  if (sort === "updated") return `Обновлены: ${dayHeading(key).replace(/^(Сегодня|Вчера)/, (m) => m.toLowerCase())}`;
  const [day, approx] = key.split("|");
  if (!day) return "Дата публикации неизвестна";
  if (approx === "<") return `Опубликованы ${dayHeading(day).replace(/^(Сегодня|Вчера), /, "")} или раньше`;
  return approx ? `Опубликованы не позже ${dayHeading(day).replace(/^(Сегодня|Вчера), /, "")}` : `Опубликованы: ${dayHeading(day).replace(/^(Сегодня|Вчера)/, (m) => m.toLowerCase())}`;
}

/** Уже отсортированный по дате список → [[день, объявления], ...] */
function byDay<T extends { listing: Listing }>(xs: T[], dayOf: (l: Listing) => string): [string, T[]][] {
  const out: [string, T[]][] = [];
  for (const x of xs) {
    const d = dayOf(x.listing);
    if (out.length && out[out.length - 1][0] === d) out[out.length - 1][1].push(x);
    else out.push([d, [x]]);
  }
  return out;
}

export function ListingsPage({ listings, fin, loading }: { listings: Listing[]; fin: Finances; loading: boolean }) {
  const [filters, setFilters, resetFilters] = useFilters();
  const { complex, sort, onlyBudget, showInactive, nearOnly, seller, finish, more } = filters;
  const differs = (k: keyof Filters) => JSON.stringify(filters[k]) !== JSON.stringify(DEFAULT_FILTERS[k]);
  const changed = (Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]).some((k) => k !== "more" && differs(k));
  const moreActive = MORE_KEYS.filter(differs).length;

  const complexes = useMemo(
    () => [...new Set(listings.map((l) => l.complex).filter(Boolean) as string[])].sort(),
    [listings],
  );

  const { primaries, groups } = useMemo(() => dedupe(listings), [listings]);

  const scored = useMemo(() => {
    let xs = scoreListings(primaries);
    if (!showInactive) xs = xs.filter((s) => s.listing.active);
    // выбрали конкретные ЖК — показываем их, даже если они не в списке «рядом с MEGA»
    if (nearOnly && !complex.length) xs = xs.filter((s) => s.listing.near !== false);
    if (complex.length) xs = xs.filter((s) => complex.includes(s.listing.complex ?? ""));
    if (finish.length) xs = xs.filter((s) => finish.includes((s.listing.finish ?? "unknown") as FinishKey));
    if (seller.length) xs = xs.filter((s) => seller.includes((s.listing.seller?.type ?? "agent") as SellerKind));
    const f = filters;
    const [pMin, pMax] = [numOr(f.priceFrom, 0) * 1e6, numOr(f.priceTo, Infinity) * 1e6];
    const [aMin, aMax] = [numOr(f.areaFrom, 0), numOr(f.areaTo, Infinity)];
    xs = xs.filter(({ listing: l }) => {
      const price = currentPrice(l);
      if (price < pMin || price > pMax) return false;
      if ((l.area ?? 0) < aMin || (l.area ?? 0) > aMax) return false;
      if (f.yearFrom && (!l.year || l.year < numOr(f.yearFrom, 0))) return false;
      if (f.notFirst && l.floor === 1) return false;
      if (f.notLast && l.floor && l.floors && l.floor === l.floors) return false;
      if (f.onlyDrops && priceChange(l) >= 0) return false;
      // «20 окт. или раньше» — реальная дата неизвестна, в «за N дней» такие не попадают
      if (f.publishedDays && (!l.published || l.publishedOpen || l.published < isoDaysAgo(Number(f.publishedDays)))) return false;
      return true;
    });
    if (onlyBudget) xs = xs.filter((s) => fitForPrice(currentPrice(s.listing), fin, { developer: s.listing.seller?.developer, complex: s.listing.complex }).some((f) => f.ok));
    const by: Record<Sort, (a: (typeof xs)[0], b: (typeof xs)[0]) => number> = {
      score: (a, b) => b.score - a.score,
      price: (a, b) => currentPrice(a.listing) - currentPrice(b.listing),
      ppm2: (a, b) => a.ppm2 - b.ppm2,
      published: (a, b) => pubRank(b.listing).localeCompare(pubRank(a.listing)) || b.score - a.score,
      updated: (a, b) => postedDate(b.listing).localeCompare(postedDate(a.listing)) || b.score - a.score,
      drop: (a, b) => priceChange(a.listing) - priceChange(b.listing),
    };
    return xs.sort(by[sort]);
  }, [primaries, filters, fin]);

  return (
    <>
      <section className="hero">
        <h1>Квартиры</h1>
        <p>3 комнаты · Бостандыкский район, акцент на окрестности MEGA · отделка — любая, фильтр ниже</p>
      </section>
      <div className="toolbar">
        <MultiSelect label="ЖК" allLabel="Все ЖК" options={complexes.map((c) => ({ value: c, label: c }))} value={complex} onChange={(v) => setFilters({ complex: v })} />
        <div className="field">
          <label>Сортировка</label>
          <select value={sort} onChange={(e) => setFilters({ sort: e.target.value as Sort })}>
            <option value="score">Самые выгодные</option>
            <option value="price">Дешевле</option>
            <option value="ppm2">Дешевле за м²</option>
            <option value="drop">Больше снижение цены</option>
            <option value="published">Дата публикации (по дням)</option>
            <option value="updated">Дата обновления на Krisha (по дням)</option>
          </select>
        </div>
        <MultiSelect
          label="Отделка"
          allLabel="Любая"
          options={[...(Object.keys(FINISH_LABELS) as Finish[]).map((k) => ({ value: k, label: FINISH_LABELS[k] })), { value: "unknown", label: "Не указана" }]}
          value={finish}
          onChange={(v) => setFilters({ finish: v as FinishKey[] })}
        />
        <MultiSelect
          label="Продавец"
          allLabel="Все"
          options={(Object.keys(SELLER_LABELS) as SellerKind[]).map((k) => ({ value: k, label: SELLER_LABELS[k] }))}
          value={seller}
          onChange={(v) => setFilters({ seller: v as SellerKind[] })}
        />
        <div className="segmented" role="group">
          <button className={nearOnly ? "on" : ""} onClick={() => setFilters({ nearOnly: true })}>Рядом с MEGA</button>
          <button className={nearOnly ? "" : "on"} onClick={() => setFilters({ nearOnly: false })}>Весь район</button>
        </div>
        <div className="segmented" role="group">
          <button className={onlyBudget ? "" : "on"} onClick={() => setFilters({ onlyBudget: false })}>Все</button>
          <button className={onlyBudget ? "on" : ""} onClick={() => setFilters({ onlyBudget: true })}>В бюджете</button>
        </div>
        <label className="small muted" style={{ display: "flex", gap: 6, alignItems: "center", paddingBottom: 6 }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setFilters({ showInactive: e.target.checked })} />
          Показывать снятые
        </label>
        <button className={`btn ${moreActive ? "" : "ghost"}`} style={{ paddingBottom: 6 }} onClick={() => setFilters({ more: !more })}>
          {more ? "Скрыть фильтры" : "Ещё фильтры"}{moreActive ? ` · ${moreActive}` : ""}
        </button>
        {changed && (
          <button className="btn ghost" style={{ paddingBottom: 6 }} onClick={resetFilters}>
            Снять все фильтры
          </button>
        )}
      </div>
      {more && (
        <div className="card more-filters">
          <div className="field">
            <label>Цена, млн ₸</label>
            <div className="range">
              <input inputMode="decimal" placeholder="от" value={filters.priceFrom} onChange={(e) => setFilters({ priceFrom: e.target.value })} />
              <input inputMode="decimal" placeholder="до" value={filters.priceTo} onChange={(e) => setFilters({ priceTo: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Площадь, м²</label>
            <div className="range">
              <input inputMode="decimal" placeholder="от" value={filters.areaFrom} onChange={(e) => setFilters({ areaFrom: e.target.value })} />
              <input inputMode="decimal" placeholder="до" value={filters.areaTo} onChange={(e) => setFilters({ areaTo: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Год постройки от</label>
            <input inputMode="numeric" placeholder="любой" value={filters.yearFrom} onChange={(e) => setFilters({ yearFrom: e.target.value })} />
          </div>
          <div className="field">
            <label>Опубликовано</label>
            <select value={filters.publishedDays} onChange={(e) => setFilters({ publishedDays: e.target.value })}>
              <option value="">Когда угодно</option>
              <option value="0">Сегодня</option>
              <option value="1">За 2 дня</option>
              <option value="3">За 3 дня</option>
              <option value="7">За неделю</option>
              <option value="30">За месяц</option>
            </select>
            <span className="hint">для старых объявлений — по оценке «не позже»</span>
          </div>
          <div className="checks">
            <label><input type="checkbox" checked={filters.notFirst} onChange={(e) => setFilters({ notFirst: e.target.checked })} /> Не первый этаж</label>
            <label><input type="checkbox" checked={filters.notLast} onChange={(e) => setFilters({ notLast: e.target.checked })} /> Не последний этаж</label>
            <label><input type="checkbox" checked={filters.onlyDrops} onChange={(e) => setFilters({ onlyDrops: e.target.checked })} /> Только со снижением цены</label>
          </div>
        </div>
      )}
      {loading ? (
        <p className="muted">Загрузка…</p>
      ) : scored.length === 0 ? (
        <div className="card empty">
          <div className="icon">🏙️</div>
          <h3>Ничего не найдено</h3>
          <p className="muted">Измените фильтры или дождитесь следующего запуска парсера.</p>
        </div>
      ) : (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            {scored.length} квартир · одинаковые объявления разных продавцов склеены в одну карточку
            {nearOnly && complex.length > 0 && " · выбраны ЖК — показываем их по всему району"}
            {nearOnly && !complex.length && " · показаны только окрестности MEGA, остальные ЖК — «Весь район» или выберите ЖК"}
          </p>
          {sort === "published" || sort === "updated" ? (
            byDay(scored, sort === "published" ? (l) => (l.published ? `${l.published}|${l.publishedExact ? "" : l.publishedOpen ? "<" : "~"}` : "") : postedDate).map(([key, xs]) => (
              <section key={key} className="day-group">
                <h2 className="day-heading">
                  {dayTitle(key, sort)} <span className="muted small">· {xs.length}</span>
                </h2>
                <div className="grid grid-3">
                  {xs.map((s) => <ListingCard key={s.listing.id} s={s} fin={fin} others={sameFlat(s.listing, groups)} />)}
                </div>
              </section>
            ))
          ) : (
            <div className="grid grid-3">
              {scored.map((s) => <ListingCard key={s.listing.id} s={s} fin={fin} others={sameFlat(s.listing, groups)} />)}
            </div>
          )}
        </>
      )}
    </>
  );
}
