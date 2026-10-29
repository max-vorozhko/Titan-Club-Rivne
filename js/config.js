// Налаштування сайту.
// firebase — конфіг веб-застосунку з Firebase Console (Project settings → Your apps → Web app).
// Ці ключі публічні за задумом Firebase; доступ до даних обмежують правила firestore.rules.
// Поки firebase не заповнено, вкладка «Рейтинг» показує «В розробці».
window.TITAN_CONFIG = Object.assign(
  {
    firebase: null,
    // Приклад:
    // firebase: {
    //   apiKey: "...",
    //   authDomain: "titan-run.firebaseapp.com",
    //   projectId: "titan-run",
    //   appId: "...",
    // },
  },
  window.TITAN_CONFIG
);
