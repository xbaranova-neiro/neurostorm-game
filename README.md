# Нейрошторм — игра

Интерактивная мини-игра по ТЗ: вертикальный web, смена на «рынке», диагностика поведения, финал с архетипами.

## Почему на GitHub «только текст»

Страница **`https://github.com/…/neurostorm-game`** — это **код и README**, не хостинг игры. Игра — это отдельные HTML-файлы.

**Играть в браузере (после включения Pages):**

1. Репозиторий → **Settings** → **Pages**
2. **Source:** Deploy from a branch → ветка **`main`**, папка **`/ (root)`** → Save
3. Через 1–2 минуты откройте сайт (ссылка появится в том же блоке Pages):

   - **Корень сайта** автоматически ведёт в игру:  
     `https://ВАШ_ЛОГИН.github.io/neurostorm-game/`  
     (сработает редирект из корневого [`index.html`](index.html) → `neurostorm/`)
   - Либо сразу:  
     `https://ВАШ_ЛОГИН.github.io/neurostorm-game/neurostorm/`

Локально без сервера: откройте в проводнике файл **`neurostorm/index.html`**.

## Запуск

```bash
cd neurostorm
python3 -m http.server 8080
```

Откройте http://localhost:8080 — или `neurostorm/index.html` (через `js/bundle.js` работает и `file://`).

Подробности: **[neurostorm/README.md](neurostorm/README.md)**

## Состав репозитория

| Путь | Описание |
|------|----------|
| `neurostorm/` | Исходники игры (HTML, CSS, JS, бандл) |
| `ТЗ_игра_Нейрошторм_для_разработчика.docx` | Техническое задание |
| `SKILL.md` | Заметки по frontend-дизайну (референс) |

## Лицензия

Укажите лицензию при необходимости.
