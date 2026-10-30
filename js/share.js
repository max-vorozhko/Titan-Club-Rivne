// Поділитися результатом: посилання для соцмереж і картинка 1080×1920 для сторіс.
(function () {
  const cfg = window.TITAN_CONFIG || {};
  // Завжди ділимось публічною адресою гри, а не адресою поточної сторінки (прев'ю, iframe тощо)
  const GAME_URL = cfg.shareUrl || location.href.split("#")[0];
  const enc = encodeURIComponent;

  function message(result) {
    return `Мій результат у грі Titan Run від @titan.club.rivne: ${result.km.toFixed(2)} км 🏃 А ти?`;
  }

  // Посилання «поділитися» кожної соцмережі (відкриваються в новій вкладці або в застосунку)
  function links(result) {
    const text = message(result);
    return {
      telegram: `https://t.me/share/url?url=${enc(GAME_URL)}&text=${enc(text)}`,
      viber: `viber://forward?text=${enc(text + " " + GAME_URL)}`,
      whatsapp: `https://wa.me/?text=${enc(text + " " + GAME_URL)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(GAME_URL)}`,
      x: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(GAME_URL)}`,
    };
  }

  // Копіювання з запасним способом для WebView, де Clipboard API заборонено
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {}
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {}
    ta.remove();
    return ok;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // Картинка для сторіс у фірмовому стилі
  async function storyImage(result) {
    const W = 1080, H = 1920;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    const brand = css("--brand") || "#f85a0a";
    const ink = css("--ink") || "#33333a";
    await document.fonts.ready;

    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, W, H);
    g.fillStyle = brand;
    g.fillRect(0, H - 360, W, 360);
    g.fillRect(0, 0, W, 24);

    try {
      const logo = await loadImage("assets/logo.png");
      const lw = 620, lh = (logo.height / logo.width) * lw;
      g.drawImage(logo, (W - lw) / 2, 150, lw, lh);
    } catch (e) {}

    g.textAlign = "center";
    g.fillStyle = ink;
    g.font = "700 64px Oswald, sans-serif";
    g.fillText("МІЙ ЗАБІГ У TITAN RUN", W / 2, 840);

    g.fillStyle = brand;
    g.font = "700 300px Oswald, sans-serif";
    g.fillText(result.km.toFixed(2), W / 2, 1150);
    g.fillStyle = ink;
    g.font = "700 90px Oswald, sans-serif";
    g.fillText("КМ", W / 2, 1260);

    g.font = "600 56px Montserrat, sans-serif";
    const extra = [`🪙 ${result.coins} монет`];
    if (result.mark && result.mark !== "—") extra.push(`🏅 ${result.mark}`);
    g.fillText(extra.join("   ·   "), W / 2, 1400);

    g.fillStyle = "#ffffff";
    g.font = "700 72px Oswald, sans-serif";
    g.fillText("А ТИ ОБЖЕНЕШ?", W / 2, H - 230);
    g.font = "600 44px Montserrat, sans-serif";
    g.fillText(GAME_URL.replace(/^https?:\/\//, "").replace(/\/$/, ""), W / 2, H - 150);
    g.fillText("@titan.club.rivne", W / 2, H - 85);

    return new Promise((resolve) => c.toBlob(resolve, "image/png"));
  }

  // Ділимось картинкою через системне меню (на телефоні туди входить Instagram), інакше — завантажуємо файл
  async function shareImage(result) {
    return shareBlob(await storyImage(result), `titan-run-${result.km.toFixed(2)}km.png`, message(result));
  }

  async function shareBlob(blob, filename, text) {
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: `${text} ${GAME_URL}` });
        return "shared";
      } catch (e) {
        if (e.name === "AbortError") return "cancelled";
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return "downloaded";
  }

  // Системне меню з текстом і посиланням (Android/iOS/ПК, де воно є)
  async function native(result) {
    try {
      await navigator.share({ title: "Titan Run", text: message(result), url: GAME_URL });
      return true;
    } catch (e) {
      return e.name === "AbortError";
    }
  }

  window.Share = {
    url: GAME_URL,
    hasNative: !!navigator.share,
    message,
    links,
    copy: (result) => copy(`${message(result)} ${GAME_URL}`),
    native,
    shareImage,
    shareBlob,
    storyImage,
  };
})();
