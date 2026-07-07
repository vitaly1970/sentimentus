# sentimentus — сайт инструментов управления портфелем

Многостраничный статический сайт с serverless-функциями на Netlify.

## Страницы (корень)
- `index.html` — хаб, точка входа (список инструментов)
- `advisor.html` — советник Barbell (TQQQ + QDTE), данные из Tiingo
- `watchdog.html` — доска гипотез (React из CDN, localStorage)
- `bottom.html` — индикатор дна (VIX / Yahoo / NAAIM через proxy)
- `styles.css` — общие стили

## Функции — принцип «папка на функцию»
Каждая функция в своей папке; имя папки = имя файла = имя функции = адрес вызова.
```
netlify/functions/
├── proxy/proxy.js     → /.netlify/functions/proxy    (индикатор дна: CBOE, Yahoo, NAAIM)
└── tiingo/tiingo.js   → /.netlify/functions/tiingo    (советник: QQQ, TQQQ, QDTE)
                          алиас: /api/tiingo
```
Добавить новую функцию = создать новую папку `netlify/functions/<имя>/<имя>.js`, ничего
существующего не трогая. Общий код между функциями (если появится) — в `netlify/functions/_shared/`
(подчёркивание, чтобы Netlify не приняла за функцию).

## Переменные окружения (Netlify → Site configuration → Environment variables)
- `TIINGO_KEY` — токен Tiingo (только для функции tiingo; в коде и браузере его нет)

Функция proxy ключей не требует (публичные источники).

## Деплой
Загрузка файлов в репозиторий → Netlify деплоит автоматически.
