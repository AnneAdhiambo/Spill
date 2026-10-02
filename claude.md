# CLAUDE.md — Private Cashu/Nostr Monetization Extension

## Context

This is an **existing application/repository**.

The feature described below is being implemented as an **extension to the existing application**, on a **new Git branch**.

### Critical instruction

**Do not rebuild, restructure, migrate, or replace the existing application architecture.**

Before writing code:

1. Inspect the repository structure.
2. Identify the existing frontend/backend architecture.
3. Identify the existing language(s), frameworks, database layer, authentication/identity system, and Nostr implementation.
4. Identify existing patterns for:

   * API requests
   * database access
   * authentication
   * state management
   * error handling
   * background jobs
   * testing
   * environment variables
5. Reuse the existing technologies and conventions wherever possible.
6. Do not introduce a new framework or language when the existing codebase already provides an appropriate solution.
7. Do not modify unrelated functionality.
8. Keep all changes isolated to this feature.
9. Work on a new branch dedicated to this feature.

The existing stack includes **JavaScript/TypeScript and/or Elixir**, depending on the existing repository structure. Use the actual technologies already present in the repo rather than assuming a stack.

---

# Feature: Private Cashu/Nostr Monetization

The goal is to add a privacy-oriented payment and monetization layer to the existing application.

The MVP has **exactly two monetization/payment mechanisms**:

1. **NIP-61 Cashu Nutzaps**
2. **Premium rooms**

Do NOT implement additional monetization systems during this feature.

---

# Product Principle

The application is privacy-first.

The core distinction is:

### Peer-to-peer zaps

Users should be able to support each other privately.

**Platform fee: 0%.**

Example:

```text
Alice ──100 sats──► Bob
```

The platform should not intercept or skim ordinary Nutzaps.

### Platform commerce

The platform earns revenue from premium infrastructure and communities.

Example:

```text
🔒 Join premium room
       ↓
    100 sats
       ↓
   Your platform
```

The product/business principle is:

> Users can support each other privately without the platform taking a cut, while the platform earns revenue from premium infrastructure and communities.

Do NOT implement:

> "We take 5% of every anonymous payment."

The MVP should remain small and technically understandable.

---

# Architecture

Use the following conceptual separation:

```text
NIP-61 / Cashu
       │
       └── peer-to-peer zaps

Cashu Payment Request
       │
       └── platform purchases

Existing application stack
(JS/TS/Elixir)
       │
       └── verifies access / entitlement

Postgres
       │
       └── stores entitlement, NOT balances
```

The existing application's architecture takes precedence over this conceptual diagram.

---

# 1. NIP-61 Cashu Nutzaps

Implement Cashu-based Nutzaps using the Nostr NIP-61 model.

## User flow

Example:

```text
Alice sees Bob's post
        ↓
Alice clicks "⚡ Zap"
        ↓
Alice chooses amount
        ↓
Client obtains Bob's Nutzap information
        ↓
Client creates a Cashu payment
        ↓
Payment is P2PK-locked to Bob's receiving key
        ↓
Client publishes the Nutzap event
        ↓
Bob's client detects the Nutzap
        ↓
Bob's Cashu wallet receives/redeems the funds
```

### Important

The backend should NOT become a custodial wallet for users.

Do not introduce:

* LNbits sub-wallets for every user
* platform-controlled Lightning wallets for users
* user balances stored in Postgres
* backend custody of user funds
* a 5% platform fee on Nutzaps

The user's Cashu wallet should remain on the appropriate client side according to the existing application's architecture.

---

# 2. Nutzap Identity

Use the application's existing Nostr identity system if one already exists.

Do not create a second identity system unnecessarily.

Nostr identity should remain separate from platform database identity where the existing architecture already makes that distinction.

NIP-61 should be used for receiving information.

The recipient's Nutzap information should include the information necessary for another user to create a valid Cashu payment.

Follow the relevant NIP-61 specification rather than inventing a proprietary payment protocol.

---

# 3. Cashu

Use an established Cashu implementation/library appropriate for the existing language and architecture.

If the existing client is JavaScript/TypeScript, investigate and use an established TypeScript Cashu implementation such as `cashu-ts` where appropriate.

Do not implement the Cashu cryptographic protocol manually.

Do not implement blind signatures, token proofs, keysets, or cryptographic primitives from scratch.

Use established libraries.

---

# 4. Mint Configuration

For the MVP, use a configured Cashu mint rather than building a new Cashu mint.

The mint URL should be configurable through environment configuration.

Example:

```env
CASHU_MINT_URL=...
```

Do not hardcode production credentials or secrets.

For development/testing, a test mint may be used where appropriate.

The implementation must make it possible to change the mint without rewriting the payment architecture.

---

# 5. Zap UI

Add a simple zap interaction to the existing UI.

Example:

```text
⚡ Zap
```

When clicked:

```text
10 sats
21 sats
50 sats
100 sats
Custom
```

The exact UI should follow the existing application's design system.

Do not introduce a new visual framework merely for this feature.

