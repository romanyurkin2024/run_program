import { useEffect, useState } from "react";
import { decodePayload, saveExtra } from "../lib/extras";
import { Listing } from "../lib/types";
import { listingHref } from "../components/ListingCard";

/** Сюда закладка «В трекер» приносит фото, телефоны и описание со страницы объявления. */
export function ImportPage({ payload, listings, loading }: { payload: string; listings: Listing[]; loading: boolean }) {
  const [p] = useState(() => decodePayload(payload));
  useEffect(() => {
    if (p) saveExtra(p);
  }, [p]);

  if (!p) {
    return (
      <div className="card empty">
        <div className="icon">⚠️</div>
        <h3>Не удалось прочитать данные</h3>
        <p className="muted">Обновите закладку на странице <a href="#/bookmarklet">«Закладка»</a> и попробуйте ещё раз.</p>
      </div>
    );
  }
  const listing = listings.find((l) => l.id === p.id);
  return (
    <div className="card empty">
      <div className="icon">✅</div>
      <h3>Сохранено: {p.photos.length} фото{p.phones.length ? `, телефон ${p.phones.join(", ")}` : ""}</h3>
      {p.photos.length > 0 && (
        <div className="thumbs" style={{ justifyContent: "center", margin: "16px 0" }}>
          {p.photos.slice(0, 8).map((u) => <span key={u} className="thumb" style={{ backgroundImage: `url("${u}")` }} />)}
        </div>
      )}
      {loading ? (
        <p className="muted">Загрузка…</p>
      ) : listing ? (
        <p><a className="btn" href={listingHref(listing.id)}>Открыть квартиру в трекере</a></p>
      ) : (
        <p className="muted">
          Этой квартиры нет в нашей выборке (другой район, нет ремонта или не 3 комнаты), но данные сохранены —
          появятся, если она попадёт в выдачу.
        </p>
      )}
      {p.photos.length === 0 && (
        <p className="small muted">Фото не нашлись — дождитесь, пока страница объявления полностью загрузится, и нажмите закладку снова.</p>
      )}
    </div>
  );
}
