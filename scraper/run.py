"""Ежедневный сбор объявлений.

    python -m scraper.run            — обычный запуск, обновляет public/data/listings.json
    python -m scraper.run --probe    — сохраняет сырые страницы в debug/ для отладки парсера
"""
from __future__ import annotations

import argparse
import json
import logging
import bisect
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from . import notify
from .sources.krisha import Blocked, Krisha

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "listings.json"
CONFIG = ROOT / "config" / "area.json"
GONE_AFTER_DAYS = 2  # не видели в полной выдаче столько дней → считаем снятым

log = logging.getLogger("scraper")


def reject_reason(item: dict, cfg: dict) -> str | None:
    """Почему объявление не подходит под наш поиск (None — подходит)."""
    # квартиры от застройщика оставляем (для них работают партнёрские ипотеки), но только в сданных домах
    if item.get("seller", {}).get("type") == "developer" and item.get("year") and item["year"] > date.today().year:
        return "ещё строится"
    if item.get("rooms") != cfg["rooms"]:
        return "не 3 комнаты"
    if item.get("year") and item["year"] < cfg["minYear"]:
        return "старый дом"
    if not item.get("price"):
        return "нет цены"
    return None


FINISH_KEYWORDS = [
    # порядок важен: «предчистовая» проверяем раньше «чистовой»
    ("needs_repair", ("требует ремонта",)),
    ("prefinish", ("предчистов", "white box", "вайт бокс")),
    ("rough", ("черновая", "черновой", "без отделки", "свободная планировка")),
    ("clean", ("чистовая", "чистовой")),
    ("repair", ("ремонт",)),
]


def classify_finish(listing: dict) -> tuple[str | None, str | None]:
    """Отделка: (категория, откуда взяли). Сначала поле «состояние» Krisha, иначе — упоминание в описании."""
    cond = (listing.get("condition") or "").lower()
    for cat, words in FINISH_KEYWORDS:
        if any(w in cond for w in words):
            return cat, "krisha"
    desc = (listing.get("description") or "").lower()
    for cat, words in FINISH_KEYWORDS:
        if cat == "repair":
            continue  # слово «ремонт» в описании слишком многозначно («требует», «после ремонта» и т.п.)
        if any(w in desc for w in words):
            return cat, "description"
    return None, None


def is_near(listing: dict, cfg: dict) -> bool:
    near = cfg["near"]
    complex_name = (listing.get("complex") or "").strip().lower()
    if complex_name and complex_name in {c.lower() for c in near["complexes"]}:
        return True
    address = listing.get("address") or ""
    for st in near["streets"]:
        m = re.search(re.escape(st["name"]) + r"\S*\s+(\d+)", address, re.IGNORECASE)
        if m and st["from"] <= int(m.group(1)) <= st["to"]:
            return True
    return False


def group_key(listing: dict) -> str:
    """Ключ «одной и той же квартиры»: ЖК (или улица с домом), площадь, этаж и этажность.

    Одну квартиру часто выставляют несколько агентов — такие объявления получают одинаковый ключ.
    Без этажа не склеиваем: слишком велик риск объединить разные квартиры.
    """
    place = (listing.get("complex") or "").strip().lower()
    if not place:
        m = re.match(r"([^\d—,]+?)\s*(\d+\w*)", listing.get("address") or "")
        place = f"{m.group(1).strip().lower()} {m.group(2)}" if m else ""
    if not place or not listing.get("floor") or not listing.get("area"):
        return listing["id"]
    return f"{place}|{round(listing['area'])}|{listing['floor']}/{listing.get('floors')}"


def apply_snapshot(listing: dict | None, item: dict, today: str) -> dict:
    """Обновляет (или создаёт) запись, дописывая цену в историю при изменении."""
    item = dict(item)
    price = item.pop("price")
    if listing is None:
        listing = {**item, "firstSeen": today, "history": []}
    else:
        phones = listing.get("seller", {}).get("phones")
        for k, v in item.items():
            if v not in (None, "", []):
                listing[k] = v
        if phones and not listing.get("seller", {}).get("phones"):
            listing.setdefault("seller", {})["phones"] = phones
    listing["lastSeen"] = today
    listing["active"] = True
    # «posted» — последняя дата на карточке Krisha; «postedFirst» — самая ранняя из увиденных:
    # если дата на карточке со временем сдвигается (поднятие), первая ближе к реальной публикации
    if item.get("posted"):
        listing["postedFirst"] = min(filter(None, [listing.get("postedFirst"), item["posted"]]))
    if not listing["history"] or listing["history"][-1]["price"] != price:
        listing["history"].append({"date": today, "price": price})
    return listing


def _num(listing_id: str) -> int | None:
    m = re.fullmatch(r"krisha:(\d+)", listing_id)
    return int(m.group(1)) if m else None


