const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

export const money = (n: number) => `${nf.format(Math.round(n))} ₸`;

/** 87 500 000 → «87,5 млн ₸» */
export function mln(n: number, digits = 1): string {
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: digits })} млн ₸`;
  }
  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000).toLocaleString("ru-RU")} тыс ₸`;
  return money(n);
}

export const num = (n: number) => nf.format(n);

export function pct(n: number, digits = 1): string {
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: digits })}%`;
}

export function date(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function duration(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts: string[] = [];
  if (y) parts.push(`${y} ${plural(y, "год", "года", "лет")}`);
  if (m) parts.push(`${m} мес`);
  return parts.join(" ") || "0 мес";
}
