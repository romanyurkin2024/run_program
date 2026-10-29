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


def _mark(price: float, cfg: dict) -> str:
    """✅ проходит по рыночной ипотеке · 🔵 только через Отбасы · ⚠️ дороже обоих вариантов."""
    if price <= cfg.get("alerts", {}).get("maxPrice", float("inf")):
        return "✅"
    return "🔵" if otbasy_payment(price, cfg) is not None else "⚠️"


def _line(l: dict, cfg: dict, extra: str = "") -> str:
    """Квартира в две строки: 1) ЖК, площадь, этаж — ссылкой; 2) цена (или изменение), отделка, продавец, пометка."""
    name = l["complex"] if l.get("complex") else (l.get("address") or l["title"])
    price = l["history"][-1]["price"]
    head = " · ".join(filter(None, [
        f'<a href="{html.escape(l["url"])}">{html.escape(name)}</a>',
        l.get("area") and f"{l['area']:g} м²".replace(".", ","),
        l.get("floor") and f"{l['floor']}/{l['floors']} эт.",
    ]))
    fin = l.get("finish")
    seller = l.get("seller", {}).get("type")
    details = " · ".join(filter(None, [
        extra or f"<b>{_mln(price)}</b>",
        fin in FINISH_LABELS and FINISH_LABELS[fin] + ("*" if l.get("finishSource") == "description" else ""),
        {"owner": "собственник", "developer": "застройщик"}.get(seller),
    ]))
    return f"• {head}\n   {_mark(price, cfg)} {details}"


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


TOP_NEAR = 8  # сколько квартир показывать в блоке «рядом с MEGA», остальное — «и ещё N на сайте»
TOP_REST = 3  # по остальному району — только самое заметное


def _block(title: str, items: list[str], limit: int) -> list[str]:
    if not items:
        return []
    out = ["", f"<b>{title} · {len(items)}</b>"] + items[:limit]
    if len(items) > limit:
        out.append(f"   …и ещё {len(items) - limit} — на сайте")
    return out


def build_report(before: dict[str, dict], store: dict, cfg: dict, today: str) -> str:
    """Короткая сводка за день: у MEGA — по блокам «Новое / Подешевели / Подорожали / Сняты», по району — главное.
    Бюджет — только пометка ✅/🔵/⚠️, не фильтр."""
    listings = store["listings"]
    d = date.fromisoformat(today)
    lines = [f"<b>🏠 Квартиры · {d.day} {MONTHS[d.month - 1]}</b>"]

    if not before:
        lines += ["", "Начали отслеживать. Со следующего дня здесь будут новые квартиры и изменения цен."]
    else:
        def moved(c, sign):
            l, old, now = c
            note = " · теперь в бюджете" if now <= cfg.get("alerts", {}).get("maxPrice", float("inf")) < old else ""
            return _line(l, cfg, f"{_mln(old)} → <b>{_mln(now)}</b> ({sign}{_mln(abs(now - old))}){note}")

        new, drops, raises, gone = _area_changes(before, listings, True)
        lines += ["", "<b>📍 РЯДОМ С MEGA</b>"]
        if not (new or drops or raises or gone):
            lines.append("Без изменений.")
        lines += _block("🆕 Новое", [_line(l, cfg) for l in new], TOP_NEAR)
        lines += _block("📉 Подешевели", [moved(c, "−") for c in drops], TOP_NEAR)
        lines += _block("📈 Подорожали", [moved(c, "+") for c in raises], TOP_NEAR)
        lines += _block("🚫 Сняты", [_line(l, cfg) for l in gone], TOP_NEAR)

        new, drops, raises, gone = _area_changes(before, listings, False)
        lines += ["", "<b>🗺 ОСТАЛЬНОЙ РАЙОН</b>"]
        counts = [f"🆕 {len(new)}", f"📉 {len(drops)}", f"📈 {len(raises)}", f"🚫 {len(gone)}"]
        lines.append(" · ".join(counts) if (new or drops or raises or gone) else "Без изменений.")
        # по району — только то, что проходит по бюджету (✅/🔵): так список остаётся коротким
        affordable = lambda l: _mark(l["history"][-1]["price"], cfg) != "⚠️"
        lines += _block("🆕 Новое в бюджете", [_line(l, cfg) for l in new if affordable(l)], TOP_REST)
        lines += _block("📉 Подешевели сильнее всего", [moved(c, "−") for c in drops], TOP_REST)

    lines += ["", "✅ рыночная ипотека · 🔵 через Отбасы · ⚠️ дороже · * отделка по описанию"]
    if url := cfg.get("siteUrl"):
        lines.append(f'<a href="{html.escape(url)}#/digest">Вся сводка на сайте →</a>')
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
