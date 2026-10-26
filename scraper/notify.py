"""Ежедневный отчёт в Telegram: новые квартиры в бюджете, снижения цен, снятые объявления.

Нужны секреты репозитория TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID. Без них отчёт просто не отправляется.

    python -m scraper.notify --setup   — бот ответит каждому, кто ему написал, его chat id
                                         (а если TELEGRAM_CHAT_ID уже задан — пришлёт тестовое сообщение)
"""
from __future__ import annotations

import argparse
import html
import json
import logging
import os
from datetime import date
from pathlib import Path

import requests

log = logging.getLogger(__name__)

API = "https://api.telegram.org/bot{token}/{method}"
LIMIT = 4000  # Telegram режет сообщения длиннее 4096 символов
MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]


def snapshot(listings: list[dict]) -> dict[str, dict]:
    """Состояние до запуска: копия нужных полей (сами записи потом меняются на месте)."""
    return {
        l["id"]: {"price": l["history"][-1]["price"], "group": l.get("group", l["id"]), "active": l["active"], "near": l.get("near")}
        for l in listings
    }


def _mln(n: float) -> str:
    return f"{n / 1e6:.1f}".rstrip("0").rstrip(".").replace(".", ",") + " млн"


def monthly_payment(price: float, cfg: dict) -> float:
    """Аннуитетный платёж при взносе и ставке из config/area.json → alerts."""
    a = cfg.get("alerts", {})
    loan = max(0.0, price - a.get("downPayment", 45_000_000))
    r = a.get("rate", 20.5) / 100 / 12
    n = a.get("years", 20) * 12
    return loan * r / (1 - (1 + r) ** -n) if loan and r else loan / n


def _line(l: dict, cfg: dict, extra: str = "") -> str:
    """Квартира одной строкой: ЖК, площадь, этаж, цена (или изменение), ₸/м², платёж и пометка бюджета."""
    name = f"ЖК {l['complex']}" if l.get("complex") else (l.get("address") or l["title"])
    floor = f" · {l['floor']}/{l['floors']} эт." if l.get("floor") else ""
    price = l["history"][-1]["price"]
    ppm2 = f" · {round(price / l['area'] / 1000)} тыс/м²" if l.get("area") else ""
    who = " · собственник" if l.get("seller", {}).get("type") == "owner" else ""
    budget = "✅" if price <= cfg.get("alerts", {}).get("maxPrice", float("inf")) else "⚠️"
    pay = f" · {budget} ~{round(monthly_payment(price, cfg) / 1000)} тыс/мес"
    text = extra or f"<b>{_mln(price)}</b>"
    return f'• <a href="{html.escape(l["url"])}">{html.escape(name)}</a> · {l.get("area")} м²{floor}{who} — {text}{ppm2}{pay}'


def _cheapest_per_group(listings: list[dict]) -> dict[str, dict]:
    best: dict[str, dict] = {}
    for l in listings:
        g = l.get("group", l["id"])
        if g not in best or l["history"][-1]["price"] < best[g]["history"][-1]["price"]:
            best[g] = l
    return best


