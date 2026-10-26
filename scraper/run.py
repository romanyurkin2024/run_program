"""Ежедневный сбор объявлений.

    python -m scraper.run            — обычный запуск, обновляет public/data/listings.json
    python -m scraper.run --probe    — сохраняет сырые страницы в debug/ для отладки парсера
"""
from __future__ import annotations

import argparse
import json
import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .sources.krisha import Gone, Krisha

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "listings.json"
SEEN = ROOT / "public" / "data" / "rejected.json"
CONFIG = ROOT / "config" / "area.json"
RECHECK_REJECTED_DAYS = 30

log = logging.getLogger("scraper")


def reject_reason(item: dict, cfg: dict) -> str | None:
    """Почему объявление не подходит под наш поиск (None — подходит)."""
    bbox = cfg["bbox"]
    if item.get("lat") and item.get("lon"):
        if not (bbox["latMin"] <= item["lat"] <= bbox["latMax"] and bbox["lonMin"] <= item["lon"] <= bbox["lonMax"]):
            return "вне района"
    if item.get("rooms") and item["rooms"] != cfg["rooms"]:
        return "не 3 комнаты"
    if item.get("year") and item["year"] < cfg["minYear"]:
        return "старый дом"
    cond = (item.get("condition") or "").lower()
    if any(x in cond for x in cfg["excludeConditions"]):
        return "без ремонта"
    if not item.get("price"):
        return "нет цены"
    return None


def apply_snapshot(listing: dict | None, item: dict, today: str) -> dict:
    """Обновляет (или создаёт) запись, дописывая цену в историю при изменении."""
    price = item.pop("price")
    item.pop("archived", None)
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


def update_price(listing: dict, price: int, today: str) -> None:
    listing["lastSeen"] = today
    listing["active"] = True
    if price and listing["history"][-1]["price"] != price:
        listing["history"].append({"date": today, "price": price})


def run(probe: bool = False) -> None:
    cfg = json.loads(CONFIG.read_text())
    today = date.today().isoformat()
    store = json.loads(DATA.read_text()) if DATA.exists() else {"updatedAt": None, "listings": []}
    rejected: dict = json.loads(SEEN.read_text()) if SEEN.exists() else {}
    by_id = {l["id"]: l for l in store["listings"]}

    debug_dir = None
    if probe:
        debug_dir = ROOT / "debug"
        debug_dir.mkdir(exist_ok=True)
    k = Krisha(debug_dir=debug_dir)

    # 1. Страницы поиска: id → цена
    found: dict[str, int | None] = {}
    max_pages = 1 if probe else cfg["krisha"]["maxPages"]
    for url in cfg["krisha"]["searchUrls"]:
        for page in range(1, max_pages + 1):
            ids = k.search(url, cfg, page)
            new = {i: p for i, p in ids.items() if i not in found}
            log.info("page %d: %d ids (%d new)", page, len(ids), len(new))
            if not new:
                break
            found.update(new)

    if probe:
        for aid in list(found)[:3]:
            try:
                item = k.advert(aid)
                log.info("parsed %s: %s", aid, json.dumps(item, ensure_ascii=False)[:1500])
                log.info("phones %s: %s", aid, k.phones(aid))
            except Exception as e:  # noqa: BLE001 — в режиме отладки логируем всё
                log.exception("advert %s: %s", aid, e)
        return

    cutoff = (date.today() - timedelta(days=RECHECK_REJECTED_DAYS)).isoformat()
    stats = {"new": 0, "updated": 0, "rejected": 0, "gone": 0, "errors": 0}

    # 2. Новые и известные объявления
    for aid, price in found.items():
        lid = f"krisha:{aid}"
        if lid in by_id and price:
            update_price(by_id[lid], price, today)
            stats["updated"] += 1
            continue
        if lid not in by_id and rejected.get(lid, {}).get("date", "") > cutoff:
            continue
        try:
            item = k.advert(aid)
        except Gone:
            continue
        except Exception as e:  # noqa: BLE001 — одно сломанное объявление не должно ронять весь запуск
            log.warning("advert %s: %s", aid, e)
            stats["errors"] += 1
            continue
        reason = reject_reason(item, cfg)
        if reason:
            rejected[lid] = {"date": today, "reason": reason}
            stats["rejected"] += 1
            continue
        if lid not in by_id or not by_id[lid].get("seller", {}).get("phones"):
            item["seller"]["phones"] = k.phones(aid)
        by_id[lid] = apply_snapshot(by_id.get(lid), item, today)
        stats["new"] += 1

    # 3. Активные, которых нет в выдаче: проверяем, не сняты ли
    for lid, listing in by_id.items():
        if not listing["active"] or listing["lastSeen"] == today or listing["source"] != "krisha":
            continue
        try:
            item = k.advert(lid.split(":", 1)[1])
            update_price(listing, item.get("price"), today)
        except Gone:
            listing["active"] = False
            stats["gone"] += 1
        except Exception as e:  # noqa: BLE001
            log.warning("recheck %s: %s", lid, e)

    store["listings"] = sorted(by_id.values(), key=lambda l: l["firstSeen"], reverse=True)
    store["updatedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    DATA.write_text(json.dumps(store, ensure_ascii=False, indent=1))
    SEEN.write_text(json.dumps(rejected, ensure_ascii=False, indent=0, sort_keys=True))
    log.info("done: %d found, %s, total %d", len(found), stats, len(by_id))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    run(probe=args.probe)
