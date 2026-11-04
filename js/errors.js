// Збирач помилок: перша помилка скрипта на сторінці потрапляє в GoatCounter як подія «js-error …» з назвою файлу,
// рядком і версією Android/Chrome. Так видно, що ламається на чужих телефонах (особливо у вбудованому браузері додатка).
(function () {
  let sent = false;
  const cut = (s, n) => String(s || "").slice(0, n);

  window.addEventListener("error", (e) => {
    if (!e || !e.message) return; // помилки завантаження картинок і шрифтів не цікаві
    const file = String(e.filename || "").replace(/^.*\//, "").replace(/\?.*/, "");
    const msg = cut(e.message, 90);

    // Помилка у вкладці «Малюнок»: показуємо текст прямо на полотні, щоб гравець міг надіслати знімок екрана
    if (/draw\.js/.test(file)) {
      const hint = document.getElementById("dr-hint");
      if (hint) {
        hint.hidden = false;
        hint.textContent = "Помилка: " + msg;
      }
    }

    if (sent || !window.Analytics) return;
    sent = true;
    const ua = navigator.userAgent;
    const android = (ua.match(/Android ([\d.]+)/) || [])[1] || "—";
    const chrome = (ua.match(/Chrome\/(\d+)/) || [])[1] || "—";
    const webview = /; wv\)/.test(ua) ? "WebView" : "браузер";
    Analytics.event(`js-error ${file}:${e.lineno} ${msg}`, `Android ${android} · Chrome ${chrome} · ${webview}`);
  });
})();
