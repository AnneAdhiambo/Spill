# Setup

How to get Spill running from a fresh clone: the Vite front end, the radio API and worker, and the local
Docker services (Postgres, Redis, Icecast, a Nostr relay).

## 1. Prerequisites

| Tool | Version we tested | Notes |
| --- | --- | --- |
| Node.js | 22.x (v22.22.0) | `packages/midnight` asks for Node 24.11.1+, but the radio demo does not use it; you will see an "Unsupported engine" warning during install. Ignore it. |
| pnpm | 12.6.0 | `radio/` pins `pnpm@10.7.0`; pnpm switches to it automatically inside `radio/`. |
| ffmpeg | 6.1 (with `ffprobe`) | Must be on your `PATH`. The worker uses it to encode the stream and the API uses it to convert audio. |
| dotenv-cli | any recent | `npm install -g dotenv-cli`. Provides the `dotenv` command used to load `radio/.env`. |
| Docker | 29.x with Compose v2 (2.40) | Compose v2 is required (`docker compose`, not `docker-compose`). |
| curl | any | Used by `start-demo.sh`. |
| A Groq API key | n/a | Free at <https://console.groq.com>. Needed for transcripts and the AI DJ. |

Free host ports: `5173` (web), `4000` (API), `8000` (Icecast), `7777` (Nostr relay), `5432` (Postgres),
`6379` (Redis). You can change them (section 4, "Different ports").

## 2. Steps from a fresh clone

All commands run from the repo root unless a `cd` says otherwise.

1. **Clone**
   ```bash
   git clone <repo-url> Spill && cd Spill
   git checkout Kelly/radio     # or the branch you were given
   ```
2. **Install both projects** (the root app and `radio/` are separate pnpm workspaces)
   ```bash
   pnpm install
   cd radio && pnpm install && cd ..
   ```
   pnpm may print "Ignored build scripts" for `radio/`. That is only a warning.
3. **Create `radio/.env`**
   ```bash
   cp radio/.env.example radio/.env
   ```
   Edit `radio/.env` and set at least:
   - `POSTGRES_PASSWORD`: choose one (letters, digits, `-`, `_`).
   - `DATABASE_URL`: the same password must appear inside it.
   - `ICECAST_SOURCE_PASSWORD` and `ICECAST_ADMIN_PASSWORD`: choose any two values.
   - `GROQ_API_KEY`: your key.

   `radio/.env` is git-ignored. Never commit it or paste it anywhere. The comments in `.env.example` mark
   which variables are secrets.
4. **Start the Docker services** (creates `spill-postgres`, `spill-redis`, `spill-icecast`, `spill-relay`)
   ```bash
   cd radio
   docker compose -f docker-compose.dev.yml up -d --wait
   ```
   Data lives in named volumes, so it survives `docker compose ... down` and restarts. To wipe everything
   use `docker compose -f docker-compose.dev.yml down -v`.
5. **Create the database tables** (still in `radio/`)
   ```bash
   dotenv -e .env -- pnpm db:migrate
   cd ..
   ```
6. **Add audio.** Audio is not in Git (it is git-ignored), so you must supply it:
   - Reports go in `radio/media/radio/`: the audio files plus a `manifest.json` that lists them:
     ```json
     [
       { "file": "water-in-kibera.mp3", "title": "Water in Kibera", "npub": "npub1..." }
     ]
     ```
     Files that are not listed in `manifest.json` are skipped on purpose. The worker transcribes new files with
     Groq on its next scan, writing `<file>.transcript.json` next to each one. Nothing plays until a
     transcript exists.
   - Music clips go in `radio/media/music/` (mp3, ogg, wav, ...). Use only audio you are allowed to broadcast.
7. **Run the demo**
   ```bash
   ./start-demo.sh
   ```
   It stops old copies, starts the containers, API, worker and front end, then prints a pass/fail checklist.
   When everything passes, open <http://localhost:5173/radio> and <http://localhost:5173/feed>. Press play once
   on the radio page. Stop everything with `./start-demo.sh stop` (the Docker containers keep running).

Optional: voice rooms need a LiveKit token server (`pnpm dev:token`). See the root `.env.example`; it is not
needed for the radio or the feed.

### Different ports

