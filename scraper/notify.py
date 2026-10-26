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
MAX_ITEMS = 12
MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]


def snapshot(listings: list[dict]) -> dict[str, dict]:
    """Состояние до запуска: копия нужных полей (сами записи потом меняются на месте)."""
    return {
        l["id"]: {"price": l["history"][-1]["price"], "group": l.get("group", l["id"]), "active": l["active"], "near": l.get("near")}
        for l in listings
    }


def _mln(n: float) -> str:
    return f"{n / 1e6:.1f}".rstrip("0").rstrip(".").replace(".", ",") + " млн"


def _line(l: dict, extra: str = "") -> str:
    name = f"ЖК {l['complex']}" if l.get("complex") else (l.get("address") or l["title"])
    floor = f" · {l['floor']}/{l['floors']} эт." if l.get("floor") else ""
    price = l["history"][-1]["price"]
    ppm2 = f" ({round(price / l['area'] / 1000)} тыс/м²)" if l.get("area") else ""
    who = " · собственник" if l.get("seller", {}).get("type") == "owner" else ""
    text = extra or f"{_mln(price)}{ppm2}"
    return f'• <a href="{html.escape(l["url"])}">{html.escape(name)}</a> · {l.get("area")} м²{floor}{who} — {text}'


def _cheapest_per_group(listings: list[dict]) -> dict[str, dict]:
    best: dict[str, dict] = {}
    for l in listings:
        g = l.get("group", l["id"])
        if g not in best or l["history"][-1]["price"] < best[g]["history"][-1]["price"]:
            best[g] = l
    return best


def build_report(before: dict[str, dict], store: dict, cfg: dict, today: str) -> str:
    alerts = cfg.get("alerts", {})
    max_price = alerts.get("maxPrice", float("inf"))
    listings = store["listings"]
    near_active = [l for l in listings if l["active"] and l.get("near")]
    groups = _cheapest_per_group(near_active)
    in_budget = {g: l for g, l in groups.items() if l["history"][-1]["price"] <= max_price}

    d = date.fromisoformat(today)
    lines = [
        f"<b>🏠 Квартиры у MEGA · {d.day} {MONTHS[d.month - 1]}</b>",
        f"В продаже: {len(groups)} квартир ({len(near_active)} объявлений), в бюджете до {_mln(max_price)}: <b>{len(in_budget)}</b>",
    ]

    if not before:
        lines.append("\nНачали отслеживать. Со следующего дня здесь будут новые квартиры и снижения цен.")
    else:
        known_groups = {s["group"] for s in before.values()}
        new = [l for g, l in in_budget.items() if g not in known_groups]
        new.sort(key=lambda l: l["history"][-1]["price"])

        drops: dict[str, tuple[dict, int, int]] = {}
        for l in near_active:
            prev = before.get(l["id"])
            now = l["history"][-1]["price"]
            if prev and now < prev["price"]:
                g = l.get("group", l["id"])
                if g not in drops or prev["price"] - now > drops[g][1] - drops[g][2]:
                    drops[g] = (l, prev["price"], now)
        drop_list = sorted(drops.values(), key=lambda x: x[2] - x[1])

        active_groups_now = {l.get("group", l["id"]) for l in listings if l["active"]}
        gone_groups = {
            s["group"] for s in before.values()
            if s["active"] and s["near"] and s["price"] <= max_price and s["group"] not in active_groups_now
        }
        by_group = _cheapest_per_group([l for l in listings if l.get("group", l["id"]) in gone_groups])

        if new:
            lines.append(f"\n<b>🆕 Новые в бюджете ({len(new)})</b>")
            lines += [_line(l) for l in new[:MAX_ITEMS]]
        if drop_list:
            lines.append(f"\n<b>📉 Снизили цену ({len(drop_list)})</b>")
            for l, old, now in drop_list[:MAX_ITEMS]:
                mark = " ✅ теперь в бюджете" if now <= max_price < old else ""
                lines.append(_line(l, f"{_mln(old)} → <b>{_mln(now)}</b> (−{_mln(old - now)}){mark}"))
        if by_group:
            lines.append(f"\n<b>🚫 Сняли с продажи ({len(by_group)})</b>")
            lines += [_line(l) for l in list(by_group.values())[:MAX_ITEMS]]
        if not (new or drop_list or by_group):
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
