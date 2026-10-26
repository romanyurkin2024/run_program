import { useEffect, useState } from "react";
import { Listing, ListingsFile } from "./types";

/** ?demo в адресе — показать демо-данные (для превью интерфейса, не реальные объявления). */
export const isDemo = typeof location !== "undefined" && new URLSearchParams(location.search).has("demo");

export function useListings(): { data: ListingsFile | null; error: string | null } {
  const [data, setData] = useState<ListingsFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const file = isDemo ? "demo-listings.json" : "listings.json";
    fetch(`${import.meta.env.BASE_URL}data/${file}`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);
  return { data, error };
}

export const currentPrice = (l: Listing) => l.history[l.history.length - 1]?.price ?? 0;
export const firstPrice = (l: Listing) => l.history[0]?.price ?? 0;
export const pricePerM2 = (l: Listing) => (l.area ? currentPrice(l) / l.area : 0);

export function priceChange(l: Listing): number {
  return currentPrice(l) - firstPrice(l);
}

export function daysOnMarket(l: Listing, now = new Date()): number {
  return Math.max(0, Math.round((now.getTime() - new Date(l.firstSeen).getTime()) / 86_400_000));
}

const groupOf = (l: Listing) => l.group ?? l.id;

function better(a: Listing, b: Listing): boolean {
  if (a.active !== b.active) return a.active;
  const d = currentPrice(a) - currentPrice(b);
  if (d !== 0) return d < 0;
  return a.seller?.type === "owner" && b.seller?.type !== "owner";
}

/**
 * Одна квартира — одна карточка. Главным считается самое дешёвое активное объявление
 * (при равной цене — от собственника), остальные доступны через groups.
 */
export function dedupe(listings: Listing[]): { primaries: Listing[]; groups: Map<string, Listing[]> } {
  const groups = new Map<string, Listing[]>();
  for (const l of listings) groups.set(groupOf(l), [...(groups.get(groupOf(l)) ?? []), l]);
  const primaries = [...groups.values()].map((members) => members.reduce((a, b) => (better(b, a) ? b : a)));
  return { primaries, groups };
}

export const sameFlat = (l: Listing, groups: Map<string, Listing[]>) =>
  (groups.get(groupOf(l)) ?? []).filter((x) => x.id !== l.id);

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface Scored {
  listing: Listing;
  score: number; // 0–100
  ppm2: number;
  vsMedian: number; // доля: -0.08 = на 8% дешевле медианы
  reasons: string[];
}

/**
 * Простая оценка «насколько выгодно»: цена м² относительно медианы по ЖК (или по району),
 * снижения цены, срок экспозиции (больше дней — больше шансов на торг), год постройки.
 */
export function scoreListings(listings: Listing[], now = new Date()): Scored[] {
  const active = listings.filter((l) => l.active && l.area);
  const all = median(active.map(pricePerM2));
  const byComplex = new Map<string, number[]>();
  for (const l of active) {
    if (!l.complex) continue;
    byComplex.set(l.complex, [...(byComplex.get(l.complex) ?? []), pricePerM2(l)]);
  }
  return listings.map((listing) => {
    const ppm2 = pricePerM2(listing);
    const peers = listing.complex ? byComplex.get(listing.complex) : undefined;
    const base = peers && peers.length >= 3 ? median(peers) : all;
    const vsMedian = base && ppm2 ? ppm2 / base - 1 : 0;
    const reasons: string[] = [];
    let score = 50 - Math.max(-0.3, Math.min(0.3, vsMedian)) * 120; // −10% к медиане → +12
    if (vsMedian <= -0.25) reasons.push("подозрительно дёшево — проверьте объявление");
    else if (vsMedian <= -0.05) reasons.push(`на ${Math.round(-vsMedian * 100)}% дешевле медианы`);
    if (vsMedian >= 0.05) reasons.push(`на ${Math.round(vsMedian * 100)}% дороже медианы`);
    const drop = -priceChange(listing);
    if (drop > 0) {
      score += Math.min(12, (drop / firstPrice(listing)) * 240);
      reasons.push("цену снижали");
    }
    const days = daysOnMarket(listing, now);
    if (days > 45) {
      score += 5;
      reasons.push(`${days} дн. в продаже — есть место для торга`);
    }
    if (listing.year && listing.year >= 2018) score += 5;
    if (listing.floor && listing.floors && (listing.floor === 1 || listing.floor === listing.floors)) {
      score -= 5;
      reasons.push(listing.floor === 1 ? "первый этаж" : "последний этаж");
    }
    // слишком низкая цена чаще означает ошибку, приманку или проблемы с документами — не поднимаем в топ
    if (vsMedian <= -0.25) score = Math.min(score, 55);
    return { listing, score: Math.max(0, Math.min(100, Math.round(score))), ppm2, vsMedian, reasons };
  });
}
