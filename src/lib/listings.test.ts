import { describe, expect, it } from "vitest";
import { dedupe, sameFlat } from "./listings";
import { Listing } from "./types";

const L = (id: string, price: number, group: string, extra: Partial<Listing> = {}): Listing => ({
  id, source: "krisha", url: "", title: "", photos: [], firstSeen: "2026-10-26", lastSeen: "2026-10-26",
  active: true, group, history: [{ date: "2026-10-26", price }], ...extra,
});

describe("dedupe", () => {
  it("keeps the cheapest active listing per flat", () => {
    const { primaries, groups } = dedupe([
      L("a", 110, "g1"), L("b", 105, "g1"), L("c", 100, "g1", { active: false }), L("d", 90, "g2"),
    ]);
    expect(primaries.map((l) => l.id).sort()).toEqual(["b", "d"]);
    expect(sameFlat(primaries.find((l) => l.id === "b")!, groups).map((l) => l.id).sort()).toEqual(["a", "c"]);
  });

  it("prefers the owner at equal price", () => {
    const { primaries } = dedupe([L("agent", 100, "g"), L("owner", 100, "g", { seller: { type: "owner" } })]);
    expect(primaries[0].id).toBe("owner");
  });

  it("listings without group stay separate", () => {
    const { primaries } = dedupe([L("x", 1, undefined as unknown as string), L("y", 1, undefined as unknown as string)]);
    expect(primaries).toHaveLength(2);
  });
});
