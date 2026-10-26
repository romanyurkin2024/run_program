import { useEffect, useState } from "react";
import { DEBT_TO_INCOME_LIMIT, MortgageProgram, PROGRAMS } from "../config/banks";
import { annuityPayment, maxPrincipalForPayment } from "./mortgage";

/** Личные финансы. Хранятся только в браузере (localStorage), в репозиторий не попадают. */
export interface Finances {
  savingsNow: number;
  monthlySavings: number;
  downPaymentTarget: number; // сколько будет к дате покупки
  purchaseDate: string; // YYYY-MM
  income: number;
  otherDebtPayments: number;
  comfortPayment: number;
  maxPayment: number;
  years: number;
  reserve: number; // подушка + расходы на сделку, не идут во взнос
}

export const DEFAULT_FINANCES: Finances = {
  savingsNow: 0,
  monthlySavings: 0,
  downPaymentTarget: 43_000_000, // ~40 млн в марте + 3 млн на депозите Отбасы
  purchaseDate: "2027-03",
  income: 1_770_000,
  otherDebtPayments: 300_000,
  comfortPayment: 650_000,
  maxPayment: 1_100_000,
  years: 20,
  reserve: 0,
};

const KEY = "kt.finances.v1";

function load(): Finances {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_FINANCES, ...JSON.parse(raw) };
  } catch {
    /* private mode / blocked storage */
  }
  return DEFAULT_FINANCES;
}

export function useFinances(): [Finances, (patch: Partial<Finances>) => void, () => void] {
  const [fin, setFin] = useState<Finances>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(fin));
    } catch {
      /* ignore */
    }
  }, [fin]);
  return [fin, (patch) => setFin((f) => ({ ...f, ...patch })), () => setFin(DEFAULT_FINANCES)];
}

/** Сумма, которая реально идёт в первоначальный взнос. */
export function downPayment(fin: Finances): number {
  return Math.max(0, fin.downPaymentTarget - fin.reserve);
}

/** Потолок платежа по требованию банков: 50% дохода минус другие кредиты. */
export function bankPaymentCap(fin: Finances): number {
  return Math.max(0, fin.income * DEBT_TO_INCOME_LIMIT - fin.otherDebtPayments);
}

export interface BudgetLevel {
  payment: number;
  maxPrice: number;
}

export interface ProgramBudget {
  program: MortgageProgram;
  comfort: BudgetLevel;
  max: BudgetLevel;
}

function maxPriceFor(program: MortgageProgram, fin: Finances, payment: number): BudgetLevel {
  const dp = downPayment(fin);
  const months = Math.min(fin.years, program.maxYears) * 12;
  const capped = Math.min(payment, bankPaymentCap(fin));
  let loan = maxPrincipalForPayment(capped, program.rate, months);
  if (program.maxLoan != null) loan = Math.min(loan, program.maxLoan);
  // взнос должен быть не меньше minDownPct от цены
  const byDown = dp / (program.minDownPct / 100);
  // если банк кредитует всю цену (взнос лежит на депозите-гарантии), то цена = заём
  const price = Math.min(program.lendsFullPrice ? loan : dp + loan, byDown);
  const realLoan = program.lendsFullPrice ? price : Math.max(0, price - dp);
  return { payment: annuityPayment(realLoan, program.rate, months), maxPrice: price };
}

export function programBudgets(fin: Finances): ProgramBudget[] {
  return PROGRAMS.map((program) => ({
    program,
    comfort: maxPriceFor(program, fin, fin.comfortPayment),
    max: maxPriceFor(program, fin, fin.maxPayment),
  }));
}

export interface ProgramFit {
  program: MortgageProgram;
  loan: number;
  payment: number;
  ok: boolean; // проходит по цифрам (взнос, лимит, платёж)
  comfortable: boolean;
  condition?: string; // дополнительно нужно выполнить условие банка
  reasons: string[];
}

const has = (list: string[] | undefined, value: string | undefined) => {
  const v = (value ?? "").toUpperCase();
  return !!v && (list ?? []).some((x) => v.includes(x.toUpperCase()) || x.toUpperCase().includes(v));
};

/**
 * listing.developer — застройщик-продавец, listing.complex — ЖК.
 * Партнёрская программа считается доступной, только если продаёт её застройщик И ЖК подтверждён в списке программы;
 * иначе — «уточнить» (если застройщик тот же) или «не применима».
 */
export function fitForPrice(price: number, fin: Finances, listing?: { developer?: string; complex?: string }): ProgramFit[] {
  const dp = downPayment(fin);
  const cap = bankPaymentCap(fin);
  return PROGRAMS.map((program) => {
    // «Алтын ұя»: банк кредитует всю цену, взнос лежит на депозите-гарантии
    const loan = program.lendsFullPrice ? price : Math.max(0, price - dp);
    const months = Math.min(fin.years, program.maxYears) * 12;
    const payment = annuityPayment(loan, program.rate, months);
    const reasons: string[] = [];
    if ((dp / price) * 100 < program.minDownPct) reasons.push(`взнос < ${program.minDownPct}%`);
    if (program.maxLoan != null && loan > program.maxLoan) reasons.push("сумма больше лимита банка");
    if (payment > cap) reasons.push("платёж > 50% дохода");
    if (payment > fin.maxPayment) reasons.push("платёж выше вашего максимума");
    let condition = program.condition;
    if (program.developers && listing) {
      if (!has(program.developers, listing.developer)) reasons.push("только у застройщика-партнёра");
      else if (has(program.confirmedComplexes, listing.complex)) condition = undefined; // ЖК подтверждён в программе
      else condition = `уточнить в банке: участие ЖК ${listing.complex ?? "—"} в программе не подтверждено`;
    }
    const ok = reasons.length === 0;
    return { program, loan, payment, ok, comfortable: ok && payment <= fin.comfortPayment, condition, reasons };
  });
}

/** Сколько месяцев от сегодня до даты покупки. */
export function monthsUntil(ym: string, from = new Date()): number {
  const [y, m] = ym.split("-").map(Number);
  return Math.max(0, (y - from.getFullYear()) * 12 + (m - 1 - from.getMonth()));
}
