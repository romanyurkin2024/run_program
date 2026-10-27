import { useEffect, useMemo, useState } from "react";
import { useFinances } from "./lib/finance";
import { isDemo, useListings } from "./lib/listings";
import { Overview } from "./pages/Overview";
import { ListingsPage } from "./pages/Listings";
import { ScrapeControl } from "./components/ScrapeControl";
import { FavoritesPage, JoinPage } from "./pages/Favorites";
import { useFavorites } from "./lib/favorites";
import { ListingDetail } from "./pages/ListingDetail";
import { MortgagePage } from "./pages/Mortgage";
import { PlanPage } from "./pages/Plan";
import { ImportPage } from "./pages/Import";
import { BookmarkletPage } from "./pages/Bookmarklet";
import { ProgramsPage } from "./pages/Programs";
import { date } from "./lib/format";
import { useExtras, withExtras } from "./lib/extras";

function useHashRoute(): string {
  const [route, setRoute] = useState(() => location.hash.slice(1) || "/");
  useEffect(() => {
    const on = () => {
      setRoute(location.hash.slice(1) || "/");
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}

const TABS = [
  { path: "/", label: "Обзор" },
  { path: "/listings", label: "Квартиры" },
  { path: "/favorites", label: "Избранное" },
  { path: "/mortgage", label: "Ипотека" },
  { path: "/programs", label: "Банки" },
  { path: "/plan", label: "План" },
];

export function App() {
  const route = useHashRoute();
  const [fin, setFin, resetFin] = useFinances();
  const { data, error } = useListings();
  const extras = useExtras();
  const listings = useMemo(() => withExtras(data?.listings ?? [], extras), [data, extras]);
  const search = isDemo ? "?demo" : "";
  const favCount = useFavorites().length;

  let page;
  if (route.startsWith("/listing/")) {
    const id = decodeURIComponent(route.slice("/listing/".length));
    page = <ListingDetail listing={listings.find((l) => l.id === id)} listings={listings} fin={fin} loading={!data && !error} />;
  } else if (route.startsWith("/import/")) {
    page = <ImportPage payload={route.slice("/import/".length)} listings={listings} loading={!data && !error} />;
  } else if (route === "/favorites" || route.startsWith("/favorites/import/")) {
    page = <FavoritesPage listings={listings} fin={fin} loading={!data && !error} importPayload={route.startsWith("/favorites/import/") ? route.slice("/favorites/import/".length) : undefined} />;
  } else if (route.startsWith("/join/")) {
    page = <JoinPage listId={route.slice("/join/".length)} />;
  } else if (route === "/programs") {
    page = <ProgramsPage />;
  } else if (route === "/bookmarklet") {
    page = <BookmarkletPage />;
  } else if (route === "/listings") {
    page = <ListingsPage listings={listings} fin={fin} loading={!data && !error} />;
  } else if (route === "/mortgage") {
    page = <MortgagePage fin={fin} setFin={setFin} />;
  } else if (route === "/plan") {
    page = <PlanPage fin={fin} setFin={setFin} resetFin={resetFin} />;
  } else {
    page = <Overview listings={listings} fin={fin} />;
  }

  const active = route.startsWith("/listing/") || route === "/listings" ? "/listings" : route.startsWith("/favorites") || route.startsWith("/join/") ? "/favorites" : route;

  return (
    <>
      {isDemo && <div className="demo-banner">Демо-режим: объявления вымышленные, только для превью интерфейса</div>}
      <nav className="nav">
        <div className="nav-inner">
          <a className="brand" href={`${search}#/`}>Квартира</a>
          <div className="tabs">
            {TABS.map((t) => (
              <a key={t.path} className={`tab ${active === t.path ? "active" : ""}`} href={`${search}#${t.path}`}>
                {t.label}
                {t.path === "/favorites" && favCount > 0 && <span className="tab-count">{favCount}</span>}
              </a>
            ))}
          </div>
        </div>
      </nav>
      <main className="page">
        {error && !isDemo && <div className="card muted">Не удалось загрузить объявления: {error}</div>}
        {!isDemo && (route === "/listings" || route === "/" || route === "") && <ScrapeControl updatedAt={data?.updatedAt} />}
        {page}
      </main>
      <footer className="footer">
        {data?.updatedAt ? `Данные обновлены ${date(data.updatedAt)}` : "Данные ещё не собирались"} · Финансы хранятся только в этом браузере ·{" "}
        <a href="#/bookmarklet">Закладка «В трекер»</a>
      </footer>
    </>
  );
}
