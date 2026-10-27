import { useEffect, useState } from "react";
import { currentPrice } from "./listings";
import { Listing } from "./types";

/**
 * Избранное хранится только в этом браузере (localStorage): у каждого человека и устройства — своё,
 * переживает перезагрузки и обновления сайта. Пропадает, только если очистить данные сайта в браузере.
 *
 * Вместе с id сохраняем «снимок» квартиры: если объявление снимут или оно исчезнет из выдачи,
 * карточка в избранном останется. Совпадение ищем и по id, и по group — одну квартиру часто
 * продают несколько агентов, и главная (самая дешёвая) карточка может смениться.
 */
export interface Favorite {
  id: string;
  group?: string;
  addedAt: string;
  priceAtAdd: number;
  title: string;
  complex?: string;
  address?: string;
  area?: number;
  floor?: number;
  floors?: number;
  url: string;
  photo?: string;
  note?: string;
}

const KEY = "kt.favorites.v1";
const EVENT = "kt-favorites";

export function loadFavorites(): Favorite[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(all: Favorite[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* quota / blocked storage */
  }
  dispatchEvent(new Event(EVENT));
}

export function snapshot(l: Listing): Favorite {
  return {
    id: l.id,
    group: l.group,
    addedAt: new Date().toISOString(),
    priceAtAdd: currentPrice(l),
    title: l.title,
    complex: l.complex,
    address: l.address,
    area: l.area,
    floor: l.floor,
    floors: l.floors,
    url: l.url,
    photo: l.photos[0],
  };
}

const matches = (f: Favorite, l: Pick<Listing, "id" | "group">) => f.id === l.id || (!!f.group && f.group === l.group);

export function findFavorite(all: Favorite[], l: Pick<Listing, "id" | "group">): Favorite | undefined {
  return all.find((f) => matches(f, l));
}

export function toggleFavorite(l: Listing): void {
  const all = loadFavorites();
  save(findFavorite(all, l) ? all.filter((f) => !matches(f, l)) : [snapshot(l), ...all]);
}

export function removeFavorite(id: string): void {
  save(loadFavorites().filter((f) => f.id !== id));
}

export function setNote(id: string, note: string): void {
  save(loadFavorites().map((f) => (f.id === id ? { ...f, note: note || undefined } : f)));
}

/** Перенос на другое устройство: ссылка с избранным, при открытии добавляет недостающее. */
export function exportFavorites(all: Favorite[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(all));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function importFavorites(payload: string): number {
  const bin = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  const items: Favorite[] = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  const all = loadFavorites();
  const fresh = items.filter((f) => f && typeof f.id === "string" && !all.some((a) => a.id === f.id));
  save([...all, ...fresh]);
  return fresh.length;
}

export function useFavorites(): Favorite[] {
  const [favs, setFavs] = useState(loadFavorites);
  useEffect(() => {
    const on = () => setFavs(loadFavorites());
    addEventListener(EVENT, on);
    addEventListener("storage", on); // другая вкладка изменила избранное
    on();
    return () => {
      removeEventListener(EVENT, on);
      removeEventListener("storage", on);
    };
  }, []);
  return favs;
}
