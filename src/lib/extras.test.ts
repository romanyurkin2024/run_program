import { describe, expect, it } from "vitest";
import { bookmarkletSource, decodePayload, encodePayload, withExtras } from "./extras";

describe("extras payload", () => {
  it("round-trips Cyrillic text and photos", () => {
    const p = { id: "krisha:1", photos: ["https://a/1-full.jpg"], phones: ["+7 701 000 00 00"], description: "Квартира с ремонтом ✨" };
    expect(decodePayload(encodePayload(p))).toEqual(p);
  });

  it("drops non-https photos and rejects garbage", () => {
    const p = { id: "krisha:1", photos: ["javascript:alert(1)", "https://ok/1.jpg"], phones: [] };
    expect(decodePayload(encodePayload(p))!.photos).toEqual(["https://ok/1.jpg"]);
    expect(decodePayload("not-base64!!")).toBeNull();
  });

  it("bookmarklet is a single javascript: URL with the site baked in", () => {
    const src = bookmarkletSource("https://example.github.io/run_program/");
    expect(src.startsWith("javascript:(")).toBe(true);
    expect(src).toContain('"https://example.github.io/run_program/"');
  });
});

describe("withExtras", () => {
  it("replaces photos and adds phones only for saved listings", () => {
    const base = { source: "krisha", url: "", title: "", firstSeen: "", lastSeen: "", active: true, history: [] };
    const ls = [
      { ...base, id: "a", photos: ["one.jpg"], seller: { type: "agent" } },
      { ...base, id: "b", photos: ["two.jpg"] },
    ];
    const out = withExtras(ls, { a: { photos: ["1.jpg", "2.jpg"], phones: ["+7 1"], savedAt: "2026-10-26" } });
    expect(out[0].photos).toEqual(["1.jpg", "2.jpg"]);
    expect(out[0].seller).toEqual({ type: "agent", phones: ["+7 1"] });
    expect(out[1]).toBe(ls[1]);
  });
});
