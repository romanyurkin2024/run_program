/**
 * Ипотечные программы на вторичное жильё.
 * Ставки меняются — перед решением всегда сверяйте с сайтом банка.
 * Источник по умолчанию: обзор krisha.kz «Ипотека на вторичку 2026» (данные на 30.05.2026).
 */
export interface MortgageProgram {
  id: string;
  bank: string;
  name: string;
  rate: number; // номинальная годовая ставка, %
  minDownPct: number; // минимальный первоначальный взнос, %
  maxLoan: number | null; // ₸, null — без явного лимита
  maxYears: number;
  secondary: boolean; // подходит для вторички
  available: boolean; // можно оформить сразу (без накоплений в банке и т.п.)
  note?: string;
  source: string;
  checkedAt: string;
}

const KRISHA_2026 = "https://krisha.kz/content/articles/2026/2026-ipoteka-na-vtorichku-2026-usloviya-vseh-bankov";

export const PROGRAMS: MortgageProgram[] = [
  {
    id: "halyk-digital-fee",
    bank: "Halyk Bank",
    name: "Цифровая ипотека (с комиссией)",
    rate: 20.5,
    minDownPct: 20,
    maxLoan: null,
    maxYears: 20,
    secondary: true,
    available: true,
    note: "Есть разовая комиссия за выдачу — учтите её в расходах.",
    source: KRISHA_2026,
    checkedAt: "2026-05-30",
  },
  {
    id: "halyk-digital",
    bank: "Halyk Bank",
    name: "Цифровая ипотека (без комиссии)",
    rate: 22,
    minDownPct: 20,
    maxLoan: null,
    maxYears: 20,
    secondary: true,
    available: true,
    source: KRISHA_2026,
    checkedAt: "2026-05-30",
  },
  {
    id: "bcc-standard",
    bank: "Банк ЦентрКредит",
    name: "Стандартная ипотека",
    rate: 20.5,
    minDownPct: 20,
    maxLoan: 100_000_000,
    maxYears: 20,
    secondary: true,
    available: true,
    note: "Лимит 30–100 млн ₸ зависит от региона и размера взноса.",
    source: KRISHA_2026,
    checkedAt: "2026-05-30",
  },
  {
    id: "altyn",
    bank: "Altyn Bank",
    name: "Ипотека на вторичное жильё",
    rate: 22.3,
    minDownPct: 20,
    maxLoan: 175_000_000,
    maxYears: 20,
    secondary: true,
    available: true,
    source: KRISHA_2026,
    checkedAt: "2026-05-30",
  },
  {
    id: "freedom-digital",
    bank: "Freedom Bank",
    name: "Цифровая ипотека",
    rate: 22,
    minDownPct: 20,
    maxLoan: 70_000_000,
    maxYears: 20,
    secondary: true,
    available: true,
    note: "Агрегаторы показывают разброс ставок 16–25% — уточнить в банке.",
    source: KRISHA_2026,
    checkedAt: "2026-05-30",
  },
  {
    id: "otbasy",
    bank: "Отбасы банк",
    name: "Жилищный заём (ЖСС)",
    rate: 3.5,
    minDownPct: 50,
    maxLoan: 100_000_000,
    maxYears: 25,
    secondary: true,
    available: false,
    note: "Нужны накопления на депозите Отбасы и выполнение оценочного показателя — сразу не получить. Можно комбинировать с банковской ипотекой.",
    source: "https://finance.kz/ipoteka/otbasy-bank/vtorichnoe-zhilyo",
    checkedAt: "2026-07-29",
  },
];

/** Платёж по ипотеке не может превышать 50% официального дохода (КДН). */
export const DEBT_TO_INCOME_LIMIT = 0.5;
