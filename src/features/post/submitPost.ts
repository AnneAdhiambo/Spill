import type { Event } from "nostr-tools"
import { createEventOperation, syncEngine, type SyncStatus } from "../../services/sync"
import { buildPostTemplate, type PostDraft } from "./buildPostEvent"
import { outboxAdd, publishToRelays, PUBLISH_DIRECT_TO_LOCAL, type RelayResult } from "./directPublish"
import type { Signer } from "./signer"

export type SubmitOutcome = {
  event: Event
  /** "duplicate" means this exact post was already in the queue. */
  enqueue: "ok" | "duplicate"
  /** Her engine's status after syncNow (undefined when offline and not attempted). */
  syncStatus: SyncStatus | undefined
  /** Per relay answers from the direct publish (empty when offline or disabled). */
  relayResults: RelayResult[]
  /** True only when some relay accepted the event. */
  posted: boolean
  /** True when a copy is kept in our own outbox, to send later. */
  inOutbox: boolean
}

/** Limits check, sign (session identity), queue in her SyncEngine, then try to publish. */
export async function submitPost(draft: PostDraft, signer: Signer, online: boolean): Promise<SubmitOutcome> {
  const template = buildPostTemplate(draft) // throws PostLimitError before anything is signed
  const event = await signer.sign(template) // signed once; never re-signed

  const op = createEventOperation("community_post", draft.communityId, event)
  const queued = await syncEngine.enqueue(op, "local")
  if (!queued.accepted && !queued.duplicate) throw new Error(`The sync queue refused this post: ${queued.reason}`)
  const opId = queued.accepted ? queued.operation.operationId : op.operationId

  const [syncStatus, relayResults] = await Promise.all([
    online ? syncEngine.syncNow(opId).catch(() => undefined) : Promise.resolve(undefined),
    online && PUBLISH_DIRECT_TO_LOCAL ? publishToRelays(event) : Promise.resolve([] as RelayResult[]),
  ])

  const directAccepted = relayResults.some((r) => r.accepted)
  let inOutbox = false
  if (PUBLISH_DIRECT_TO_LOCAL && !directAccepted) {
    try { await outboxAdd(event); inOutbox = true } catch (err) { console.warn("Could not save to the outbox", err) }
  }
  return {
    event,
    enqueue: queued.accepted ? "ok" : "duplicate",
    syncStatus,
    relayResults,
    posted: directAccepted || syncStatus === "synced",
    inOutbox,
  }
}
