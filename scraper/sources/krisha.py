"""Парсер krisha.kz: страницы поиска → id объявлений → карточка объявления."""
from __future__ import annotations

import json
import logging
import random
import re
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

log = logging.getLogger(__name__)

BASE = "https://krisha.kz"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0 Safari/537.36",
    "Accept-Language": "ru-RU,ru;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


class Gone(Exception):
    """Объявление удалено или снято с публикации."""


class Krisha:
    def __init__(self, debug_dir: Path | None = None, delay: tuple[float, float] = (1.5, 3.5)):
        self.s = requests.Session()
        self.s.headers.update(HEADERS)
        self.debug_dir = debug_dir
        self.delay = delay

    def _get(self, url: str, **kw) -> requests.Response:
        time.sleep(random.uniform(*self.delay))
        r = self.s.get(url, timeout=30, **kw)
        log.info("GET %s → %s (%d bytes)", r.url, r.status_code, len(r.content))
        if self.debug_dir:
            name = re.sub(r"[^\w.-]+", "_", r.url.split("://", 1)[-1])[:150]
            (self.debug_dir / f"{name}.html").write_bytes(r.content)
        return r

    # ---------- search ----------

    def search(self, url: str, cfg: dict, page: int) -> dict[str, int | None]:
        """Возвращает {id: цена или None} со страницы поиска."""
        params = {
            "das[live.rooms]": cfg["rooms"],
            "das[house.year][from]": cfg["minYear"],
            "das[price][to]": cfg["maxPrice"],
            "das[live.square][from]": cfg["minArea"],
        }
        if page > 1:
            params["page"] = page
        r = self._get(url, params=params)
        r.raise_for_status()
        return parse_search(r.text)

    # ---------- detail ----------

    def advert(self, advert_id: str) -> dict:
        r = self._get(f"{BASE}/a/show/{advert_id}")
        if r.status_code in (404, 410):
            raise Gone(advert_id)
        r.raise_for_status()
        data = parse_advert(r.text, advert_id)
        if data.get("archived"):
            raise Gone(advert_id)
        return data

    def phones(self, advert_id: str) -> list[str]:
        """Телефон на сайте показывается по кнопке; пробуем тот же запрос, что делает браузер."""
        try:
            r = self._get(
                f"{BASE}/a/ajaxPhones",
                params={"id": advert_id},
                headers={"X-Requested-With": "XMLHttpRequest", "Referer": f"{BASE}/a/show/{advert_id}"},
            )
            if r.ok and r.headers.get("content-type", "").startswith("application/json"):
                return parse_phones(r.json())
        except (requests.RequestException, ValueError) as e:
            log.warning("phones %s: %s", advert_id, e)
        return []


# ---------- parsing (pure functions, testable on saved HTML) ----------

_ID_RE = re.compile(r"/a/show/(\d+)")


def _digits(text: str | None) -> int | None:
    if not text:
        return None
    d = re.sub(r"\D", "", text)
    return int(d) if d else None


def _num(text: str | None) -> float | None:
    if not text:
        return None
    m = re.search(r"\d+(?:[.,]\d+)?", text.replace("\xa0", " "))
    return float(m.group().replace(",", ".")) if m else None


def parse_search(html: str) -> dict[str, int | None]:
    soup = BeautifulSoup(html, "html.parser")
    out: dict[str, int | None] = {}
    for card in soup.select("[data-id]"):
        link = card.find("a", href=_ID_RE)
        if not link:
            continue
        aid = _ID_RE.search(link["href"]).group(1)
        price_el = card.select_one(".a-card__price, [class*=price]")
        out[aid] = _digits(price_el.get_text()) if price_el else None
    for a in soup.find_all("a", href=_ID_RE):  # запасной путь, если вёрстка карточек поменялась
        out.setdefault(_ID_RE.search(a["href"]).group(1), None)
    return out


def extract_js_object(html: str, marker: str) -> dict | None:
    i = html.find(marker)
    if i < 0:
        return None
    start = html.find("{", i)
    try:
        obj, _ = json.JSONDecoder().raw_decode(html[start:])
        return obj
    except ValueError:
        return None


def _dig(d: dict | None, *paths: str):
    for path in paths:
        cur = d
        for key in path.split("."):
            cur = cur.get(key) if isinstance(cur, dict) else None
        if cur not in (None, "", []):
            return cur
    return None


