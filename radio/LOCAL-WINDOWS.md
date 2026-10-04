# Local radio with Docker Desktop

This runs the radio backend in Linux containers while the existing Vite frontend runs on Windows. No separate Ubuntu installation, host pnpm, or host FFmpeg is needed.

From `Spill/radio` in PowerShell:

```powershell
docker compose -f docker-compose.dev.yml -f docker-compose.local.yml up -d --build --wait
```

The first start downloads images and installs dependencies. Database migrations run before the API starts. Postgres, Redis and the relay use persistent Docker volumes; media stays in `radio/media`.

From `Spill` in another terminal, start the frontend if it is not already running:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open <http://localhost:5173/radio>. The API is at <http://localhost:4000/api/v1/health>, Icecast at <http://localhost:8000>, and the local relay at `ws://localhost:7777`.

## Configure content

Keep credentials in the ignored `radio/.env`. Set `GROQ_API_KEY` there for transcription and AI programming. Do not put it in a `VITE_*` variable.

- Put reports in `radio/media/radio/` and list them in that folder's `manifest.json` with `file`, `title`, and the reporter's `npub`. The worker creates a manifest template on first start. Reports need a successful transcript before playback.
- Put music in `radio/media/music/`. Use audio you have permission to broadcast.
- With no media, the station correctly stays off air. For a temporary sound check only, set `RADIO_TEST_TONE_ENABLED=true` in `radio/.env`; restore `false` afterward.

After changing `.env` or adding music, apply the configuration and restart the worker:

```powershell
docker compose -f docker-compose.dev.yml -f docker-compose.local.yml up -d --wait
docker compose -f docker-compose.dev.yml -f docker-compose.local.yml restart worker
```

The frontend reads `VITE_RADIO_API_URL=http://localhost:4000` and `VITE_RADIO_STREAM_URL=http://localhost:8000/live` from the root `.env.local`. Restart Vite after changing those values. Its exact origin must be listed in `radio/.env` under `CORS_ORIGINS`.

## Status and stopping

```powershell
docker compose -f docker-compose.dev.yml -f docker-compose.local.yml ps
docker compose -f docker-compose.dev.yml -f docker-compose.local.yml logs --tail 50 api worker
docker compose -f docker-compose.dev.yml -f docker-compose.local.yml stop
```

Stopping preserves database volumes and media. Do not run the worker through `start-demo.sh` at the same time as this container setup: two encoders would compete for the same stream.
