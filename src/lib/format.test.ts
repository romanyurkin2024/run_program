import { describe, expect, it } from "vitest";
import { dayHeading, shortDate } from "./format";
import { postedDate } from "./listings";
import { Listing } from "./types";

describe("dates", () => {
  const now = new Date(2026, 9, 27, 12);
  it("day headings", () => {
    expect(dayHeading("2026-10-27", now)).toBe("Сегодня, 27 октября");
    expect(dayHeading("2026-10-26", now)).toBe("Вчера, 26 октября");
    expect(dayHeading("2026-10-20", now)).toBe("20 октября");
    expect(dayHeading("2025-12-03", now)).toMatch(/2025/);
  });
  it("short date hides the current year", () => {
    expect(shortDate("2026-10-26", now)).toBe("26 окт.");
    expect(shortDate("2025-12-03", now)).toMatch(/2025/);
  });
  it("feed date falls back to firstSeen", () => {
    expect(postedDate({ firstSeen: "2026-10-26" } as Listing)).toBe("2026-10-26");
    expect(postedDate({ firstSeen: "2026-10-26", posted: "2026-10-20" } as Listing)).toBe("2026-10-20");
  });
});