def parse_advert(html: str, advert_id: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    js = extract_js_object(html, "window.data") or {}
    adv = js.get("advert") if isinstance(js.get("advert"), dict) else {}

    # Параметры «Город / Тип дома / ЖК / Год постройки / Площадь / Состояние …»
    params: dict[str, str] = {}
    for item in soup.select("[data-name]"):
        key = item.get("data-name")
        val = item.select_one(".offer__advert-short-info, dd")
        if key and val:
            params[key] = " ".join(val.get_text(" ", strip=True).split())
    for dl in soup.select(".offer__parameters dl"):
        dt, dd = dl.find("dt"), dl.find("dd")
        if dt and dd:
            params.setdefault(dt.get("data-name") or dt.get_text(strip=True), dd.get_text(" ", strip=True))

    title_el = soup.select_one(".offer__advert-title h1, h1")
    title = _dig(adv, "title") or (title_el.get_text(" ", strip=True) if title_el else "")
    price = _dig(adv, "price") or _digits((soup.select_one(".offer__price") or soup.new_tag("x")).get_text())

    photos: list[str] = []
    for p in _dig(adv, "photos") or []:
        src = p.get("src") or p.get("url") if isinstance(p, dict) else p
        if isinstance(src, str):
            photos.append(src)
    if not photos:
        for el in soup.select("[data-photo-url]"):
            photos.append(el["data-photo-url"])
    if not photos:
        for img in soup.select(".gallery img, .offer__gallery img"):
            src = img.get("src") or img.get("data-src")
            if src:
                photos.append(src)
    photos = [("https:" + p if p.startswith("//") else p) for p in dict.fromkeys(photos)]

    floor_text = params.get("flat.floor") or params.get("Этаж") or ""
    fm = re.search(r"(\d+)\s*из\s*(\d+)", floor_text)
    floor = int(fm.group(1)) if fm else _dig(adv, "floor")
    floors = int(fm.group(2)) if fm else _dig(adv, "floors", "maxFloor")

    square_text = params.get("live.square") or params.get("Площадь, м²") or ""
    sm = re.findall(r"\d+(?:[.,]\d+)?", square_text)
    area = float(sm[0].replace(",", ".")) if sm else _num(str(_dig(adv, "square") or ""))
    kitchen = None
    km = re.search(r"кухн\w*\s*[—-]?\s*(\d+(?:[.,]\d+)?)", square_text)
    if km:
        kitchen = float(km.group(1).replace(",", "."))

    year = _digits(params.get("house.year") or params.get("Год постройки"))
    complex_name = params.get("map.complex") or params.get("Жилой комплекс") or _dig(adv, "complex.name")
    address = _dig(adv, "addressTitle", "address.full") or params.get("map.street")
    city = params.get("map.city") or params.get("Город")
    if not address:
        sub = soup.select_one(".offer__location, .offer__advert-title .offer__location")
        address = sub.get_text(" ", strip=True) if sub else None
    elif city and city not in address:
        address = f"{city}, {address}"

    owner = soup.select_one(".owners__name, .owners__name-text")
    owner_label = soup.select_one(".owners__label")
    seller_type = None
    label = (owner_label.get_text(" ", strip=True).lower() if owner_label else "") + " " + str(_dig(adv, "userType", "ownerType") or "").lower()
    if "хозяин" in label or "собствен" in label or "owner" in label:
        seller_type = "owner"
    elif "агент" in label or "специалист" in label or "agent" in label:
        seller_type = "agent"
    elif "застрой" in label or "builder" in label:
        seller_type = "developer"

    rooms_m = re.search(r"(\d+)-комн", title or "")
    desc_el = soup.select_one(".js-description, .offer__description .text, .a-text")
    archived = bool(soup.select_one(".offer__archive, .a-archived, .archive-badge")) or "Объявление в архиве" in html

    return {
        "id": f"krisha:{advert_id}",
        "source": "krisha",
        "url": f"{BASE}/a/show/{advert_id}",
        "title": title,
        "complex": complex_name,
        "address": address,
        "district": params.get("map.district"),
        "lat": _dig(adv, "map.lat", "lat"),
        "lon": _dig(adv, "map.lon", "lon"),
        "rooms": _dig(adv, "rooms") or (int(rooms_m.group(1)) if rooms_m else None),
        "area": area,
        "kitchenArea": kitchen,
        "floor": floor,
        "floors": floors,
        "year": year,
        "condition": params.get("flat.renovation") or params.get("Состояние квартиры"),
        "buildingType": params.get("house.building") or params.get("Тип дома"),
        "bathroom": params.get("flat.toilet") or params.get("Санузел"),
        "photos": photos,
        "seller": {"name": owner.get_text(" ", strip=True) if owner else _dig(adv, "ownerName"), "type": seller_type},
        "description": desc_el.get_text("\n", strip=True) if desc_el else None,
        "price": int(price) if price else None,
        "archived": archived,
    }


def parse_phones(payload) -> list[str]:
    raw = payload.get("phones") if isinstance(payload, dict) else payload
    if isinstance(raw, str):
        raw = re.split(r"[,;\n]", raw)
    out = []
    for p in raw or []:
        p = p.get("phone") if isinstance(p, dict) else p
        if isinstance(p, str) and re.search(r"\d{3}", p):
            out.append(p.strip())
    return out