def estimate_published(listings: dict[str, dict], today: str) -> None:
    """Дата публикации на Krisha. В выдаче её нет (на карточке — дата обновления), поэтому:

    * номер объявления больше всех, что мы видели в прошлые дни, → объявление вышло после прошлого сбора,
      и дата на его карточке — это и есть дата публикации (точно, до дня);
    * для остальных — оценка сверху: номера на Krisha растут со временем (проверено на данных 27.10:
      чем больше номер, тем позже самая ранняя дата обновления), значит объявление опубликовано не позже,
      чем самая ранняя дата обновления среди объявлений с номером не меньше его.
    """
    seen_before = [n for l in listings.values() if l["firstSeen"] < today and (n := _num(l["id"]))]
    prev_max = max(seen_before, default=None)
    dated = sorted((n, l["posted"]) for l in listings.values() if l.get("posted") and (n := _num(l["id"])))
    suffix_min: list[str] = [""] * len(dated)
    cur = "9999-12-31"
    for i in range(len(dated) - 1, -1, -1):
        cur = min(cur, dated[i][1])
        suffix_min[i] = cur
    ids = [n for n, _ in dated]
    floor = dated and min(p for _, p in dated)  # самая старая дата обновления в выдаче — раньше Krisha не показывает
    for l in listings.values():
        n = _num(l["id"])
        if n is None or l.get("publishedExact"):
            continue
        if prev_max is not None and l["firstSeen"] == today and n > prev_max and l.get("posted"):
            l["published"], l["publishedExact"] = l["posted"], True
            continue
        i = bisect.bisect_left(ids, n)
        if i < len(ids):
            bound = suffix_min[i]
            l["published"] = min(filter(None, [l.get("published"), bound]))
            l["publishedExact"] = False
        # оценка упёрлась в самую старую дату выдачи: «эта дата или раньше», настоящая неизвестна
        l["publishedOpen"] = bool(floor) and l.get("published", "9999") <= floor


def mark_gone(listings: dict[str, dict], today: str) -> int:
    cutoff = (date.fromisoformat(today) - timedelta(days=GONE_AFTER_DAYS)).isoformat()
    n = 0
    for l in listings.values():
        if l["active"] and l["lastSeen"] < cutoff:
            l["active"] = False
            n += 1
    return n


def already_collected_today(store: dict, today: str) -> bool:
    """Данные за сегодня уже есть — повторный (страховочный) запуск по расписанию не нужен."""
    return bool(store.get("updatedAt")) and store["updatedAt"][:10] == today


def run(probe: bool = False, if_stale: bool = False) -> None:
    cfg = json.loads(CONFIG.read_text())
    today = date.today().isoformat()
    store = json.loads(DATA.read_text()) if DATA.exists() else {"updatedAt": None, "listings": []}
    if if_stale and already_collected_today(store, today):
        log.info("данные за %s уже собраны — пропускаю", today)
        return
    by_id = {l["id"]: l for l in store["listings"]}
    prev_state = notify.snapshot(store["listings"])

    debug_dir = None
    if probe:
        debug_dir = ROOT / "debug"
        debug_dir.mkdir(exist_ok=True)
    k = Krisha(debug_dir=debug_dir)

    seen: set[str] = set()
    stats = {"cards": 0, "kept": 0, "new": 0, "price_changes": 0, "rejected": {}}
    complete = True
    for url in cfg["krisha"]["searchUrls"]:
        page = 0
        while True:
            page += 1
            if page > (2 if probe else cfg["krisha"]["maxPages"]):
                complete = False
                log.warning("hit maxPages on %s", url)
                break
            try:
                cards = k.search(url, cfg, page)
            except Blocked:
                log.error("blocked by anti-bot on page %d — stopping, will not mark listings as gone", page)
                complete = False
                break
            new_cards = [c for c in cards if c["id"] not in seen]
            if not new_cards:
                break  # дошли до конца выдачи
            for item in new_cards:
                seen.add(item["id"])
                stats["cards"] += 1
                if reason := reject_reason(item, cfg):
                    stats["rejected"][reason] = stats["rejected"].get(reason, 0) + 1
                    continue
                stats["kept"] += 1
                before = by_id.get(item["id"])
                if before is None:
                    stats["new"] += 1
                elif before["history"][-1]["price"] != item["price"]:
                    stats["price_changes"] += 1
                by_id[item["id"]] = apply_snapshot(before, item, today)
            log.info("page %d: %d cards", page, len(new_cards))

    if probe:
        log.info("probe: %s", stats)
        return

    stats["gone"] = mark_gone(by_id, today) if complete else 0
    for l in by_id.values():
        l["near"] = is_near(l, cfg)
        l["group"] = group_key(l)
        l["finish"], l["finishSource"] = classify_finish(l)
    estimate_published(by_id, today)
    store["listings"] = sorted(by_id.values(), key=lambda l: l["firstSeen"], reverse=True)
    if stats["cards"]:
        store["updatedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    DATA.write_text(json.dumps(store, ensure_ascii=False, indent=1))
    log.info("done (complete=%s): %s, total %d", complete, stats, len(by_id))
    if not stats["cards"]:
        raise SystemExit("no cards parsed — layout changed or access blocked")

    try:
        notify.daily_report(prev_state, store, cfg, today)
    except Exception as e:  # noqa: BLE001 — уведомление не должно ронять сбор данных
        log.warning("telegram: %s", e)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--if-stale", action="store_true", help="ничего не делать, если данные за сегодня уже собраны")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    run(probe=args.probe, if_stale=args.if_stale)
