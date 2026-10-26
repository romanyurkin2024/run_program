"""Генерирует вымышленные объявления для превью интерфейса (?demo). Не реальные данные."""
import json, random
from datetime import date, timedelta
from pathlib import Path

random.seed(7)
OUT = Path(__file__).resolve().parent.parent / "public" / "data"
PALETTES = [("#d6c6b0", "#8a7560"), ("#c9d3dc", "#5d6f80"), ("#e3d9cc", "#9b8a73"), ("#cfd8cf", "#62735f"), ("#ddd2d8", "#7f6a76")]

def svg(i, room):
    a, b = PALETTES[i % len(PALETTES)]
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><rect x="80" y="120" width="260" height="300" rx="8" fill="#fff" opacity=".35"/><rect x="420" y="330" width="300" height="140" rx="16" fill="#000" opacity=".12"/><text x="400" y="560" font-family="-apple-system,Helvetica" font-size="34" fill="#fff" text-anchor="middle" opacity=".85">ДЕМО · {room}</text></svg>"""

rooms = ["гостиная", "кухня", "спальня", "детская", "санузел"]
complexes = [("Estet", "Розыбакиева 197/2", 2019), ("Element", "Розыбакиева 247", 2021), ("Terra", "Гагарина 233", 2017),
             ("Mega Towers", "Розыбакиева 220", 2020), ("Alma City", "Аль-Фараби 98", 2018)]
conds = ["евроремонт", "хорошее", "дизайнерский ремонт"]
today = date(2026, 10, 26)
listings = []
for i in range(12):
    cx, addr, year = complexes[i % len(complexes)]
    area = round(random.uniform(82, 118), 1)
    ppm2 = random.uniform(880_000, 1_120_000)
    start = round(area * ppm2 / 100_000) * 100_000
    age = random.randint(3, 90)
    first = today - timedelta(days=age)
    hist = [{"date": first.isoformat(), "price": start}]
    p = start
    for k in range(random.choice([0, 0, 1, 2, 3])):
        p = p - random.choice([1, 2, 3, 5]) * 500_000
        d = first + timedelta(days=int(age * (k + 1) / 4))
        hist.append({"date": d.isoformat(), "price": p})
    photos = []
    for j in range(5):
        name = f"demo/{i}-{j}.svg"
        (OUT / name).write_text(svg(i + j, rooms[j]))
        photos.append(f"data/{name}")
    floors = random.choice([12, 16, 18, 22])
    listings.append({
        "id": f"demo:{1000 + i}", "source": random.choice(["krisha", "krisha", "olx"]),
        "url": "https://krisha.kz/", "title": f"3-комнатная квартира · {area} м²",
        "complex": cx, "address": f"Алматы, Бостандыкский р-н, {addr}", "district": "Бостандыкский",
        "lat": 43.205 + random.uniform(-0.008, 0.008), "lon": 76.893 + random.uniform(-0.01, 0.01),
        "rooms": 3, "area": area, "kitchenArea": round(area * 0.15, 1), "floor": random.randint(1, floors), "floors": floors,
        "year": year, "condition": random.choice(conds), "buildingType": "монолитный", "bathroom": "2 с/у и более",
        "photos": photos, "seller": {"name": random.choice(["Айгерим", "Данияр", "Ольга", "Ержан"]), "type": random.choice(["owner", "agent"]), "phones": ["+7 700 000 00 00"]},
        "description": "Демо-описание. Светлая квартира с ремонтом, встроенная кухня, паркинг, закрытый двор.",
        "firstSeen": first.isoformat(), "lastSeen": today.isoformat(), "active": i != 11, "history": hist,
    })
(OUT / "demo-listings.json").write_text(json.dumps({"updatedAt": today.isoformat(), "listings": listings}, ensure_ascii=False, indent=1))
print(len(listings), "demo listings")
