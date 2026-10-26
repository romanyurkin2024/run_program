import { useEffect, useState } from "react";
import { useFinances } from "./lib/finance";
import { isDemo, useListings } from "./lib/listings";
import { Overview } from "./pages/Overview";
import { ListingsPage } from "./pages/Listings";
import { ListingDetail } from "./pages/ListingDetail";
import { MortgagePage } from "./pages/Mortgage";
import { PlanPage } from "./pages/Plan";
import { date } from "./lib/format";

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
  { path: "/mortgage", label: "Ипотека" },
  { path: "/plan", label: "План" },
];

export function App() {
  const route = useHashRoute();
  const [fin, setFin, resetFin] = useFinances();
  const { data, error } = useListings();
  const listings = data?.listings ?? [];
  const search = isDemo ? "?demo" : "";

  let page;
  if (route.startsWith("/listing/")) {
    const id = decodeURIComponent(route.slice("/listing/".length));
    page = <ListingDetail listing={listings.find((l) => l.id === id)} listings={listings} fin={fin} loading={!data && !error} />;
  } else if (route === "/listings") {
    page = <ListingsPage listings={listings} fin={fin} loading={!data && !error} />;
  } else if (route === "/mortgage") {
    page = <MortgagePage fin={fin} setFin={setFin} />;
  } else if (route === "/plan") {
    page = <PlanPage fin={fin} setFin={setFin} resetFin={resetFin} />;
  } else {
    page = <Overview listings={listings} fin={fin} />;
  }

  const active = route.startsWith("/listing") ? "/listings" : route;

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
              </a>
            ))}
          </div>
        </div>
      </nav>
      <main className="page">
        {error && !isDemo && <div className="card muted">Не удалось загрузить объявления: {error}</div>}
        {page}
      </main>
      <footer className="footer">
        {data?.updatedAt ? `Данные обновлены ${date(data.updatedAt)}` : "Данные ещё не собирались"} · Финансы хранятся только в этом браузере
      </footer>
    </>
  );
}
