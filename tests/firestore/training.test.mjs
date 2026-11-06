// Прокачка: тренування з таймерами, прискорення, рівень у таблицях і послаблені межі рейтингів
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
const env = await initializeTestEnvironment({ projectId: "demo-titan", firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 } });
const H = 3600 * 1000; const T0 = Date.now();
const ago = (h) => Timestamp.fromMillis(Date.now() - h * H);
const now = serverTimestamp();
const longAgo = ago(100);
const d = new Date(); const wd = (d.getUTCDay() + 6) % 7;
const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - wd)).toISOString().slice(0, 10);

const seeds = {
  idle: { boosts: 0, coins: 1000, heads: 0, earnAt: longAgo },
  idle10: { boosts: 0, coins: 1000, heads: 0, earnAt: longAgo, lvlSpd: 10 },
  idleEnd5: { boosts: 0, coins: 1000, heads: 0, earnAt: longAgo, lvlEnd: 5 },
  poor: { boosts: 0, coins: 10, heads: 0, earnAt: longAgo },
  busy: { boosts: 0, coins: 1000, heads: 0, earnAt: longAgo, trainStat: "spd", trainStart: ago(0.5) },
  done: { boosts: 0, coins: 1000, heads: 0, earnAt: longAgo, trainStat: "spd", trainStart: ago(5) },
  done6: { boosts: 0, coins: 1000, heads: 0, earnAt: longAgo, lvlEnd: 5, trainStat: "end", trainStart: ago(5) },
  done6ok: { boosts: 0, coins: 1000, heads: 0, earnAt: longAgo, lvlEnd: 5, trainStat: "end", trainStart: ago(9) },
  skip: { boosts: 0, coins: 1000, heads: 0, earnAt: longAgo, trainStat: "spd", trainStart: ago(1) },
  lv: { boosts: 0, coins: 50, heads: 0, earnAt: longAgo, lvlSpd: 2, lvlEnd: 1 },
};
const reseed = async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const [id, v] of Object.entries(seeds)) await setDoc(doc(db, "profiles/" + id), { ...v, updatedAt: new Date() });
  });
};
const u = (id) => env.authenticatedContext(id).firestore();
const P = (id) => doc(u(id), "profiles/" + id);
const w = (id, extra) => setDoc(P(id), { ...seeds[id], updatedAt: now, ...extra });
const wOmit = (id, extra, omit) => { const o = { ...seeds[id], updatedAt: now, ...extra }; omit.forEach((k) => delete o[k]); return setDoc(P(id), o); };
const run = (km, time, extra) => ({ name: "Олег", km, coins: 10, time, updatedAt: now, ...extra });
const sun = (time, extra) => ({ name: "Олег", time, stumbles: 1, updatedAt: now, ...extra });

