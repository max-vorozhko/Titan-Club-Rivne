import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "demo-titan",
  firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
});
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, "admins/owner@x.com"), { role: "owner" });
  await setDoc(doc(db, "admins/second@x.com"), { role: "admin" });
  await setDoc(doc(db, "athletes/a1"), { name: "Тест Атлет", persona: "Лис", emoji: "🦊", active: true, updatedAt: new Date() });
  await setDoc(doc(db, "club/public"), { athletes: {}, runs: {}, updatedAt: new Date() });
  await setDoc(doc(db, "codes/TR-AAAA-BBBB"), { used: false, createdAt: new Date() });
});

const ctx = (uid, email, verified = true) => env.authenticatedContext(uid, email ? { email, email_verified: verified, firebase: { sign_in_provider: "google.com" } } : { firebase: { sign_in_provider: "anonymous" } }).firestore();
const owner = ctx("o1", "owner@x.com");
const second = ctx("s1", "second@x.com");
const stranger = ctx("x1", "stranger@x.com");
const unverified = ctx("u1", "owner@x.com", false);
const anon = ctx("anon1", null);
const nobody = env.unauthenticatedContext().firestore();
const oldDevice = ctx("L5F6ELplpsaOGeqSiOqiyoYPTBl1", null);

const athlete = { name: "Новий Атлет", persona: "Вовк", emoji: "🐺", active: true, updatedAt: serverTimestamp() };
const run = (email) => ({ date: "2026-11-08", km: 10, present: ["a1"], updatedBy: email, updatedAt: serverTimestamp() });
const code = () => ({ used: false, createdAt: serverTimestamp() });

const cases = [
  ["owner reads own admin doc", assertSucceeds(getDoc(doc(owner, "admins/owner@x.com")))],
  ["second reads own admin doc", assertSucceeds(getDoc(doc(second, "admins/second@x.com")))],
  ["second can't read owner's admin doc", assertFails(getDoc(doc(second, "admins/owner@x.com")))],
  ["stranger reads own (missing) admin doc", assertSucceeds(getDoc(doc(stranger, "admins/stranger@x.com")))],
  ["nobody can write admins", assertFails(setDoc(doc(owner, "admins/new@x.com"), { role: "owner" }))],

  ["owner reads athletes", assertSucceeds(getDocs(collection(owner, "athletes")))],
  ["second reads athletes", assertSucceeds(getDocs(collection(second, "athletes")))],
  ["stranger can't read athletes", assertFails(getDocs(collection(stranger, "athletes")))],
  ["anon player can't read athletes", assertFails(getDocs(collection(anon, "athletes")))],
  ["unverified email can't read athletes", assertFails(getDocs(collection(unverified, "athletes")))],
  ["second creates athlete", assertSucceeds(setDoc(doc(second, "athletes/a2"), athlete))],
  ["stranger can't create athlete", assertFails(setDoc(doc(stranger, "athletes/a3"), athlete))],
  ["bad athlete keys rejected", assertFails(setDoc(doc(owner, "athletes/a4"), { ...athlete, phone: "123" }))],

  ["second saves run", assertSucceeds(setDoc(doc(second, "runs/2026-45"), run("second@x.com")))],
  ["run with someone else's email rejected", assertFails(setDoc(doc(second, "runs/2026-44"), run("owner@x.com")))],
  ["run with km 500 rejected", assertFails(setDoc(doc(owner, "runs/2026-43"), { ...run("owner@x.com"), km: 500 }))],
  ["run with null km ok", assertSucceeds(setDoc(doc(owner, "runs/2026-42"), { ...run("owner@x.com"), km: null }))],
  ["bad run id rejected", assertFails(setDoc(doc(owner, "runs/hack"), run("owner@x.com")))],
  ["anon can't read runs", assertFails(getDocs(collection(anon, "runs")))],
  ["anon can't write runs", assertFails(setDoc(doc(anon, "runs/2026-41"), run("")))],

  ["anon reads club/public", assertSucceeds(getDoc(doc(anon, "club/public")))],
  ["unauthenticated reads club/public", assertSucceeds(getDoc(doc(nobody, "club/public")))],
  ["second writes club/public", assertSucceeds(setDoc(doc(second, "club/public"), { athletes: { a1: { p: "Лис", e: "🦊", a: true } }, runs: {}, updatedAt: serverTimestamp() }, { merge: true }))],
  ["anon can't write club/public", assertFails(setDoc(doc(anon, "club/public"), { athletes: {}, runs: {}, updatedAt: serverTimestamp() }))],
  ["stranger can't write club/public", assertFails(setDoc(doc(stranger, "club/public"), { athletes: {}, runs: {}, updatedAt: serverTimestamp() }))],
  ["real names can't sneak into club/public as new key", assertFails(setDoc(doc(owner, "club/public"), { names: ["x"], updatedAt: serverTimestamp() }, { merge: true }))],

  ["owner lists codes", assertSucceeds(getDocs(collection(owner, "codes")))],
  ["owner creates code", assertSucceeds(setDoc(doc(owner, "codes/TR-CCCC-DDDD"), code()))],
  ["second can't list codes", assertFails(getDocs(collection(second, "codes")))],
  ["second can't create code", assertFails(setDoc(doc(second, "codes/TR-EEEE-FFFF"), code()))],
  ["old owner device still lists codes", assertSucceeds(getDocs(collection(oldDevice, "codes")))],
  ["anon can't list codes", assertFails(getDocs(collection(anon, "codes")))],
  ["second can't delete code", assertFails(deleteDoc(doc(second, "codes/TR-AAAA-BBBB")))],
];
let fail = 0;
for (const [name, p] of cases) {
  try { await p; console.log("✓", name); } catch (e) { fail++; console.log("✗", name, "—", e.message.split("\n")[0]); }
}
console.log(`\n${cases.length - fail}/${cases.length} passed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
