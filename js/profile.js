// Профіль гравця на цьому пристрої: вигляд аватара, статистика, досягнення (мерч) і бусти.
// Вигляд і статистика живуть у localStorage; бусти — у Firestore profiles/{uid}, бо їх дають промокоди.
(function () {
  const KEY = "titan.profile.v1";
  const BEST_KEY = "titan.best.v1"; // рекорд режиму «Біг», який гра вже зберігала раніше

  // Досягнення: що треба зробити і яку річ гардероба це відкриває
  const ACHIEVEMENTS = [
    { id: "streak3", title: "3 дні поспіль", desc: "Грай три дні поспіль", item: ["hat", "cap"] },
    { id: "streak7", title: "Тиждень без пропусків", desc: "Грай 7 днів поспіль", item: ["glasses", "sun"] },
    { id: "game10", title: "Десятка", desc: "Пробіжи 10 км у режимі «Біг»", item: ["shirt", "black"] },
    { id: "game42", title: "Марафонець", desc: "Пробіжи 42,2 км у режимі «Біг»", item: ["shirt", "gold"] },
    { id: "sunday5", title: "Недільний ранок", desc: "Фінішуй «Недільну пробіжку» біля КТС", item: ["shirt", "kts"] },
    { id: "trailAny", title: "Трейлраннер", desc: "Фінішуй будь-який трейл", item: ["hat", "buff"] },
    { id: "trail26", title: "Вертикаль", desc: "Фінішуй трейл на 26 км", item: ["shoes", "trail"] },
    { id: "top3week", title: "Подіум тижня", desc: "Потрап у топ-3 тижня в «Неділі»", item: ["shoes", "neon"] },
    { id: "top1", title: "Лідер", desc: "Стань першим у рейтингу тижня або в таблиці трейлу", item: ["hat", "wreath"] },
  ];

  function load() {
    let p = null;
    try {
      p = JSON.parse(localStorage.getItem(KEY));
    } catch (e) {}
    p = p || {};
    p.look = Object.assign({}, Avatar.DEFAULT_LOOK, p.look);
    p.stats = Object.assign(
      { runs: 0, totalKm: 0, streak: 0, bestStreak: 0, lastDay: "", gameBest: 0, sunday: {}, trail: {} },
      p.stats
    );
    p.unlocked = p.unlocked || [];
    // Рекорд «Бігу» до появи профілю
    try {
      p.stats.gameBest = Math.max(p.stats.gameBest, parseFloat(localStorage.getItem(BEST_KEY)) || 0);
    } catch (e) {}
    return p;
  }

  let state = load();

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function kyivDay(offsetDays) {
    const d = new Date(Date.now() + (offsetDays || 0) * 864e5);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(d);
  }

  // Серія днів: зараховуємо день один раз; пропуск дня — серія з початку
  function touchStreak() {
    const s = state.stats;
    const today = kyivDay(0);
    if (s.lastDay === today) return;
    s.streak = s.lastDay === kyivDay(-1) ? s.streak + 1 : 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.lastDay = today;
  }

  function unlock(ids) {
    const fresh = ids.filter((id) => !state.unlocked.includes(id));
    state.unlocked.push(...fresh);
    return fresh.map((id) => ACHIEVEMENTS.find((a) => a.id === id));
  }

  function itemName(a) {
    return Avatar.option(a.item[0], a.item[1]).label;
  }

  function announce(achievements) {
    achievements.forEach((a, i) => setTimeout(() => toast(`🎁 Новий мерч: ${itemName(a)}!`), i * 1800));
  }

  /** Завершений забіг: { mode: "game" | "sunday" | "trail", km?, dist?, time? } */
  function record(run) {
    const s = state.stats;
    touchStreak();
    s.runs++;
    const earned = [];
    if (run.mode === "game") {
      s.totalKm += run.km;
      s.gameBest = Math.max(s.gameBest, run.km);
      if (run.km >= 10) earned.push("game10");
      if (run.km >= 42.2) earned.push("game42");
    } else {
      s.totalKm += run.dist;
      const best = s[run.mode][run.dist];
      if (!best || run.time < best) s[run.mode][run.dist] = run.time;
      if (run.mode === "sunday") earned.push("sunday5");
      if (run.mode === "trail") earned.push("trailAny");
      if (run.mode === "trail" && run.dist === 26) earned.push("trail26");
    }
    if (s.streak >= 3) earned.push("streak3");
    if (s.streak >= 7) earned.push("streak7");
    const fresh = unlock(earned);
    save();
    announce(fresh);
    return fresh;
  }

  /** Місце в таблиці після збереження результату */
  function placed(mode, place) {
    if (!place) return [];
    const earned = [];
    if (mode === "sunday" && place <= 3) earned.push("top3week");
    if ((mode === "sunday" || mode === "trail") && place === 1) earned.push("top1");
    const fresh = unlock(earned);
    save();
    announce(fresh);
    return fresh;
  }

  function isAvailable(part, id) {
    const o = Avatar.option(part, id);
    return !o.unlock || state.unlocked.includes(o.unlock);
  }

  function setLook(part, id) {
    if (!isAvailable(part, id)) return false;
    state.look[part] = id;
    save();
    return true;
  }

  // ---------- Тост поверх усіх вкладок ----------
  let toastTimer;
  function toast(text) {
    const el = document.getElementById("global-toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2200);
  }

  // ---------- Бусти «Супер-кросівки» (Firestore profiles/{uid}, промокоди codes/{code}) ----------
  let boosts = null;

  async function profileRef() {
    const { db, uid } = await Leaderboard.connect();
    return { db, ref: db.collection("profiles").doc(uid), uid };
  }

  async function refreshBoosts() {
    if (!Leaderboard.enabled) return (boosts = 0);
    try {
      const { ref } = await profileRef();
      const snap = await ref.get();
      boosts = snap.exists ? snap.data().boosts || 0 : 0;
    } catch (e) {
      boosts = boosts || 0;
    }
    return boosts;
  }

  // Активація: в одній транзакції позначаємо код використаним і додаємо буст; правила бази перевіряють обидва кроки
  async function redeem(raw) {
    const code = String(raw || "").trim().toUpperCase();
    if (!/^[A-Z0-9-]{6,40}$/.test(code)) throw new Error("bad_code");
    const { db, ref, uid } = await profileRef();
    const stamp = firebase.firestore.FieldValue.serverTimestamp();
    const snap = await ref.get();
    const current = snap.exists ? snap.data().boosts || 0 : 0;
    const batch = db.batch();
    batch.update(db.collection("codes").doc(code), { used: true, usedBy: uid, usedAt: stamp });
    batch.set(ref, { boosts: current + 1, lastCode: code, updatedAt: stamp });
    try {
      await batch.commit();
    } catch (e) {
      throw new Error("invalid_code");
    }
    boosts = current + 1;
    return boosts;
  }

  // Списати один буст на старті забігу
  async function useBoost() {
    const { ref } = await profileRef();
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : null;
    if (!data || !data.boosts) throw new Error("no_boosts");
    await ref.set({ boosts: data.boosts - 1, lastCode: data.lastCode, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    boosts = data.boosts - 1;
    return boosts;
  }

  // ---------- Перемикач «Взути супер-кросівки» на старті «Неділі» й «Трейлу» ----------

  async function renderBoostToggle(label) {
    const n = Leaderboard.enabled ? await refreshBoosts() : 0;
    label.hidden = !n;
    label.querySelector("input").checked = false;
    label.querySelector("small").textContent = `залишилось ${n}`;
  }

  // Списує буст, якщо гравець його вибрав; повертає true, якщо забіг буде з бустом
  async function takeBoost(label) {
    const input = label.querySelector("input");
    if (label.hidden || !input.checked) return false;
    input.checked = false;
    try {
      const left = await useBoost();
      label.querySelector("small").textContent = `залишилось ${left}`;
      label.hidden = !left;
      toast("⚡ Супер-кросівки взуто на цей забіг!");
      return true;
    } catch (e) {
      toast("Не вдалося взути супер-кросівки 😕");
      return false;
    }
  }

  window.Profile = {
    ACHIEVEMENTS,
    get state() {
      return state;
    },
    look: (boosted) => Avatar.resolve(state.look, boosted),
    setLook,
    isAvailable,
    itemName,
    record,
    placed,
    toast,
    boosts: () => boosts,
    refreshBoosts,
    redeem,
    useBoost,
    renderBoostToggle,
    takeBoost,
  };
})();
