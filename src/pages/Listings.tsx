import { useEffect, useMemo, useState } from "react";
import { ListingCard } from "../components/ListingCard";
import { Finances, fitForPrice } from "../lib/finance";
import { currentPrice, daysOnMarket, dedupe, priceChange, sameFlat, scoreListings } from "../lib/listings";
import { Listing } from "../lib/types";

type Sort = "score" | "price" | "ppm2" | "new" | "drop";

interface Filters {
  complex: string;
  sort: Sort;
  onlyBudget: boolean;
  showInactive: boolean;
  nearOnly: boolean;
}

const DEFAULT_FILTERS: Filters = { complex: "", sort: "score", onlyBudget: false, showInactive: false, nearOnly: true };
const FILTERS_KEY = "kt.filters.v1";

/** Фильтры переживают перезагрузку страницы (localStorage), пока их не сбросят кнопкой. */
function useFilters(): [Filters, (patch: Partial<Filters>) => void, () => void] {
  const [filters, setFilters] = useState<Filters>(() => {
    try {
      const raw = localStorage.getItem(FILTERS_KEY);
      if (raw) return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
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

export function ListingsPage({ listings, fin, loading }: { listings: Listing[]; fin: Finances; loading: boolean }) {
  const [filters, setFilters, resetFilters] = useFilters();
  const { complex, sort, onlyBudget, showInactive, nearOnly } = filters;
  const changed = (Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]).some((k) => filters[k] !== DEFAULT_FILTERS[k]);

  const complexes = useMemo(
    () => [...new Set(listings.map((l) => l.complex).filter(Boolean) as string[])].sort(),
    [listings],
  );

  const { primaries, groups } = useMemo(() => dedupe(listings), [listings]);

  const scored = useMemo(() => {
    let xs = scoreListings(primaries);
    if (!showInactive) xs = xs.filter((s) => s.listing.active);
    if (nearOnly) xs = xs.filter((s) => s.listing.near !== false);
    if (complex) xs = xs.filter((s) => s.listing.complex === complex);
    if (onlyBudget) xs = xs.filter((s) => fitForPrice(currentPrice(s.listing), fin).some((f) => f.ok));
    const by: Record<Sort, (a: (typeof xs)[0], b: (typeof xs)[0]) => number> = {
      score: (a, b) => b.score - a.score,
      price: (a, b) => currentPrice(a.listing) - currentPrice(b.listing),
      ppm2: (a, b) => a.ppm2 - b.ppm2,
      new: (a, b) => daysOnMarket(a.listing) - daysOnMarket(b.listing),
      drop: (a, b) => priceChange(a.listing) - priceChange(b.listing),
    };
    return xs.sort(by[sort]);
  }, [primaries, complex, sort, onlyBudget, showInactive, nearOnly, fin]);

  return (
    <>
      <section className="hero">
        <h1>Квартиры</h1>
        <p>3 комнаты · вторичка с ремонтом · Бостандыкский район, акцент на окрестности MEGA</p>
      </section>
      <div className="toolbar">
        <div className="field">
          <label>ЖК</label>
          <select value={complex} onChange={(e) => setFilters({ complex: e.target.value })}>
            <option value="">Все ЖК</option>
            {complexes.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Сортировка</label>
          <select value={sort} onChange={(e) => setFilters({ sort: e.target.value as Sort })}>
            <option value="score">Самые выгодные</option>
            <option value="price">Дешевле</option>
            <option value="ppm2">Дешевле за м²</option>
            <option value="drop">Больше снижение цены</option>
            <option value="new">Новые</option>
          </select>
        </div>
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
        {changed && (
          <button className="btn ghost" style={{ paddingBottom: 6 }} onClick={resetFilters}>
            Снять все фильтры
          </button>
        )}
      </div>
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
          <p className="muted small" style={{ marginTop: 0 }}>{scored.length} квартир · одинаковые объявления разных продавцов склеены в одну карточку</p>
          <div className="grid grid-3">
            {scored.map((s) => <ListingCard key={s.listing.id} s={s} fin={fin} others={sameFlat(s.listing, groups)} />)}
          </div>
        </>
      )}
    </>
  );
}