After a successful zap, provide a clear confirmation.

Example:

```text
⚡ 100 sats sent
```

For a received zap:

```text
⚡ You received 100 sats
```

The existing application should determine the appropriate UI components, notifications, and state-management patterns.

---

# 6. No Platform Fee on Nutzaps

This is a hard requirement.

If:

```text
Alice ──100 sats──► Bob
```

then:

```text
Bob = 100 sats
Platform = 0 sats
```

Do not implement a percentage fee, fixed fee, routing fee, or hidden deduction on Nutzaps.

If Cashu mint/swap/melt fees exist, they should be treated as Cashu infrastructure/payment costs rather than a platform revenue fee.

Do not represent those costs as platform revenue.

---

# 7. Premium Rooms

Implement the second monetization mechanism:

```text
🔒 Join premium room
       ↓
    payment
       ↓
   platform
       ↓
 access granted
```

A room should be able to have a premium/paid-access configuration.

At minimum, the room needs:

```text
is_premium
price
currency/unit
payment configuration
```

Follow the existing room/database architecture.

Do not create a parallel room system.

---

# 8. Premium Room Payment

Use a Cashu Payment Request or the appropriate established Cashu payment mechanism for the platform purchase.

The flow should conceptually be:

```text
User
 ↓
Select "Join premium room"
 ↓
Application creates/obtains payment request
 ↓
User pays using Cashu
 ↓
Payment is verified
 ↓
Application records entitlement
 ↓
User gains access
```

The application must verify payment before granting access.

Do not grant access merely because the client claims that payment succeeded.

---

# 9. Entitlements

Postgres should store **access entitlement**, not user monetary balances.

Example conceptual schema:

```text
room_entitlements
-----------------
id
room_id
user_id / nostr_pubkey
status
granted_at
expires_at
payment_reference
```

Use the existing application's identity conventions.

The database may store:

* whether the user has access
* when access was granted
* when access expires
* which room the entitlement applies to
* a payment/reference identifier necessary for reconciliation

The database should NOT become a Cashu wallet ledger.

Do not create:

```text
user_balance
cashu_balance
wallet_balance
```

unless the existing application already has a legitimate accounting requirement unrelated to this feature.

---

# 10. Premium Room Access

When a user attempts to enter a premium room:

```text
User
 ↓
Does entitlement exist?
 ↓
YES → allow access
 ↓
NO → show payment UI
```

If the entitlement has expired:

```text
expired
 ↓
deny premium access
 ↓
offer renewal
```

The exact entitlement duration should be configurable.

Do not hardcode assumptions about subscription duration if the existing product requirements do not specify one.

---

# 11. Payment Verification

Payment verification must happen server-side where necessary.

Never trust:

```text
client says payment succeeded
```

as sufficient evidence.

The backend/application must independently verify the payment according to the Cashu protocol/library being used.

Only after verification should the entitlement be persisted.

Use idempotency so that:

```text
same payment
same request
same webhook/event
same retry
```

cannot grant multiple entitlements or otherwise create inconsistent state.

---

# 12. Platform Revenue

The platform's revenue comes from:

```text
Premium rooms
```

not from ordinary peer-to-peer Nutzaps.

Conceptually:

```text
Nutzap:

Alice ─────────100 sats────────► Bob
Platform ───────────────────────► 0 sats


Premium room:

User ─────────100 sats──────────► Platform
                                   │
                                   ▼
                              Room access
```

If the application later introduces creator monetization, escrow, paid content, bounties, or other commercial mechanisms, treat those as separate future features.

Do not expand the scope of this implementation.

---

# 13. Security Requirements

This feature deals with payments and potentially sensitive users.

Follow these principles:

### Never store Cashu secrets unnecessarily

Do not send private wallet secrets to the backend.

### Never log Cashu proofs

Do not put Cashu proofs, wallet secrets, private keys, or sensitive payment tokens into:

* application logs
* analytics
* error tracking
* database debug logs
* browser console logs in production

### Never log payment contents unnecessarily

Keep payment-related logging minimal.

### No secrets in source control

Use environment variables/configuration for:

* mint URLs
* API credentials
* platform payment configuration
* signing keys
* other secrets

### Validate everything

Validate:

* amounts
* mint URLs
* room IDs
* payment references
* entitlement state
* expiration
* event signatures
* Cashu proofs/tokens

### Prevent replay

A successful Cashu payment must not be reusable to obtain unlimited premium-room access.

Use appropriate payment identifiers/state and idempotency.

---

# 14. Privacy Requirements

The privacy model is important.

Do not unnecessarily connect:

```text
Nostr identity
+
payment history
+
real-world identity
```

Do not add:

* email collection
* phone collection
* tracking SDKs
* advertising identifiers
* unnecessary analytics
* unnecessary payment history

as part of this feature.

The platform should know what is necessary to operate premium-room access, but should not collect additional sensitive information simply because the payment system makes it technically available.

---

# 15. Nostr/NIP Compliance

Do not invent custom event formats if an existing NIP already defines the required functionality.

