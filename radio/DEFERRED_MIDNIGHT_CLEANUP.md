Deferred Midnight cleanup

This document lists Midnight-related files, packages, tests and artifacts that were intentionally NOT deleted during the Phase 2 minimal decoupling. These items are deferred for a later, deliberate cleanup phase (Phase 7).

Sections:

1) Packages / workspace
- packages/midnight/
  - Full Midnight implementation, managed contract artifacts and scripts.
  - Tests under `packages/midnight/test/`.
  - Keep this package intact for now; it may be removed or moved in Phase 7.

2) API privacy & migrations
- apps/api/src/privacy.ts
  - Retained (and partially adapted) to provide in-memory and Postgres privacy stores for compatibility with tests and DB schema.
- apps/api/src/db/migrations/0003_privacy.sql
  - MUST be kept. Migration defines privacy tables used by old flows.
- apps/api/src/db/schema.ts
  - Columns referencing privacy (privacy_verified, programming_eligible, privacy_verifications, editorial_reviews) remain.
  - Note: source code now contains `// OPEN QUESTION: replace with a proper eligible flag before Phase 7 drops the privacy tables.` comments at each use of `privacy_verified` to aid Phase 7 planning.

3) Tests
- apps/api/test/privacy.test.ts
- apps/api/test/privacy-routes.test.ts
- packages/midnight/test/*
  - These tests reference Midnight and privacy flows. They will be addressed together with package removal.

4) UI / Pages
- radio/app/midnight/* and pages referencing Midnight
  - Pages were stubbed or marked as removed during Phase 2. Keep them in place to avoid breaking routes.
- components/midnight-dashboard.tsx
- components/verification-console.tsx
- components/contribution-console.tsx
  - These components were stubbed to avoid runtime calls to Midnight endpoints. They can be removed/rewritten later.

5) Config and .env
- `.env.example` MIDNIGHT_* entries were removed to avoid encouraging configuration during Phase 3.
- Any remaining documentation references to Midnight should be reviewed during Phase 7.

6) pnpm / workspace config
- Root `package.json` overrides touching Midnight were trimmed during Phase 2. Leave workspace package and lockfile unchanged until cleanup.

7) Migration plan for Phase 7
- Add a new migration `0004_remove_privacy.sql` that drops privacy tables IF EXISTS and removes indices. This must be applied only after ensuring no running services rely on them and after migrating any needed data out.

Notes and rationale
- The goal of Phase 2 was minimal runtime decoupling so the API and worker can run without MIDNIGHT_* env vars. Removing the whole Midnight package now would break developer workflows and tests. Phase 7 should be a planned, reviewed cleanup with proper migration and deprecation steps.

If you want, I can now:
- run tests for the API and worker, or
- continue implementing the eligibility rule across other modules, or
- prepare Phase 7's `0004_remove_privacy.sql` draft.
