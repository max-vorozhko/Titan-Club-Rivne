// Налаштування сайту.
// firebase — конфіг веб-застосунку з Firebase Console (Project settings → Your apps → Web app).
// Ці ключі публічні за задумом Firebase; доступ до даних обмежують правила firestore.rules.
// Якщо прибрати firebase (null), вкладка «Рейтинг» покаже «В розробці».
window.TITAN_CONFIG = Object.assign(
  {
    // Одноклубники, які біжать у групі в «Недільній пробіжці» (до 14 імен)
    clubRunners: [
      "Коля кум", "Вадік кум", "Макс", "Паша", "Іра", "Настя", "Таня", "Люда",
      "Саша йог", "Марина", "Ілона", "Віталік", "Микола",
    ],
    // Код сайту в GoatCounter (статистика відвідувань без cookie): https://КОД.goatcounter.com
    // Порожній рядок — статистика вимкнена.
    goatcounter: "titan-run",
    // Донат за «Супер-кросівки»: посилання на банку Monobank і де отримати промокод.
    // Вставте посилання на банку між лапками, наприклад: donateUrl: "https://send.monobank.ua/jar/XXXXXXXX",
    donateUrl: "https://send.monobank.ua/jar/A25V4sTs2g",
    boostPrice: 30, // грн за одні «Супер-кросівки»
    promoContact: "@max_vorozhko",
    // Google-таблиця відвідуваності для адмінки (admin.html → «Таблиця»): лише копія, головні дані — в адмінці.
    // id — частина посилання між /d/ і /edit; таблиця лишається приватною, доступ — через Google-вхід адміна.
    attendanceSheet: { id: "1_GkYJtKmIGXlxWziViNhWwbQTiB34pIkdRG8UyP3FnM", tab: "Аркуш1", kmTab: "Кілометри" },
    // Публічна адреса гри, якою діляться гравці
    shareUrl: "https://max-vorozhko.github.io/Titan-Club-Rivne/",
    firebase: {
      apiKey: "AIzaSyC3ATlAmf9Fcb92A2k1xam9qfjgN7ipHcw",
      authDomain: "titan-run.firebaseapp.com",
      projectId: "titan-run",
      storageBucket: "titan-run.firebasestorage.app",
      messagingSenderId: "400161018413",
      appId: "1:400161018413:web:475d88e99f14877e761ea4",
    },
  },
  window.TITAN_CONFIG
);
