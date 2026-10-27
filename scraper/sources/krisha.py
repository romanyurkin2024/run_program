"""Парсер krisha.kz по страницам поиска.

Страницы отдельных объявлений закрыты анти-бот проверкой (слайдер), поэтому
всё берём из выдачи поиска: цена, площадь, этаж, ЖК, год, состояние, продавец, фото.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
import random
import re
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup, Tag

log = logging.getLogger(__name__)

BASE = "https://krisha.kz"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0 Safari/537.36",
    "Accept-Language": "ru-RU,ru;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


class Blocked(Exception):
    """Сайт показал анти-бот проверку вместо страницы."""


class Krisha:
    def __init__(self, debug_dir: Path | None = None, delay: tuple[float, float] = (2.0, 4.0)):
        self.s = requests.Session()
        self.s.headers.update(HEADERS)
        self.debug_dir = debug_dir
        self.delay = delay

    def search(self, url: str, cfg: dict, page: int) -> list[dict]:
        params = {
            "das[live.rooms]": cfg["rooms"],
            "das[house.year][from]": cfg["minYear"],
            "das[price][from]": cfg["minPrice"],
            "das[price][to]": cfg["maxPrice"],
            "das[live.square][from]": cfg["minArea"],
        }
        if page > 1:
            params["page"] = page
        time.sleep(random.uniform(*self.delay))
        r = self.s.get(url, params=params, timeout=30)
        log.info("GET %s → %s (%d bytes)", r.url, r.status_code, len(r.content))
        if self.debug_dir:
            (self.debug_dir / f"search-{page}.html").write_bytes(r.content)
        if r.status_code == 468 or "/.safeline/" in r.text[:3000]:
            raise Blocked(r.url)
        r.raise_for_status()
        return parse_search(r.text)


# ---------- parsing (pure functions, testable on saved HTML) ----------

def _text(el: Tag | None) -> str:
    return " ".join(el.get_text(" ", strip=True).split()) if el else ""


def _int(text: str) -> int | None:
    d = re.sub(r"\D", "", text)
    return int(d) if d else None


def parse_title(title: str) -> dict:
    """«3-комнатная квартира · 94.5 м² · 1/16 этаж» → rooms, area, floor, floors."""
    out: dict = {}
    if m := re.search(r"(\d+)-комн", title):
        out["rooms"] = int(m.group(1))
    if m := re.search(r"(\d+(?:[.,]\d+)?)\s*м²", title):
        out["area"] = float(m.group(1).replace(",", "."))
    if m := re.search(r"(\d+)\s*/\s*(\d+)\s*этаж", title):
        out["floor"], out["floors"] = int(m.group(1)), int(m.group(2))
    return out


_PARAM_RE = re.compile(
    r"^(жил\. комплекс|\w+ дом$|\d{4} г\.п\.|состояние:|но |потолки|санузел|телефон|интернет|меблирован|"
    r"балкон|\d+ этаж|парковка|дверь|окна|пол |охрана|кухня|бывшее общежитие|приватизирован|в залоге)"
)


def parse_preview(text: str) -> dict:
    """«жил. комплекс Riviera, монолитный дом, 2019 г.п., состояние: свежий ремонт, …, санузел …, <описание>»."""
    out: dict = {}
    if m := re.search(r"жил\. комплекс ([^,]+),", text):
        out["complex"] = m.group(1).strip()
    if m := re.search(r"(\w+) дом,", text):
        out["buildingType"] = m.group(1)
    if m := re.search(r"(\d{4}) г\.п\.", text):
        out["year"] = int(m.group(1))
    if m := re.search(r"состояние: ([^,]+(?:, но [^,]+)?),", text):
        out["condition"] = m.group(1).strip()
    if m := re.search(r"санузел ([^,]+),", text):
        out["bathroom"] = m.group(1).strip()
    # Описание продавца идёт после перечня параметров
    parts = [p.strip() for p in text.split(",")]
    i = 0
    while i < len(parts) and _PARAM_RE.match(parts[i]):
        i += 1
    desc = ", ".join(parts[i:]).strip()
    if desc:
        out["description"] = desc
    return out


def seller_type(label: str) -> str | None:
    low = label.lower()
    if "хозяин" in low or "собственник" in low:
        return "owner"
    if "застройщик" in low or "новостройка" in low:
        return "developer"
    if "агент" in low or "специалист" in low or "агентство" in low:
        return "agent"
    return None


_MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]


def parse_card_date(text: str, today: date | None = None) -> str | None:
    """«26 окт.» из карточки → ISO-дата. Года на карточке нет: если дата позже сегодняшней — это прошлый год.

    Это дата последнего обновления/поднятия, а не публикации: 27.10 у 150 объявлений, которые мы видели
    уже 26.10, стояла дата 27.10. Дату публикации выдача не показывает.
    """
    today = today or date.today()
    t = text.strip().lower()
    if t.startswith("сегодня"):
        return today.isoformat()
    if t.startswith("вчера"):
        return (today - timedelta(days=1)).isoformat()
    m = re.fullmatch(r"(\d{1,2})\s+([а-я]{3})[а-я]*\.?(?:\s+(\d{4}))?", t)
    if not m or m.group(2) not in _MONTHS:
        return None
    month, day = _MONTHS.index(m.group(2)) + 1, int(m.group(1))
    year = int(m.group(3)) if m.group(3) else today.year
    try:
        d = date(year, month, day)
    except ValueError:
        return None
    if not m.group(3) and d > today:
        d = date(year - 1, month, day)
    return d.isoformat()


def parse_card(card: Tag) -> dict | None:
    aid = card.get("data-id")
    title_el = card.select_one(".a-card__title")
    if not aid or not title_el:
        return None
    title = _text(title_el)
    subtitle = _text(card.select_one(".a-card__subtitle"))
    district, _, address = subtitle.partition(", ")
    if "р-н" not in district:
        district, address = "", subtitle
    owner_label = _text(card.select_one(".a-card__owner"))
    photo = None
    if pic := card.select_one("picture[data-full-src]"):
        photo = pic["data-full-src"]
    elif img := card.select_one("img.a-image__img"):
        photo = img.get("src")
    nb = card.select_one("a.a-card__image[data-nb]")
    posted = next((d for el in card.select(".a-card__stats-item") if (d := parse_card_date(_text(el)))), None)
    item = {
        "id": f"krisha:{aid}",
        "source": "krisha",
        "url": f"{BASE}/a/show/{aid}",
        "title": title,
        "address": address,
        "district": district.replace(" р-н", "") or None,
        "photos": [photo] if photo else [],
        "photoCount": _int(nb["data-nb"]) if nb else None,  # сколько фото в объявлении на сайте
        "seller": {
            "type": seller_type(owner_label),
            # «Крыша Агент» / «Хозяин недвижимости» — это метки, а не имена; имя есть только у застройщика
            "name": owner_label if seller_type(owner_label) == "developer" else None,
            # «Новостройка ЖК «Estet» от застройщика «BAZIS–А»» → «BAZIS–А»: по нему подбираются партнёрские ипотеки
            "developer": (m.group(1) if (m := re.search(r"застройщика\s*«([^»]+)»", owner_label)) else None),
        },
        "price": _int(_text(card.select_one(".a-card__price"))),
        "posted": posted,  # дата последнего обновления на Krisha (не публикации)
        **parse_title(title),
        **parse_preview(_text(card.select_one(".a-card__text-preview"))),
    }
    return item


def parse_search(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    return [c for c in (parse_card(el) for el in soup.select("div.a-card[data-id]")) if c]