def build_report(before: dict[str, dict], store: dict, cfg: dict, today: str) -> str:
    """Все изменения по квартирам рядом с MEGA, без отсечения по цене: бюджет — только пометка ✅/⚠️."""
    max_price = cfg.get("alerts", {}).get("maxPrice", float("inf"))
    listings = store["listings"]
    near_active = [l for l in listings if l["active"] and l.get("near")]
    groups = _cheapest_per_group(near_active)
    in_budget = sum(1 for l in groups.values() if l["history"][-1]["price"] <= max_price)

    d = date.fromisoformat(today)
    lines = [
        f"<b>🏠 Квартиры у MEGA · {d.day} {MONTHS[d.month - 1]}</b>",
        f"В продаже: {len(groups)} квартир ({len(near_active)} объявлений), из них до {_mln(max_price)}: {in_budget}",
        "✅ — в бюджете, ⚠️ — дороже; платёж при взносе и ставке из настроек",
    ]

    if not before:
        lines.append("\nНачали отслеживать. Со следующего дня здесь будут новые квартиры и изменения цен.")
    else:
        known_groups = {s["group"] for s in before.values()}
        new = sorted((l for g, l in groups.items() if g not in known_groups), key=lambda l: l["history"][-1]["price"])

        changes: dict[str, tuple[dict, int, int]] = {}
        for l in near_active:
            prev = before.get(l["id"])
            now = l["history"][-1]["price"]
            if prev and now != prev["price"]:
                g = l.get("group", l["id"])
                if g not in changes or abs(prev["price"] - now) > abs(changes[g][1] - changes[g][2]):
                    changes[g] = (l, prev["price"], now)
        drops = sorted((c for c in changes.values() if c[2] < c[1]), key=lambda c: c[2] - c[1])
        raises = sorted((c for c in changes.values() if c[2] > c[1]), key=lambda c: c[1] - c[2])

        active_groups_now = {l.get("group", l["id"]) for l in listings if l["active"]}
        gone_groups = {s["group"] for s in before.values() if s["active"] and s["near"] and s["group"] not in active_groups_now}
        gone = _cheapest_per_group([l for l in listings if l.get("group", l["id"]) in gone_groups])

        if new:
            lines.append(f"\n<b>🆕 Новые квартиры ({len(new)})</b>")
            lines += [_line(l, cfg) for l in new]
        if drops:
            lines.append(f"\n<b>📉 Снизили цену ({len(drops)})</b>")
            for l, old, now in drops:
                mark = " · теперь в бюджете" if now <= max_price < old else ""
                lines.append(_line(l, cfg, f"{_mln(old)} → <b>{_mln(now)}</b> (−{_mln(old - now)}){mark}"))
        if raises:
            lines.append(f"\n<b>📈 Подняли цену ({len(raises)})</b>")
            lines += [_line(l, cfg, f"{_mln(old)} → <b>{_mln(now)}</b> (+{_mln(now - old)})") for l, old, now in raises]
        if gone:
            lines.append(f"\n<b>🚫 Сняли с продажи ({len(gone)})</b>")
            lines += [_line(l, cfg) for l in gone.values()]
        if not (new or drops or raises or gone):
            lines.append("\nЗа день без изменений.")

    if url := cfg.get("siteUrl"):
        lines.append(f'\n<a href="{html.escape(url)}">Открыть трекер</a>')
    return "\n".join(lines)


def chunks(text: str, limit: int = LIMIT) -> list[str]:
    out, cur = [], ""
    for line in text.split("\n"):
        if len(cur) + len(line) + 1 > limit:
            out.append(cur)
            cur = ""
        cur += ("\n" if cur else "") + line
    if cur:
        out.append(cur)
    return out


def send(text: str, token: str, chat_id: str) -> None:
    for part in chunks(text):
        r = requests.post(
            API.format(token=token, method="sendMessage"),
            json={"chat_id": chat_id, "text": part, "parse_mode": "HTML", "disable_web_page_preview": True},
            timeout=30,
        )
        if not r.ok:
            raise RuntimeError(f"sendMessage {r.status_code}: {r.text[:300]}")


def daily_report(before: dict[str, dict], store: dict, cfg: dict, today: str) -> None:
    token, chat_id = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        log.info("telegram: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID не заданы — отчёт не отправлен")
        return
    send(build_report(before, store, cfg, today), token, chat_id)
    log.info("telegram: отчёт отправлен")


def setup() -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        raise SystemExit("Добавьте секрет TELEGRAM_BOT_TOKEN (токен от @BotFather)")
    if chat_id := os.environ.get("TELEGRAM_CHAT_ID"):
        send("✅ Бот подключён. Отчёт будет приходить каждый день после сбора объявлений.", token, chat_id)
        log.info("test message sent")
        return
    r = requests.get(API.format(token=token, method="getUpdates"), timeout=30)
    r.raise_for_status()
    chats = {u["message"]["chat"]["id"] for u in r.json().get("result", []) if "message" in u}
    if not chats:
        raise SystemExit("Бот пока никто не писал: откройте бота в Telegram, нажмите Start и запустите снова")
    for chat in chats:
        send(f"Ваш chat id: <code>{chat}</code>\nДобавьте его в GitHub как секрет TELEGRAM_CHAT_ID.", token, str(chat))
    # сами id в лог не пишем: логи Actions видны всем, у кого есть доступ к репозиторию
    log.info("chat id sent to %d chat(s)", len(chats))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--setup", action="store_true")
    ap.add_argument("--preview", action="store_true", help="напечатать отчёт по текущим данным, ничего не отправляя")
    args = ap.parse_args()
    if args.setup:
        setup()
    elif args.preview:
        root = Path(__file__).resolve().parent.parent
        store = json.loads((root / "public/data/listings.json").read_text())
        cfg = json.loads((root / "config/area.json").read_text())
        print(build_report(snapshot(store["listings"]), store, cfg, date.today().isoformat()))
