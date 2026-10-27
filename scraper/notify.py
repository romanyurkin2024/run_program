"""Ежедневный отчёт в Telegram: новые квартиры в бюджете, снижения цен, снятые объявления.

Нужны секреты репозитория TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID. Без них отчёт просто не отправляется.

    python -m scraper.notify --setup   — бот ответит каждому, кто ему написал, его chat id
                                         (а если TELEGRAM_CHAT_ID уже задан — пришлёт тестовое сообщение)
    python -m scraper.notify --send-file outbox/telegram.html — отправить готовый текст (разбор Claude)
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


def otbasy_payment(price: float, cfg: dict) -> float | None:
    """Платёж по промежуточному займу Отбасы — только если взнос покрывает 50% цены."""
    a = cfg.get("alerts", {})
    down = a.get("downPayment", 45_000_000)
    if "otbasyRate" not in a or down < price * 0.5:
        return None
    r = a["otbasyRate"] / 100 / 12
    n = a.get("years", 20) * 12
    loan = price - down
    return loan * r / (1 - (1 + r) ** -n) if loan > 0 else 0.0


FINISH_LABELS = {
    "repair": "с ремонтом",
    "clean": "чистовая",
    "prefinish": "предчистовая",
    "rough": "черновая",
    "needs_repair": "требует ремонта",
}


def _money(n: float) -> str:
    return _mln(n) if n >= 1_000_000 else f"{round(n / 1000)} тыс"


def _line(l: dict, cfg: dict, extra: str = "") -> str:
    """Квартира одной строкой: ЖК, площадь, этаж, отделка, цена (или изменение), ₸/м², ипотечный платёж."""
    name = f"ЖК {l['complex']}" if l.get("complex") else (l.get("address") or l["title"])
    floor = f" · {l['floor']}/{l['floors']} эт." if l.get("floor") else ""
    price = l["history"][-1]["price"]
    ppm2 = f" · {round(price / l['area'] / 1000)} тыс/м²" if l.get("area") else ""
    seller = l.get("seller", {}).get("type")
    who = " · собственник" if seller == "owner" else " · застройщик" if seller == "developer" else ""
    fin = l.get("finish")
    finish = f" · {FINISH_LABELS[fin]}{' (по описанию)' if l.get('finishSource') == 'description' else ''}" if fin in FINISH_LABELS else ""
    ok = price <= cfg.get("alerts", {}).get("maxPrice", float("inf"))
    pay = f"\n   💳 ипотека ~{_money(monthly_payment(price, cfg))}/мес {'✅' if ok else '⚠️ выше лимита банка'}"
    if (o := otbasy_payment(price, cfg)) is not None:
        pay += f" · Отбасы ~{_money(o)}/мес"
    text = extra or f"<b>{_mln(price)}</b>"
    return f'• <a href="{html.escape(l["url"])}">{html.escape(name)}</a> · {l.get("area")} м²{floor}{finish}{who} — {text}{ppm2}{pay}'


def _cheapest_per_group(listings: list[dict]) -> dict[str, dict]:
    best: dict[str, dict] = {}
    for l in listings:
        g = l.get("group", l["id"])
        if g not in best or l["history"][-1]["price"] < best[g]["history"][-1]["price"]:
            best[g] = l
    return best


def _area_changes(before: dict[str, dict], listings: list[dict], near: bool) -> tuple[list, list, list, list]:
    """Новые квартиры, снижения, повышения и снятые — для одной части района (у MEGA или остальное)."""
    part = [l for l in listings if bool(l.get("near")) == near]
    active = [l for l in part if l["active"]]
    groups = _cheapest_per_group(active)
    known_groups = {s["group"] for s in before.values()}
    new = sorted((l for g, l in groups.items() if g not in known_groups), key=lambda l: l["history"][-1]["price"])

    changes: dict[str, tuple[dict, int, int]] = {}
    for l in active:
        prev = before.get(l["id"])
        now = l["history"][-1]["price"]
        if prev and now != prev["price"]:
            g = l.get("group", l["id"])
            if g not in changes or abs(prev["price"] - now) > abs(changes[g][1] - changes[g][2]):
                changes[g] = (l, prev["price"], now)
    drops = sorted((c for c in changes.values() if c[2] < c[1]), key=lambda c: c[2] - c[1])
    raises = sorted((c for c in changes.values() if c[2] > c[1]), key=lambda c: c[1] - c[2])

    active_groups_now = {l.get("group", l["id"]) for l in listings if l["active"]}
    gone_groups = {
        s["group"] for s in before.values()
        if s["active"] and bool(s["near"]) == near and s["group"] not in active_groups_now
    }
    gone = list(_cheapest_per_group([l for l in part if l.get("group", l["id"]) in gone_groups]).values())
    return new, drops, raises, gone


def build_report(before: dict[str, dict], store: dict, cfg: dict, today: str) -> str:
    """Все изменения по Бостандыкскому району: отдельно у MEGA и остальное. Бюджет — только пометка, не фильтр."""
    max_price = cfg.get("alerts", {}).get("maxPrice", float("inf"))
    listings = store["listings"]

    def count(near: bool) -> tuple[int, int, int]:
        act = [l for l in listings if l["active"] and bool(l.get("near")) == near]
        g = _cheapest_per_group(act)
        return len(g), len(act), sum(1 for l in g.values() if l["history"][-1]["price"] <= max_price)

    d = date.fromisoformat(today)
    n_flats, n_ads, n_budget = count(True)
    o_flats, o_ads, o_budget = count(False)
    lines = [
        f"<b>🏠 Квартиры, Бостандыкский р-н · {d.day} {MONTHS[d.month - 1]}</b>",
        f"У MEGA: {n_flats} квартир ({n_ads} объявлений), по рыночной ипотеке проходят {n_budget}",
        f"Остальной район: {o_flats} квартир ({o_ads} объявлений), проходят {o_budget}",
        f"💳 — платёж по рыночной ипотеке (взнос {_mln(cfg.get('alerts', {}).get('downPayment', 0))}, "
        f"{str(cfg.get('alerts', {}).get('rate', 20.5)).replace('.', ',')}%, {cfg.get('alerts', {}).get('years', 20)} лет): "
        "✅ банк одобрит, ⚠️ выше лимита 50% дохода; «Отбасы» — промежуточный заём при 50% на депозите",
    ]

    if not before:
        lines.append("\nНачали отслеживать. Со следующего дня здесь будут новые квартиры и изменения цен.")
    else:
        for near, title in ((True, "📍 Рядом с MEGA"), (False, "🗺 Остальной Бостандыкский район")):
            new, drops, raises, gone = _area_changes(before, listings, near)
            lines.append(f"\n<b>{title}</b>")
            if new:
                lines.append(f"<b>🆕 Новые квартиры ({len(new)})</b>")
                lines += [_line(l, cfg) for l in new]
            if drops:
                lines.append(f"<b>📉 Снизили цену ({len(drops)})</b>")
                for l, old, now in drops:
                    mark = " · теперь проходит по ипотеке" if now <= max_price < old else ""
                    lines.append(_line(l, cfg, f"{_mln(old)} → <b>{_mln(now)}</b> (−{_mln(old - now)}){mark}"))
            if raises:
                lines.append(f"<b>📈 Подняли цену ({len(raises)})</b>")
                lines += [_line(l, cfg, f"{_mln(old)} → <b>{_mln(now)}</b> (+{_mln(now - old)})") for l, old, now in raises]
            if gone:
                lines.append(f"<b>🚫 Сняли с продажи ({len(gone)})</b>")
                lines += [_line(l, cfg) for l in gone]
            if not (new or drops or raises or gone):
                lines.append("Без изменений.")

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
        payload = {"chat_id": chat_id, "text": part, "parse_mode": "HTML", "disable_web_page_preview": True}
        r = requests.post(API.format(token=token, method="sendMessage"), json=payload, timeout=30)
        if r.status_code == 400 and "parse entities" in r.text:
            # битая HTML-разметка (обычно в тексте, написанном не нами) — лучше отправить как есть, чем потерять
            payload.pop("parse_mode")
            r = requests.post(API.format(token=token, method="sendMessage"), json=payload, timeout=30)
        if not r.ok:
            raise RuntimeError(f"sendMessage {r.status_code}: {r.text[:300]}")


def daily_report(before: dict[str, dict], store: dict, cfg: dict, today: str) -> None:
    if os.environ.get("SKIP_TELEGRAM"):
        log.info("telegram: отключено для этого запуска")
        return
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
    ap.add_argument("--send-file", help="отправить текст из файла (HTML-разметка Telegram)")
    args = ap.parse_args()
    if args.setup:
        setup()
    elif args.send_file:
        token, chat_id = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
        if not token or not chat_id:
            raise SystemExit("нужны секреты TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID")
        text = Path(args.send_file).read_text().strip()
        if not text:
            raise SystemExit(f"{args.send_file} пустой")
        send(text, token, chat_id)
        log.info("telegram: отправлено %d символов", len(text))
    elif args.preview:
        root = Path(__file__).resolve().parent.parent
        store = json.loads((root / "public/data/listings.json").read_text())
        cfg = json.loads((root / "config/area.json").read_text())
        print(build_report(snapshot(store["listings"]), store, cfg, date.today().isoformat()))
