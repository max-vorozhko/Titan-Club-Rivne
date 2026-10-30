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
        const cred = auth.currentUser ? { user: auth.currentUser } : await auth.signInAnonymously();
        return { db, uid: cred.user.uid, scores: db.collection("scores") };
      })();
      ready.catch(() => (ready = null));
    }
    return ready;
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
    const snap = await scores.orderBy("km", "desc").limit(TOP_N).get();
    const rows = snap.docs.map((d, i) => {
      const v = d.data();
      return { place: i + 1, name: v.name, km: v.km, coins: v.coins, me: d.id === uid };
    });
    let me = null;
    const mine = rows.find((r) => r.me);
    if (mine) me = { place: mine.place, km: mine.km };
    else {
      const own = await scores.doc(uid).get();
      if (own.exists) me = { place: await placeOf(scores, own.data().km), km: own.data().km };
    }
    const total = rows.length < TOP_N ? rows.length : await countOf(scores);
    return { rows, me, total };
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

    if (prev && prev.km >= km) {
      // Рекорд не побито: лише оновлюємо ім'я, якщо його змінили
      best = prev.km;
      if (prev.name !== name) await ref.set({ ...prev, name, updatedAt: stamp });
    } else {
      await ref.set({
        name,
        km,
        coins: Math.floor(run.coins),
        // Округлюємо вгору, щоб не порушити перевірку швидкості в правилах
        time: Math.ceil(run.time),
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
    if (prev && prev.time <= run.time) {
      best = prev.time;
      if (prev.name !== name) await ref.set({ ...prev, name, updatedAt: stamp });
    } else {
      await ref.set({ name, time: Math.round(run.time), stumbles: Math.floor(run.stumbles), updatedAt: stamp });
    }
    const faster = await countOf(runs.where("time", "<", best));
    return { best, place: faster === null ? null : faster + 1 };
  }

  async function sundayTop(week, dist, limit) {
    const { db, uid } = await connect();
    const snap = await sundayRuns(db, week, dist).orderBy("time").limit(limit || TOP_N).get();
    return snap.docs.map((d, i) => ({ place: i + 1, name: d.data().name, time: d.data().time, me: d.id === uid }));
  }

  window.Leaderboard = {
    enabled,
    getName: () => read(NAME_KEY),
    setName: (name) => write(NAME_KEY, name.trim().slice(0, 20)),
    top,
    submit,
    sundaySubmit,
    sundayTop,
  };
})();
