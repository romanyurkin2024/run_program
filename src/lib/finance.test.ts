import { describe, expect, it } from "vitest";
import { DEFAULT_FINANCES, bankPaymentCap, fitForPrice, monthsUntil, programBudgets } from "./finance";

describe("finance", () => {
  it("bank cap is 50% of income minus other debts", () => {
    expect(bankPaymentCap({ ...DEFAULT_FINANCES, income: 1_650_000, otherDebtPayments: 100_000 })).toBe(725_000);
  });

  it("max budget never needs a payment above the bank cap", () => {
    const fin = { ...DEFAULT_FINANCES, maxPayment: 1_100_000 };
    for (const b of programBudgets(fin)) {
      expect(b.max.payment).toBeLessThanOrEqual(bankPaymentCap(fin) + 1);
      expect(b.comfort.maxPrice).toBeLessThanOrEqual(b.max.maxPrice);
    }
  });

  it("budget price is affordable according to fitForPrice", () => {
    const fin = DEFAULT_FINANCES;
    const b = programBudgets(fin).find((x) => x.program.id === "bcc-standard")!;
    const fit = fitForPrice(b.max.maxPrice - 1000, fin).find((f) => f.program.id === "bcc-standard")!;
    expect(fit.ok).toBe(true);
    const over = fitForPrice(b.max.maxPrice * 1.1, fin).find((f) => f.program.id === "bcc-standard")!;
    expect(over.ok).toBe(false);
  });

  it("down payment below the minimum makes a program unavailable", () => {
    const fin = { ...DEFAULT_FINANCES, downPaymentTarget: 10_000_000, income: 100_000_000, maxPayment: 1e9 };
    const fit = fitForPrice(100_000_000, fin).find((f) => f.program.id === "halyk-digital")!;
    expect(fit.reasons).toContain("взнос < 20%");
  });

  it("conditional programs pass on numbers but carry their condition", () => {
    const fit = fitForPrice(90_000_000, DEFAULT_FINANCES).find((f) => f.program.id === "otbasy-intermediate")!;
    expect(fit.ok).toBe(true);
    expect(fit.condition).toMatch(/50%/);
    const over = fitForPrice(95_000_000, DEFAULT_FINANCES).find((f) => f.program.id === "otbasy-intermediate")!;
    expect(over.reasons).toContain("взнос < 50%");
  });

  it("monthsUntil counts calendar months", () => {
    expect(monthsUntil("2027-03", new Date(2026, 9, 26))).toBe(5);
    expect(monthsUntil("2026-01", new Date(2026, 9, 26))).toBe(0);
  });
});
