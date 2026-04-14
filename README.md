# Voice Screening Platform

Monorepo for a self-hosted voice AI screening platform built from the product spec in `docs/VOICE_SCREENING_PLATFORM_MASTER_SPEC.md`.

## Apps

- `apps/web`: React + Vite admin dashboard
- `apps/server`: Express + WebSocket backend

## Local development

1. Copy `.env.example` to `.env`
2. Fill the required local values in `.env`, especially the MongoDB Atlas `DATABASE_URL`
3. Start Redis with `docker compose up -d`
4. Install dependencies with `npm install`
5. Push the Prisma schema with `npx prisma db push --schema apps/server/prisma/schema.prisma`
6. Start both apps with `npm run dev`

## Local URLs

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000/api`
- Backend health: `http://localhost:3000/health`
- Media WebSocket: `ws://localhost:3000/ws/media/:callId`

## Environment variables

### App and server

- `NODE_ENV`: runtime mode
- `PORT`: backend port
- `SERVER_URL`: backend base URL
- `APP_URL`: frontend base URL
- `VITE_API_URL`: frontend API base URL used by Vite
- `JWT_SECRET`: auth signing secret
- `ENCRYPTION_KEY`: secret used for encrypting provider credentials later

### Database and queue

- `DATABASE_URL`: MongoDB connection string
- `REDIS_URL`: Redis connection string

### Telephony

- `PLIVO_AUTH_ID`
- `PLIVO_AUTH_TOKEN`
- `PLIVO_DEFAULT_NUMBER`
- `EXOTEL_ACCOUNT_SID`
- `EXOTEL_API_KEY`
- `EXOTEL_API_TOKEN`
- `EXOTEL_SUBDOMAIN`
- `EXOTEL_APP_ID`
- `EXOTEL_DEFAULT_NUMBER`

### AI services

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `DEEPGRAM_API_KEY`
- `DEEPGRAM_MODEL`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_DEFAULT_VOICE_ID`
- `ELEVENLABS_DEFAULT_MODEL`

### Storage

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_BUCKET_NAME`
- `AWS_BUCKET_PREFIX`

## Current status

The current scaffold compiles and runs, but external providers are still stubbed.
That means you can run and inspect the UI and backend structure now, but real call placement and real AI/media flows still need to be wired to Plivo or Exotel, Deepgram, OpenAI, ElevenLabs, and S3.
