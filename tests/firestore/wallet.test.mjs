// Гаманець гравця profiles/{uid}: монети, «Розгін», промокоди, добовий ліміт
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, getDoc, setDoc, writeBatch, serverTimestamp, Timestamp } from "firebase/firestore";
const env = await initializeTestEnvironment({ projectId: "demo-titan", firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 } });
await env.clearFirestore();
const longAgo = Timestamp.fromMillis(Date.now() - 3600 * 1000); // година тому: дозволено ~4300 монет приросту
const today = Math.floor((Date.now() + 3 * 3600 * 1000) / 864e5);
const now = serverTimestamp();
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, "profiles/rich"), { boosts: 1, heads: 1, coins: 500, earnAt: longAgo, lastCode: "OLD-CODE1", updatedAt: new Date() });
  await setDoc(doc(db, "profiles/rich2"), { boosts: 0, heads: 0, coins: 900, earnAt: longAgo, buyDay: today, buyN: 4, updatedAt: new Date() });
  await setDoc(doc(db, "profiles/rich3"), { boosts: 0, heads: 0, coins: 900, earnAt: longAgo, buyDay: today, buyN: 5, updatedAt: new Date() });
  await setDoc(doc(db, "profiles/legacy"), { boosts: 1, lastCode: "OLD-CODE2", updatedAt: new Date() });
  await setDoc(doc(db, "profiles/fresh"), { boosts: 0, coins: 50, heads: 0, earnAt: new Date(), updatedAt: new Date() });
  await setDoc(doc(db, "codes/TR-AAAA-BBBB"), { used: false, createdAt: new Date() });
});
const u = (id) => env.authenticatedContext(id).firestore();
const P = (id) => (db) => doc(db, "profiles/" + id);
const base = (d, extra) => ({ ...d, updatedAt: now, ...extra });
const rich = { boosts: 1, heads: 1, coins: 500, earnAt: longAgo, lastCode: "OLD-CODE1" };
const rich2 = { boosts: 0, heads: 0, coins: 900, earnAt: longAgo, buyDay: today, buyN: 4 };
const rich3 = { ...rich2, buyN: 5 };
const rich4 = { ...rich2, buyDay: today - 1, buyN: 5 };
const legacy = { boosts: 1, lastCode: "OLD-CODE2" };
const fresh = { boosts: 0, coins: 50, heads: 0, earnAt: new Date() };

