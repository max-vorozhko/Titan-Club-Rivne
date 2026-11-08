// Пробіг з початку року (Titan Premium): yearKm/{рік}/members/{athleteId}
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, getDoc, getDocs, collection, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
const env = await initializeTestEnvironment({ projectId: "demo-titan", firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 } });
const Y = new Date().getUTCFullYear();
const now = serverTimestamp();
const mine = `yearKm/${Y}/members/a1`;
const seed = { base: 100, added: 0, total: 100, log: [] };
const withLog = { base: 100, added: 30, total: 130, log: [{ k: 10, t: 1 }, { k: 20, t: 2 }] };
const reseed = async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, "admins/adm@x.com"), { role: "admin" });
    await setDoc(doc(db, "athletes/a1"), { name: "Ірина Поліщук", persona: "Лис", emoji: "🦊", active: true, updatedAt: new Date() });
    await setDoc(doc(db, "athletes/a2"), { name: "Саша Остапчук", persona: "Ведмідь", emoji: "🐻", active: true, updatedAt: new Date() });
    await setDoc(doc(db, "logins/u1"), { email: "ira@x.com", displayName: "Ira", nick: "", athleteId: "a1", createdAt: new Date(), lastSeen: new Date() });
    await setDoc(doc(db, "logins/u2"), { email: "free@x.com", displayName: "Free", nick: "", createdAt: new Date(), lastSeen: new Date() });
    await setDoc(doc(db, mine), { ...seed, updatedAt: new Date() });
    await setDoc(doc(db, `yearKm/${Y}/members/a2`), { ...seed, updatedAt: new Date() });
    await setDoc(doc(db, `yearKm/${Y}/members/a3`), { ...withLog, updatedAt: new Date() });
  });
};
const member = () => env.authenticatedContext("u1", { email: "ira@x.com", email_verified: true, firebase: { sign_in_provider: "google.com" } }).firestore();
const free = () => env.authenticatedContext("u2", { email: "free@x.com", email_verified: true, firebase: { sign_in_provider: "google.com" } }).firestore();
const admin = () => env.authenticatedContext("adm", { email: "adm@x.com", email_verified: true, firebase: { sign_in_provider: "google.com" } }).firestore();
const anon = () => env.authenticatedContext("anon1", { firebase: { sign_in_provider: "anonymous" } }).firestore();
const put = (db, path, o) => setDoc(doc(db, path), { ...o, updatedAt: now });

const cases = [
  ["member reads leaderboard", () => getDocs(collection(member(), `yearKm/${Y}/members`)), true],
  ["admin reads leaderboard", () => getDocs(collection(admin(), `yearKm/${Y}/members`)), true],
  ["unlinked google user can't read", () => getDocs(collection(free(), `yearKm/${Y}/members`)), false],
  ["anonymous can't read", () => getDocs(collection(anon(), `yearKm/${Y}/members`)), false],

  ["member creates own doc", () => put(member(), mine, seed), true],
  ["member can't create for another athlete", () => put(member(), `yearKm/${Y}/members/a9`, seed), false],
  ["unlinked user can't create", () => put(free(), `yearKm/${Y}/members/a1`, seed), false],
  ["can't create for a future year", () => put(member(), `yearKm/${Y + 1}/members/a1`, seed), false],
  ["can't create for two years ago", () => put(member(), `yearKm/${Y - 2}/members/a1`, seed), false],
  ["create with huge base rejected", () => put(member(), `yearKm/${Y}/members/a1`, { ...seed, base: 29000, total: 29000 }), false],
  ["create with added > 0 rejected", () => put(member(), `yearKm/${Y}/members/a1`, { base: 10, added: 5, total: 15, log: [] }), false],
  ["create with wrong total rejected", () => put(member(), `yearKm/${Y}/members/a1`, { ...seed, total: 500 }), false],

  ["set base to 150", () => put(member(), mine, { ...seed, base: 150, total: 150 }), true],
  ["set base: total must match", () => put(member(), mine, { ...seed, base: 150, total: 999 }), false],
  ["set base too high for the date rejected", () => put(member(), mine, { ...seed, base: 29999, total: 29999 }), false],
  ["add 10 km with log", () => put(member(), mine, { ...seed, added: 10, total: 110, log: [{ k: 10, t: 5 }] }), true],
  ["add 100 km at once ok", () => put(member(), mine, { ...seed, added: 100, total: 200, log: [{ k: 100, t: 5 }] }), true],
  ["add 101 km at once rejected", () => put(member(), mine, { ...seed, added: 101, total: 201, log: [{ k: 101, t: 5 }] }), false],
  ["add without logging rejected", () => put(member(), mine, { ...seed, added: 10, total: 110 }), false],
  ["add and change base together rejected", () => put(member(), mine, { base: 50, added: 10, total: 60, log: [{ k: 10, t: 5 }] }), false],
  ["add with wrong total rejected", () => put(member(), mine, { ...seed, added: 10, total: 500, log: [{ k: 10, t: 5 }] }), false],
  ["member can't verify own km", () => put(member(), mine, { ...seed, verifiedKm: 100 }), false],
  ["member can't touch another's doc", () => put(member(), `yearKm/${Y}/members/a2`, { ...seed, base: 5, total: 5 }), false],
  ["member can't delete", () => deleteDoc(doc(member(), mine)), false],
  ["undo last addition", () => put(member(), `yearKm/${Y}/members/a1`, { ...withLog, added: 20, total: 120, log: [{ k: 20, t: 2 }] }), "a3undo"],

  ["admin verifies", () => put(admin(), mine, { ...seed, verifiedKm: 100, verifiedAt: now }), true],
  ["admin overrides a member's total", () => put(admin(), `yearKm/${Y}/members/a2`, { base: 500, added: 0, total: 500, log: [] }), true],
  ["admin creates for athlete without login", () => put(admin(), `yearKm/${Y}/members/a7`, { base: 12, added: 0, total: 12, log: [] }), true],
  ["admin deletes", () => deleteDoc(doc(admin(), mine)), true],
  ["admin can't write a wrong total", () => put(admin(), mine, { ...seed, total: 5 }), false],
];
let pass = 0;
for (const [name, fn, ok] of cases) {
  await reseed();
  // кейси «create» і «can't create»: починаємо без документа учасника
  if (/creates|can't create|create with|unlinked user can't create/.test(name)) await env.withSecurityRulesDisabled(async (c) => deleteDoc(doc(c.firestore(), mine)));
  let got = true;
  try {
    if (ok === "a3undo") {
      // undo: логін u1 прив'язаний до a1, тому для цього кейсу готуємо a1 із двома додаваннями
      await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), mine), { ...withLog, updatedAt: new Date() }));
      await assertSucceeds(fn());
    } else await (ok ? assertSucceeds(fn()) : assertFails(fn()));
  } catch (e) { got = false; }
  console.log((got ? "✓ " : "✗ ") + name);
  if (got) pass++;
}
console.log(`${pass}/${cases.length}`);
await env.cleanup();
process.exit(pass === cases.length ? 0 : 1);
