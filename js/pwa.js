// Додаток на екрані телефона (PWA): сервіс-воркер і підказка «Додай Titan Run на екран».
// iPhone: показуємо, куди натиснути в Safari. Android: кнопка «Встановити». Уже встановлено — нічого не показуємо.
(function () {
  const $ = (id) => document.getElementById(id);
  const HIDE_KEY = "titan.install.hidden";
  const HIDE_DAYS = 14;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const inApp = typeof window.TelegramWebviewProxy !== "undefined" || /Telegram|Instagram|FBAN|FBAV/i.test(ua);
  const standalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  const event = (path, title) => window.Analytics && Analytics.event(path, title);

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  if (standalone) {
    event("pwa-open", "Відкрито як додаток");
    return;
  }

  function hiddenRecently() {
    try {
      const at = Number(localStorage.getItem(HIDE_KEY));
      return at && Date.now() - at < HIDE_DAYS * 86400000;
    } catch (e) {
      return false;
    }
  }

  function show(how) {
    if (hiddenRecently()) return;
    $("install-how").innerHTML = how;
    $("install").hidden = false;
  }

  $("install-close").addEventListener("click", () => {
    $("install").hidden = true;
    try {
      localStorage.setItem(HIDE_KEY, String(Date.now()));
    } catch (e) {}
  });

  if (isIOS) {
    show(
      inApp
        ? "Відкрий цю сторінку в <b>Safari</b> (⋯ → «Відкрити в Safari»), а там: <b>Поділитися</b> <span class=\"install__ico\">⬆️</span> → <b>«На початковий екран»</b>."
        : "Натисни <b>Поділитися</b> <span class=\"install__ico\">⬆️</span> внизу екрана → <b>«На початковий екран»</b> → «Додати». Гра відкриватиметься на весь екран, як додаток."
    );
    return;
  }

  // Android / Chrome: браузер сам пропонує встановлення — показуємо свою кнопку
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    $("install-btn").hidden = false;
    show("Іконка на екрані, гра на весь екран — як звичайний додаток.");
  });
  $("install-btn").addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    if (outcome === "accepted") {
      $("install").hidden = true;
      event("pwa-install", "Встановлено як додаток");
    }
  });
  window.addEventListener("appinstalled", () => ($("install").hidden = true));
})();