const cases = [
  ["start training: −20 coins, level 1, 4 h", () => w("idle", { coins: 980, trainStat: "spd", trainStart: now }), true],
  ["start with wrong price rejected", () => w("idle", { coins: 990, trainStat: "spd", trainStart: now }), false],
  ["start with start time in the past rejected", () => w("idle", { coins: 980, trainStat: "spd", trainStart: ago(5) }), false],
  ["start while another training is active rejected", () => w("busy", { coins: 980, trainStat: "end", trainStart: now }), false],
  ["start at max level rejected", () => w("idle10", { coins: 780, trainStat: "spd", trainStart: now }), false],
  ["start level 6 costs 120", () => w("idleEnd5", { coins: 880, trainStat: "end", trainStart: now }), true],
  ["start level 6 for 20 rejected", () => w("idleEnd5", { coins: 980, trainStat: "end", trainStart: now }), false],
  ["start without enough coins rejected", () => w("poor", { coins: -10, trainStat: "spd", trainStart: now }), false],
  ["start can't also bump level", () => w("idle", { coins: 980, trainStat: "spd", trainStart: now, lvlSpd: 1 }), false],

  ["claim before time rejected", () => wOmit("busy", { lvlSpd: 1 }, ["trainStat", "trainStart"]), false],
  ["claim after 4 h: +1 level", () => wOmit("done", { lvlSpd: 1 }, ["trainStat", "trainStart"]), true],
  ["claim +2 levels rejected", () => wOmit("done", { lvlSpd: 2 }, ["trainStat", "trainStart"]), false],
  ["claim bumps the wrong stat rejected", () => wOmit("done", { lvlEnd: 1 }, ["trainStat", "trainStart"]), false],
  ["claim while keeping the timer rejected", () => w("done", { lvlSpd: 1 }), false],
  ["level 6 needs 8 h: after 5 h rejected", () => wOmit("done6", { lvlEnd: 6 }, ["trainStat", "trainStart"]), false],
  ["level 6 after 9 h ok", () => wOmit("done6ok", { lvlEnd: 6 }, ["trainStat", "trainStart"]), true],
  ["claim can't change coins", () => wOmit("done", { lvlSpd: 1, coins: 5000 }, ["trainStat", "trainStart"]), false],

  ["speed up: 3 h left = 45 coins", () => w("skip", { coins: 955, trainStart: ago(5) }), true],
  ["speed up: 48 coins (±3) ok", () => w("skip", { coins: 952, trainStart: ago(5) }), true],
  ["speed up: 30 coins rejected", () => w("skip", { coins: 970, trainStart: ago(5) }), false],
  ["speed up for free rejected", () => w("skip", { trainStart: ago(5) }), false],
  ["speed up but not far enough rejected", () => w("skip", { coins: 955, trainStart: ago(3) }), false],
  ["speed up can't add coins", () => w("skip", { coins: 1200, trainStart: ago(5) }), false],
  ["speed up can't change stat", () => w("skip", { coins: 955, trainStart: ago(5), trainStat: "end" }), false],

  ["score with lvl 3 (real 3) ok", () => setDoc(doc(u("lv"), "scores/lv"), run(5, 100, { lvl: 3 })), true],
  ["score with lvl 4 (real 3) rejected", () => setDoc(doc(u("lv"), "scores/lv"), run(5, 100, { lvl: 4 })), false],
  ["score with lvl without a profile rejected", () => setDoc(doc(u("nop"), "scores/nop"), run(5, 100, { lvl: 1 })), false],
  ["+10% speed (0.29 km/s) with lvl ok", () => setDoc(doc(u("lv"), "scores/lv"), run(29, 100, { lvl: 3 })), true],
  ["0.29 km/s without lvl rejected", () => setDoc(doc(u("lv"), "scores/lv"), run(29, 100)), false],
  ["0.31 km/s even with lvl rejected", () => setDoc(doc(u("lv"), "scores/lv"), run(31, 100, { lvl: 3 })), false],
  ["sunday 5 km at 185 s/km with lvl ok", () => setDoc(doc(u("lv"), `sunday/${monday}/5k/lv`), sun(925, { lvl: 3 })), true],
  ["sunday 5 km at 185 s/km without lvl rejected", () => setDoc(doc(u("lv"), `sunday/${monday}/5k/lv`), sun(925)), false],
  ["sunday at 170 s/km with lvl rejected", () => setDoc(doc(u("lv"), `sunday/${monday}/5k/lv`), sun(850, { lvl: 3 })), false],
  ["trail 7 km at 135 s/km with lvl ok", () => setDoc(doc(u("lv"), "trail/7k/runs/lv"), sun(945, { lvl: 3 })), true],
  ["trail 7 km at 135 s/km without lvl rejected", () => setDoc(doc(u("lv"), "trail/7k/runs/lv"), sun(945)), false],
  ["lvl 0 is not allowed as a field", () => setDoc(doc(u("lv"), "scores/lv"), run(5, 100, { lvl: 0 })), false],
];
let pass = 0;
for (const [name, fn, ok] of cases) {
  await reseed();
  let got = true;
  try { await (ok ? assertSucceeds(fn()) : assertFails(fn())); } catch (e) { got = false; }
  console.log((got ? "✓ " : "✗ ") + name + "  [" + Math.round((Date.now() - T0) / 1000) + "s]");
  if (got) pass++;
}
console.log(`${pass}/${cases.length}`);
await env.cleanup();
process.exit(pass === cases.length ? 0 : 1);
