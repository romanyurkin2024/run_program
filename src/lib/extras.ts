import { useEffect, useState } from "react";
import { Listing } from "./types";

/**
 * Данные, которые закладка «В трекер» забирает со страницы объявления, открытой в браузере:
 * все фото, телефоны, полное описание. Хранятся только в этом браузере (localStorage).
 */
export interface Extra {
  photos: string[];
  phones: string[];
  description?: string;
  savedAt: string;
}

export interface ImportPayload {
  id: string;
  photos: string[];
  phones: string[];
  description?: string;
}

const KEY = "kt.extras.v1";
const EVENT = "kt-extras";

export function loadExtras(): Record<string, Extra> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function saveExtra(p: ImportPayload): void {
  const all = loadExtras();
  const prev = all[p.id];
  all[p.id] = {
    photos: p.photos.length ? p.photos : prev?.photos ?? [],
    phones: p.phones.length ? p.phones : prev?.phones ?? [],
    description: p.description || prev?.description,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* quota / blocked storage */
  }
  dispatchEvent(new Event(EVENT));
}

export function useExtras(): Record<string, Extra> {
  const [extras, setExtras] = useState(loadExtras);
  useEffect(() => {
    const on = () => setExtras(loadExtras());
    addEventListener(EVENT, on);
    addEventListener("storage", on);
    on(); // эффекты дочерних страниц (импорт) срабатывают раньше, чем эта подписка — перечитываем
    return () => {
      removeEventListener(EVENT, on);
      removeEventListener("storage", on);
    };
  }, []);
  return extras;
}

/** base64url(UTF-8 JSON) — так данные передаются из закладки в адресе страницы. */
export function encodePayload(p: ImportPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePayload(s: string): ImportPayload | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const p = JSON.parse(json);
    if (typeof p?.id !== "string" || !Array.isArray(p.photos)) return null;
    return {
      id: p.id,
      photos: p.photos.filter((x: unknown) => typeof x === "string" && /^https:\/\//.test(x)),
      phones: Array.isArray(p.phones) ? p.phones.filter((x: unknown) => typeof x === "string") : [],
      description: typeof p.description === "string" ? p.description : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Код закладки. Выполняется на странице krisha.kz/a/show/…, которую человек уже открыл:
 * собирает фото галереи (папка с самым частым uuid — так не попадают фото «похожих объявлений»),
 * телефоны из ссылок tel:, описание, и открывает трекер с этими данными в адресе.
 */
export function bookmarkletSource(site: string): string {
  const fn = function (SITE: string) {
    const m = location.href.match(/krisha\.kz\/a\/show\/(\d+)/);
    if (!m) {
      alert("Откройте объявление на krisha.kz и нажмите закладку ещё раз");
      return;
    }
    const byFolder: Record<string, string[]> = {};
    const seen: Record<string, 1> = {};
    const add = (raw: string | null) => {
      if (!raw) return;
      let u = raw.trim().split(" ")[0];
      if (u.indexOf("//") === 0) u = "https:" + u;
      const f = u.match(/^https:\/\/[^/]*(?:krisha|kcdn)[^/]*\/.*\/([0-9a-f-]{36})\/(\d+)-[^/]+$/);
      if (!f) return;
      const full = u.replace(/-[^/-]+$/, "-full.jpg");
      if (seen[full]) return;
      seen[full] = 1;
      (byFolder[f[1]] = byFolder[f[1]] || []).push(full);
    };
    document.querySelectorAll("img,source,[data-photo-url],[data-full-src],[data-src],a[href]").forEach((el) => {
      ["src", "data-src", "data-photo-url", "data-full-src", "href"].forEach((a) => add(el.getAttribute(a)));
      (el.getAttribute("srcset") || "").split(",").forEach(add);
    });
    let photos: string[] = [];
    Object.keys(byFolder).forEach((k) => {
      if (byFolder[k].length > photos.length) photos = byFolder[k];
    });
    const phones: string[] = [];
    document.querySelectorAll('a[href^="tel:"]').forEach((a) => {
      const t = (a.textContent || a.getAttribute("href")!.slice(4)).trim();
      if (/\d{3}/.test(t) && phones.indexOf(t) < 0) phones.push(t);
    });
    const d = document.querySelector(".js-description, .offer__description .text, .offer__description, .a-text");
    const payload = { id: "krisha:" + m[1], photos, phones, description: d ? (d as HTMLElement).innerText.trim().slice(0, 4000) : "" };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const url = SITE + "#/import/" + b64;
    if (!window.open(url, "_blank")) location.href = url;
  };
  return `javascript:(${fn.toString()})(${JSON.stringify(site)});void 0`;
}

/** Подмешивает сохранённые закладкой фото, телефоны и описание к объявлениям из общего файла. */
export function withExtras(listings: Listing[], extras: Record<string, Extra>): Listing[] {
  return listings.map((l) => {
    const x = extras[l.id];
    if (!x) return l;
    return {
      ...l,
      photos: x.photos.length ? x.photos : l.photos,
      seller: { ...l.seller, phones: x.phones.length ? x.phones : l.seller?.phones },
      description: x.description || l.description,
      extraSavedAt: x.savedAt,
    };
  });
}
