"""Ежедневный сбор объявлений.

    python -m scraper.run            — обычный запуск, обновляет public/data/listings.json
    python -m scraper.run --probe    — сохраняет сырые страницы в debug/ для отладки парсера
"""
from __future__ import annotations

import argparse
import json
import logging
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .sources.krisha import Blocked, Krisha

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "listings.json"
CONFIG = ROOT / "config" / "area.json"
GONE_AFTER_DAYS = 2  # не видели в полной выдаче столько дней → считаем снятым

log = logging.getLogger("scraper")


def reject_reason(item: dict, cfg: dict) -> str | None:
    """Почему объявление не подходит под наш поиск (None — подходит)."""
    if item.get("seller", {}).get("type") == "developer":
        return "новостройка от застройщика"
    if item.get("rooms") != cfg["rooms"]:
        return "не 3 комнаты"
    if item.get("year") and item["year"] < cfg["minYear"]:
        return "старый дом"
    cond = (item.get("condition") or "").lower()
    if any(x in cond for x in cfg["excludeConditions"]):
        return "без ремонта"
    if not item.get("price"):
        return "нет цены"
    return None


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
    if not listing["history"] or listing["history"][-1]["price"] != price:
        listing["history"].append({"date": today, "price": price})
    return listing


def mark_gone(listings: dict[str, dict], today: str) -> int:
    cutoff = (date.fromisoformat(today) - timedelta(days=GONE_AFTER_DAYS)).isoformat()
    n = 0
    for l in listings.values():
        if l["active"] and l["lastSeen"] < cutoff:
            l["active"] = False
            n += 1
    return n


def run(probe: bool = False) -> None:
    cfg = json.loads(CONFIG.read_text())
    today = date.today().isoformat()
    store = json.loads(DATA.read_text()) if DATA.exists() else {"updatedAt": None, "listings": []}
    by_id = {l["id"]: l for l in store["listings"]}

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
    store["listings"] = sorted(by_id.values(), key=lambda l: l["firstSeen"], reverse=True)
    if stats["cards"]:
        store["updatedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    DATA.write_text(json.dumps(store, ensure_ascii=False, indent=1))
    log.info("done (complete=%s): %s, total %d", complete, stats, len(by_id))
    if not stats["cards"]:
        raise SystemExit("no cards parsed — layout changed or access blocked")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    run(probe=args.probe)
