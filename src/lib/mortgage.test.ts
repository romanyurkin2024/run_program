import { describe, expect, it } from "vitest";
import { annuityPayment, buildSchedule, maxPrincipalForPayment } from "./mortgage";

describe("mortgage", () => {
  it("annuity payment matches the textbook formula", () => {
    // 10 млн на 12 мес под 12% → 888 487.88
    expect(annuityPayment(10_000_000, 12, 12)).toBeCloseTo(888_487.88, 1);
  });

  it("maxPrincipalForPayment is the inverse of annuityPayment", () => {
    const p = annuityPayment(50_000_000, 20.5, 240);
    expect(maxPrincipalForPayment(p, 20.5, 240)).toBeCloseTo(50_000_000, 0);
  });

  it("annuity schedule repays the loan in full", () => {
    const res = buildSchedule({ principal: 40_000_000, annualRate: 20, months: 180, type: "annuity" });
    expect(res.months).toBe(180);
    expect(res.schedule.at(-1)!.balance).toBeLessThan(1);
    expect(res.totalPaid - res.overpayment).toBeCloseTo(40_000_000, 0);
  });

  it("differentiated payments decrease and overpay less than annuity", () => {
    const a = buildSchedule({ principal: 40_000_000, annualRate: 20, months: 180, type: "annuity" });
    const d = buildSchedule({ principal: 40_000_000, annualRate: 20, months: 180, type: "differentiated" });
    expect(d.firstPayment).toBeGreaterThan(d.lastPayment);
    expect(d.overpayment).toBeLessThan(a.overpayment);
  });

  it("extra monthly payment shortens the term", () => {
    const base = buildSchedule({ principal: 40_000_000, annualRate: 20, months: 240, type: "annuity" });
    const extra = buildSchedule({ principal: 40_000_000, annualRate: 20, months: 240, type: "annuity", extraMonthly: 200_000 });
    expect(extra.months).toBeLessThan(base.months);
    expect(extra.overpayment).toBeLessThan(base.overpayment);
  });
});
