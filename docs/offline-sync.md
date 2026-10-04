# Offline store-and-forward + Bluetooth sync

Spill keeps working without internet: previously viewed community posts stay
readable, new posts and community joins are saved on the device, and they
publish automatically once a relay is reachable. Queued items can also be
handed to a nearby device, which publishes them if it gets online first.

## Architecture

```text
             communityService (createPost / joinCommunity / getPosts)
                                 │
                          ┌──────▼──────┐
                          │ Sync Engine │  src/services/sync/SyncEngine.ts
                          └──────┬──────┘
                 ┌───────────────┴───────────────┐
           NostrTransport                 NearbyShareTransport
           role: upstream                 role: peer
           (relays — marks synced)        (Bluetooth / Quick Share / AirDrop)
                 └───────────────┬───────────────┘
                          ┌──────▼──────┐
                          │ Sync Queue  │  IndexedDB `spill_offline.sync_queue`
                          └──────┬──────┘
                          ┌──────▼──────┐
                          │ Local Cache │  IndexedDB `spill_offline.local_cache`
                          └─────────────┘
```

There is one queue and one engine. Every operation, whether created by the
user or received from a nearby device, enters through `syncEngine.enqueue()`,
which validates, deduplicates and persists it. Transports only move data:

- **upstream** transports (`NostrTransport`) deliver to the network of record.
  An operation becomes `synced` only after a relay answers `OK`.
- **peer** transports (`NearbyShareTransport`) hand copies to another device.
  They never mark anything synced.

## What is synced

All offline-capable actions are signed Nostr events, created and signed once
on the author's device:

| Entity           | Nostr kind | Operation |
| ---------------- | ---------- | --------- |
| `community_post` | 1          | create    |
| `community_join` | 9021       | create    |

The queue stores the **signed event**, and every transport forwards it
unchanged. It is never re-signed, so its id and signature stay the same
across retries and devices.

## Idempotency

- Each operation has a UUID `operationId`. The queue's primary key is
  `operationId` and it has a unique index on `entityId` (the event id), so
  IndexedDB rejects duplicates atomically, including concurrent ones.
- Relays deduplicate by event id (NIP-01). An event id is the hash of the
  signed content, so a retry after a lost response, or the same post arriving
  through A and through B, is stored once. The relay answers
  `OK true "duplicate: …"`, which counts as success.

## States and retries

`pending → syncing → synced`, or `syncing → retrying → … → failed`.

- Attempts only happen when the device isn't known to be offline. Being
  offline doesn't use up retries.
- Backoff starts at 5 s and doubles each time (with ±20% jitter), capped at
  5 minutes. After 8 attempts the operation becomes `failed`.
- Relay protocol rejections (`invalid:`, `blocked:`, `pow:`, `restricted:`
  from every relay) are marked `failed` immediately.
- `failed` operations stay queued and are never deleted silently. The post
  shows **Retry**, which gives the operation a fresh retry budget.
- An operation left in `syncing` when the app closed is requeued on the next
  start.
- `synced` operations are kept for 7 days (for status display and
  deduplication), then pruned.

The UI never claims success early. The composer says "Posted." only after a
relay confirmed. Otherwise it says "Post saved on this device. It will sync
when you're back online." Posts show ○ Waiting for connection / ↻ Syncing… /
⚠ Couldn't sync — we'll retry / ✓ Synced.

## Pulling changes

`getPosts(communityId)` asks the engine to pull changes since the last
successful pull, stores them in the local cache, then renders from the cache,
so the feed looks the same online and offline. Viewed communities are also
refreshed in the background.

Nostr relays have no server sequence numbers, so the cursor is the newest
`created_at` seen, re-queried with a 5-minute overlap. Cache writes are keyed
by event id, so the overlap is harmless. Author clocks can be wrong, so a post
backdated by more than the overlap window can be missed by incremental pulls.
That's an accepted MVP limitation.

Only posts from communities the user has viewed are cached, capped at 200 per
community. Keys, tokens and wallet data are never cached.

## Conflicts

There are none to resolve in this MVP. Posts and joins are create-only and
immutable (a signed Nostr event can't be edited), and joining twice is
harmless. No CRDTs and no last-write-wins rules are needed. If editable
entities are added later, they should use Nostr replaceable events, where the
newest `created_at` wins.

## Bluetooth (nearby) sync

Spill is a browser PWA. Web Bluetooth can only act as a client (central). A
browser can't advertise or run a GATT server, and iOS Safari has no Web
Bluetooth at all, so two Spill PWAs can't open a direct Bluetooth link. The
nearby transport therefore uses the OS share sheet, which is the Bluetooth
path the web platform does provide:

1. **Device A** taps **Share N waiting**. Spill packages the unsynced
   operations (at most 200) into a small `spill-sync-….txt` file and opens
   the share sheet: Bluetooth, Quick Share/Nearby Share, AirDrop. If file
   sharing isn't supported, the file is downloaded so it can be sent by
   Bluetooth from the file manager.
2. **Device B** opens it in Spill with **Receive file**, or, with the PWA
   installed on Android, picks Spill in the share menu (Web Share Target →
   service worker → `/communities?received=1`).
3. Each operation goes through `syncEngine.enqueue(op, "peer")`: the same
   validation, deduplication, queue and retries as local operations. Received
   posts appear in B's feed immediately, marked as waiting.
4. Whichever device reaches a relay first publishes. The other device's copy
   is a harmless duplicate.

The bundle contains only wire fields (`operationId`, `operationType`,
`entityType`, `entityId`, `scope`, `payload.event`, `createdAt`), never local
bookkeeping. A file is one-way, so instead of a "list ids, then request"
handshake, the sender sends everything pending and the receiver deduplicates
by `operationId` and `entityId`.

## Validation and security

`src/services/sync/validation.ts` treats every operation as untrusted JSON and
returns a freshly built object containing only known fields. It checks:

- UUID operation id, supported operation and entity type, community scope
- a well-formed NIP-01 event (hex id/pubkey/sig, size and tag limits)
- event kind matches the entity type, and the `h` tag matches the scope
- `entityId` equals the event id
- the timestamp is not more than 10 minutes in the future and not more than
  30 days old
- the event id hash and Schnorr signature (`verifyEvent`)

Operations are self-authorizing: a forwarding device can't alter content or
impersonate the author without breaking the signature. Received data is never
executed, and it can't write to storage except through `enqueue`. Bundles are
limited to 2 MB and 200 operations.

The queue and cache hold only signed public events. The sync code never logs
payloads, events, keys or queue contents. Errors keep only a short message.
Image attachments are kept only on the author's device and aren't part of
the queued event.

## Tests

```sh
npm test
```

`src/services/sync/__tests__/` covers offline creation, reconnection, lost
response retries, app restart, ordering of multiple operations, bounded
retries, pull cursors, validation, device-to-device transfer (two simulated
devices with separate IndexedDB instances), Bluetooth → internet forwarding,
duplicate transfers, B restarting, and invalid or tampered bundles.