For Nutzaps, follow:

* NIP-61
* relevant Cashu NUT specifications
* existing Nostr event conventions already used by the repository

Use the actual current specifications during implementation.

Do not assume that a previous implementation found online is correct.

---

# 16. Existing Repository First

Before implementation, inspect:

```text
package.json
mix.exs
config/
lib/
assets/
src/
priv/
database migrations
existing Nostr code
existing room code
existing authentication
existing UI components
existing tests
```

Only inspect directories that actually exist.

Determine:

```text
Where does frontend code live?
Where does backend code live?
Where are database schemas/migrations?
How are API calls implemented?
How are Nostr events currently represented?
How are rooms represented?
How is authentication handled?
How are environment variables handled?
How are tests structured?
```

Then implement using those patterns.

---

# 17. Branch

This feature must be implemented on a new branch.

Do not work directly on the main/default branch.

Use a descriptive branch name such as:

```text
feature/cashu-nutzaps-premium-rooms
```

Before modifying files, confirm the current git state and branch.

Do not overwrite unrelated uncommitted user work.

---

# 18. Dependency Policy

Before adding a dependency:

1. Check whether the repository already has an equivalent dependency.
2. Check whether the required functionality can be implemented using existing dependencies.
3. Prefer mature, established Cashu/Nostr libraries.
4. Avoid unnecessary dependencies.
5. Do not add an entire framework to implement one payment feature.

For cryptographic functionality, use established libraries.

Never implement cryptographic primitives manually.

---

# 19. Testing

At minimum, test:

### Nutzaps

```text
✓ recipient Nutzap configuration can be discovered
✓ zap amount is validated
✓ Cashu payment can be constructed
✓ payment is correctly associated with recipient
✓ Nutzap event is generated correctly
✓ recipient can detect the Nutzap
✓ duplicate Nutzap/payment cannot be processed twice
✓ invalid payment cannot be accepted
```

### Premium rooms

```text
✓ premium room requires payment
✓ unpaid user cannot access premium content
✓ successful payment grants entitlement
✓ duplicate payment does not create duplicate entitlement
✓ expired entitlement denies access
✓ valid entitlement grants access
✓ invalid payment cannot grant access
```

### Security

```text
✓ private keys are never sent to backend
✓ Cashu proofs are not logged
✓ payment verification is not client-trusted
✓ secrets are not committed
```

Use the repository's existing testing framework.

---

# 20. Implementation Order

Implement incrementally.

## Phase 1 — Understand existing architecture

Inspect the repository and identify:

* Nostr implementation
* user identity
* room implementation
* database
* frontend
* backend
* existing payment infrastructure

Do not code before understanding these pieces.

## Phase 2 — Cashu foundation

Add the appropriate Cashu dependency/library.

Configure the mint.

Create the minimum wallet/payment integration required for the client.

## Phase 3 — Nutzap receiving configuration

Implement the recipient's NIP-61 `kind:10019` configuration.

## Phase 4 — Nutzap sending

Implement:

```text
⚡ Zap
 ↓
amount
 ↓
Cashu token
 ↓
P2PK recipient
 ↓
NIP-61 Nutzap
```

## Phase 5 — Nutzap receiving

Implement detection and redemption of incoming Nutzaps.

## Phase 6 — Premium rooms

Add premium-room configuration and UI.

## Phase 7 — Cashu platform payment

Implement the Cashu payment request flow for premium-room access.

## Phase 8 — Entitlements

Persist verified access entitlement.

## Phase 9 — Testing

Test payments, duplicate handling, access control, expiry, and security.

## Phase 10 — UX polish

Only after the payment flows work correctly should the UI be polished.

---

# 21. Scope Guardrails

Do NOT implement these in this feature:

```text
✗ LNbits user wallets
✗ custodial user wallets
✗ 5% fee on Nutzaps
✗ Lightning Address for every user
✗ NIP-57 zap receipts for Cashu Nutzaps
✗ Cashu mint implementation
✗ creator revenue splitting
✗ escrow
✗ bounties
✗ paid posts
✗ subscriptions beyond the premium-room entitlement
✗ additional monetization systems
✗ new frontend frameworks
✗ replacement of the existing architecture
```

Those can be considered separately later.

---

# 22. Definition of Done

The feature is complete when:

### Nutzaps

A user can:

```text
open another user's post
       ↓
click ⚡ Zap
       ↓
select amount
       ↓
send Cashu payment
       ↓
NIP-61 Nutzap is published
       ↓
recipient receives the sats
```

with:

**0% platform fee.**

### Premium rooms

A user can:

```text
discover premium room
       ↓
see price
       ↓
pay using Cashu
       ↓
payment is independently verified
       ↓
entitlement is created
       ↓
room access is granted
```

The platform receives revenue from the premium-room payment.

### Architecture

The final implementation should maintain:

```text
Nostr
  → social identity/events

Cashu
  → value transfer

Existing application
  → access control / entitlements

Postgres
  → entitlement state
```

The implementation should be minimal, secure, testable, and consistent with the existing repository.
