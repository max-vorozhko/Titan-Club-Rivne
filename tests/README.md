# Тести

## Правила Firestore (`tests/firestore`)

Перевіряють `firestore.rules` на емуляторі: рейтинги (`scores`, `sunday`, `trail`, `draw`), позначки ▲▼ (`dayStart`),
адмінку й відвідуваність (`admins`, `athletes`, `runs`, `club/public`, промокоди), входи через Google (`logins`).

```bash
cd tests/firestore && npm install          # один раз
cd ../.. && npx --prefix tests/firestore firebase emulators:start --only auth,firestore --project demo-titan
# в іншому терміналі:
cd tests/firestore && npm test
```

Потрібні Java (емулятор) і Node 18+. **Перед повним `npm test` перезапускайте емулятор**: `rules.test.mjs` не очищає базу, і дані попередніх прогонів ламають його. **Змінили `firestore.rules` — додайте сценарії й запустіть усе до публікації правил.**
Довжини контурів малюнків у `drawLen()` правил мають збігатися з `js/draw.js` (див. `docs/HANDOFF.md`, 7д).

Браузерні перевірки (Playwright на емуляторах) у репозиторії не збережені; як їх відтворювали — `docs/HANDOFF.md`, розділ 8.
