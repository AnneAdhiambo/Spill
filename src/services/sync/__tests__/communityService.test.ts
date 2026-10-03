import "fake-indexeddb/auto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeRelayTransport } from "./helpers";

// Minimal localStorage for the existing identity/post storage.
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
} as Storage;

const { createIdentity, saveIdentity } = await import("../../../features/identity/keys");
const { communityService } = await import("../../nostr/communityService");
const { syncEngine } = await import("..");
const { resetOfflineDb } = await import("../db");

const relay = new FakeRelayTransport();

beforeAll(() => {
  syncEngine.registerTransport(relay);
});

beforeEach(async () => {
  await resetOfflineDb();
  store.clear();
  saveIdentity(createIdentity());
  relay.available = true;
  relay.mode = "ok";
  relay.stored.clear();
  relay.pull = async () => ({ entries: [], cursor: null });
});

describe("communityService on the sync engine", () => {
  it("online: a post is published and reported as synced", async () => {
    const { post, synced } = await communityService.createPost("group-0", "online post", "");
    expect(synced).toBe(true);
    expect(relay.stored.has(post.id)).toBe(true);
    const feed = await communityService.getPosts("group-0");
    expect(feed.some((p) => p.id === post.id)).toBe(true);
  });

  it("offline: a post appears locally, is queued, and syncs on reconnect", async () => {
    relay.available = false;
    const { post, synced } = await communityService.createPost("group-0", "offline post", "");

    expect(synced).toBe(false);
    expect((await communityService.getPosts("group-0")).some((p) => p.id === post.id)).toBe(true);
    const [op] = await syncEngine.getAll();
    expect(op.entityId).toBe(post.id);
    expect(op.status).toBe("pending");

    relay.available = true;
    await syncEngine.flush();
    expect((await syncEngine.getAll())[0].status).toBe("synced");
    expect(relay.stored.get(post.id)?.content).toBe("offline post");
  });

  it("offline: joining marks the community joined and queues the join", async () => {
    relay.available = false;
    await communityService.joinCommunity("group-1", "");
    expect(communityService.getJoinedCommunities()).toContain("group-1");
    const [op] = await syncEngine.getAll();
    expect(op.entityType).toBe("community_join");
    expect(op.payload.event.kind).toBe(9021);
  });

  it("offline: previously loaded posts are served from the cache", async () => {
    relay.pull = async (scope) => ({
      entries: [
        {
          entityId: "a".repeat(64),
          entityType: "community_post",
          data: { id: "a".repeat(64), content: "cached remote post", pubkey: "b".repeat(64), createdAt: 1_700_000_000 },
          updatedAt: new Date().toISOString(),
          scope,
        },
      ],
      cursor: "1700000000",
    });
    await communityService.getPosts("group-2");

    relay.available = false; // offline now
    const feed = await communityService.getPosts("group-2");
    expect(feed.map((p) => ("content" in p ? p.content : ""))).toContain("cached remote post");
  });

  it("falls back to the sample reports for an empty community, as before", async () => {
    const feed = await communityService.getPosts("group-0");
    expect(feed.length).toBeGreaterThan(0);
    expect(feed.every((p) => "title" in p)).toBe(true);
  });
});