const cases = [
  ["new user gets 50 starter coins", () => setDoc(P("n1")(u("n1")), { boosts: 0, coins: 50, heads: 0, earnAt: now, updatedAt: now }), true],
  ["new user can't start with 5000 coins", () => setDoc(P("n2")(u("n2")), { boosts: 0, coins: 5000, heads: 0, earnAt: now, updatedAt: now }), false],
  ["new user can't start with a head start", () => setDoc(P("n3")(u("n3")), { boosts: 0, coins: 50, heads: 3, earnAt: now, updatedAt: now }), false],
  ["new user can't start with a boost and no code", () => setDoc(P("n4")(u("n4")), { boosts: 1, coins: 50, heads: 0, earnAt: now, updatedAt: now }), false],
  ["can't write someone else's profile", () => setDoc(P("n5")(u("zz")), { boosts: 0, coins: 50, heads: 0, earnAt: now, updatedAt: now }), false],
  ["can't read someone else's profile", () => getDoc(P("rich")(u("zz"))), false],
  ["reads own profile", () => getDoc(P("rich")(u("rich"))), true],

  ["legacy profile gets wallet (50)", () => setDoc(P("legacy")(u("legacy")), base(legacy, { coins: 50, heads: 0, earnAt: now })), true],
  ["legacy profile can't get 500", () => setDoc(P("legacy")(u("legacy")), base(legacy, { coins: 500, heads: 0, earnAt: now })), false],

  ["earn 20 coins right after creating", () => setDoc(P("fresh")(u("fresh")), base(fresh, { coins: 70, earnAt: now })), true],
  ["earn 500 coins right after creating rejected", () => setDoc(P("fresh")(u("fresh")), base(fresh, { coins: 550, earnAt: now })), false],
  ["earn without moving earnAt rejected", () => setDoc(P("rich")(u("rich")), base(rich, { coins: 520 })), false],
  ["earn 100 after an hour ok", () => setDoc(P("rich")(u("rich")), base(rich, { coins: 600, earnAt: now })), true],
  ["earn can't touch boosts", () => setDoc(P("rich")(u("rich")), base(rich, { coins: 520, earnAt: now, boosts: 5 })), false],
  ["coins can't go up without earnAt moving or via buy", () => setDoc(P("rich")(u("rich")), base(rich, { coins: 9999 })), false],

  ["buy head start for 100", () => setDoc(P("rich")(u("rich")), base(rich, { coins: 400, heads: 2, buyDay: today, buyN: 1 })), true],
  ["buy for 50 only rejected", () => setDoc(P("rich")(u("rich")), base(rich, { coins: 450, heads: 2, buyDay: today, buyN: 1 })), false],
  ["buy two for 100 rejected", () => setDoc(P("rich")(u("rich")), base(rich, { coins: 400, heads: 3, buyDay: today, buyN: 1 })), false],
  ["head start for free rejected", () => setDoc(P("rich")(u("rich")), base(rich, { heads: 2, buyDay: today, buyN: 1 })), false],
  ["buy with future day rejected", () => setDoc(P("rich")(u("rich")), base(rich, { coins: 400, heads: 2, buyDay: today + 1, buyN: 1 })), false],
  ["5th buy of the day ok", () => setDoc(P("rich2")(u("rich2")), base(rich2, { coins: 800, heads: 1, buyN: 5 })), true],
  ["6th buy of the day rejected", () => setDoc(P("rich3")(u("rich3")), base(rich3, { coins: 800, heads: 1, buyN: 6 })), false],
  ["can't reset the counter within the same day", () => setDoc(P("rich3")(u("rich3")), base(rich3, { coins: 800, heads: 1, buyN: 1 })), false],
  ["buy without counting it rejected", () => setDoc(P("rich3")(u("rich3")), base(rich3, { coins: 800, heads: 1, buyN: 5 })), false],
  ["new day resets counter", () => setDoc(P("rich4")(u("rich4")), base(rich4, { coins: 800, heads: 1, buyDay: today, buyN: 1 })), true],

  ["use head start", () => setDoc(P("rich")(u("rich")), base(rich, { heads: 0 })), true],
  ["use head start but sneak coins rejected", () => setDoc(P("rich")(u("rich")), base(rich, { heads: 0, coins: 5000 })), false],
  ["use boost", () => setDoc(P("rich")(u("rich")), base(rich, { boosts: 0 })), true],
  ["old client overwrite without wallet rejected", () => setDoc(P("rich")(u("rich")), { boosts: 0, lastCode: "OLD-CODE1", updatedAt: now }), false],
  ["can't give yourself a boost", () => setDoc(P("rich")(u("rich")), base(rich, { boosts: 5 })), false],

  ["redeem a code for 120 coins", async () => {
    const db = u("rich"); const b = writeBatch(db);
    b.update(doc(db, "codes/TR-AAAA-BBBB"), { used: true, usedBy: "rich", usedAt: now });
    b.set(P("rich")(db), base(rich, { coins: 620, lastCode: "TR-AAAA-BBBB" }));
    return b.commit();
  }, true],
  ["redeem for 300 coins rejected", async () => {
    const db = u("rich"); const b = writeBatch(db);
    b.update(doc(db, "codes/TR-AAAA-BBBB"), { used: true, usedBy: "rich", usedAt: now });
    b.set(P("rich")(db), base(rich, { coins: 800, lastCode: "TR-AAAA-BBBB" }));
    return b.commit();
  }, false],
  ["redeem for coins AND a boost rejected", async () => {
    const db = u("rich"); const b = writeBatch(db);
    b.update(doc(db, "codes/TR-AAAA-BBBB"), { used: true, usedBy: "rich", usedAt: now });
    b.set(P("rich")(db), base(rich, { coins: 620, boosts: 2, lastCode: "TR-AAAA-BBBB" }));
    return b.commit();
  }, false],
  ["120 coins without a code rejected", () => setDoc(P("rich")(u("rich")), base(rich, { coins: 620 })), false],
  ["120 coins reusing the old code rejected", () => setDoc(P("rich")(u("rich")), base(rich, { coins: 620, lastCode: "OLD-CODE1" })), false],
  ["redeem a code keeps wallet", async () => {
    const db = u("rich"); const b = writeBatch(db);
    b.update(doc(db, "codes/TR-AAAA-BBBB"), { used: true, usedBy: "rich", usedAt: now });
    b.set(P("rich")(db), base(rich, { boosts: 2, lastCode: "TR-AAAA-BBBB" }));
    return b.commit();
  }, true],
];
let pass = 0;
for (const [name, fn, ok] of cases) {
  // кожен кейс — на чистих даних, щоб вони не впливали один на одного
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, "profiles/rich"), { boosts: 1, heads: 1, coins: 500, earnAt: longAgo, lastCode: "OLD-CODE1", updatedAt: new Date() });
    await setDoc(doc(db, "profiles/rich2"), { boosts: 0, heads: 0, coins: 900, earnAt: longAgo, buyDay: today, buyN: 4, updatedAt: new Date() });
    await setDoc(doc(db, "profiles/rich3"), { boosts: 0, heads: 0, coins: 900, earnAt: longAgo, buyDay: today, buyN: 5, updatedAt: new Date() });
    await setDoc(doc(db, "profiles/rich4"), { boosts: 0, heads: 0, coins: 900, earnAt: longAgo, buyDay: today - 1, buyN: 5, updatedAt: new Date() });
    await setDoc(doc(db, "profiles/legacy"), { boosts: 1, lastCode: "OLD-CODE2", updatedAt: new Date() });
    await setDoc(doc(db, "profiles/fresh"), { boosts: 0, coins: 50, heads: 0, earnAt: new Date(), updatedAt: new Date() });
    await setDoc(doc(db, "codes/TR-AAAA-BBBB"), { used: false, createdAt: new Date() });
    for (const id of ["n1", "n2", "n3", "n4", "n5"]) await db.doc("profiles/" + id).delete();
  });
  let got = true;
  try { await (ok ? assertSucceeds(fn()) : assertFails(fn())); } catch (e) { got = false; }
  console.log((got ? "✓ " : "✗ ") + name);
  if (got) pass++;
}
console.log(`${pass}/${cases.length}`);
await env.cleanup();
process.exit(pass === cases.length ? 0 : 1);
