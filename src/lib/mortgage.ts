export type RepaymentType = "annuity" | "differentiated";

export interface LoanInput {
  principal: number;
  annualRate: number; // percent, e.g. 20.5
  months: number;
  type: RepaymentType;
  extraMonthly?: number; // досрочное погашение каждый месяц (сокращение срока)
}

export interface ScheduleRow {
  month: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

export interface LoanResult {
  firstPayment: number;
  lastPayment: number;
  totalPaid: number;
  overpayment: number;
  months: number;
  schedule: ScheduleRow[];
}

export function annuityPayment(principal: number, annualRate: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/** Максимальная сумма займа, которую обслуживает заданный ежемесячный платёж (аннуитет). */
export function maxPrincipalForPayment(payment: number, annualRate: number, months: number): number {
  if (payment <= 0 || months <= 0) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return payment * months;
  return (payment * (1 - Math.pow(1 + r, -months))) / r;
}

export function buildSchedule({ principal, annualRate, months, type, extraMonthly = 0 }: LoanInput): LoanResult {
  const r = annualRate / 100 / 12;
  const schedule: ScheduleRow[] = [];
  if (principal <= 0 || months <= 0) {
    return { firstPayment: 0, lastPayment: 0, totalPaid: 0, overpayment: 0, months: 0, schedule };
  }
  const annuity = annuityPayment(principal, annualRate, months);
  const basePrincipal = principal / months;
  let balance = principal;
  let totalPaid = 0;
  for (let m = 1; m <= months && balance > 0.5; m++) {
    const interest = balance * r;
    let principalPart = type === "annuity" ? annuity - interest : basePrincipal;
    principalPart = Math.min(balance, principalPart + extraMonthly);
    const payment = principalPart + interest;
    balance -= principalPart;
    totalPaid += payment;
    schedule.push({ month: m, payment, interest, principal: principalPart, balance: Math.max(0, balance) });
  }
  return {
    firstPayment: schedule[0]?.payment ?? 0,
    lastPayment: schedule[schedule.length - 1]?.payment ?? 0,
    totalPaid,
    overpayment: totalPaid - principal,
    months: schedule.length,
    schedule,
  };
}
