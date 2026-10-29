# Titan Club Rivne — Titan Run

Інтерактивна гра й бонусна програма для бігового клубу [Titan Club Rivne](https://www.instagram.com/titan.club.rivne).

Статичний сайт без збірки: HTML + CSS + JS. Працює на телефоні й комп'ютері, легко публікується на GitHub Pages.

## Запуск

```bash
python3 -m http.server 8000
# відкрити http://localhost:8000
```

## Публікація

Сайт публікується через GitHub Pages з гілки `main` (корінь репозиторію):
https://max-vorozhko.github.io/Titan-Club-Rivne/

При кожному релізі збільшуйте `?v=N` у `index.html` для CSS і JS, інакше браузери гравців можуть узяти старі файли з кешу.

## Гра «Titan Run»

- **Тап / Пробіл / ↑**: стрибок, у повітрі можна ще раз (подвійний стрибок).
- 💧 Вода відновлює енергію; енергія поступово витрачається.
- ⚡ Енергогель: 4 секунди прискорення й невразливості.
- 🪙 Титан-монети.
- Перешкоди: конуси, калюжі, лавки, собаки (з 1.5 км), шлагбауми (з 4 км, потрібен подвійний стрибок).
- Відмітки 1 км, 5K, 10K, півмарафон і марафон; рекорд зберігається в браузері; результатом можна поділитися.

## Рейтинг (Firebase)

Лідерборд зберігається у Firebase: анонімний вхід + Firestore, колекція `scores/{uid}` з кращим результатом кожного гравця.
Правила безпеки (`firestore.rules`) дозволяють гравцю писати лише свій документ, лише покращувати результат,
обмежують ім'я (2–20 символів), дистанцію (до 60 км) і відсікають фізично неможливу швидкість.

Проєкт Firebase: `titan-run` (конфіг у `js/config.js`). Якщо прибрати конфіг, вкладка «Рейтинг» покаже «В розробці».

### Налаштування (один раз)

1. https://console.firebase.google.com → **Add project** (наприклад, `titan-run`), Google Analytics можна вимкнути.
2. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable**.
3. **Build → Firestore Database → Create database** → регіон `eur3 (europe-west)` → *Start in production mode*.
4. **Firestore → Rules**: вставити вміст `firestore.rules` → **Publish**.
5. **Project settings → Your apps → Web (`</>`)** → зареєструвати застосунок → скопіювати `firebaseConfig`
   у `js/config.js` (поле `firebase`).
6. **Authentication → Settings → Authorized domains**: додати `max-vorozhko.github.io`.

Видалити фейковий результат: **Firestore → Data → scores →** документ → Delete.

### Тестування правил локально

```bash
npm i -g firebase-tools
firebase emulators:start --only auth,firestore --project demo-titan
```

## Бонусна програма

| Пробіжок | Подарунок |
|---------:|-----------|
| 5  | ☕ Кава |
| 15 | 🧦 Шкарпетки |
| 25 | 👕 Футболка |
| 35 | 🧥 Худі |

Рівні задаються в `js/rewards.js`.

## Відмітки присутності (в розробці)

Вкладка «Бонуси» зараз неактивна: показує позначку «В розробці» і рівні подарунків.
Заготовка логіки відміток лежить у `js/attendance.js` (поки не підключена); для справжнього обліку потрібен бекенд.

## Фірмовий стиль

- Логотип: `assets/logo.png` (прозорий фон, вирізано з офіційного лого на білому фоні).
- Кольори з логотипу: помаранчевий `--brand: #f85a0a` і графітовий `--ink: #33333a` у `:root` на початку `css/style.css`. Гра бере кольори звідти ж.
- Шрифти: Oswald (заголовки, кнопки, цифри) і Montserrat (текст).

## Структура

```
index.html
css/style.css
js/config.js      — налаштування (конфіг Firebase)
js/leaderboard.js — рейтинг: анонімний вхід і Firestore
js/game.js        — гра (canvas)
js/rewards.js     — рівні бонусів
js/attendance.js  — відмітки присутності
js/app.js         — вкладки, інтерфейс, зв'язка гри та бонусів
assets/logo.png
firestore.rules   — правила безпеки рейтингу
firebase.json     — конфіг Firebase CLI/емуляторів
```
