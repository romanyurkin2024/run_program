import unittest
from pathlib import Path

from scraper import notify
from scraper.run import apply_snapshot, group_key, is_near, mark_gone, reject_reason
from scraper.sources.krisha import parse_preview, parse_search, parse_title, seller_type

CFG = {
    "rooms": 3,
    "minYear": 2012,
    "excludeConditions": ["черновая отделка", "требует ремонта"],
    "near": {"complexes": ["Estet", "Element"], "streets": [{"name": "Розыбакиева", "from": 150, "to": 300}]},
}

# Настоящие карточки из выдачи krisha.kz (сохранены пробным запуском)
FIXTURE = (Path(__file__).parent / "fixtures" / "krisha_search.html").read_text()


class ParseTest(unittest.TestCase):
    def test_real_search_page(self):
        cards = {c["id"]: c for c in parse_search(FIXTURE)}
        self.assertEqual(len(cards), 5)
        c = cards["krisha:1016211872"]
        self.assertEqual(c["price"], 90_000_000)
        self.assertEqual((c["rooms"], c["area"], c["floor"], c["floors"]), (3, 94.5, 1, 16))
        self.assertEqual((c["complex"], c["year"], c["buildingType"]), ("Riviera", 2019, "монолитный"))
        self.assertEqual(c["condition"], "не новый, но аккуратный ремонт")
        self.assertEqual(c["district"], "Бостандыкский")
        self.assertTrue(c["address"].startswith("Сатпаева"))
        self.assertTrue(c["photos"][0].startswith("https://krisha-photos.kcdn.online/"))
        self.assertEqual(c["seller"]["type"], "agent")
        self.assertTrue(c["description"].startswith("🏡 Продаётся"))
        self.assertEqual(cards["krisha:1016900411"]["seller"]["type"], "owner")
        self.assertEqual(cards["krisha:1005293694"]["seller"]["type"], "developer")

    def test_title(self):
        self.assertEqual(parse_title("3-комнатная квартира · 111.2 м²"), {"rooms": 3, "area": 111.2})

    def test_preview(self):
        p = parse_preview("жил. комплекс 4YOU, монолитный дом, 2022 г.п., состояние: свежий ремонт, потолки 3м., "
                          "санузел 2 с/у и более, меблирована полностью, Срочно продаю, торг")
        self.assertEqual(p["complex"], "4YOU")
        self.assertEqual(p["condition"], "свежий ремонт")
        self.assertEqual(p["bathroom"], "2 с/у и более")
        self.assertEqual(p["description"], "Срочно продаю, торг")

    def test_seller_type(self):
        self.assertEqual(seller_type("Хозяин недвижимости"), "owner")
        self.assertEqual(seller_type("Крыша Агент"), "agent")
        self.assertIsNone(seller_type(""))


class FilterTest(unittest.TestCase):
    def base(self, **kw):
        return {"rooms": 3, "year": 2019, "condition": "свежий ремонт", "price": 1, "seller": {"type": "owner"}, **kw}

    def test_rejects(self):
        self.assertEqual(reject_reason(self.base(year=1975), CFG), "старый дом")
        self.assertEqual(reject_reason(self.base(condition="черновая отделка"), CFG), "без ремонта")
        self.assertEqual(reject_reason(self.base(rooms=4), CFG), "не 3 комнаты")
        self.assertEqual(reject_reason(self.base(seller={"type": "developer"}), CFG), "новостройка от застройщика")
        self.assertIsNone(reject_reason(self.base(), CFG))

    def test_near(self):
        self.assertTrue(is_near({"complex": "Estet", "address": "x"}, CFG))
        self.assertTrue(is_near({"complex": "ELEMENT", "address": "Тажибаевой 157"}, CFG))
        self.assertTrue(is_near({"address": "Розыбакиева 247 — MEGA"}, CFG))
        self.assertFalse(is_near({"address": "ул. Абдуллы Розыбакиева 388Б1"}, CFG))
        self.assertFalse(is_near({"complex": "Estet Plus", "address": "Жарокова 137"}, CFG))
        self.assertFalse(is_near({"address": "Розыбакиева"}, CFG))


