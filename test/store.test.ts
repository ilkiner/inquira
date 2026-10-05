import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { memoryStore } from "@/lib/store/memory";
import { createPostgresStore } from "@/lib/store/postgres";
import type { Store } from "@/lib/store/types";

// The same contract runs against the in-memory store and real Postgres (PGlite).
async function postgresStore(): Promise<Store> {
  const db = new PGlite();
  await db.exec(readFileSync(new URL("../db/0001_init.sql", import.meta.url), "utf8"));
  return createPostgresStore(async (text, params) => (await db.query(text, params)).rows as never);
}

const stores: [string, () => Promise<Store>][] = [
  ["memory", async () => memoryStore],
  ["postgres", postgresStore],
];

describe.each(stores)("%s store", (_, make) => {
  let store: Store;
  beforeAll(async () => {
    store = await make();
  });

  it("creates and reads a web conversation", async () => {
    const c = await store.createConversation();
    expect(c).toMatchObject({ channel: "web", externalUserId: null, stage: "new", mode: "ai", score: 0 });
    expect(c.visitorToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(await store.getConversation(c.id)).toMatchObject({ id: c.id, apiHistory: [] });
  });

  it("finds WhatsApp conversations by number", async () => {
    const number = `90555${Math.floor(Math.random() * 1e7)}`;
    const c = await store.createConversation({ channel: "whatsapp", externalUserId: number, whatsapp: `+${number}` });
    expect((await store.findConversationByExternalUser("whatsapp", number))?.id).toBe(c.id);
    expect(await store.findConversationByExternalUser("web", number)).toBeNull();
  });

  it("patches only the given fields", async () => {
    const c = await store.createConversation();
    await store.updateConversation(c.id, { name: "Anna", score: 55, stage: "qualifying" });
    await store.updateConversation(c.id, { country: "Germany" });
    expect(await store.getConversation(c.id)).toMatchObject({
      name: "Anna",
      country: "Germany",
      score: 55,
      stage: "qualifying",
    });
  });

  it("appends history in order", async () => {
    const c = await store.createConversation();
    await store.appendApiHistory(c.id, [{ role: "user", content: "a" }]);
    await store.appendApiHistory(c.id, [
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
    ]);
    expect((await store.getConversation(c.id))!.apiHistory.map((m) => m.content)).toEqual(["a", "b", "c"]);
  });

  it("lists messages, filters by time and tracks staff sync", async () => {
    const c = await store.createConversation();
    const first = await store.addMessage(c.id, "patient", "hello");
    const staff = await store.addMessage(c.id, "staff", "hi from Elif");
    expect((await store.listMessages(c.id)).map((m) => m.text)).toEqual(["hello", "hi from Elif"]);
    expect((await store.listMessages(c.id, first.createdAt)).map((m) => m.id)).toContain(staff.id);

    expect((await store.listUnsyncedStaffMessages(c.id)).map((m) => m.id)).toEqual([staff.id]);
    await store.markStaffMessagesSynced([staff.id]);
    expect(await store.listUnsyncedStaffMessages(c.id)).toEqual([]);
  });

  it("claims each event only once", async () => {
    const id = `wamid.${Math.random()}`;
    expect(await store.claimEvent(id)).toBe(true);
    expect(await store.claimEvent(id)).toBe(false);
  });

  it("lists conversations newest first without history", async () => {
    const older = await store.createConversation();
    const newer = await store.createConversation();
    await store.appendApiHistory(newer.id, [{ role: "user", content: "x" }]);
    const list = await store.listConversations();
    const ids = list.map((c) => c.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
  });
});
