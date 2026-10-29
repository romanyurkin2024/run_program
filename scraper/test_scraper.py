import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scraper import notify, run as run_mod
from scraper.run import apply_snapshot, classify_finish, group_key, is_near, mark_gone, reject_reason
from scraper.sources.krisha import parse_preview, parse_search, parse_title, seller_type

CFG = {
    "rooms": 3,
    "minYear": 2012,
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
        self.assertEqual(c["photoCount"], 25)
        self.assertEqual(cards["krisha:1006779744"]["photoCount"], 45)
        self.assertTrue(c["description"].startswith("🏡 Продаётся"))
        self.assertEqual(cards["krisha:1016900411"]["seller"]["type"], "owner")
        self.assertEqual(cards["krisha:1005293694"]["seller"]["type"], "developer")
        self.assertEqual(cards["krisha:1005293694"]["seller"]["developer"], "ТОО ADS Capital")

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
        self.assertIsNone(reject_reason(self.base(condition="черновая отделка"), CFG))  # черновые оставляем, фильтр — на сайте
        self.assertEqual(reject_reason(self.base(rooms=4), CFG), "не 3 комнаты")
        self.assertIsNone(reject_reason(self.base(seller={"type": "developer"}), CFG))  # сданный дом от застройщика оставляем
        self.assertEqual(reject_reason(self.base(seller={"type": "developer"}, year=2099), CFG), "ещё строится")
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

    def test_all_changes_regardless_of_budget(self):
        before = notify.snapshot([L(1, 95e6, "a"), L(2, 80e6, "b"), L(3, 85e6, "c"), L(8, 130e6, "g"), L(9, 100e6, "h")])
        after = [
            L(1, 90e6, "a"),               # снизили и попали в бюджет
            L(2, 80e6, "b", active=False),  # сняли
            L(3, 85e6, "c"),
            L(4, 85e6, "c"),               # дубль известной квартиры — не новая
            L(5, 70e6, "d"),               # новая в бюджете
            L(6, 70e6, "e", near=False),   # новая в остальном районе — тоже показываем, отдельным разделом
            L(7, 120e6, "f"),              # новая и дорогая — тоже показываем
            L(8, 125e6, "g"),              # снизили, но всё ещё дороже бюджета — показываем
            L(9, 105e6, "h"),              # подняли
        ]
        text = notify.build_report(before, {"listings": after}, self.CFG, "2026-10-27")
        mega, rest = text.split("ОСТАЛЬНОЙ РАЙОН")
        self.assertIn("🆕 Новое · 2", mega)
        self.assertIn("show/5", mega)
        self.assertIn("show/7", mega)
        self.assertIn("📉 Подешевели · 2", mega)
        self.assertIn("теперь в бюджете", mega)
        self.assertIn("show/8", mega)
        self.assertIn("📈 Подорожали · 1", mega)
        self.assertIn("🚫 Сняты · 1", mega)
        self.assertIn("show/2", mega)
        self.assertIn("🆕 1", rest)
        self.assertIn("show/6", rest)  # новая в бюджете по району — показываем
        self.assertNotIn("show/6", mega)
        self.assertIn("✅", text)
        self.assertIn("\n\n<b>📉 Подешевели", text)  # между блоками — пустая строка

    def test_line_is_two_short_lines(self):
        cfg = {"alerts": {"maxPrice": 77e6, "downPayment": 43e6, "rate": 20.5, "years": 20, "otbasyRate": 8.5}}
        line = notify._line(L(1, 118.8e6, "a", finish="rough", finishSource="description"), cfg)
        head, details = line.split("\n")
        self.assertIn("show/1", head)
        self.assertIn("черновая*", details)
        self.assertTrue(details.strip().startswith("⚠️"))
        self.assertIn("\n   🔵 ", notify._line(L(2, 83e6, "b"), cfg))  # дороже рынка, но проходит через Отбасы

    def test_long_lists_are_cut(self):
        before = notify.snapshot([L(100, 1e8, "z")])
        after = [L(100, 1e8, "z")] + [L(i, 70e6 + i, f"n{i}") for i in range(1, 13)]
        text = notify.build_report(before, {"listings": after}, self.CFG, "2026-10-27")
        self.assertIn("…и ещё 4 — на сайте", text)

    def test_monthly_payment(self):
        cfg = {"alerts": {"downPayment": 45e6, "rate": 20.5, "years": 20}}
        self.assertAlmostEqual(notify.monthly_payment(87.5e6, cfg), 739_000, delta=1500)
        self.assertEqual(notify.monthly_payment(40e6, cfg), 0)
        cfg["alerts"]["otbasyRate"] = 8.5
        self.assertAlmostEqual(notify.otbasy_payment(83e6, cfg), 330_000, delta=1500)
        self.assertIsNone(notify.otbasy_payment(95e6, cfg))  # взнос меньше 50%

    def test_send_falls_back_to_plain_text_on_bad_html(self):
        bad = mock.Mock(ok=False, status_code=400, text="Bad Request: can't parse entities")
        good = mock.Mock(ok=True, status_code=200, text="{}")
        with mock.patch.object(notify.requests, "post", side_effect=[bad, good]) as post:
            notify.send("a < b", "t", "1")
        self.assertEqual(post.call_count, 2)
        self.assertNotIn("parse_mode", post.call_args.kwargs["json"])

    def test_chunks(self):
        parts = notify.chunks("\n".join(["x" * 100] * 100), limit=1000)
        self.assertTrue(all(len(p) <= 1000 for p in parts))
        self.assertEqual("\n".join(parts).count("x"), 100 * 100)


class RunTest(unittest.TestCase):
    """Полный запуск на сохранённой выдаче: данные пишутся, отчёт получает снимок «до»."""

    def test_run_passes_previous_state_to_report(self):
        cards = parse_search(FIXTURE)
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp) / "listings.json"
            data.write_text(json.dumps({"updatedAt": None, "listings": []}))
            calls = []
            with mock.patch.object(run_mod, "DATA", data), \
                 mock.patch.object(run_mod.Krisha, "search", side_effect=lambda url, cfg, page: cards if page == 1 else []), \
                 mock.patch.object(run_mod.notify, "daily_report", side_effect=lambda *a: calls.append(a)):
                run_mod.run()
                run_mod.run()  # второй день: «до» уже не пустое
            store = json.loads(data.read_text())
            self.assertEqual(len(store["listings"]), 4)  # 4-комнатная от застройщика отброшена, 3-комнатная оставлена
            first, second = calls
            self.assertEqual(first[0], {})
            self.assertTrue(all(isinstance(v, dict) and "price" in v for v in second[0].values()))
            notify.build_report(second[0], second[1], second[2], second[3])  # не падает