Edit `radio/.env`: `POSTGRES_PORT`, `REDIS_PORT`, `RELAY_PORT`, `API_PORT`, `ICECAST_PORT`, and keep these
consistent: the port inside `DATABASE_URL` / `REDIS_URL`, `RADIO_PUBLIC_STREAM_URL`, and `CORS_ORIGINS`
(it must list the exact front end origin). To change the web port: `WEB_PORT=5273 ./start-demo.sh`. To run a
second copy beside another one, also set a different `SPILL_CONTAINER_PREFIX` and start compose with
`-p <another-name>`. `start-demo.sh` reads all of these from `radio/.env`.

## 3. Platform notes

**Windows**: use WSL 2. Install Ubuntu, install Docker Desktop with the WSL integration turned on, then do
everything above inside the WSL terminal. Clone into the WSL filesystem (for example `~/Spill`), not `/mnt/c/...`;
installs and file watching are very slow and unreliable on the Windows drive. `start-demo.sh` refuses to run
under Git Bash or PowerShell and tells you so.

**macOS**: `brew install node pnpm ffmpeg curl && npm install -g dotenv-cli`, and install Docker Desktop.
macOS has no `setsid`, so `start-demo.sh` uses `nohup` instead (it prints a note). The one difference is
that `./start-demo.sh stop` finds the leftover processes by their working directory instead of by process
group. It still only touches processes started from this folder.

**Linux**: install Docker Engine with the Compose plugin, plus `ffmpeg` and `curl` from your package manager.

## 4. Troubleshooting

**Browser says the request "has been blocked by CORS policy".** The API only allows origins listed in
`CORS_ORIGINS`, and the port is part of the origin. If the page is at `http://localhost:5273` but `.env` says
`http://localhost:5173`, it fails. Add the real origin (comma-separated), then restart the API. The launcher
reports this as "API CORS missing for port ...". The waveform needs a similar header from Icecast: it is set in
`radio/infrastructure/docker/icecast.xml`, so make sure you started Icecast from `docker-compose.dev.yml`.

**Groq returns 400 or the transcript job fails immediately.** The speech model name must be exactly
`whisper-large-v3` (`GROQ_WHISPER_MODEL`). A wrong model name is rejected by Groq. Check the worker log for the
error text. The chat model for the DJ is `GROQ_MODEL=openai/gpt-oss-20b`.

**`missing_audio_input` from Groq.** The audio file was not attached to the request (an empty or wrongly built
multipart upload). This was a bug in the transcriber and is fixed: it now builds the request from a `Blob`
and `FormData` and does not set `Content-Type` by hand. If you see it again, check you are on a current checkout
and that the audio file is not empty (`ffprobe` it). A 400 is treated as permanent: the file is marked failed
and not retried.

**Two voices at once, a page that flips between tracks, or more than one `ffmpeg`.** Duplicate workers. Each
worker runs its own encoder into the same mount. Run `./start-demo.sh stop`, check with `pgrep -fa "tsx|ffmpeg"`,
then start again. The launcher already stops old copies and checks that exactly one encoder is running.

**`Buffer is not defined` (or `global is not defined`) in the browser console.** Some of our dependencies expect
Node globals in the browser. `src/main.tsx` provides `window.Buffer` from the `buffer` package, so that import
must stay at the top of the file. `vite.config.ts` previously also set `define: { global: "globalThis" }`; if you
see `global is not defined`, restore it. After changing either, rebuild: `pnpm build`.

**`ERR_PNPM_IGNORED_BUILDS` (esbuild) on install.** pnpm needs permission to run esbuild's install script.
In the root `pnpm-workspace.yaml`, `allowBuilds` must say `esbuild: true`.

**`ERR_PNPM_OUTDATED_LOCKFILE`.** `pnpm-lock.yaml` does not match `package.json`. Run `pnpm install` (without
`--frozen-lockfile`) and commit the updated lockfile.

**`docker: Conflict. The container name "/spill-..." is already in use`.** You already have hand-made containers
with those names. Remove them (`docker rm -f spill-postgres spill-redis spill-icecast spill-relay`; this
deletes their data) or set `SPILL_CONTAINER_PREFIX` to something else.

**Icecast says "no /live source".** The worker is not streaming. Look at `radio/tmp_worker.log`. Common causes:
`RADIO_BROADCAST_ENABLED` is not `true`, the `ICECAST_SOURCE_PASSWORD` in `.env` changed after the container
was created (recreate it: `docker compose -f docker-compose.dev.yml up -d --force-recreate icecast`), or there is
no media with a transcript yet.
