# Deploy the Spill website to Vercel

Vercel hosts the React website. The radio API, continuous radio worker, Icecast stream, Postgres, Redis, and LiveKit token server must run on a separate always-on host.

## Create the Vercel project

1. Push the current branch to GitHub.
2. In Vercel, select **Add New → Project** and import `AnneAdhiambo/Spill`.
3. Keep the project root as the repository root. Vercel detects Vite and uses `npm run build` with the `dist` output folder.
4. Add the production environment variables below before deploying.
5. Deploy. The `vercel.json` rewrite makes direct visits to routes such as `/radio`, `/space`, and `/communities` load the React app correctly.

## Vercel environment variables

These values are public browser configuration. Do not put passwords, database URLs, or LiveKit API secrets in a `VITE_` variable.

```env
VITE_RADIO_API_URL=https://api.example.com
VITE_RADIO_STREAM_URL=https://radio.example.com/live
VITE_LIVEKIT_TOKEN_ENDPOINT=https://token.example.com/api/livekit/token
VITE_NOSTR_RELAYS=wss://relay.example.com
VITE_NOSTR_READ_RELAYS=wss://relay.example.com,wss://relay.damus.io,wss://relay.nostr.band
```

Replace the example hosts after the radio stack and token service are deployed. Every Vercel deployment bakes these values into the frontend, so redeploy after changing them.

## Services outside Vercel

| Service | Why it is separate |
| --- | --- |
| Radio API | Serves recordings and now-playing data |
| Radio worker | Runs continuously to ingest and broadcast audio |
| Icecast | Maintains the live audio stream |
| Postgres and Redis | Persist radio and queue state |
| LiveKit token server | Holds private LiveKit credentials and signs room tokens |

Use a Docker-capable host with persistent storage for the radio media. Set `CORS_ORIGINS` there to the exact Vercel domain, configure Icecast CORS for the same domain, and set `APP_ORIGIN` on the token server to that domain.
