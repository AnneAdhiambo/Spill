# Spill

Spill is a community-first radio and reporting app focused on local stories, live audio, and trustworthy public updates.

## Product shape

- Live radio station and now-playing interface
- AI-assisted playlist generation and editorial decision records
- Contribution intake with safe disclosure boundaries
- Local-first audio publishing and stream checks

## Local development

```bash
pnpm install
pnpm dev
```

The Next.js app runs from the workspace root. The API can be started separately with:

```bash
pnpm dev:api
```

## Stack

- Next.js app
- Fastify API
- PostgreSQL and Redis optional runtime services
- Icecast for radio streaming

## Notes

This project keeps the radio experience and media tooling as the primary product surface. Cleanup work removes legacy Midnight-specific scaffolding and keeps the app aligned to Spill's public-facing radio mission.
