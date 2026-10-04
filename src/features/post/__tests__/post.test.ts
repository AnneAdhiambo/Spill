import { describe, expect, it } from "vitest";
import { buildPostTemplate, PostLimitError } from "../buildPostEvent";
import { mergePosts, parsePostEvent } from "../feedEvent";

const sha = "b".repeat(64);

describe("buildPostTemplate", () => {
  it("builds her community tags, t=spill, content-warning and imeta, photo URL on the last line", () => {
    const t = buildPostTemplate(
      { text: "hi", communityId: "group-1", area: "Kibera", photo: { url: `http://x/media/${sha}`, sha256: sha, mime: "image/jpeg", sensitiveReason: "violence" } },
      1_700_000_000,
    );
    expect(t.kind).toBe(1);
    expect(t.tags.find((x) => x[0] === "h")).toEqual(["h", "group-1"]);
    expect(t.tags.some((x) => x[0] === "a")).toBe(true);
    expect(t.tags).toContainEqual(["t", "spill"]);
    expect(t.tags).toContainEqual(["content-warning", "violence"]);
    expect(t.content.split("\n").at(-1)).toBe(`http://x/media/${sha}`);
  });
  it("rejects over-limit content and bad scopes before signing", () => {
    expect(() => buildPostTemplate({ text: "x".repeat(16_001), communityId: "group-1" })).toThrow(PostLimitError);
    expect(() => buildPostTemplate({ text: "hi", communityId: "Activists!" })).toThrow(PostLimitError);
    expect(() => buildPostTemplate({ text: "hi", communityId: "group-1", area: "a".repeat(513) })).toThrow(PostLimitError);
  });
});

describe("feed parsing", () => {
  const ev = (content: string, tags: string[][] = []) => ({ id: "1".repeat(64), pubkey: "2".repeat(64), created_at: 1, tags, content });
  it("ignores empty content and keeps only the imeta hash", () => {
    expect(parsePostEvent(ev("   "), true)).toBeNull();
    const p = parsePostEvent(ev("hello\n\nhttp://h/media/" + sha, [["h", "group-2"], ["imeta", "url http://h/media/" + sha, "x " + sha]]), true)!;
    expect(p.text).toBe("hello");
    expect(p.photoSha256).toBe(sha);
    expect(p.communityId).toBe("group-2");
  });
  it("dedupes by id, earlier list wins", () => {
    const a = parsePostEvent(ev("a"), true)!;
    const b = { ...a, text: "b", onRelay: false };
    expect(mergePosts([a], [b])).toEqual([a]);
  });
});
