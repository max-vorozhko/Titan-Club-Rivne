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
    { id: "year100", title: "100 км за рік", desc: "Titan Premium: запиши 100 км у «Мій пробіг»", item: ["shirt", "bronze"] },
    { id: "year500", title: "500 км за рік", desc: "Titan Premium: запиши 500 км у «Мій пробіг»", item: ["shirt", "silver"] },
    { id: "year1000", title: "1000 км за рік", desc: "Titan Premium: запиши 1000 км у «Мій пробіг»", item: ["shirt", "diamond"] },
  ];

  function load() {
    let p = null;
    try {
      p = JSON.parse(localStorage.getItem(KEY));
    } catch (e) {}
    p = p || {};
    p.look = Object.assign({}, Avatar.DEFAULT_LOOK, p.look);
    p.stats = Object.assign(
      { runs: 0, totalKm: 0, streak: 0, bestStreak: 0, lastDay: "", gameBest: 0, sunday: {}, trail: {}, bestRuns: [] },
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
    return Kyiv.iso(d);
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

  // Десять найкращих забігів «Бігу» з датою (лише на цьому пристрої; без Firestore)
  const KEEP_RUNS = 10;
  function rememberRun(run) {
    if (!(run.km >= 0.1)) return;
    const list = state.stats.bestRuns;
    const mine = { km: Math.round(run.km * 100) / 100, at: Date.now() };
    if (run.boost) mine.boost = true;
    list.push(mine);
    list.sort((a, b) => b.km - a.km || b.at - a.at);
    list.length = Math.min(list.length, KEEP_RUNS);
    state.lastRunAt = mine.at;
  }

  /** Найкращі забіги «Бігу»: [{km, at, boost?, old?, fresh?}]. Рекорд, збережений до появи історії, іде без дати (old). */
  function bestRuns(n) {
    const s = state.stats;
    const list = s.bestRuns.map((r) => ({ ...r, fresh: r.at === state.lastRunAt }));
    if (s.gameBest > 0 && !list.some((r) => r.km >= s.gameBest - 0.005)) list.push({ km: s.gameBest, old: true });
    list.sort((a, b) => b.km - a.km || (b.at || 0) - (a.at || 0));
    return list.slice(0, n);
  }

  /** Завершений забіг: { mode: "game" | "sunday" | "trail", km?, dist?, time?, boost? } */
  function record(run) {
    const s = state.stats;
    touchStreak();
    s.runs++;
    const earned = [];
    if (run.mode === "draw") {
      // «Малюнок дня»: кілометрів немає, лише лічильник забігів і серія днів
    } else if (run.mode === "game") {
      s.totalKm += run.km;
      s.gameBest = Math.max(s.gameBest, run.km);
      rememberRun(run);
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

  /** Віхи пробігу за рік (Titan Premium): 100 / 500 / 1000 км відкривають форму */
  function milestones(totalKm) {
    const earned = [];
    if (totalKm >= 100) earned.push("year100");
    if (totalKm >= 500) earned.push("year500");
    if (totalKm >= 1000) earned.push("year1000");
    const fresh = unlock(earned);
    if (fresh.length) {
      save();
      announce(fresh);
    }
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

  // ---------- Гаманець і бусти (Firestore profiles/{uid}) ----------
  // boosts — «Супер-кросівки» за промокод (скрізь), heads — «Розгін», куплений за монети (лише «Біг»),
  // coins — монети з «Бігу», earnAt — коли востаннє нараховували (правила обмежують швидкість заробітку),
  // buyDay/buyN — добовий ліміт купівель розгону за монети.
  const START_COINS = 50;
  const HEAD_PRICE = 100; // збігається з правилами Firestore
  const PROMO_COINS = 120; // монет за промокод (теж у правилах)
  const BUY_LIMIT = 5;
  const PENDING_KEY = "titan.pendingCoins.v1"; // монети, які не вдалося зберегти (немає зв'язку)

  let wallet = null; // { boosts, heads, coins, buyDay, buyN }
  let loading = null;

  // Київська доба (як у правилах: UTC+3, без урахування зимового зсуву в 1 годину)
  const buyDayNow = () => Math.floor((Date.now() + 3 * 3600 * 1000) / 864e5);

  async function profileRef() {
    const { db, uid } = await Leaderboard.connect();
    return { db, ref: db.collection("profiles").doc(uid), uid };
  }

  const stampNow = () => firebase.firestore.FieldValue.serverTimestamp();

  function toWallet(d) {
    return {
      boosts: d.boosts || 0,
      heads: d.heads || 0,
      coins: d.coins || 0,
      buyDay: d.buyDay || 0,
      buyN: d.buyN || 0,
      lvlSpd: d.lvlSpd || 0,
      lvlEnd: d.lvlEnd || 0,
      trainStat: d.trainStat || "",
      trainStart: d.trainStart && d.trainStart.toMillis ? d.trainStart.toMillis() : 0,
    };
  }

  // Рівні запам'ятовуємо на пристрої, щоб бонус діяв і до завантаження гаманця
  const LEVELS_KEY = "titan.levels.v1";
  function remember(w) {
    wallet = w;
    try {
      localStorage.setItem(LEVELS_KEY, JSON.stringify({ spd: w.lvlSpd, end: w.lvlEnd }));
    } catch (e) {}
    return w;
  }

  // Читає профіль; новачкові створює гаманець зі стартовими монетами, старому профілю (з бустами) додає гаманець
  async function loadWallet() {
    if (!Leaderboard.enabled) return remember(toWallet({}));
    if (loading) return loading;
    loading = (async () => {
      try {
        const { ref } = await profileRef();
        const snap = await ref.get();
        let data = snap.exists ? snap.data() : null;
        if (!data || data.coins === undefined) {
          const base = data ? { ...data } : { boosts: 0 };
          data = { ...base, coins: START_COINS, heads: 0, earnAt: stampNow(), updatedAt: stampNow() };
          await ref.set(data);
          data = (await ref.get()).data();
        }
        remember(toWallet(data));
        await flushPending();
      } catch (e) {
        wallet = wallet || toWallet({});
      }
      return wallet;
    })();
    try {
      return await loading;
    } finally {
      loading = null;
    }
  }

  const refreshBoosts = async () => (await loadWallet()).boosts;

  // Монети, які не вдалося записати, чекають у пам'яті пристрою до наступного разу
  const readPending = () => {
    try {
      return Math.max(0, parseInt(localStorage.getItem(PENDING_KEY), 10) || 0);
    } catch (e) {
      return 0;
    }
  };
  const writePending = (n) => {
    try {
      localStorage.setItem(PENDING_KEY, String(n));
    } catch (e) {}
  };

  async function flushPending() {
    const n = readPending();
    if (!n) return;
    try {
      await writeCoins(n);
      writePending(0);
    } catch (e) {}
  }

  async function writeCoins(n) {
    const { ref } = await profileRef();
    const snap = await ref.get();
    if (!snap.exists || snap.data().coins === undefined) throw new Error("no_wallet");
    const data = snap.data();
    await ref.set({ ...data, coins: data.coins + n, earnAt: stampNow(), updatedAt: stampNow() });
    remember(toWallet({ ...data, coins: data.coins + n }));
  }

  /** Монети за забіг у «Бігу»: додаємо в гаманець (якщо не вийшло — запам'ятовуємо на потім) */
  async function earnCoins(n) {
    n = Math.floor(n);
    if (!Leaderboard.enabled || !(n > 0)) return wallet;
    try {
      await loadWallet(); // створить гаманець, якщо його ще немає
      await writeCoins(n + readPending());
      writePending(0);
    } catch (e) {
      writePending(readPending() + n);
    }
    return wallet;
  }

  // Скільки розгонів за монети ще можна купити сьогодні
  function buysLeft() {
    const w = wallet || toWallet({});
    return w.buyDay === buyDayNow() ? Math.max(0, BUY_LIMIT - w.buyN) : BUY_LIMIT;
  }

  /** Купівля «Розгону» за монети: −100 монет, +1 розгін, до 5 на добу */
  async function buyHead() {
    const w = await loadWallet();
    if (w.coins < HEAD_PRICE) throw new Error("no_coins");
    if (!buysLeft()) throw new Error("limit");
    const { ref } = await profileRef();
    const snap = await ref.get();
    const data = snap.data();
    const day = buyDayNow();
    const buyN = data.buyDay === day ? (data.buyN || 0) + 1 : 1;
    const next = { ...data, coins: data.coins - HEAD_PRICE, heads: (data.heads || 0) + 1, buyDay: day, buyN, updatedAt: stampNow() };
    await ref.set(next);
    remember(toWallet(next));
    return wallet;
  }

  // Активація: в одній транзакції позначаємо код використаним і додаємо нагороду (reward: "boost" — буст, "coins" — 120 монет);
  // правила бази перевіряють обидва кроки
  async function redeem(raw, reward) {
    const code = String(raw || "").trim().toUpperCase();
    if (!/^[A-Z0-9-]{6,40}$/.test(code)) throw new Error("bad_code");
    await loadWallet();
    const { db, ref, uid } = await profileRef();
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : { boosts: 0 };
    const batch = db.batch();
    batch.update(db.collection("codes").doc(code), { used: true, usedBy: uid, usedAt: stampNow() });
    const asCoins = reward === "coins";
    const next = asCoins
      ? { ...data, coins: (data.coins || 0) + PROMO_COINS, lastCode: code, updatedAt: stampNow() }
      : { ...data, boosts: (data.boosts || 0) + 1, lastCode: code, updatedAt: stampNow() };
    batch.set(ref, next);
    try {
      await batch.commit();
    } catch (e) {
      throw new Error("invalid_code");
    }
    remember(toWallet(next));
    return wallet;
  }

  // Списати один буст на старті забігу; kind "head" — спершу розгін за монети, потім промокодний буст
  async function useBoost(kind) {
    const { ref } = await profileRef();
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : null;
    if (!data) throw new Error("no_boosts");
    let next;
    if (kind === "head" && data.heads > 0) next = { ...data, heads: data.heads - 1 };
    else if (data.boosts > 0) next = { ...data, boosts: data.boosts - 1 };
    else throw new Error("no_boosts");
    next.updatedAt = stampNow();
    await ref.set(next);
    remember(toWallet(next));
    return wallet;
  }

  // ---------- Прокачка: тренування з таймерами (правила Firestore перевіряють усе на сервері) ----------

  const STATS = {
    spd: { key: "lvlSpd", name: "Швидкість", icon: "⚡", hint: "біжиш швидше: до +10% до швидкості в «Бігу», «Неділі» й «Трейлі»" },
    end: { key: "lvlEnd", name: "Витривалість", icon: "🫁", hint: "енергія витрачається повільніше: до −10%" },
  };
  const MAX_LEVEL = 10;
  const SKIP_PER_HOUR = 15;

  const trainHours = (nextLevel) => (nextLevel <= 5 ? 4 : 8);
  const trainCost = (nextLevel) => 20 * nextLevel;

  /** Стан тренування: { active, stat, endsAt, left (мс), done, nextLevel } або null */
  function training() {
    const w = wallet;
    if (!w || !w.trainStat) return null;
    const nextLevel = w[STATS[w.trainStat].key] + 1;
    const endsAt = w.trainStart + trainHours(nextLevel) * 3600 * 1000;
    const left = endsAt - Date.now();
    return { stat: w.trainStat, nextLevel, endsAt, left: Math.max(0, left), done: left <= 0 };
  }

  // Ціна прискорення: 15 монет за кожну годину, що лишилась (округлення вгору)
  const skipCost = (leftMs) => Math.ceil((leftMs / 3600000) * SKIP_PER_HOUR);

  async function trainingWrite(change) {
    const { ref } = await profileRef();
    const snap = await ref.get();
    const data = snap.data();
    const next = change({ ...data });
    next.updatedAt = stampNow();
    await ref.set(next);
    const fresh = (await ref.get()).data();
    return remember(toWallet(fresh));
  }

  async function startTraining(stat) {
    const w = await loadWallet();
    if (!STATS[stat]) throw new Error("bad_stat");
    if (w.trainStat) throw new Error("busy");
    const next = w[STATS[stat].key] + 1;
    if (next > MAX_LEVEL) throw new Error("max");
    if (w.coins < trainCost(next)) throw new Error("no_coins");
    return trainingWrite((d) => ({ ...d, coins: d.coins - trainCost(next), trainStat: stat, trainStart: stampNow() }));
  }

  async function claimTraining() {
    const t = training();
    if (!t) throw new Error("none");
    return trainingWrite((d) => {
      const key = STATS[t.stat].key;
      const out = { ...d, [key]: (d[key] || 0) + 1 };
      delete out.trainStat;
      delete out.trainStart;
      return out;
    });
  }

  async function speedUpTraining() {
    const t = training();
    if (!t || t.done) throw new Error("none");
    const price = skipCost(t.left);
    if (wallet.coins < price) throw new Error("no_coins");
    const len = trainHours(t.nextLevel) * 3600 * 1000;
    // «Зсуваємо» початок так, щоб тренування вже закінчилось (із запасом на розбіжність годинників)
    const startedAt = firebase.firestore.Timestamp.fromMillis(Date.now() - len - 30 * 60 * 1000);
    return trainingWrite((d) => ({ ...d, coins: d.coins - price, trainStart: startedAt }));
  }

  // Бонуси прокачки: speed — множник швидкості (до 1.10), drain — множник витрати енергії (до 0.90)
  function bonus() {
    let spd = 0;
    let end = 0;
    if (wallet) {
      spd = wallet.lvlSpd;
      end = wallet.lvlEnd;
    } else {
      try {
        const c = JSON.parse(localStorage.getItem(LEVELS_KEY));
        spd = Math.max(0, Math.min(MAX_LEVEL, (c && c.spd) | 0));
        end = Math.max(0, Math.min(MAX_LEVEL, (c && c.end) | 0));
      } catch (e) {}
    }
    return { speed: 1 + 0.01 * spd, drain: 1 - 0.01 * end, lvl: spd + end };
  }

  // ---------- Перемикач «Взути супер-кросівки» («Неділя», «Трейл») і «Розгін» («Біг») ----------

  const forKind = (kind, w) => (kind === "head" ? w.heads + w.boosts : w.boosts);

  async function renderBoostToggle(label, kind) {
    const n = Leaderboard.enabled ? forKind(kind, await loadWallet()) : 0;
    label.hidden = !n;
    label.querySelector("input").checked = false;
    label.querySelector("small").textContent = `залишилось ${n}`;
  }

  // Списує буст, якщо гравець його вибрав; повертає true, якщо забіг буде з бустом
  async function takeBoost(label, kind) {
    const input = label.querySelector("input");
    if (label.hidden || !input.checked) return false;
    input.checked = false;
    try {
      const w = await useBoost(kind);
      const left = forKind(kind, w);
      label.querySelector("small").textContent = `залишилось ${left}`;
      label.hidden = !left;
      toast(kind === "head" ? "⚡ Розгін увімкнено на цей забіг!" : "⚡ Супер-кросівки взуто на цей забіг!");
      return true;
    } catch (e) {
      toast("Не вдалося увімкнути буст 😕");
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
    milestones,
    bestRuns,
    placed,
    toast,
    boosts: () => (wallet ? wallet.boosts : null),
    wallet: () => wallet,
    loadWallet,
    earnCoins,
    buyHead,
    buysLeft,
    HEAD_PRICE,
    STATS,
    MAX_LEVEL,
    trainHours,
    trainCost,
    skipCost,
    training,
    startTraining,
    claimTraining,
    speedUpTraining,
    bonus,
    level: () => bonus().lvl,
    PROMO_COINS,
    BUY_LIMIT,
    START_COINS,
    refreshBoosts,
    redeem,
    useBoost,
    renderBoostToggle,
    takeBoost,
  };
})();
