import { SimplePool } from "nostr-tools";
import type { Event } from "nostr-tools";
import { NOSTR_RELAYS } from "./config";
import type { Signer } from "./signer";

export type PostPhoto = { url: string; sha256: string; mime: string };
export type PostInput = { text: string; area?: string; community?: string; photo?: PostPhoto | null };

export const pool = new SimplePool();

/** created_at rounded down to the nearest 10 minutes so the exact posting time is not revealed. */
export const roundedNow = () => Math.floor(Date.now() / 1000 / 600) * 600;

export async function publishPost(input: PostInput, signer: Signer): Promise<{ event: Event; accepted: number }> {
  const tags: string[][] = [["t", "spill"]];
  const area = input.area?.trim();
  if (area) tags.push(["area", area]);
  if (input.community) tags.push(["community", input.community]);
  // OPEN QUESTION: how communities are represented on Nostr (NIP-72 or a custom tag) and how "Join" gates posting.
  let content = input.text.trim();
  if (input.photo) {
    // NIP-92 imeta; the URL is also the last line of content so other Nostr clients show the photo.
    tags.push(["imeta", `url ${input.photo.url}`, `m ${input.photo.mime}`, `x ${input.photo.sha256}`]);
    content = `${content}\n\n${input.photo.url}`.trim();
  }
  const event = await signer.sign({ kind: 1, created_at: roundedNow(), tags, content });

  // Success only once at least one relay has accepted the event.
  const results = await Promise.allSettled(
    pool.publish(NOSTR_RELAYS, event).map((p) =>
      Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000))]),
    ),
  );
  const accepted = results.filter((r) => r.status === "fulfilled").length;
  if (accepted === 0) throw new Error("No relay accepted the post. Nothing was published.");
  return { event, accepted };
}
