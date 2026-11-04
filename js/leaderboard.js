// Лідерборд на Firebase: анонімний вхід + Firestore, колекція scores/{uid} з кращим результатом гравця.
(function () {
  const NAME_KEY = "titan.name.v1";
  const SDK_VERSION = "11.10.0";
  const SDK = ["app", "auth", "firestore"].map(
    (m) => `https://cdn.jsdelivr.net/npm/firebase@${SDK_VERSION}/firebase-${m}-compat.js`
  );
  const TOP_N = 30;
  const cfg = window.TITAN_CONFIG || {};
  const enabled = !!(cfg.firebase && cfg.firebase.projectId);

  function read(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch (e) {
      return "";
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("sdk_load"));
      document.head.appendChild(s);
    });
  }

  // SDK вантажимо лише коли лідерборд увімкнено, і лише один раз
  let ready = null;
  function connect() {
    if (!ready) {
      ready = (async () => {
        for (const src of SDK) await loadScript(src);
        firebase.initializeApp(cfg.firebase);
        const auth = firebase.auth();
        const db = firebase.firestore();
        if (cfg.emulator) {
          auth.useEmulator("http://127.0.0.1:9099");
          db.useEmulator("127.0.0.1", 8080);
        }
        // Спершу чекаємо, поки Firebase відновить збереженого гравця (анонімного чи з Google), і лише потім
        // вирішуємо, чи входити анонімно: інакше вхід через Google загубився б при перезавантаженні
        await new Promise((resolve) => {
          const off = auth.onAuthStateChanged(() => { off(); resolve(); });
        });
        if (!auth.currentUser) await auth.signInAnonymously();
        return { db, auth, scores: db.collection("scores") };
      })();
      ready.catch(() => (ready = null));
    }
    // uid беремо щоразу заново: після входу через Google він може змінитися
    return ready.then((c) => ({ ...c, uid: c.auth.currentUser ? c.auth.currentUser.uid : null }));
  }

  // ---------- Зміна місця відносно вчора ----------
  // Кожен запис зберігає dayStart — свій результат на початок доби, коли його востаннє змінювали
  // (null — запис створено того дня). Звідси для всіх однаково видно «вчорашнє» місце.

  // Північ за київським часом, мс (незалежно від часового поясу телефона; див. js/kyiv.js)
  const dayStartMs = (now) => Kyiv.startOfDayMs(now);

  const millis = (t) => (t && t.toMillis ? t.toMillis() : null);

  // Значення dayStart для нового запису: результат на початок сьогоднішньої доби
  function nextDayStart(prev, field) {
    if (!prev) return null;
    const at = millis(prev.updatedAt);
    if (at !== null && at < dayStartMs()) return prev[field];
    return "dayStart" in prev ? prev.dayStart : prev[field];
  }

  // Результат запису на початок доби: число, null (з'явився сьогодні) або undefined (невідомо — старий запис)
  function startValue(d, field) {
    const at = millis(d.updatedAt);
    if (at === null) return undefined;
    if (at < dayStartMs()) return d[field];
    return "dayStart" in d ? d.dayStart : undefined;
  }

  // Місце = кількість кращих + 1, однаково для «зараз» і «вчора»
  function rankOf(value, values, lower) {
    return values.filter((v) => (lower ? v < value : v > value)).length + 1;
  }

  // docs: [{id, data}] → рядки, впорядковані за результатом, з move (▲/▼ на скільки місць) і isNew
  function withMoves(docs, field, lower, uid, knownBefore) {
    const sorted = docs
      .map((d) => ({ id: d.id, v: d.data[field], start: startValue(d.data, field), data: d.data }))
      .sort((a, b) => (lower ? a.v - b.v : b.v - a.v));
    const now = sorted.map((r) => r.v);
    // Вчорашня таблиця: невідомий старт вважаємо незмінним результатом
    const before = sorted.map((r) => (r.start === undefined ? r.v : r.start)).filter((v) => v !== null && v !== undefined);
    return sorted.map((r, i) => {
      const row = { id: r.id, place: i + 1, data: r.data, me: r.id === uid, move: 0, isNew: false };
      if (r.start === null) row.isNew = !(knownBefore && knownBefore.has(r.id));
      else if (r.start !== undefined) row.move = rankOf(r.start, before, lower) - rankOf(r.v, now, lower);
      return row;
    });
  }

  // compat-SDK не має агрегатного count(), тож рахуємо документи; для клубу це кілька сотень записів максимум
  async function countOf(query) {
    try {
      return (await query.get()).size;
    } catch (e) {
      return null;
    }
  }

  // Місце = кількість гравців з більшим результатом + 1
  async function placeOf(scores, km) {
    const above = await countOf(scores.where("km", ">", km));
    return above === null ? null : above + 1;
  }

  async function top() {
    const { scores, uid } = await connect();
    const snap = await scores.get();
    const all = withMoves(snap.docs.map((d) => ({ id: d.id, data: d.data() })), "km", false, uid);
    const rows = all.slice(0, TOP_N).map((r) => ({ place: r.place, name: r.data.name, km: r.data.km, coins: r.data.coins, me: r.me, move: r.move, isNew: r.isNew }));
    const mine = all.find((r) => r.me);
    const me = mine ? { place: rankOf(mine.data.km, all.map((r) => r.data.km), false), km: mine.data.km } : null;
    return { rows, me, total: all.length };
  }

  async function submit(run) {
    const { scores, uid } = await connect();
    const ref = scores.doc(uid);
    const name = read(NAME_KEY);
    const km = Math.round(run.km * 100) / 100;
    const own = await ref.get();
    const prev = own.exists ? own.data() : null;
    const stamp = firebase.firestore.FieldValue.serverTimestamp();
    let best = km;

    const dayStart = nextDayStart(prev, "km");
    if (prev && prev.km >= km) {
      // Рекорд не побито: лише оновлюємо ім'я, якщо його змінили
      best = prev.km;
      if (prev.name !== name) await ref.set({ ...prev, name, dayStart, updatedAt: stamp });
    } else {
      await ref.set({
        name,
        km,
        coins: Math.floor(run.coins),
        // Округлюємо вгору, щоб не порушити перевірку швидкості в правилах
        time: Math.ceil(run.time),
        dayStart,
        updatedAt: stamp,
      });
    }
    return { best, place: await placeOf(scores, best) };
  }

  // ---------- Недільна пробіжка: рейтинг тижня sunday/{понеділок}/{5k|10k}/{uid} ----------

  function sundayRuns(db, week, dist) {
    return db.collection("sunday").doc(week).collection(dist + "k");
  }

  // Найкращий (найменший) час гравця за тиждень на дистанції
  async function sundaySubmit(run) {
    const { db, uid } = await connect();
    const runs = sundayRuns(db, run.week, run.dist);
    const ref = runs.doc(uid);
    const name = read(NAME_KEY);
    const own = await ref.get();
    const prev = own.exists ? own.data() : null;
    const stamp = firebase.firestore.FieldValue.serverTimestamp();
    let best = run.time;
    const dayStart = nextDayStart(prev, "time");
    if (prev && prev.time <= run.time) {
      best = prev.time;
      if (prev.name !== name) await ref.set({ ...prev, name, dayStart, updatedAt: stamp });
    } else {
      // boost пишемо лише для забігів із бустом: звичайні результати сумісні й зі старими правилами
      const doc = { name, time: Math.round(run.time), stumbles: Math.floor(run.stumbles), dayStart, updatedAt: stamp };
      if (run.boost) doc.boost = true;
      await ref.set(doc);
    }
    const faster = await countOf(runs.where("time", "<", best));
    return { best, place: faster === null ? null : faster + 1 };
  }

  // opts.moves + opts.prevWeek: позначки ▲/▼/NEW для поточного тижня
  async function sundayTop(week, dist, limit, opts) {
    const { db, uid } = await connect();
    if (!(opts && opts.moves)) {
      const snap = await sundayRuns(db, week, dist).orderBy("time").limit(limit || TOP_N).get();
      return snap.docs.map((d, i) => ({ place: i + 1, name: d.data().name, time: d.data().time, boost: !!d.data().boost, me: d.id === uid }));
    }
    const [snap, prevSnap] = await Promise.all([
      sundayRuns(db, week, dist).get(),
      opts.prevWeek ? sundayRuns(db, opts.prevWeek, dist).get() : Promise.resolve(null),
    ]);
    const known = new Set(prevSnap ? prevSnap.docs.map((d) => d.id) : []);
    return withMoves(snap.docs.map((d) => ({ id: d.id, data: d.data() })), "time", true, uid, known)
      .slice(0, limit || TOP_N)
      .map((r) => ({ place: r.place, name: r.data.name, time: r.data.time, boost: !!r.data.boost, me: r.me, move: r.move, isNew: r.isNew }));
  }

  // ---------- Трейл: турнірна таблиця trail/{7k|13k|26k}/runs/{uid}, найкращий час за весь час ----------

  function trailRuns(db, dist) {
    return db.collection("trail").doc(dist + "k").collection("runs");
  }

  async function trailSubmit(run) {
    const { db, uid } = await connect();
    const runs = trailRuns(db, run.dist);
    const ref = runs.doc(uid);
    const name = read(NAME_KEY);
    const own = await ref.get();
    const prev = own.exists ? own.data() : null;
    const stamp = firebase.firestore.FieldValue.serverTimestamp();
    let best = run.time;
    const dayStart = nextDayStart(prev, "time");
    if (prev && prev.time <= run.time) {
      best = prev.time;
      if (prev.name !== name) await ref.set({ ...prev, name, dayStart, updatedAt: stamp });
    } else {
      // boost пишемо лише для забігів із бустом: звичайні результати сумісні й зі старими правилами
      const doc = { name, time: Math.round(run.time), stumbles: Math.floor(run.stumbles), dayStart, updatedAt: stamp };
      if (run.boost) doc.boost = true;
      await ref.set(doc);
    }
    const faster = await countOf(runs.where("time", "<", best));
    return { best, place: faster === null ? null : faster + 1 };
  }

  async function trailTop(dist, limit) {
    const { db, uid } = await connect();
    const snap = await trailRuns(db, dist).get();
    return withMoves(snap.docs.map((d) => ({ id: d.id, data: d.data() })), "time", true, uid)
      .slice(0, limit || TOP_N)
      .map((r) => ({ place: r.place, name: r.data.name, time: r.data.time, boost: !!r.data.boost, me: r.me, move: r.move, isNew: r.isNew }));
  }

  // ---------- Малюнок дня: draw/{titan|heart|star|rivne}/runs/{uid}, найкращий результат за малюнок ----------
  // key = бали·10000 − час у десятих секунди: більше — краще (спершу бали, при рівних швидший).

  const drawRuns = (db, id) => db.collection("draw").doc(id).collection("runs");

  async function drawSubmit(run) {
    const { db, uid } = await connect();
    const runs = drawRuns(db, run.id);
    const ref = runs.doc(uid);
    const name = read(NAME_KEY);
    const t = Math.min(36000, Math.max(10, Math.round(run.time * 10)));
    const points = Math.max(0, Math.min(1000, Math.round(run.points)));
    const key = points * 10000 - t;
    const own = await ref.get();
    const prev = own.exists ? own.data() : null;
    const stamp = firebase.firestore.FieldValue.serverTimestamp();
    const dayStart = nextDayStart(prev, "key");
    let best = { key, points, time: t / 10 };
    if (prev && prev.key >= key) {
      // Рекорд не побито: лише оновлюємо ім'я, якщо його змінили
      best = { key: prev.key, points: prev.points, time: prev.t / 10 };
      if (prev.name !== name) await ref.set({ ...prev, name, dayStart, updatedAt: stamp });
    } else {
      await ref.set({ name, points, t, key, dayStart, updatedAt: stamp });
    }
    const better = await countOf(runs.where("key", ">", best.key));
    return { best, place: better === null ? null : better + 1 };
  }

  async function drawTop(id, limit) {
    const { db, uid } = await connect();
    const snap = await drawRuns(db, id).get();
    return withMoves(snap.docs.map((d) => ({ id: d.id, data: d.data() })), "key", false, uid)
      .slice(0, limit || TOP_N)
      .map((r) => ({ place: r.place, name: r.data.name, points: r.data.points, time: r.data.t / 10, me: r.me, move: r.move, isNew: r.isNew }));
  }

  // Позначка біля імені: ▲2 / ▼1 / NEW (нічого, якщо місце не змінилось або невідомо)
  function moveBadge(r) {
    if (!r) return "";
    if (r.isNew) return ' <span class="mv mv--new" title="Новий у таблиці з учора">NEW</span>';
    if (r.move > 0) return ` <span class="mv mv--up" title="Піднявся з учора на ${r.move}">▲${r.move}</span>`;
    if (r.move < 0) return ` <span class="mv mv--down" title="Опустився з учора на ${-r.move}">▼${-r.move}</span>`;
    return "";
  }

  window.Leaderboard = {
    enabled,
    connect,
    getName: () => read(NAME_KEY),
    setName: (name) => write(NAME_KEY, name.trim().slice(0, 20)),
    top,
    submit,
    sundaySubmit,
    sundayTop,
    trailSubmit,
    trailTop,
    drawSubmit,
    drawTop,
    moveBadge,
    withMoves,
  };
})();
