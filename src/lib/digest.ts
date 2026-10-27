import { Listing } from "./types";

/**
 * Сводка изменений за день сбора по сравнению с предыдущим сбором.
 *
 * Что считаем новым: объявление, которое впервые попало в трекер в этот день И вышло после прошлого
 * сбора (publishedExact — номер новее всех, что видели раньше). Старые объявления, впервые попавшие
 * в трекер (например, после расширения поиска), — отдельно, это не новинки рынка.
 * «Пропали» — были в прошлом сборе, а в этом их нет; снятыми трекер помечает только через 2 дня.
 */
export interface PriceMove {
  listing: Listing;
  from: number;
  to: number;
}

export interface DigestPart {
  fresh: Listing[]; // новые на рынке
  firstTracked: Listing[]; // старые объявления, впервые попавшие в трекер
  drops: PriceMove[];
  rises: PriceMove[];
  missing: Listing[]; // не нашлись в выдаче (ещё не «сняты»)
  removed: Listing[]; // помечены снятыми
  relisted: { fresh: Listing; gone: Listing }[]; // новое объявление той же квартиры, что пропала
}

export interface Digest {
  day: string;
  prev?: string; // предыдущий день сбора
  firstDay: boolean; // первый день наблюдения — сравнивать не с чем
  near: DigestPart;
  rest: DigestPart;
}

/** Дни, в которые был сбор (по датам, когда объявления видели). Свежие — первыми. */
export function scrapeDays(listings: Listing[]): string[] {
  const days = new Set<string>();
  for (const l of listings) {
    days.add(l.firstSeen);
    days.add(l.lastSeen);
    for (const h of l.history) days.add(h.date);
  }
  return [...days].filter(Boolean).sort().reverse();
}

const empty = (): DigestPart => ({ fresh: [], firstTracked: [], drops: [], rises: [], missing: [], removed: [], relisted: [] });

/** Оставляет по одной записи на квартиру (group), предпочитая самую дешёвую. */
function uniq<T>(xs: T[], listing: (x: T) => Listing): T[] {
  const price = (l: Listing) => l.history[l.history.length - 1]?.price ?? 0;
  const best = new Map<string, T>();
  for (const x of xs) {
    const l = listing(x);
    const key = l.group ?? l.id;
    const cur = best.get(key);
    if (!cur || price(l) < price(listing(cur))) best.set(key, x);
  }
  return xs.filter((x) => best.get(listing(x).group ?? listing(x).id) === x);
}

export function buildDigest(listings: Listing[], day: string): Digest {
  const days = scrapeDays(listings);
  const prev = days.find((d) => d < day);
  const near = empty();
  const rest = empty();
  const part = (l: Listing) => (l.near ? near : rest);

  for (const l of listings) {
    const p = part(l);
    if (l.firstSeen === day && prev) (l.publishedExact ? p.fresh : p.firstTracked).push(l);
    // за день сборов может быть несколько: сравниваем последнюю цену дня с последней ценой до него
    // (или с первой ценой дня, если раньше объявления не видели)
    const today = l.history.filter((h) => h.date === day);
    const before = l.history.filter((h) => h.date < day);
    const from = before.length ? before[before.length - 1].price : today.length > 1 ? today[0].price : undefined;
    if (today.length && from !== undefined) {
      const move = { listing: l, from, to: today[today.length - 1].price };
      if (move.to < move.from) p.drops.push(move);
      else if (move.to > move.from) p.rises.push(move);
    }
    // были в прошлом сборе, в этом — нет
    if (prev && l.lastSeen === prev) (l.active ? p.missing : p.removed).push(l);
  }

  for (const p of [near, rest]) {
    // одну квартиру часто выставляют несколько продавцов — в сводке одна строка на квартиру
    p.fresh = uniq(p.fresh, (l) => l);
    p.firstTracked = uniq(p.firstTracked, (l) => l);
    p.drops = uniq(p.drops, (m) => m.listing);
    p.rises = uniq(p.rises, (m) => m.listing);
    p.missing = uniq(p.missing, (l) => l);
    p.removed = uniq(p.removed, (l) => l);
    const gone = [...p.missing, ...p.removed];
    for (const f of p.fresh) {
      const g = gone.find((x) => x.group && x.group === f.group);
      if (g) p.relisted.push({ fresh: f, gone: g });
    }
    const price = (l: Listing) => l.history[l.history.length - 1]?.price ?? 0;
    p.fresh.sort((a, b) => price(a) - price(b));
    p.firstTracked.sort((a, b) => price(a) - price(b));
    p.drops.sort((a, b) => a.to - a.from - (b.to - b.from));
    p.rises.sort((a, b) => b.to - b.from - (a.to - a.from));
  }
  return { day, prev, firstDay: !prev, near, rest };
}
