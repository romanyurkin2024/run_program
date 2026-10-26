import { useMemo, useState } from "react";
import { ListingCard } from "../components/ListingCard";
import { Finances, fitForPrice } from "../lib/finance";
import { currentPrice, daysOnMarket, dedupe, priceChange, sameFlat, scoreListings } from "../lib/listings";
import { Listing } from "../lib/types";

type Sort = "score" | "price" | "ppm2" | "new" | "drop";

export function ListingsPage({ listings, fin, loading }: { listings: Listing[]; fin: Finances; loading: boolean }) {
  const [complex, setComplex] = useState("");
  const [sort, setSort] = useState<Sort>("score");
  const [onlyBudget, setOnlyBudget] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [nearOnly, setNearOnly] = useState(true);

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
          <select value={complex} onChange={(e) => setComplex(e.target.value)}>
            <option value="">Все ЖК</option>
            {complexes.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Сортировка</label>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="score">Самые выгодные</option>
            <option value="price">Дешевле</option>
            <option value="ppm2">Дешевле за м²</option>
            <option value="drop">Больше снижение цены</option>
            <option value="new">Новые</option>
          </select>
        </div>
        <div className="segmented" role="group">
          <button className={nearOnly ? "on" : ""} onClick={() => setNearOnly(true)}>Рядом с MEGA</button>
          <button className={nearOnly ? "" : "on"} onClick={() => setNearOnly(false)}>Весь район</button>
        </div>
        <div className="segmented" role="group">
          <button className={onlyBudget ? "" : "on"} onClick={() => setOnlyBudget(false)}>Все</button>
          <button className={onlyBudget ? "on" : ""} onClick={() => setOnlyBudget(true)}>В бюджете</button>
        </div>
        <label className="small muted" style={{ display: "flex", gap: 6, alignItems: "center", paddingBottom: 6 }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Показывать снятые
        </label>
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
