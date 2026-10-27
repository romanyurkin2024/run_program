import { useEffect, useMemo, useState } from "react";
import { ListingCard } from "../components/ListingCard";
import { Finances } from "../lib/finance";
import { date, mln } from "../lib/format";
import { Favorite, exportFavorites, importFavorites, removeFavorite, setNote, useFavorites } from "../lib/favorites";
import { currentPrice, dedupe, sameFlat, scoreListings } from "../lib/listings";
import { Listing } from "../lib/types";

/** Текущая карточка для избранного: то же объявление, а если его нет — та же квартира у другого продавца. */
function resolve(f: Favorite, listings: Listing[]): Listing | undefined {
  const same = listings.filter((l) => l.id === f.id || (!!f.group && l.group === f.group));
  return same.find((l) => l.id === f.id && l.active) ?? same.filter((l) => l.active).sort((a, b) => currentPrice(a) - currentPrice(b))[0] ?? same[0];
}

function Note({ f }: { f: Favorite }) {
  const [text, setText] = useState(f.note ?? "");
  useEffect(() => setText(f.note ?? ""), [f.note]);
  return (
    <textarea
      className="fav-note"
      placeholder="Заметка: звонили, торг, что смотреть на просмотре…"
      value={text}
      rows={1}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== (f.note ?? "") && setNote(f.id, text.trim())}
    />
  );
}

export function FavoritesPage({ listings, fin, loading, importPayload }: { listings: Listing[]; fin: Finances; loading: boolean; importPayload?: string }) {
  const favs = useFavorites();
  const [imported, setImported] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!importPayload) return;
    try {
      const n = importFavorites(importPayload);
      setImported(n ? `Добавлено в избранное: ${n}` : "Всё из ссылки уже было в избранном");
    } catch {
      setImported("Ссылка повреждена — попросите прислать её ещё раз");
    }
    history.replaceState(null, "", "#/favorites");
  }, [importPayload]);

  const { groups } = useMemo(() => dedupe(listings), [listings]);
  const items = useMemo(() => {
    const found = favs.map((f) => ({ f, l: resolve(f, listings) }));
    const scored = scoreListings(found.map((x) => x.l).filter((l): l is Listing => !!l));
    return found.map(({ f, l }) => ({ f, l, s: l && scored.find((s) => s.listing.id === l.id) }));
  }, [favs, listings]);

  async function share() {
    const url = `${location.origin}${location.pathname}#/favorites/import/${exportFavorites(favs)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      prompt("Скопируйте ссылку и откройте её на другом устройстве", url);
    }
  }

  return (
    <>
      <section className="hero">
        <h1>Избранное</h1>
        <p>Хранится в этом браузере: у каждого своё, не пропадает при обновлении сайта и перезагрузке.</p>
      </section>
      {imported && <div className="card tight" style={{ marginBottom: 16 }}>{imported}</div>}
      {loading ? (
        <p className="muted">Загрузка…</p>
      ) : favs.length === 0 ? (
        <div className="card empty">
          <div className="icon">☆</div>
          <h3>Пока пусто</h3>
          <p className="muted">Нажмите ☆ на фото квартиры в списке или «В избранное» на её странице.</p>
        </div>
      ) : (
        <>
          <div className="toolbar" style={{ alignItems: "center" }}>
            <span className="muted small">{favs.length} в избранном</span>
            <button className="btn ghost" onClick={share}>{copied ? "Ссылка скопирована ✓" : "Перенести на другое устройство"}</button>
          </div>
          <div className="grid grid-3">
            {items.map(({ f, l, s }) => {
              const now = l ? currentPrice(l) : undefined;
              const diff = now !== undefined ? now - f.priceAtAdd : 0;
              return (
                <div key={f.id} className="fav-item">
                  {l && s ? (
                    <ListingCard s={s} fin={fin} others={sameFlat(l, groups)} />
                  ) : (
                    <div className="card fav-gone">
                      <div className="badges"><span className="badge red">Нет в выдаче Krisha</span></div>
                      <h3 style={{ margin: "8px 0 4px" }}>{f.complex ? `ЖК ${f.complex}` : f.title}</h3>
                      <div className="listing-meta">{[f.area && `${f.area} м²`, f.floor && `${f.floor}/${f.floors} эт.`, f.address].filter(Boolean).join(" · ")}</div>
                      <div className="listing-meta">Было {mln(f.priceAtAdd, 1)} · <a href={f.url} target="_blank" rel="noreferrer">открыть на Krisha ↗</a></div>
                    </div>
                  )}
                  <div className="fav-meta">
                    <span className="muted">В избранном с {date(f.addedAt)}, тогда {mln(f.priceAtAdd, 1)}</span>
                    {diff !== 0 && <span className={`badge ${diff < 0 ? "green" : "red"}`}>{diff < 0 ? "↓" : "↑"} {mln(Math.abs(diff), 1)} с тех пор</span>}
                    {l && !l.active && <span className="badge red">Снято</span>}
                    {l && l.id !== f.id && <span className="badge" title="Исходное объявление снято или подорожало — показываем ту же квартиру у другого продавца">другой продавец</span>}
                    <button className="btn ghost" style={{ marginLeft: "auto", padding: 0 }} onClick={() => removeFavorite(f.id)}>Убрать</button>
                  </div>
                  <Note f={f} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