class MergeTest(unittest.TestCase):
    def test_history_appends_only_on_change(self):
        item = {"id": "krisha:1", "source": "krisha", "seller": {}, "price": 100, "photos": []}
        l = apply_snapshot(None, item, "2026-10-01")
        l = apply_snapshot(l, item, "2026-10-02")
        l = apply_snapshot(l, {**item, "price": 95}, "2026-10-03")
        self.assertEqual(l["history"], [{"date": "2026-10-01", "price": 100}, {"date": "2026-10-03", "price": 95}])
        self.assertEqual((l["firstSeen"], l["lastSeen"]), ("2026-10-01", "2026-10-03"))
        self.assertEqual(item["price"], 100)  # входной словарь не меняется

    def test_resnapshot_keeps_phones(self):
        l = apply_snapshot(None, {"id": "krisha:1", "seller": {"phones": ["1"]}, "price": 100}, "2026-10-01")
        l = apply_snapshot(l, {"id": "krisha:1", "seller": {"type": "owner"}, "price": 90}, "2026-10-05")
        self.assertEqual(l["seller"]["phones"], ["1"])

    def test_mark_gone(self):
        ls = {"a": {"active": True, "lastSeen": "2026-10-01"}, "b": {"active": True, "lastSeen": "2026-10-05"}}
        self.assertEqual(mark_gone(ls, "2026-10-05"), 1)
        self.assertFalse(ls["a"]["active"])
        self.assertTrue(ls["b"]["active"])


class GroupTest(unittest.TestCase):
    def test_same_flat_from_different_agents(self):
        a = {"id": "krisha:1", "complex": "4YOU", "area": 101.2, "floor": 3, "floors": 8}
        b = {"id": "krisha:2", "complex": "4you ", "area": 100.8, "floor": 3, "floors": 8}
        self.assertEqual(group_key(a), group_key(b))
        self.assertNotEqual(group_key(a), group_key({**b, "floor": 4}))

    def test_address_when_no_complex(self):
        a = {"id": "krisha:1", "address": "Розыбакиева 247 — MEGA", "area": 90, "floor": 5, "floors": 12}
        b = {"id": "krisha:2", "address": "Розыбакиева 247", "area": 90, "floor": 5, "floors": 12}
        self.assertEqual(group_key(a), group_key(b))

    def test_no_floor_is_never_grouped(self):
        self.assertEqual(group_key({"id": "krisha:9", "complex": "Estet", "area": 90}), "krisha:9")


def L(i, price, group, near=True, active=True, **kw):
    return {"id": f"krisha:{i}", "url": f"https://krisha.kz/a/show/{i}", "title": "3-комн", "complex": "Estet",
            "area": 90, "floor": 5, "floors": 12, "near": near, "active": active, "group": group,
            "seller": {}, "history": [{"date": "2026-10-27", "price": price}], **kw}


class ReportTest(unittest.TestCase):
    CFG = {"alerts": {"maxPrice": 92_500_000}, "siteUrl": "https://x/"}

    def test_first_run_has_no_flood(self):
        text = notify.build_report({}, {"listings": [L(1, 80e6, "a")]}, self.CFG, "2026-10-27")
        self.assertIn("Начали отслеживать", text)
        self.assertNotIn("Новые", text)

    def test_new_drop_gone(self):
        before = notify.snapshot([L(1, 95e6, "a"), L(2, 80e6, "b"), L(3, 85e6, "c")])
        after = [
            L(1, 90e6, "a"),               # снизили и попали в бюджет
            L(2, 80e6, "b", active=False),  # сняли
            L(3, 85e6, "c"),
            L(4, 85e6, "c"),               # дубль известной квартиры — не новая
            L(5, 70e6, "d"),               # новая в бюджете
            L(6, 70e6, "e", near=False),   # далеко — не интересует
            L(7, 120e6, "f"),              # новая, но дорого
        ]
        text = notify.build_report(before, {"listings": after}, self.CFG, "2026-10-27")
        self.assertIn("Новые в бюджете (1)", text)
        self.assertIn("show/5", text)
        self.assertIn("Снизили цену (1)", text)
        self.assertIn("теперь в бюджете", text)
        self.assertIn("Сняли с продажи (1)", text)
        self.assertIn("show/2", text)
        self.assertNotIn("show/6", text)
        self.assertNotIn("show/7", text)

    def test_chunks(self):
        parts = notify.chunks("\n".join(["x" * 100] * 100), limit=1000)
        self.assertTrue(all(len(p) <= 1000 for p in parts))
        self.assertEqual("\n".join(parts).count("x"), 100 * 100)


if __name__ == "__main__":
    unittest.main()
