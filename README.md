#  Spill

> Offline-first journalism and community platform for Africa

Spill empowers communities to share trusted local stories, organize around what matters and stay connected—even when the internet isn't reliable. Built for resilience, trust and participation.

---

##  What Spill does

- **Local storytelling** — Share and discover community-led journalism
- **Works offline** — Full functionality without internet connectivity
- **Live audio** — Real-time radio and voice-based experiences
- **Community-first** — Organize, discuss, and build trust locally
- **Decentralized** — Nostr integration for resilient communication
- **Fast and light** — Optimized for low-bandwidth environments

---

## Quick Start

### Prerequisites

- **Node.js** 22.4.0 or newer  
- **npm** (comes with Node.js)  
- **pnpm** (for radio workspace)

```bash
npm install -g pnpm
```

### Get it running in 3 steps

```bash
# 1. Clone the repo
git clone https://github.com/AnneAdhiambo/Spill.git
cd Spill

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Then open the URL shown in your terminal (usually `http://localhost:5173`).

**Explore:**
- `/` — Landing page  
- `/communities` — Community feed

---

##  Project Structure

```
Spill/
├── src/                    # Main app (React + Vite + TypeScript)
├── server/                 # Backend utilities
├── radio/                  # Radio workspace (Next.js + Fastify)
│   ├── apps/
│   ├── packages/
│   └── media/
└── vite.config.ts
```

---

##  Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite, TypeScript |
| **Radio App** | Next.js, Fastify, PostgreSQL, Redis |
| **Styling** | Tailwind CSS, CSS |
| **Infrastructure** | Drizzle ORM, Nostr, LiveKit, Cashu |

---

##  Common Commands



### Main app

```bash
npm run dev           # Start development server
npm run typecheck     # Run TypeScript checks
npm run build         # Build for production
npm run preview       # Preview production build
npm run test          # Run tests
```

### Radio workspace

```bash
cd radio
pnpm install          # Install radio dependencies
pnpm dev              # Start Next.js + API
pnpm dev:api          # Start API only
pnpm build            # Build all packages
pnpm db:migrate       # Run database migrations
```

---

## Run locally

```sh
npm install
npm run dev
```

Open the URL Vite prints, then visit `/` for the landing page or `/communities` for the community feed.

```sh
npm run typecheck
npm run build
```
##  Contributing
We welcome contributions from:
- Developers and designers
- Journalists and storytellers
- Community organizers
- Researchers and civic tech enthusiasts

**How to contribute:**

```bash
git checkout -b feature/your-feature
# Make your changes
git add .
git commit -m "Add your feature description"
git push origin feature/your-feature
```

Then open a pull request on GitHub.

---

##  Use Cases

- **Local newsrooms** — Publish and organize community stories
- **Civic groups** — Coordinate around local issues and campaigns
- **Emergency response** — Reliable communication when infrastructure fails
- **Rural communities** — Access to information with minimal connectivity
- **Researchers** — Study community-led media and trust-building

---

##  Requirements

- Node.js v22.4.0+
- npm
- pnpm (for radio workspace)
- PostgreSQL & Redis (optional, for radio features)

---

##  Environment Setup

For local development, create a `.env.local` file in the root:

```env
# Optional: Add your configuration here
# LIVEKIT_API_KEY=your_key
# LIVEKIT_API_SECRET=your_secret
```

---

##  Documentation

- [Radio workspace README](./radio/README.md)
- [Media management guide](./radio/media/README.md)
- [Offline support and nearby (Bluetooth) sync](./docs/offline-sync.md)

---

##  License

This project is open source.

---

##  Support & Feedback

-  [Open an issue](https://github.com/AnneAdhiambo/Spill/issues) for bugs or feature requests
-  Have ideas? Start a discussion or open a pull request
-  Want to collaborate? Reach out!

---

##  Getting Help

**Installation issues?**
- Verify Node.js: `node --version` (should be 22.4.0+)
- Clear cache: `rm -rf node_modules package-lock.json && npm install`
- Check pnpm: `pnpm --version`

**Running into errors?**
- Check the [Issues tab](https://github.com/AnneAdhiambo/Spill/issues)
- Open a new issue with details about what went wrong

---

<div align="center">

**Made for communities. By communities.**

[Star ](https://github.com/AnneAdhiambo/Spill) • [Fork](https://github.com/AnneAdhiambo/Spill/fork) • [Report Issue](https://github.com/AnneAdhiambo/Spill/issues)

</div>
```

---


