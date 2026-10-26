/**
 * Ипотечные программы для покупки квартиры в Алматы: рыночные (вторичка), Отбасы, партнёрские (у застройщиков).
 * Это и реестр предложений: каждую найденную программу фиксируем здесь с источником и датой проверки.
 * Ставки меняются, а агрегаторы расходятся между собой — перед решением сверяйте с банком.
 * Источники: обзоры krisha.kz, kn.kz, profinance.kz, finance.kz (данные 2026 г., см. source/checkedAt).
 */
export type ProgramKind = "market" | "otbasy" | "partner";

export interface MortgageProgram {
  id: string;
  kind: ProgramKind;
  bank: string;
  name: string;
  /** Диапазон ставки как в источнике, например «0,1–18,5%». */
  rateText?: string;
  rate: number; // номинальная годовая ставка, % (если в источниках диапазон — берём верхнюю границу, чтобы не занижать платёж)
  minDownPct: number; // минимальный первоначальный взнос, %
  maxLoan: number | null; // ₸, null — без явного лимита
  maxYears: number;
  commissionPct?: number; // разовая комиссия банка от суммы займа
  /** Условие, без выполнения которого программа недоступна (показывается как «условно»). */
  condition?: string;
  /** Партнёрская программа: работает только при покупке у этих застройщиков (сравнение по подстроке, без регистра). */
  developers?: string[];
  /**
   * ЖК, участие которых подтверждено источником (сравнение по подстроке, без регистра).
   * Если списка нет или ЖК в нём не найден — программа НЕ считается доступной, а помечается «уточнить».
   * Не выводим участие ЖК только из того, что застройщик тот же.
   */
  confirmedComplexes?: string[];
  /** Банк кредитует 100% цены, а ваш взнос лежит на блокированном депозите — платёж считается от полной цены. */
  lendsFullPrice?: boolean;
  /** Что можно купить по программе. */
  housing?: string;
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
    kind: "otbasy",
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
    id: "altyn-tamasha",
    kind: "partner",
    bank: "Altyn Bank",
    name: "Ипотека «Тамаша» (партнёр BAZIS-A)",
    rate: 18.5,
    minDownPct: 20,
    maxLoan: 175_000_000,
    maxYears: 20,
    rateText: "0,1–18,5%",
    developers: ["BAZIS"],
    // по странице программы на altynbank.kz (видимая часть списка; список может быть длиннее)
    confirmedComplexes: ["Auezov City", "Акварель", "AL’FARABI 27", "AL'FARABI 27", "Estet", "Jazz", "Легенда", "Metropole", "Orion III", "Primavera", "Riviera"],
    housing:
      "ЖК BAZIS-A в Алматы из списка на странице банка: Auezov City, Акварель, AL'FARABI 27, Estet, Jazz, Легенда, Metropole, Orion III, Primavera, Riviera " +
      "(список в источнике обрывается — может быть длиннее). Element в видимой части списка НЕТ.",
    condition: "покупать у BAZIS-A квартиру в ЖК из списка программы, не у частного продавца",
    note:
      "Ставка 0,1–18,5% (ГЭСВ до 20,31%) зависит от субсидии застройщика и срока; в расчёте взята верхняя граница. " +
      "По AIR Press, взнос сейчас от 20% (раньше программа рекламировалась «без доп. взноса»). " +
      "Низкую ставку застройщик обычно закладывает в цену — спросите у BAZIS-A цену при оплате без ипотеки и сравните полную стоимость.",
    source: "https://altynbank.kz/ru/personal/ipoteka-tamasha",
    checkedAt: "2026-10-26",
  },
  {
    id: "bcc-plus",
    kind: "market",
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
    kind: "market",
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
    kind: "market",
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
    kind: "market",
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
    kind: "market",
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
    kind: "market",
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
    kind: "market",
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
    kind: "otbasy",
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
    kind: "otbasy",
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
  // ---------- Партнёрские программы (только при покупке у застройщика-партнёра) ----------
  {
    id: "halyk-bi",
    kind: "partner",
    bank: "Halyk Bank",
    name: "«Halyk Ипотека» с BI Group",
    rateText: "1,1–18,5%",
    rate: 18.5,
    minDownPct: 20,
    maxLoan: 200_000_000,
    maxYears: 20,
    developers: ["BI GROUP", "BI-GROUP", "БИ ГРУПП"],
    housing: "строящиеся и готовые квартиры BI Group; список ЖК публично не опубликован (сообщают в банке/отделе продаж). Участие ЖК 4YOU НЕ подтверждено.",
    condition: "покупать у BI Group в ЖК из списка программы — список запросить",
    note: "Акция до 31.12.2026. Низкая ставка часто только на первый период, потом растёт — уточнить график ставки и цену без ипотеки.",
    source: "https://bi.group/ru/promotion/halyk-ipoteka",
    checkedAt: "2026-10-26",
  },
  {
    id: "otbasy-bi",
    kind: "otbasy",
    bank: "Отбасы банк",
    name: "Промежуточный заём у застройщика-партнёра без ожидания ОП",
    rateText: "8,5%, затем 3,5–5%",
    rate: 8.5,
    minDownPct: 50,
    maxLoan: 100_000_000,
    maxYears: 25,
    developers: ["BI GROUP", "BI-GROUP", "БИ ГРУПП", "SAT NS", "QAZAQSTROY"],
    housing:
      "квартиры застройщиков-партнёров Отбасы: с 15.10.2026 BI Group выделил ~600 квартир в Астане, Алматы, Шымкенте, Атырау; " +
      "какие ЖК — только в отделах продаж BI Group (публичного списка нет). SAT NS и QazaqStroy — соглашения в процессе.",
    condition: "покупать у застройщика-партнёра Отбасы и держать на депозите ≥ 50% стоимости; нужно письмо застройщика о брони",
    note: "Главное отличие — без ожидания оценочного показателя и 6 месяцев накопления: можно внести 50% и сразу брать заём. Есть ли среди этих квартир что-то у MEGA — не подтверждено, спросить в BI Group.",
    source: "https://informburo.kz/novosti/otbasy-bank-zapustil-ipoteku-bez-sestimesiacnogo-xraneniia-deneg-na-depozite",
    checkedAt: "2026-10-26",
  },
  {
    id: "forte-bi",
    kind: "partner",
    bank: "ForteBank",
    name: "Совместная ипотека с BI Group",
    rateText: "от 3% (реклама); партнёрские 1,6–19,8%",
    rate: 19.8,
    minDownPct: 20,
    maxLoan: null,
    maxYears: 20,
    developers: ["BI GROUP", "BI-GROUP", "БИ ГРУПП"],
    housing: "квартиры BI Group (запуск — сентябрь 2026)",
    condition: "покупать у BI Group",
    note: "Условия программы с BI Group в источниках не раскрыты полностью — запросить в ForteBank.",
    source: "https://profinance.kz/ipoteka",
    checkedAt: "2026-10-26",
  },
  {
    id: "freedom-bi",
    kind: "partner",
    bank: "Freedom Bank",
    name: "Накопительная ипотека с BI Group",
    rateText: "от 5%; партнёрские до 16,9%",
    rate: 16.9,
    minDownPct: 20,
    maxLoan: 70_000_000,
    maxYears: 20,
    developers: ["BI GROUP", "BI-GROUP", "БИ ГРУПП"],
    housing: "новое жильё BI Group",
    condition: "покупать у BI Group; накопительная схема — уточнить, сколько копить до выдачи",
    source: "https://tengrinews.kz/kazakhstan_news/freedom-bank-bi-group-zapuskayut-nakopitelnuyu-ipoteku-eto-596969/",
    checkedAt: "2026-10-26",
  },
  {
    id: "bcc-partner",
    kind: "partner",
    bank: "Банк ЦентрКредит",
    name: "Партнёрские программы с застройщиками",
    rateText: "1,2–18,75%",
    rate: 18.75,
    minDownPct: 20,
    maxLoan: 100_000_000,
    maxYears: 20,
    // список застройщиков-партнёров БЦК публично не найден — автоматически ни к какой квартире не применяем
    developers: [],
    housing: "квартиры застройщиков-партнёров БЦК — список не опубликован; по одному обзору BI Group сотрудничает с БЦК (не подтверждено банком)",
    condition: "покупать у застройщика-партнёра БЦК — список запросить в банке",
    note: "Вы сотрудники и зарплатные клиенты БЦК — спросите и про партнёрские ставки, и про условия для сотрудников.",
    source: "https://info.homsters.kz/partnyorskaya-ipoteka-ot-0-1-kakie-banki-i-zastrojshhiki-predlagayut-nizkie-stavki/",
    checkedAt: "2026-10-26",
  },
  {
    id: "altyn-partner-almaty",
    kind: "partner",
    bank: "Altyn Bank",
    name: "Партнёрская ипотека (застройщики Алматы)",
    rateText: "0,1–18,5%",
    rate: 18.5,
    minDownPct: 20,
    maxLoan: 175_000_000,
    maxYears: 20,
    developers: ["ATAMURA", "KUSTO", "SHEBER", "MDI", "ETASA", "BEREKE STROY", "HAYAT"],
    housing: "партнёры в Алматы по решению банка от 16.01.2026: ATAMURA Group, Kusto Home, SHEBER Group, MDI Construction, ETASA, Bereke Stroy Group, Hayat Construction Group (BI Group — по программе «Оңай»)",
    condition: "покупать у одного из застройщиков-партнёров Altyn в Алматы",
    note: "Список застройщиков — с сайта банка (решение от 16.01.2026); конкретные ЖК там не перечислены. Etasa Residence (Жарокова 218) построил ли ETASA из списка — не подтверждено.",
    source: "https://altynbank.kz/ru/personal/partnerskaya-ipoteka",
    checkedAt: "2026-10-26",
  },
  // ---------- Новые рыночные продукты ----------
  {
    id: "altyn-uya",
    kind: "market",
    bank: "Altyn Bank",
    name: "«Алтын ұя» (с 07.10.2026)",
    rateText: "7–16%, фиксированная",
    rate: 16,
    minDownPct: 20,
    maxLoan: 175_000_000,
    maxYears: 15,
    lendsFullPrice: true,
    housing: "готовое жильё; строящееся у партнёров — по разным данным уже или в планах",
    condition: "уточнить в банке: годится ли вторичка и как работает депозит-гарантия",
    note:
      "Банк кредитует полную цену, ваши ≥ 20% блокируются на депозите под 0,1% и в конце гасят остаток долга. " +
      "Досрочно гасить своими деньгами можно со следующего дня после выдачи — уточнить, можно ли этим сразу уменьшить заём. Платёж посчитан от полной цены по 16%.",
    source: "https://finratings.kz/news/16989-altyn-bank-zapuskaet-novuiu-ipoteku-ot-7/",
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
    name: "Bereke Bank",
    rate: "—",
    reason: "по данным Krisha, ипотеку сейчас не выдаёт",
    source: KRISHA_2026,
  },
];

/** Кто строил ЖК у MEGA — по нему видно, какие партнёрские программы работают при покупке у застройщика. */
export const COMPLEX_DEVELOPERS: { complex: string; developer: string; confirmed: boolean; source: string }[] = [
  { complex: "Estet", developer: "BAZIS-A", confirmed: true, source: "https://krisha.kz/complex/show/almaty/estet/" },
  { complex: "Element", developer: "BAZIS-A", confirmed: true, source: "https://www.kn.kz/zhilye-kompleksy/almaty/element" },
  { complex: "4YOU", developer: "BI Group Юг", confirmed: true, source: "https://krisha.kz/complex/show/almaty/4you/" },
  { complex: "Terra", developer: "Tau development", confirmed: false, source: "https://krisha.kz/a/show/689098887" },
  { complex: "Tumar", developer: "Корпорация ВЕК", confirmed: true, source: "https://krisha.kz/a/show/1012037149" },
];

/** Платёж по ипотеке не может превышать 50% официального дохода (КДН). */
export const DEBT_TO_INCOME_LIMIT = 0.5;
