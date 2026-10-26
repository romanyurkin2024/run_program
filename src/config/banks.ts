/**
 * Ипотечные программы для покупки ВТОРИЧНОГО жилья в Алматы.
 * Ставки меняются, а агрегаторы расходятся между собой — перед решением сверяйте с банком.
 * Источники: обзоры krisha.kz, kn.kz, profinance.kz, finance.kz (данные 2026 г., см. source/checkedAt).
 */
export interface MortgageProgram {
  id: string;
  bank: string;
  name: string;
  rate: number; // номинальная годовая ставка, % (если в источниках диапазон — берём верхнюю границу, чтобы не занижать платёж)
  minDownPct: number; // минимальный первоначальный взнос, %
  maxLoan: number | null; // ₸, null — без явного лимита
  maxYears: number;
  commissionPct?: number; // разовая комиссия банка от суммы займа
  /** Условие, без выполнения которого программа недоступна (показывается как «условно»). */
  condition?: string;
  /** Доступно только через годы (не к дате покупки) — показываем в конце как вариант на будущее. */
  later?: boolean;
  note?: string;
  source: string;
  checkedAt: string;
}

const KRISHA_2026 = "https://krisha.kz/content/articles/2026/2026-ipoteka-na-vtorichku-2026-usloviya-vseh-bankov";
const MYTENGE = "https://mytenge.kz/ru/ipoteka/na-vtorichnoe-zhile";
const FINANCE_OTBASY = "https://finance.kz/ipoteka/otbasy-bank";

export const PROGRAMS: MortgageProgram[] = [
  {
    id: "otbasy-intermediate",
    bank: "Отбасы банк",
    name: "Промежуточный жилищный заём",
    rate: 8.5,
    minDownPct: 50,
    maxLoan: 100_000_000,
    maxYears: 25,
    condition: "внести не меньше 50% стоимости на депозит Отбасы",
    note:
      "С июня 2026 единая ставка 8,5% (ГЭСВ 9–9,6%), раньше было 6–7,5%. 50% стоимости должно лежать на депозите Отбасы. " +
      "После выполнения оценочного показателя заём переводят в жилищный под 3,5–5%. Можно ли внести сумму разом и сроки — уточнить в отделении.",
    source: "https://krisha.kz/content/news/2026/2026-otbasy-bank-povyshaet-stavku-po-ipoteke",
    checkedAt: "2026-10-26",
  },
  {
    id: "bcc-plus",
    bank: "Банк ЦентрКредит",
    name: "Ипотека Плюс",
    rate: 19.5,
    minDownPct: 20,
    maxLoan: 100_000_000,
    maxYears: 15,
    note: "Без комиссии за выдачу, но обязательна страховка. Ставка 19,5–22,15% в зависимости от условий.",
    source: MYTENGE,
    checkedAt: "2026-09-08",
  },
  {
    id: "halyk-digital-fee",
    bank: "Halyk Bank",
    name: "Цифровая ипотека (с комиссией)",
    rate: 20.5,
    minDownPct: 20,
    maxLoan: null,
    maxYears: 20,
    commissionPct: 1,
    note: "Разовая комиссия 1% от суммы займа.",
    source: KRISHA_2026,
    checkedAt: "2026-05-30",
  },
  {
    id: "bcc-standard",
    bank: "Банк ЦентрКредит",
    name: "Стандартная ипотека",
    rate: 21.8,
    minDownPct: 20,
    maxLoan: 100_000_000,
    maxYears: 15,
    commissionPct: 2,
    note: "Ставка 20,5–21,8%, комиссия 2%. Лимит 30–100 млн ₸ зависит от региона и взноса.",
    source: MYTENGE,
    checkedAt: "2026-09-08",
  },
  {
    id: "forte-standard",
    bank: "ForteBank",
    name: "Ипотека на вторичное жильё",
    rate: 21.5,
    minDownPct: 15,
    maxLoan: null,
    maxYears: 15,
    note: "Самый низкий взнос — от 15%. Агрегаторы расходятся по ставке, уточнить в банке.",
    source: MYTENGE,
    checkedAt: "2026-09-08",
  },
  {
    id: "halyk-digital",
    bank: "Halyk Bank",
    name: "Цифровая ипотека (без комиссии)",
    rate: 22,
    minDownPct: 20,
    maxLoan: null,
    maxYears: 20,
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
    note: "Ставка по агрегаторам 18–22%. По некоторым данным — для получающих зарплату в Freedom Bank; уточнить.",
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
    source: KRISHA_2026,
    checkedAt: "2026-05-30",
  },
  {
    id: "otbasy-housing",
    bank: "Отбасы банк",
    name: "Жилищный заём (ЖСС)",
    rate: 5,
    minDownPct: 50,
    maxLoan: 100_000_000,
    maxYears: 25,
    condition: "накопить 50% на депозите Отбасы и выполнить оценочный показатель (обычно годы накоплений)",
    later: true,
    note: "Ставка 3,5–5%. Сразу не получить — вариант на будущее или как продолжение промежуточного займа.",
    source: FINANCE_OTBASY,
    checkedAt: "2026-10-15",
  },
  {
    id: "otbasy-refinance",
    bank: "Отбасы банк",
    name: "Рефинансирование ипотеки другого банка",
    rate: 8.5,
    minDownPct: 20,
    maxLoan: 85_000_000,
    maxYears: 25,
    condition: "после покупки накопить на депозите Отбасы ≥ 50% остатка долга и пройти оценку платёжеспособности",
    later: true,
    note:
      "Способ позже снизить ставку рыночной ипотеки. В октябре 2026 выдача приостанавливалась (1–23 октября) из-за новых правил: " +
      "деньги перечисляются напрямую прежнему банку. Ставка от 3,5% (жилищный заём) или 8,5% (промежуточный) — зависит от накоплений и оценочного показателя.",
    source: "https://krisha.kz/content/news/2026/2026-otbasy-bank-priostanovil-refinansirovanie-ipoteki",
    checkedAt: "2026-10-26",
  },
];

/** Программы, которые проверили, но для вторички в Алматы они не подходят — показываем, чтобы было видно, что их учли. */
export const NOT_FOR_SECONDARY: { name: string; rate: string; reason: string; source: string }[] = [
  {
    name: "«7-20-25» (Halyk, Altyn и др.)",
    rate: "7%",
    reason: "только первичное жильё от застройщика, лимит займа в Алматы около 30 млн ₸",
    source: "https://krisha.kz/content/news/2025/2025-budet-li-rabotat-ipoteka-7-20-25-v-2026-godu",
  },
  {
    name: "«Наурыз» (Отбасы банк)",
    rate: "7–9%",
    reason: "вторичка разрешена только в моногородах и сёлах; в Алматы — только новостройки, заём до 36 млн ₸",
    source: "https://informburo.kz/novosti/otbasy-bank-opublikoval-spisok-ucastnikov-programmy-nauryz-2026",
  },
  {
    name: "Партнёрская ипотека (Halyk, Freedom + BI Group и др.)",
    rate: "0,1–18,5%",
    reason: "субсидирует застройщик — только новостройки от партнёров банка",
    source: "https://profinance.kz/ipoteka",
  },
  {
    name: "Bereke Bank",
    rate: "—",
    reason: "по данным Krisha, ипотеку сейчас не выдаёт",
    source: KRISHA_2026,
  },
];

/** Платёж по ипотеке не может превышать 50% официального дохода (КДН). */
export const DEBT_TO_INCOME_LIMIT = 0.5;