class FinishTest(unittest.TestCase):
    def test_from_krisha_condition(self):
        self.assertEqual(classify_finish({"condition": "свежий ремонт"}), ("repair", "krisha"))
        self.assertEqual(classify_finish({"condition": "не новый, но аккуратный ремонт"}), ("repair", "krisha"))
        self.assertEqual(classify_finish({"condition": "требует ремонта"}), ("needs_repair", "krisha"))
        self.assertEqual(classify_finish({"condition": "черновая отделка"}), ("rough", "krisha"))
        self.assertEqual(classify_finish({"condition": "предчистовая отделка"}), ("prefinish", "krisha"))
        self.assertEqual(classify_finish({"condition": "чистовая отделка"}), ("clean", "krisha"))

    def test_from_description_when_no_condition(self):
        self.assertEqual(classify_finish({"description": "Продаётся квартира в черновой отделке"}), ("rough", "description"))
        self.assertEqual(classify_finish({"description": "Сдана с чистовой отделкой"}), ("clean", "description"))
        self.assertEqual(classify_finish({"description": "Предчистовая отделка, вид на горы"}), ("prefinish", "description"))
        # «ремонт» в описании не считаем — слишком многозначно
        self.assertEqual(classify_finish({"description": "можно сделать ремонт под себя"}), (None, None))
        self.assertEqual(classify_finish({}), (None, None))


class PostedDateTest(unittest.TestCase):
    def test_card_date(self):
        from datetime import date
        from scraper.sources.krisha import parse_card_date
        today = date(2026, 10, 27)
        self.assertEqual(parse_card_date("26 окт.", today), "2026-10-26")
        self.assertEqual(parse_card_date("3 дек.", today), "2025-12-03")  # года нет — значит прошлый
        self.assertEqual(parse_card_date("сегодня", today), "2026-10-27")
        self.assertEqual(parse_card_date("вчера", today), "2026-10-26")
        self.assertIsNone(parse_card_date("Алматы", today))

    def test_from_fixture_and_first_posted_is_kept(self):
        cards = parse_search(FIXTURE)
        self.assertTrue(all(c["posted"] for c in cards))
        l = run_mod.apply_snapshot(None, {**cards[0], "posted": "2026-10-20"}, "2026-10-26")
        l = run_mod.apply_snapshot(l, {**cards[0], "posted": "2026-10-27"}, "2026-10-27")
        self.assertEqual((l["posted"], l["postedFirst"]), ("2026-10-27", "2026-10-20"))


class PublishedTest(unittest.TestCase):
    def test_new_id_is_exact_old_ids_get_upper_bound(self):
        def L(n, seen, posted):
            return {"id": f"krisha:{n}", "firstSeen": seen, "posted": posted}
        ls = {l["id"]: l for l in [
            L(100, "2026-10-26", "2026-10-27"),  # старое, подняли сегодня
            L(200, "2026-10-26", "2026-10-21"),
            L(300, "2026-10-26", "2026-10-23"),
            L(400, "2026-10-27", "2026-10-27"),  # новый номер — вышло после прошлого сбора
            L(150, "2026-10-27", "2026-10-26"),  # впервые увидели, но номер старый
        ]}
        run_mod.estimate_published(ls, "2026-10-27")
        self.assertEqual((ls["krisha:400"]["published"], ls["krisha:400"]["publishedExact"]), ("2026-10-27", True))
        self.assertEqual((ls["krisha:100"]["published"], ls["krisha:100"]["publishedExact"]), ("2026-10-21", False))
        self.assertEqual(ls["krisha:150"]["published"], "2026-10-21")
        self.assertEqual(ls["krisha:300"]["published"], "2026-10-23")
        self.assertTrue(ls["krisha:100"]["publishedOpen"])  # 21.10 — самая старая дата в выдаче
        self.assertFalse(ls["krisha:300"]["publishedOpen"])
        # оценка только уточняется: завтра граница не «съезжает» на более позднюю дату
        ls["krisha:200"]["posted"] = "2026-10-28"
        run_mod.estimate_published(ls, "2026-10-28")
        self.assertEqual(ls["krisha:100"]["published"], "2026-10-21")


class StaleTest(unittest.TestCase):
    def test_already_collected_today(self):
        from scraper.run import already_collected_today
        self.assertTrue(already_collected_today({"updatedAt": "2026-10-27T01:20:00+00:00"}, "2026-10-27"))
        self.assertFalse(already_collected_today({"updatedAt": "2026-10-26T17:00:56+00:00"}, "2026-10-27"))
        self.assertFalse(already_collected_today({"updatedAt": None}, "2026-10-27"))


if __name__ == "__main__":
    unittest.main()
