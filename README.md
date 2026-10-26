# Квартира — трекер

Ищем трёхкомнатную квартиру на вторичке с ремонтом в районе MEGA Alma-Ata
(Estet, Element, Terra и соседние ЖК). Каждый день собираем объявления, храним историю цен
и проверяем, какие ипотечные программы подходят под наш бюджет.

**Сайт:** https://romanyurkin2024.github.io/run_program/ · демо-данные: добавьте `?demo` к адресу.

## Как устроено

| Часть | Где | Что делает |
|---|---|---|
| Сайт | `src/` (Vite + React + TS) | Обзор, список квартир, карточка с историей цены, ипотечный калькулятор, план накоплений |
| Парсер | `scraper/` (Python) | Krisha.kz → `public/data/listings.json`, история цен дописывается каждый день |
| Район и фильтры | `config/area.json` | Координаты района, мин. год постройки, площадь, исключаемые состояния |
| Банки | `src/config/banks.ts` | Ставки и условия ипотечных программ на вторичку (сверять с банками) |
| Автоматизация | `.github/workflows/` | `Scrape` — каждый день в 07:00 по Алматы, затем `Deploy` на GitHub Pages |

Личные финансы (накопления, доход) вводятся на сайте и хранятся только в браузере.

## Локально

```bash
npm ci
npm run dev          # сайт на http://localhost:5173/run_program/
npm test             # тесты калькулятора
pip install -r scraper/requirements.txt
python -m unittest scraper.test_scraper
python -m scraper.run          # сбор объявлений
python -m scraper.run --probe  # сохранить сырые страницы в debug/ для отладки
python scripts/make_demo.py    # пересоздать демо-данные
```
