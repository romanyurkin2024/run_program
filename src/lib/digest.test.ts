import { describe, expect, it } from "vitest";
import { buildDigest, scrapeDays } from "./digest";
import { Listing } from "./types";

const L = (id: string, o: Partial<Listing>): Listing =>
  ({ id, source: "krisha", url: "", title: "", photos: [], history: [{ date: "2026-10-26", price: 80e6 }], firstSeen: "2026-10-26", lastSeen: "2026-10-27", active: true, near: true, ...o }) as Listing;

describe("digest", () => {
  const data = [
    L("drop", { history: [{ date: "2026-10-26", price: 90e6 }, { date: "2026-10-27", price: 85e6 }] }),
    L("rise", { near: false, history: [{ date: "2026-10-26", price: 90e6 }, { date: "2026-10-27", price: 95e6 }] }),
    L("fresh", { firstSeen: "2026-10-27", publishedExact: true, group: "elif|85|12/13", history: [{ date: "2026-10-27", price: 85e6 }] }),
    L("gone", { lastSeen: "2026-10-26", group: "elif|85|12/13", history: [{ date: "2026-10-26", price: 90e6 }] }),
    L("old-new-to-tracker", { firstSeen: "2026-10-27", publishedExact: false, history: [{ date: "2026-10-27", price: 70e6 }] }),
    L("same", {}),
    L("intraday", { near: false, firstSeen: "2026-10-27", history: [{ date: "2026-10-27", price: 89e6 }, { date: "2026-10-27", price: 88e6 }] }),
  ];

  it("lists scrape days newest first", () => {
    expect(scrapeDays(data)).toEqual(["2026-10-27", "2026-10-26"]);
  });

  it("splits changes by area and kind", () => {
    const d = buildDigest(data, "2026-10-27");
    expect(d.prev).toBe("2026-10-26");
    expect(d.near.drops.map((m) => m.listing.id)).toEqual(["drop"]);
    expect(d.rest.rises.map((m) => m.listing.id)).toEqual(["rise"]);
    // цена поменялась между двумя сборами одного дня
    expect(d.rest.drops.map((m) => [m.listing.id, m.from, m.to])).toEqual([["intraday", 89e6, 88e6]]);
    expect(d.near.fresh.map((l) => l.id)).toEqual(["fresh"]);
    expect(d.near.firstTracked.map((l) => l.id)).toEqual(["old-new-to-tracker"]);
    expect(d.near.missing.map((l) => l.id)).toEqual(["gone"]);
    // новое объявление с той же площадью и этажом, что пропавшее, — возможно, та же квартира
    expect(d.near.relisted.map((r) => [r.fresh.id, r.gone.id])).toEqual([["fresh", "gone"]]);
  });

  it("first day has nothing to compare with", () => {
    const d = buildDigest(data, "2026-10-26");
    expect(d.firstDay).toBe(true);
    expect(d.near.fresh).toEqual([]);
    expect(d.near.missing).toEqual([]);
  });
});
