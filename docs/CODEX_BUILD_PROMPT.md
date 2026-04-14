# Codex Build Prompt

Use this prompt when you want Codex to build the application from scratch in this repository.

## Prompt

Build a production-structured monorepo for a self-hosted voice AI screening platform.

You must follow the full specification in:

- `docs/VOICE_SCREENING_PLATFORM_MASTER_SPEC.md`

Treat that file as the source of truth for:
- product scope
- architecture
- route design
- page structure
- entity model
- provider abstraction
- UI styling and layout direction

Important implementation rules:

1. The UI must match the attached Bolna-style screenshots in layout and density.
2. Use a light dashboard theme, not a dark theme.
3. Keep NxtWave branding, but preserve the same shell structure and interaction patterns as the reference UI.
4. Every entity must use UUIDs.
5. Every call attempt must create a new call UUID and use it in WebSocket or media session routing.
6. Telephony must support both `Plivo` and `Exotel` via a provider abstraction.
7. Both providers must appear in the Settings UI from the start.
8. Provider credentials are configured in Settings and referenced elsewhere.
9. Do not collapse unrelated pages into one generic route.
10. Implement page routes and tab routes exactly as defined in the spec.
11. Prioritize clean architecture: frontend app shell, backend API, queue workers, telephony adapters, and media bridge should be clearly separated.
12. Use React + Vite + TypeScript + Tailwind on the frontend.
13. Use Node.js + Express + TypeScript + Prisma + MongoDB + Redis + Bull on the backend.
14. Prepare the app for Railway deployment with public HTTPS and WebSocket support.
15. Do not use placeholder architecture that will need to be rewritten later.

Build order:

1. Create monorepo foundation, package layout, shared config, and Docker Compose.
2. Create backend app with Prisma schema, auth, settings, provider config storage, and health routes.
3. Create frontend app shell with sidebar, top utility bar, page header, and route structure.
4. Build the full Agent Builder page with all eight tabs and the three-column layout from the screenshots.
5. Build Settings pages with both telephony providers visible.
6. Build Numbers, Campaigns, Batches, and Call History pages.
7. Add queue and scheduling modules.
8. Add telephony abstraction layer and provider adapters.
9. Add WebSocket media bridge and call-session state management.
10. Add transcript, recording, summary, extraction, and analytics pipelines.

Quality bar:

- no giant files mixing unrelated concerns
- no missing route shells
- no guessed UI patterns that drift away from the screenshots
- reusable UI primitives
- clean TypeScript types
- explicit loading, empty, and error states

If you need to make implementation tradeoffs, preserve:
- route structure
- provider abstraction
- UUID-based call and session design
- agent builder layout
- page-level separation
