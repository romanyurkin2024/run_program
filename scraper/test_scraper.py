import unittest

from scraper.run import apply_snapshot, reject_reason, update_price
from scraper.sources.krisha import extract_js_object, parse_advert, parse_phones, parse_search

CFG = {
    "rooms": 3,
    "minYear": 2012,
    "bbox": {"latMin": 43.19, "latMax": 43.23, "lonMin": 76.86, "lonMax": 76.92},
    "excludeConditions": ["черновая отделка", "требует ремонта"],
}

SEARCH_HTML = """
<div class="a-card" data-id="111"><a class="a-card__title" href="/a/show/111">3-комнатная</a>
  <div class="a-card__price">95 000 000 〒</div></div>
<div class="a-card" data-id="222"><a href="/a/show/222">x</a><div class="a-card__price">88&nbsp;500&nbsp;000 〒</div></div>
<a href="/a/show/333">без карточки</a>
"""

ADVERT_HTML = """
<html><body>
<div class="offer__advert-title"><h1>3-комнатная квартира · 98.5 м² · 7/16 этаж, Розыбакиева 197/2</h1></div>
<div class="offer__price">95 000 000 〒</div>
<div class="offer__info-item" data-name="map.complex"><div class="offer__advert-short-info">Estet</div></div>
<div class="offer__info-item" data-name="house.year"><div class="offer__advert-short-info">2019</div></div>
<div class="offer__info-item" data-name="flat.floor"><div class="offer__advert-short-info">7 из 16</div></div>
<div class="offer__info-item" data-name="live.square"><div class="offer__advert-short-info">98.5 м², кухня — 14 м²</div></div>
<div class="offer__info-item" data-name="flat.renovation"><div class="offer__advert-short-info">хорошее</div></div>
<div class="owners__label">Хозяин недвижимости</div><div class="owners__name">Айгуль</div>
<div class="js-description">Отличная квартира</div>
<script>window.data = {"advert": {"id": 555, "price": 95000000, "photos": [{"src": "//photos.krisha.kz/1.jpg"}],
 "map": {"lat": 43.207, "lon": 76.893}, "addressTitle": "Розыбакиева 197/2"}};</script>
</body></html>
"""


class ParseTest(unittest.TestCase):
    def test_search(self):
        self.assertEqual(parse_search(SEARCH_HTML), {"111": 95_000_000, "222": 88_500_000, "333": None})

    def test_js_object(self):
        self.assertEqual(extract_js_object('x; window.data = {"a": {"b": [1, "}"]}};', "window.data"), {"a": {"b": [1, "}"]}})
        self.assertIsNone(extract_js_object("nothing", "window.data"))

    def test_advert(self):
        a = parse_advert(ADVERT_HTML, "555")
        self.assertEqual(a["price"], 95_000_000)
        self.assertEqual(a["complex"], "Estet")
        self.assertEqual(a["year"], 2019)
        self.assertEqual((a["floor"], a["floors"]), (7, 16))
        self.assertEqual((a["area"], a["kitchenArea"]), (98.5, 14.0))
        self.assertEqual(a["rooms"], 3)
        self.assertEqual(a["photos"], ["https://photos.krisha.kz/1.jpg"])
        self.assertEqual(a["seller"], {"name": "Айгуль", "type": "owner"})
        self.assertEqual((a["lat"], a["lon"]), (43.207, 76.893))
        self.assertIsNone(reject_reason(a, CFG))

    def test_phones(self):
        self.assertEqual(parse_phones({"phones": ["+7 701 111 22 33"]}), ["+7 701 111 22 33"])
        self.assertEqual(parse_phones({"phones": "+7 701 111 22 33, +7 702 000 00 00"}), ["+7 701 111 22 33", "+7 702 000 00 00"])
        self.assertEqual(parse_phones({}), [])


class FilterTest(unittest.TestCase):
    def base(self, **kw):
        return {"lat": 43.2, "lon": 76.9, "rooms": 3, "year": 2019, "condition": "евроремонт", "price": 1, **kw}

    def test_rejects(self):
        self.assertEqual(reject_reason(self.base(lat=43.3), CFG), "вне района")
        self.assertEqual(reject_reason(self.base(year=1975), CFG), "старый дом")
        self.assertEqual(reject_reason(self.base(condition="Черновая отделка"), CFG), "без ремонта")
        self.assertEqual(reject_reason(self.base(rooms=2), CFG), "не 3 комнаты")
        self.assertIsNone(reject_reason(self.base(), CFG))


class MergeTest(unittest.TestCase):
    def test_history_appends_only_on_change(self):
        item = {"id": "krisha:1", "source": "krisha", "seller": {"phones": ["1"]}, "price": 100, "photos": []}
        l = apply_snapshot(None, dict(item), "2026-10-01")
        update_price(l, 100, "2026-10-02")
        update_price(l, 95, "2026-10-03")
        self.assertEqual(l["history"], [{"date": "2026-10-01", "price": 100}, {"date": "2026-10-03", "price": 95}])
        self.assertEqual((l["firstSeen"], l["lastSeen"]), ("2026-10-01", "2026-10-03"))

    def test_resnapshot_keeps_phones(self):
        l = apply_snapshot(None, {"id": "krisha:1", "seller": {"phones": ["1"]}, "price": 100}, "2026-10-01")
        l = apply_snapshot(l, {"id": "krisha:1", "seller": {"name": "A", "phones": []}, "price": 90}, "2026-10-05")
        self.assertEqual(l["seller"]["phones"], ["1"])
        self.assertEqual(len(l["history"]), 2)


if __name__ == "__main__":
    unittest.main()
