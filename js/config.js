// Налаштування сайту.
// firebase — конфіг веб-застосунку з Firebase Console (Project settings → Your apps → Web app).
// Ці ключі публічні за задумом Firebase; доступ до даних обмежують правила firestore.rules.
// Якщо прибрати firebase (null), вкладка «Рейтинг» покаже «В розробці».
window.TITAN_CONFIG = Object.assign(
  {
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
