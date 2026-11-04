# Titan Run для Android

Оболонка на Flutter: гра Titan Run з сайту клуба (https://max-vorozhko.github.io/Titan-Club-Rivne/) на весь екран,
з іконкою, кнопкою «Назад» як у додатку й екраном «Немає з'єднання». Оновлення гри приходять з сайту: перевстановлювати додаток не треба.

- Зовнішні посилання (Instagram, Telegram, Viber, банка Monobank) і адмінка відкриваються в браузері чи в іншому додатку (`lib/navigation_policy.dart`).
- Кнопку «Назад» обробляє сама гра: `window.titanBack()` у `js/app.js` закриває вікно або повертає з розділу на головну.

## Як отримати .apk

Збірка йде в GitHub Actions (`.github/workflows/android.yml`): Actions → «Android APK» → Run workflow.
З галочкою **release** файл `titan-run.apk` з'являється в Releases (тег `android-latest`):
https://github.com/max-vorozhko/Titan-Club-Rivne/releases/tag/android-latest

Без галочки його можна забрати в розділі Artifacts запуску.

## Локально (потрібні Flutter 3.47+ і Android SDK)

```bash
cd mobile
flutter pub get
flutter analyze && flutter test
flutter build apk --release
```

Файл: `build/app/outputs/flutter-apk/app-release.apk`. Зараз збірка підписується debug-ключем: так .apk можна ставити файлом, але не в Google Play.
