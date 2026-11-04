import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, serverTimestamp } from "firebase/firestore";
const env = await initializeTestEnvironment({ projectId: "demo-titan", firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const yest = new Date(Date.now() - 86400000 * 1.5);
const d = (name, points, t, extra) => ({ name, points, t, key: points * 10000 - t, updatedAt: serverTimestamp(), ...extra });
await env.withSecurityRulesDisabled(async (c) => {
  await setDoc(doc(c.firestore(), "draw/heart/runs/p1"), { name: "Олег", points: 800, t: 120, key: 800 * 10000 - 120, updatedAt: yest });
});
const p1 = env.authenticatedContext("p1").firestore();
const p2 = env.authenticatedContext("p2").firestore();
const p3 = env.authenticatedContext("p3").firestore();
const anon = env.unauthenticatedContext().firestore();
const cases = [
  ["anyone reads the table", () => getDocs(collection(anon, "draw/heart/runs")), true],
  ["new result: dayStart null", () => setDoc(doc(p2, "draw/heart/runs/p2"), d("Ірина", 900, 150, { dayStart: null })), true],
  ["new result without dayStart (old client style) ok", () => setDoc(doc(p3, "draw/titan/runs/p3"), d("Макс", 700, 400)), true],
  ["new result with fake dayStart rejected", () => setDoc(doc(p3, "draw/star/runs/p3"), d("Макс", 700, 300, { dayStart: 5 })), false],
  ["improve: dayStart = old key", () => setDoc(doc(p1, "draw/heart/runs/p1"), d("Олег", 900, 130, { dayStart: 800 * 10000 - 120 })), true],
  ["worse result rejected", () => setDoc(doc(p1, "draw/heart/runs/p1"), d("Олег", 500, 130, { dayStart: 800 * 10000 - 120 })), false],
  ["rename with same result ok", () => setDoc(doc(p2, "draw/heart/runs/p2"), d("Ірина К", 900, 150, { dayStart: 900 * 10000 - 150 })), true],
  ["someone else's document rejected", () => setDoc(doc(p1, "draw/heart/runs/p2"), d("Хакер", 1000, 100)), false],
  ["unknown drawing rejected", () => setDoc(doc(p3, "draw/cat/runs/p3"), d("Макс", 700, 300)), false],
  ["points above 1000 rejected", () => setDoc(doc(p3, "draw/rivne/runs/p3"), d("Макс", 1001, 900)), false],
  ["key not matching points and time rejected", () => setDoc(doc(p3, "draw/rivne/runs/p3"), { name: "Макс", points: 900, t: 900, key: 99999999, updatedAt: serverTimestamp() }), false],
  ["impossibly fast 1000 points rejected (heart, 2 s)", () => setDoc(doc(p3, "draw/heart/runs/p3"), d("Макс", 1000, 20)), false],
  ["impossibly fast 950 points rejected (heart, 3.5 s)", () => setDoc(doc(p3, "draw/heart/runs/p3"), d("Макс", 950, 35)), false],
  ["realistic 977 points in 9.4 s accepted (heart)", () => setDoc(doc(p3, "draw/heart/runs/p3"), d("Макс", 977, 94)), true],
  ["low points quickly are fine (400 pts, 1.5 s)", () => setDoc(doc(env.authenticatedContext("p4").firestore(), "draw/star/runs/p4"), d("Новий", 400, 15)), true],
  ["time below 1 second rejected", () => setDoc(doc(env.authenticatedContext("p5").firestore(), "draw/star/runs/p5"), d("Новий", 100, 5)), false],
  ["name too short rejected", () => setDoc(doc(env.authenticatedContext("p6").firestore(), "draw/star/runs/p6"), d("А", 400, 200)), false],
  ["extra field rejected", () => setDoc(doc(env.authenticatedContext("p7").firestore(), "draw/star/runs/p7"), d("Новий", 400, 200, { admin: true })), false],
  ["unauthenticated write rejected", () => setDoc(doc(anon, "draw/star/runs/px"), d("Хтось", 400, 200)), false],
  ["delete rejected", () => deleteDoc(doc(p1, "draw/heart/runs/p1")), false],
];
let fail = 0;
for (const [name, fn, ok] of cases) {
  try { await (ok ? assertSucceeds(fn()) : assertFails(fn())); console.log("✓", name); } catch (e) { fail++; console.log("✗", name, "—", e.message.split("\n")[0]); }
}
console.log(`${cases.length - fail}/${cases.length}`);
await env.cleanup(); process.exit(fail ? 1 : 0);
