import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
const env = await initializeTestEnvironment({ projectId: "demo-titan", firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const yest = new Date(Date.now() - 86400000);
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, "scores/p1"), { name: "Олег", km: 5, coins: 10, time: 100, updatedAt: yest });
  await setDoc(doc(db, "trail/7k/runs/p1"), { name: "Олег", time: 3000, stumbles: 1, dayStart: 3200, updatedAt: yest });
});
const p1 = env.authenticatedContext("p1").firestore();
const p2 = env.authenticatedContext("p2").firestore();
const p3 = env.authenticatedContext("p3").firestore();
const s = (km, extra) => ({ name: "Олег", km, coins: 10, time: 100, updatedAt: serverTimestamp(), ...extra });
const t = (time, extra) => ({ name: "Олег", time, stumbles: 1, updatedAt: serverTimestamp(), ...extra });
const cases = [
  ["new score with dayStart null", () => setDoc(doc(p2, "scores/p2"), s(3, { dayStart: null })), true],
  ["new score with fake dayStart rejected", () => setDoc(doc(p3, "scores/p3"), s(3, { dayStart: 50 })), false],
  ["improve: dayStart = old km", () => setDoc(doc(p1, "scores/p1"), s(6, { dayStart: 5 })), true],
  ["improve again same day: dayStart kept", () => setDoc(doc(p1, "scores/p1"), s(7, { dayStart: 5 })), true],
  ["fake dayStart rejected", () => setDoc(doc(p1, "scores/p1"), s(8, { dayStart: 40 })), false],
  ["old client without dayStart still ok", () => setDoc(doc(p1, "scores/p1"), s(9)), true],
  ["trail improve: dayStart = old time", () => setDoc(doc(p1, "trail/7k/runs/p1"), t(2900, { dayStart: 3000 })), true],
  ["trail: dayStart = old dayStart ok", () => setDoc(doc(p1, "trail/7k/runs/p1"), t(2800, { dayStart: 3000 })), true],
  ["trail: random dayStart rejected", () => setDoc(doc(p1, "trail/7k/runs/p1"), t(2700, { dayStart: 1234 })), false],
];
let fail = 0;
for (const [name, fn, ok] of cases) {
  try { await (ok ? assertSucceeds(fn()) : assertFails(fn())); console.log("✓", name); } catch (e) { fail++; console.log("✗", name, e.message.split("\n")[0]); }
}
console.log(`${cases.length - fail}/${cases.length}`);
await env.cleanup(); process.exit(fail ? 1 : 0);
