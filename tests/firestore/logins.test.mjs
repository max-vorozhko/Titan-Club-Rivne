import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, deleteDoc, deleteField, serverTimestamp } from "firebase/firestore";
const env = await initializeTestEnvironment({ projectId: "demo-titan", firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, "admins/admin@x.com"), { role: "admin" });
  await setDoc(doc(db, "athletes/a1"), { name: "Ірина Поліщук", persona: "Лис", emoji: "🦊", active: true, updatedAt: new Date() });
  await setDoc(doc(db, "athletes/a2"), { name: "Саша Остапчук", persona: "Вовк", emoji: "🐺", active: true, updatedAt: new Date() });
  // gl1 — залогінений і вже прив'язаний; gl2 — залогінений, ще не прив'язаний
  await setDoc(doc(db, "logins/gl1"), { email: "ira@x.com", displayName: "Ira", nick: "Іра", createdAt: new Date(), lastSeen: new Date(), athleteId: "a1" });
  await setDoc(doc(db, "logins/gl2"), { email: "new@x.com", displayName: "New", nick: "", createdAt: new Date(), lastSeen: new Date() });
});
const g = (uid, email, verified = true) => env.authenticatedContext(uid, { email, email_verified: verified, firebase: { sign_in_provider: "google.com" } }).firestore();
const gl1 = g("gl1", "ira@x.com"), gl2 = g("gl2", "new@x.com"), admin = g("adm", "admin@x.com");
const anon = env.authenticatedContext("anon1", { firebase: { sign_in_provider: "anonymous" } }).firestore();
const fresh = g("gl3", "fresh@x.com"), unverified = g("gl4", "u@x.com", false), nobody = env.unauthenticatedContext().firestore();
const ts = () => serverTimestamp();
const mk = (email, extra) => ({ email, displayName: "Хтось", nick: "Нік", createdAt: ts(), lastSeen: ts(), ...extra });

const cases = [
  // створення запису про вхід
  ["google user creates own login", () => setDoc(doc(fresh, "logins/gl3"), mk("fresh@x.com")), true],
  ["anonymous (no email) can't create login", () => setDoc(doc(anon, "logins/anon1"), mk("a@x.com")), false],
  ["unverified email can't create login", () => setDoc(doc(unverified, "logins/gl4"), mk("u@x.com")), false],
  ["can't create login with another email", () => setDoc(doc(g("gl5", "five@x.com"), "logins/gl5"), mk("other@x.com")), false],
  ["can't create login for another uid", () => setDoc(doc(g("gl6", "six@x.com"), "logins/gl7"), mk("six@x.com")), false],
  ["can't self-link athlete on create", () => setDoc(doc(g("gl8", "eight@x.com"), "logins/gl8"), mk("eight@x.com", { athleteId: "a1" })), false],
  ["nick longer than 20 rejected", () => setDoc(doc(g("gl9", "nine@x.com"), "logins/gl9"), mk("nine@x.com", { nick: "x".repeat(21) })), false],
  // оновлення гравцем
  ["player updates nick and lastSeen", () => updateDoc(doc(gl2, "logins/gl2"), { nick: "Новий", displayName: "New G", lastSeen: ts() }), true],
  ["player can't change email", () => updateDoc(doc(gl2, "logins/gl2"), { email: "hack@x.com", lastSeen: ts() }), false],
  ["player can't link himself to an athlete", () => updateDoc(doc(gl2, "logins/gl2"), { athleteId: "a2", linkedAt: ts(), linkedBy: "new@x.com", lastSeen: ts() }), false],
  ["linked player can't re-point his link", () => updateDoc(doc(gl1, "logins/gl1"), { athleteId: "a2" }), false],
  ["linked player can't remove his link", () => updateDoc(doc(gl1, "logins/gl1"), { athleteId: deleteField() }), false],
  // читання
  ["player reads own login", () => getDoc(doc(gl1, "logins/gl1")), true],
  ["player can't read someone else's login", () => getDoc(doc(gl1, "logins/gl2")), false],
  ["player can't list logins", () => getDocs(collection(gl1, "logins")), false],
  ["admin lists logins", () => getDocs(collection(admin, "logins")), true],
  ["admin reads any login", () => getDoc(doc(admin, "logins/gl1")), true],
  ["anonymous can't list logins", () => getDocs(collection(anon, "logins")), false],
  // прив'язка адміном
  ["admin links login to athlete", () => updateDoc(doc(admin, "logins/gl2"), { athleteId: "a2", linkedAt: ts(), linkedBy: "admin@x.com" }), true],
  ["admin can't link to a missing athlete", () => updateDoc(doc(admin, "logins/gl2"), { athleteId: "zzz", linkedAt: ts(), linkedBy: "admin@x.com" }), false],
  ["admin can't forge linkedBy", () => updateDoc(doc(admin, "logins/gl2"), { athleteId: "a1", linkedAt: ts(), linkedBy: "someone@x.com" }), false],
  ["admin can't change the email", () => updateDoc(doc(admin, "logins/gl2"), { email: "x@x.com" }), false],
  ["admin unlinks", () => updateDoc(doc(admin, "logins/gl1"), { athleteId: deleteField(), linkedAt: deleteField(), linkedBy: deleteField() }), true],
  // справжні імена: лише адміни й прив'язані (gl2 щойно прив'язали до a2; gl1 щойно відв'язали)
  ["linked member reads athletes", () => getDocs(collection(gl2, "athletes")), true],
  ["unlinked google user can't read athletes", () => getDocs(collection(gl1, "athletes")), false],
  ["google user without any login doc can't read athletes", () => getDocs(collection(fresh, "athletes")), false],
  ["anonymous can't read athletes", () => getDocs(collection(anon, "athletes")), false],
  ["unauthenticated can't read athletes", () => getDocs(collection(nobody, "athletes")), false],
  ["admin still reads athletes", () => getDocs(collection(admin, "athletes")), true],
  ["linked member can't write athletes", () => updateDoc(doc(gl2, "athletes/a1"), { name: "Хакер" }), false],
  ["linked member can't delete athletes", () => deleteDoc(doc(gl2, "athletes/a1")), false],
  ["linked member can't read runs", () => getDocs(collection(gl2, "runs")), false],
  ["linked member reads public club doc", () => getDoc(doc(gl2, "club/public")), true],
  ["admin deletes a login", () => deleteDoc(doc(admin, "logins/gl2")), true],
  ["after deleting the login the member loses access", () => getDocs(collection(gl2, "athletes")), false],
];
let fail = 0;
for (const [name, fn, ok] of cases) {
  try { await (ok ? assertSucceeds(fn()) : assertFails(fn())); console.log("✓", name); } catch (e) { fail++; console.log("✗", name, "—", e.message.split("\n")[0]); }
}
console.log(`${cases.length - fail}/${cases.length}`);
await env.cleanup(); process.exit(fail ? 1 : 0);
