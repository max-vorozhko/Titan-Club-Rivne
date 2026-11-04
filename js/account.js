// Вхід гравця через Google (необов'язковий). Анонімна гра лишається: вхід прив'язує пошту до поточного
// анонімного профілю, тож результати, ім'я в рейтингах і бусти йдуть за акаунтом на інші пристрої.
// Список входів бачить лише адмін (колекція logins), він же прив'язує пошту до атлета клубу.
// Прив'язаний учасник клубу бачить справжні імена у вкладці «Клуб».
(function () {
  const $ = (id) => document.getElementById(id);
  const cfg = window.TITAN_CONFIG || {};
  const CLIENT_ID = cfg.googleClientId || "";
  const GIS_SRC = "https://accounts.google.com/gsi/client";
  const NONCE_KEY = "titan.login.nonce";
  const ua = navigator.userAgent;
  const STANDALONE = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  // Google не пускає вхід у вбудованих браузерах: Android WebView (оболонка-додаток), Telegram, Instagram, Facebook
  const WEBVIEW = /; wv\)/.test(ua);
  const IN_APP = typeof window.TelegramWebviewProxy !== "undefined" || /Telegram|Instagram|FBAN|FBAV/i.test(ua);

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (text) => window.Profile && Profile.toast(text);

  let state = { signedIn: false, email: "", name: "", athleteId: "", athleteName: "" };
  const listeners = [];
  const emit = () => listeners.forEach((f) => f(state));

  const enabled = () => !!(window.Leaderboard && Leaderboard.enabled && CLIENT_ID);

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("load"));
      document.head.appendChild(s);
    });
  }

  // ---------- Стан: хто увійшов і чи прив'язаний до атлета ----------

  async function refresh() {
    if (!Leaderboard.enabled) return state;
    const { auth, db, uid } = await Leaderboard.connect();
    const u = auth.currentUser;
    const google = !!u && u.providerData.some((p) => p.providerId === "google.com");
    const next = { signedIn: google, email: google ? u.email || "" : "", name: google ? u.displayName || "" : "", athleteId: "", athleteName: "" };
    if (google) {
      try {
        const ref = db.collection("logins").doc(uid);
        const snap = await ref.get();
        const stamp = firebase.firestore.FieldValue.serverTimestamp();
        const nick = Leaderboard.getName() || "";
        const displayName = (u.displayName || "").slice(0, 100);
        if (!snap.exists) {
          // Входу ще немає в списку (наприклад, запис не вдався одразу): створюємо
          await u.getIdToken(true);
          await ref.set({ email: u.email, displayName, nick, createdAt: stamp, lastSeen: stamp });
        } else {
          const d = snap.data();
          next.athleteId = d.athleteId || "";
          if (d.nick !== nick || d.displayName !== displayName) await ref.update({ nick, displayName, lastSeen: stamp });
        }
        if (next.athleteId) {
          const a = await db.collection("athletes").doc(next.athleteId).get();
          next.athleteName = a.exists ? a.data().name : "";
        }
      } catch (e) {}
    }
    state = next;
    emit();
    return state;
  }

  // Імена всіх атлетів {id: {name, active}} — лише для прив'язаних учасників клубу (так вирішують правила бази)
  async function athleteNames() {
    const { db } = await Leaderboard.connect();
    const snap = await db.collection("athletes").get();
    const map = {};
    snap.docs.forEach((d) => (map[d.id] = { name: d.data().name, active: d.data().active !== false }));
    return map;
  }

  // ---------- Вхід і вихід ----------

  async function signInWithIdToken(idToken) {
    const { auth } = await Leaderboard.connect();
    const cred = firebase.auth.GoogleAuthProvider.credential(idToken);
    try {
      if (auth.currentUser && auth.currentUser.isAnonymous) await auth.currentUser.linkWithCredential(cred);
      else await auth.signInWithCredential(cred);
    } catch (e) {
      // Ця пошта вже має профіль (входила з іншого пристрою): переходимо в нього
      if (e.code === "auth/credential-already-in-use" || e.code === "auth/email-already-in-use") await auth.signInWithCredential(e.credential || cred);
      else throw e;
    }
    await refresh();
  }

  async function signOut() {
    const { auth } = await Leaderboard.connect();
    await auth.signOut();
    await auth.signInAnonymously();
    await refresh();
  }

  const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  const baseUrl = () => location.origin + location.pathname.replace(/index\.html$/, "");

  // Вхід переходом на сторінку Google (для ярлика на екрані, де вікна входу не повертають результат)
  function redirectSignIn() {
    const nonce = randomId();
    try { localStorage.setItem(NONCE_KEY, nonce); } catch (e) {}
    const q = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: baseUrl(), response_type: "id_token", scope: "openid email profile", nonce, prompt: "select_account" });
    location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + q;
  }

  async function finishRedirect() {
    if (!/[#&](id_token|error)=/.test(location.hash)) return;
    const h = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, "", location.pathname + location.search);
    document.querySelector('.tabs__btn[data-tab="profile"]').click();
    if (h.get("error")) return toast("Google не дав увійти 😕");
    const token = h.get("id_token");
    let expected = null;
    try { expected = localStorage.getItem(NONCE_KEY); localStorage.removeItem(NONCE_KEY); } catch (e) {}
    try {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (expected && payload.nonce !== expected) throw new Error("nonce");
      await signInWithIdToken(token);
      toast("✓ Ти увійшов через Google");
    } catch (e) {
      toast("Не вдалося увійти 😕");
    }
  }

  async function mountButton(box) {
    box.innerHTML = "";
    if (WEBVIEW || IN_APP) {
      box.innerHTML = '<p class="muted small-left">Вхід через Google не працює у вбудованому браузері (додаток, Telegram, Instagram). Відкрий гру в Safari або Chrome.</p>';
      return;
    }
    if (STANDALONE) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn--primary btn--small";
      b.textContent = "Увійти з Google";
      b.addEventListener("click", redirectSignIn);
      box.appendChild(b);
      return;
    }
    try {
      await loadScript(GIS_SRC);
      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        ux_mode: "popup",
        auto_select: false,
        use_fedcm_for_button: true,
        callback: (resp) =>
          signInWithIdToken(resp.credential).then(() => toast("✓ Ти увійшов через Google"), () => toast("Не вдалося увійти 😕")),
      });
      google.accounts.id.renderButton(box, { theme: "filled_blue", size: "large", shape: "pill", text: "signin_with", locale: "uk", width: 260 });
    } catch (e) {
      box.innerHTML = '<p class="muted small-left">Не вдалося завантажити кнопку Google 😕</p>';
    }
  }

  // ---------- Блок «Акаунт» у профілі ----------

  const profileActive = () => $("tab-profile").classList.contains("is-active");

  async function render() {
    const card = $("account");
    if (!card) return;
    card.hidden = !enabled();
    if (!enabled()) return;
    const body = $("account-body");
    const btn = $("account-btn");
    if (!state.signedIn) {
      body.innerHTML =
        '<b>Увійти через Google</b><span>Необов\'язково. Результати, ім\'я в рейтингах і супер-кросівки лишаться з тобою на будь-якому пристрої. Без входу гра працює, як раніше.</span>';
      // Бібліотеку Google вантажимо лише коли гравець відкрив профіль
      if (profileActive()) mountButton(btn);
      else btn.innerHTML = "";
      return;
    }
    btn.innerHTML = '<button class="link" id="account-out" type="button">Вийти</button>';
    $("account-out").addEventListener("click", () => signOut().then(() => toast("Ти вийшов. Тепер ти знову гість."), () => toast("Не вдалося вийти 😕")));
    body.innerHTML = state.athleteId
      ? `<b>✅ ${escapeHtml(state.email)}</b><span>Ти в клубі${state.athleteName ? ": <b>" + escapeHtml(state.athleteName) + "</b>" : ""}. У вкладці «Клуб» ти бачиш справжніх бігунів, а не вигаданих персонажів.</span>`
      : `<b>✅ ${escapeHtml(state.email)}</b><span>Ти увійшов. Бігаєш з Titan Club? Напиши адміну: він підтвердить твою пошту, і у вкладці «Клуб» відкриються справжні імена.</span>`;
  }

  window.Account = {
    get state() { return state; },
    enabled,
    refresh,
    athleteNames,
    signOut,
    onChange: (f) => listeners.push(f),
  };

  listeners.push(render);

  document.querySelectorAll(".tabs__btn").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.tab === "profile" && enabled()) refresh().then(render, render);
    })
  );
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-goto-account]")) {
      document.querySelector('.tabs__btn[data-tab="profile"]').click();
    }
  });

  render();
  if (enabled()) finishRedirect();
})();
