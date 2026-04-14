# Voice AI Screening Platform Master Spec

This document is the product, architecture, UX, and delivery blueprint for a self-hosted voice AI screening platform built for India outbound calling.

It is intended to be:
- the single source of truth for Codex implementation
- detailed enough to build without guessing page structure or system boundaries
- aligned to the attached Bolna screenshots for layout, density, and interaction patterns

This spec is intentionally implementation-oriented, but it does not provide code. It defines what to build, how it should be organized, how it should behave, and how the UI should look.

## 1. Product Summary

Build a multi-provider voice AI screening platform with:
- an admin dashboard for teams to create and manage agents
- campaign and batch engines for bulk outbound calling
- a telephony abstraction layer with `Plivo` and `Exotel`
- a real-time audio bridge for live call streaming
- transcription, LLM response generation, and TTS playback
- post-call recording, transcript storage, summary generation, and analytics

Primary use case:
- NxtWave ops teams upload student/contact lists
- choose an agent and telephony provider
- launch AI screening calls
- review recordings, transcripts, summaries, extracted data, and outcomes

## 2. Product Principles

The product must follow these rules:

1. The UI should match the attached Bolna screenshots in layout and density.
2. The branding should be NxtWave-owned, but the structure and interaction model should feel very close to Bolna.
3. Every persisted entity uses a UUID.
4. Every call/conversation gets its own UUID and never shares session state.
5. Telephony must be provider-agnostic at the business logic level.
6. Provider credentials are configured once in Settings and referenced elsewhere.
7. Agent builder must be the flagship screen and should be the most polished page.
8. The system must support both one-off bulk batches and reusable campaigns.
9. Call records, recordings, transcripts, and extracted analytics must be traceable by call UUID.
10. Build for deployment on Railway or Render with MongoDB, Redis, S3, and public webhook support.

## 3. Core Roles

### 3.1 Admin
- manages provider credentials
- creates and edits agents
- uploads students and runs campaigns
- listens to recordings and reads transcripts
- views analytics and failures

### 3.2 Recruiter / Operator
- uses existing agents
- launches batches or campaigns
- reviews results
- may not edit global provider credentials

### 3.3 System
- schedules and retries calls
- maintains session state during conversations
- stores recordings, summaries, and extracted results

## 4. High-Level Architecture

The architecture should align to the referenced `voice_screening_system_architecture.svg`.

### 4.1 Main Layers

1. Admin dashboard
   - React + Vite + TypeScript + Tailwind
   - light theme, Bolna-style layout

2. REST API + scheduler
   - Node.js + Express + Bull
   - owns CRUD, settings, scheduling, queues, exports, and webhooks

3. WebSocket audio bridge
   - `ws` server in Node
   - handles telephony media streams and provider events

4. External services
   - Telephony: Plivo or Exotel
   - STT: Deepgram
   - LLM: OpenAI
   - TTS: ElevenLabs

5. Storage and queue
   - MongoDB for app data
   - Redis for Bull queues and retry state
   - S3 for recordings and uploaded CSV archives if needed

### 4.2 Real-Time Call Flow

1. Scheduler creates a `Call` record with a new UUID.
2. Telephony provider dials the student.
3. On answer, telephony provider opens a WebSocket/media session to `/ws/media/:callId`.
4. The media bridge receives inbound audio frames.
5. Audio is normalized for STT requirements.
6. Deepgram returns interim and final transcript segments.
7. Conversation manager appends the user utterance to the call session.
8. OpenAI generates the next bot turn based on agent instructions and conversation state.
9. ElevenLabs synthesizes the response audio.
10. Audio is converted to telephony-compatible format and streamed back.
11. This repeats until the interview ends or timeout/hangup conditions are met.
12. Recording webhook or provider callback is processed after the call.
13. Recording is fetched and stored in S3.
14. Transcript, summary, extracted data, and final status are persisted against the same call UUID.

## 5. Required Providers and Responsibilities

### 5.1 Telephony

Supported providers:
- `Plivo`
- `Exotel`

Provider responsibilities:
- outbound call initiation
- answer and status callbacks
- media streaming session initiation
- post-call recording retrieval or callback handoff

Key product rule:
- both providers must appear in the UI from day one
- even if only one is active in production initially

### 5.2 STT

Primary:
- Deepgram `nova-3`

Responsibilities:
- live transcription
- endpointing and turn detection inputs
- final utterance events

### 5.3 LLM

Primary:
- OpenAI `gpt-4o-mini`

Responsibilities:
- agent conversational policy
- follow-up question generation
- context-aware turn responses
- post-call summary and extraction jobs

### 5.4 TTS

Primary:
- ElevenLabs

Responsibilities:
- voice playback
- configurable voice model, speed, stability, similarity

### 5.5 Storage

- S3 for recordings and optional imports/exports archive

### 5.6 Queue

- Redis + Bull for:
  - campaign scheduling
  - concurrency control
  - retry rules
  - delayed jobs
  - resumable execution

## 6. Monorepo Structure

Use this exact workspace shape:

```text
voice-screening-platform/
├── apps/
│   ├── web/
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.js
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── router/
│   │       │   ├── index.tsx
│   │       │   ├── protected-routes.tsx
│   │       │   └── route-ids.ts
│   │       ├── pages/
│   │       │   ├── auth/
│   │       │   ├── dashboard/
│   │       │   ├── agents/
│   │       │   ├── campaigns/
│   │       │   ├── batches/
│   │       │   ├── calls/
│   │       │   ├── numbers/
│   │       │   ├── settings/
│   │       │   └── NotFoundPage.tsx
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── stores/
│   │       ├── lib/
│   │       ├── mocks/
│   │       ├── styles/
│   │       └── types/
│   ├── server/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── src/
│   │       ├── index.ts
│   │       ├── app.ts
│   │       ├── config/
│   │       ├── db/
│   │       ├── middleware/
│   │       ├── routes/
│   │       ├── controllers/
│   │       ├── services/
│   │       ├── websocket/
│   │       ├── queues/
│   │       ├── workers/
│   │       ├── utils/
│   │       └── types/
├── packages/
│   ├── shared/
│   └── config/
├── docs/
├── docker-compose.yml
├── package.json
├── .env.example
└── README.md
```

## 7. Entity Model and UUID Rules

All primary keys are UUID strings.

### 7.1 Organization
- `id`
- `name`
- `slug`
- `ownerUserId`
- `createdAt`
- `updatedAt`

### 7.2 User
- `id`
- `organizationId`
- `name`
- `email`
- `passwordHash`
- `role`
- `isActive`
- `createdAt`
- `updatedAt`

### 7.3 TelephonyConfig
- `id`
- `organizationId`
- `provider` = `plivo` | `exotel`
- `displayName`
- `isDefault`
- `status`
- `credentialsEncrypted`
- `defaultFromNumber`
- `createdAt`
- `updatedAt`

### 7.4 PhoneNumber
- `id`
- `organizationId`
- `provider`
- `providerNumberId`
- `phoneNumber`
- `label`
- `capabilities`
- `isActive`
- `isDefaultOutbound`
- `assignedAgentId`
- `createdAt`
- `updatedAt`

### 7.5 Agent
- `id`
- `organizationId`
- `name`
- `slug`
- `status`
- `welcomeMessage`
- `systemPrompt`
- `finalMessage`
- `llmProvider`
- `llmModel`
- `llmTemperature`
- `llmMaxTokens`
- `knowledgeBaseIds`
- `sttProvider`
- `sttModel`
- `sttKeywords`
- `languageCodes`
- `ttsProvider`
- `ttsModel`
- `ttsVoiceId`
- `ttsVoiceName`
- `ttsBufferSize`
- `ttsSpeedRate`
- `ttsSimilarityBoost`
- `ttsStability`
- `ttsStyleExaggeration`
- `responseRate`
- `endpointingMs`
- `linearDelayMs`
- `generatePreciseTranscript`
- `interruptAfterWordCount`
- `userOnlineDetectionEnabled`
- `userOnlineMessageDelaySeconds`
- `userOnlinePrompt`
- `telephonyProvider`
- `ambientNoise`
- `noiseCancellationEnabled`
- `voicemailDetectionEnabled`
- `dtmfEnabled`
- `autoRescheduleEnabled`
- `callTimingRestrictionEnabled`
- `hangupOnSilenceEnabled`
- `hangupOnSilenceSeconds`
- `callTimeoutSeconds`
- `hangupPromptEnabled`
- `hangupPromptText`
- `analyticsWebhookUrl`
- `summarizationEnabled`
- `extractionEnabled`
- `extractionPrompt`
- `toolDefinitions`
- `inboundNumberId`
- `createdAt`
- `updatedAt`

### 7.6 Campaign
- `id`
- `organizationId`
- `agentId`
- `name`
- `status` = `draft` | `scheduled` | `running` | `paused` | `completed` | `archived`
- `telephonyProvider`
- `telephonyConfigId`
- `fromNumberId`
- `maxRetries`
- `retryDelayMinutes`
- `callWindowStart`
- `callWindowEnd`
- `timezone`
- `concurrencyLimit`
- `summaryMode`
- `totalStudents`
- `queuedStudents`
- `calledStudents`
- `completedStudents`
- `failedStudents`
- `createdAt`
- `updatedAt`

### 7.7 Student
- `id`
- `campaignId`
- `externalRef`
- `name`
- `phone`
- `email`
- `metadataJson`
- `latestStatus`
- `retryCount`
- `lastQueuedAt`
- `lastCalledAt`
- `createdAt`
- `updatedAt`

### 7.8 Batch
- `id`
- `organizationId`
- `agentId`
- `name`
- `status`
- `telephonyProvider`
- `telephonyConfigId`
- `fromNumberId`
- `csvUploadId`
- `concurrencyLimit`
- `maxRetries`
- `retryDelayMinutes`
- `totalItems`
- `processedItems`
- `successfulItems`
- `failedItems`
- `createdAt`
- `updatedAt`

### 7.9 BatchItem
- `id`
- `batchId`
- `name`
- `phone`
- `email`
- `metadataJson`
- `status`
- `retryCount`
- `lastCallId`
- `createdAt`
- `updatedAt`

### 7.10 Call
- `id`
- `organizationId`
- `campaignId`
- `batchId`
- `studentId`
- `agentId`
- `telephonyProvider`
- `telephonyConfigId`
- `providerCallId`
- `providerSessionId`
- `direction`
- `status`
- `subStatus`
- `startedAt`
- `answeredAt`
- `endedAt`
- `durationSeconds`
- `costEstimate`
- `recordingStorageKey`
- `recordingUrl`
- `transcriptText`
- `summaryText`
- `extractedDataJson`
- `errorCode`
- `errorMessage`
- `createdAt`
- `updatedAt`

### 7.11 CallTurn
- `id`
- `callId`
- `speaker` = `assistant` | `user` | `system`
- `sequence`
- `text`
- `startOffsetMs`
- `endOffsetMs`
- `createdAt`

### 7.12 RecordingAsset
- `id`
- `callId`
- `provider`
- `providerRecordingId`
- `sourceUrl`
- `storageKey`
- `mimeType`
- `durationSeconds`
- `createdAt`

### 7.13 WebhookDelivery
- `id`
- `callId`
- `targetUrl`
- `eventType`
- `payloadJson`
- `status`
- `attemptCount`
- `lastAttemptAt`
- `createdAt`

## 8. UUID and Session Rules

This must be enforced consistently:

1. New call attempt always creates a new call UUID.
2. Retry does not reuse the previous call UUID.
3. WebSocket route must include the call UUID.
4. Provider metadata must include the call UUID when supported.
5. Conversation state must be keyed by call UUID only.
6. Transcript rows and recording assets must reference the same call UUID.
7. UI details pages should use UUID route params for calls, campaigns, agents, and batches.

## 9. Frontend Route Map

Do not collapse unrelated pages into a single route. Use dedicated page routes.

### 9.1 Auth Routes

- `/login`
- `/register`

### 9.2 Core App Routes

- `/dashboard`
- `/agents`
- `/agents/new`
- `/agents/:agentId`
- `/agents/:agentId/agent`
- `/agents/:agentId/llm`
- `/agents/:agentId/audio`
- `/agents/:agentId/engine`
- `/agents/:agentId/call`
- `/agents/:agentId/tools`
- `/agents/:agentId/analytics`
- `/agents/:agentId/inbound`
- `/campaigns`
- `/campaigns/new`
- `/campaigns/:campaignId`
- `/campaigns/:campaignId/overview`
- `/campaigns/:campaignId/calls`
- `/campaigns/:campaignId/students`
- `/batches`
- `/batches/new`
- `/batches/:batchId`
- `/batches/:batchId/overview`
- `/batches/:batchId/items`
- `/calls`
- `/calls/:callId`
- `/numbers`
- `/settings`
- `/settings/providers`
- `/settings/ai-services`
- `/settings/storage`
- `/settings/team`

### 9.3 Route Behavior Notes

- `/agents/:agentId` should redirect to `/agents/:agentId/agent`
- `/campaigns/:campaignId` should redirect to `/campaigns/:campaignId/overview`
- `/batches/:batchId` should redirect to `/batches/:batchId/overview`
- deep-linking to tabs must preserve browser refresh and direct navigation

## 10. Backend API Surface

### 10.1 Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### 10.2 Dashboard

- `GET /api/dashboard/overview`
- `GET /api/dashboard/call-volume`
- `GET /api/dashboard/status-breakdown`
- `GET /api/dashboard/recent-calls`

### 10.3 Agents

- `GET /api/agents`
- `POST /api/agents`
- `GET /api/agents/:agentId`
- `PATCH /api/agents/:agentId`
- `DELETE /api/agents/:agentId`
- `POST /api/agents/:agentId/test-call`
- `POST /api/agents/:agentId/duplicate`

### 10.4 Campaigns

- `GET /api/campaigns`
- `POST /api/campaigns`
- `GET /api/campaigns/:campaignId`
- `PATCH /api/campaigns/:campaignId`
- `DELETE /api/campaigns/:campaignId`
- `POST /api/campaigns/:campaignId/start`
- `POST /api/campaigns/:campaignId/pause`
- `POST /api/campaigns/:campaignId/resume`
- `POST /api/campaigns/:campaignId/students/upload`
- `GET /api/campaigns/:campaignId/students`
- `GET /api/campaigns/:campaignId/calls`
- `GET /api/campaigns/:campaignId/export`

### 10.5 Batches

- `GET /api/batches`
- `POST /api/batches`
- `GET /api/batches/:batchId`
- `PATCH /api/batches/:batchId`
- `DELETE /api/batches/:batchId`
- `POST /api/batches/:batchId/start`
- `POST /api/batches/:batchId/pause`
- `POST /api/batches/:batchId/resume`
- `GET /api/batches/:batchId/items`

### 10.6 Calls

- `GET /api/calls`
- `GET /api/calls/:callId`
- `GET /api/calls/:callId/transcript`
- `GET /api/calls/:callId/recording`
- `GET /api/calls/:callId/turns`
- `POST /api/calls/:callId/redeliver-webhook`

### 10.7 Numbers

- `GET /api/numbers`
- `POST /api/numbers`
- `PATCH /api/numbers/:numberId`
- `DELETE /api/numbers/:numberId`

### 10.8 Settings

- `GET /api/settings`
- `GET /api/settings/providers`
- `PUT /api/settings/providers`
- `GET /api/settings/ai-services`
- `PUT /api/settings/openai`
- `PUT /api/settings/deepgram`
- `PUT /api/settings/elevenlabs`
- `GET /api/settings/storage`
- `PUT /api/settings/storage`
- `GET /api/settings/team`
- `POST /api/settings/providers/test`
- `POST /api/settings/ai-services/test`
- `POST /api/settings/storage/test`

### 10.9 Webhooks

- `POST /api/webhooks/plivo/status`
- `POST /api/webhooks/plivo/recording`
- `POST /api/webhooks/exotel/status`
- `POST /api/webhooks/exotel/passthrough`

### 10.10 Media WebSocket

- `GET /ws/media/:callId`

## 11. UI Direction Based on the Attached Screenshots

The screenshots show a light, card-based control panel. The spec must follow that, not the earlier dark mock direction.

### 11.1 Overall Visual Character

The application should feel:
- bright
- operational
- compact but not cramped
- SaaS dashboard-like
- more workflow-oriented than marketing-oriented

### 11.2 Brand Interpretation

Use NxtWave identity, but mirror the Bolna page structure:
- same left navigation pattern
- same top utility bar pattern
- same agent builder shell
- same tabbed middle panel
- same right action rail
- same rounded card language

Avoid copying Bolna logos or trademarks directly.

### 11.3 Layout Shell

The app shell should be a three-layer frame:

1. Promo or announcement strip at the top of the content area
   - optional
   - full width
   - pale blue background
   - message + CTA button + close icon

2. Main horizontal app frame
   - left sidebar fixed
   - content area scrollable

3. Page content shell
   - page heading row
   - then major work area

### 11.4 Spacing and Surface Tokens

Use these approximate design tokens:

- app background: `#f6f8fc`
- sidebar background: `#f4f6fb`
- card background: `#ffffff`
- primary blue: `#2f67f6`
- primary blue hover: `#2457da`
- soft blue border: `#dbe6ff`
- muted text: `#667085`
- body text: `#344054`
- heading text: `#101828`
- card border: `#e4e7ec`
- selected tab border: `#2f67f6`
- selected tab background: `#f7faff`
- success green: `#16a34a`
- warning orange: `#f59e0b`
- danger red: `#ef4444`

### 11.5 Typography

- font family: `Inter` or a close modern sans stack
- page title: 44-48px line-height feel on desktop, visually like screenshot heading scale
- section card titles: 26-30px visual feel for big agent title, 18-20px for block headings
- labels: 13-14px
- helper text: 12-13px

### 11.6 Border Radius

- large cards: 16px
- inputs: 12px
- small buttons: 10-12px
- tabs: 14px

### 11.7 Shadows

Keep shadows very light. The screenshots rely more on borders than deep shadows.

## 12. App Shell Layout

### 12.1 Sidebar

Sidebar width:
- desktop: 240px fixed

Sections:
- logo + status
- `Platform` nav group
- `Team` nav group
- bottom user profile trigger

Nav order should be:
- Agent Setup
- Call History
- My Numbers
- SIP Trunks
- Knowledge Base
- Batches
- Voice Lab
- Developers
- Providers
- Workflows
- Campaigns
- Documentation

For the MVP in this spec, fully implement:
- Agent Setup
- Call History
- My Numbers
- Batches
- Providers / Settings
- Campaigns
- Dashboard

### 12.2 Content Header

Top utility row should contain:
- balance chip
- add funds button
- utility icon buttons
- help button

This row should visually resemble the screenshots.

## 13. Page-Level Spec

## 13.1 Dashboard Page

Route:
- `/dashboard`

Purpose:
- overview of system performance
- recent activity
- fast access to failed calls and active campaigns

Sections:

1. Header
- title: `Dashboard`
- subtitle: `Overview of your voice screening activity`

2. KPI cards row
- Total Calls
- Completion Rate
- Avg Duration
- Calls This Week

3. Charts row
- daily call volume
- status breakdown

4. Active campaigns widget
- current running campaigns
- quick pause/resume actions

5. Recent calls table
- student
- campaign
- duration
- status
- started at
- actions

6. Queue health or provider health card
- active telephony provider
- Redis queue status
- AI service connectivity summary

## 13.2 Agent Setup List Page

Route:
- `/agents`

Purpose:
- list all agents
- search
- create new agent

Layout:
- left list rail only
- clicking an agent opens builder route

Important behavior:
- selecting `New Agent` opens `/agents/new`
- new agents start with sensible defaults from platform template

## 13.3 Agent Builder Page

Routes:
- `/agents/new`
- `/agents/:agentId/agent`
- `/agents/:agentId/llm`
- `/agents/:agentId/audio`
- `/agents/:agentId/engine`
- `/agents/:agentId/call`
- `/agents/:agentId/tools`
- `/agents/:agentId/analytics`
- `/agents/:agentId/inbound`

This is the highest-priority page in the product.

### 13.3.1 Shell Layout

Match the screenshots closely with a three-column composition:

1. Left column
- `Your Agents` card
- `Import` button
- `New Agent` button
- search box
- agent list items

2. Center column
- top summary card with:
  - agent name input
  - Agent ID button
  - Share button
  - cost per min strip
  - routing badge
- below that, tab rail
- below that, current tab card content

3. Right column
- primary CTA: `Get call from agent`
- secondary CTA: `Set inbound agent`
- quick link: `Purchase phone numbers`
- secondary card:
  - `See all call logs`
  - `Save agent`
  - delete icon button
  - updated timestamp
  - `Chat with agent`
  - `Test via browser`

### 13.3.2 Agent Summary Card

Elements:
- editable agent name
- `Agent ID` action
- `Share` action
- cost bar with colored segments
- badges for:
  - routing
  - configured service layers

### 13.3.3 Tabs

Tabs must look like the screenshots:
- icon above or beside label
- rounded rectangular active state
- compact spacing
- within a single card strip

Tabs:
- Agent
- LLM
- Audio
- Engine
- Call
- Tools
- Analytics
- Inbound

### 13.3.4 Agent Tab

Sections:

1. Agent Welcome Message
- multiline input
- helper text explaining variable usage such as `{candidate_name}`

2. Agent Prompt
- large textarea
- optional `AI Edit` action
- draft-preservation is required

### 13.3.5 LLM Tab

Sections:

1. Choose LLM model
- provider select
- model select

2. Model Parameters
- token output slider + numeric input
- temperature slider + numeric input
- helper text under each

3. Knowledge base attachment
- multi-select
- empty state supported

### 13.3.6 Audio Tab

Sections:

1. Configure Language
- single or multi-language support
- language chips

2. Speech-to-Text
- provider select
- model select
- keywords input

3. Text-to-Speech
- provider select
- model select
- voice selector
- play preview button
- `Add voices` link button

4. Voice tuning controls
- buffer size
- speed rate
- similarity boost
- stability
- style exaggeration

### 13.3.7 Engine Tab

Sections:

1. Transcription and Interruptions
- precise transcript toggle
- words-before-interrupting control
- helper copy

2. Response Latency
- response rate select
- endpointing slider + numeric input
- linear delay slider + numeric input
- descriptive helper block

3. User Online Detection
- enabled toggle
- language chip area
- follow-up message textarea
- invoke-after slider + numeric input

### 13.3.8 Call Tab

This tab is critical because it must support both providers.

Sections:

1. Call Configuration
- telephony provider dropdown
- ambient noise dropdown
- noise cancellation toggle
- voicemail detection toggle
- keypad input toggle
- auto reschedule toggle

2. Outbound call timing restrictions
- master toggle
- if enabled:
  - start time
  - end time
  - timezone
  - allowed days

3. Final Call Message
- language chips
- textarea

4. Call Management
- hangup on user silence slider + toggle
- total call timeout slider + numeric input
- hangup using prompt toggle
- hangup prompt textarea

Provider-specific behavior:
- selecting `Plivo` or `Exotel` here only chooses which saved credentials/config to use
- credentials are not edited on this page
- show helper text:
  - `Using provider configuration from Settings > Providers`

### 13.3.9 Tools Tab

Purpose:
- define structured tools the LLM can invoke

Tool cards:
- Calendar Availability
- Book Appointment
- Transfer Call
- Custom Function

Each tool card shows:
- title
- short description
- `Add` button

### 13.3.10 Analytics Tab

Purpose:
- post-call automations and extraction behavior

Sections:

1. Post Call Tasks
- webhook URL input
- event docs link
- test or ping button

2. Summarization
- master toggle
- summary style select

3. Extractions
- extraction enabled toggle
- extraction prompt field

4. Custom Analytics
- list of extractors or analytic rules
- `Extract custom analytics` button

### 13.3.11 Inbound Tab

Purpose:
- assign a phone number for inbound calls

Sections:
- current assignment
- available numbers list
- empty state directing to Numbers page

### 13.3.12 Agent Builder States

Must support:
- loading
- unsaved changes
- saved success toast
- validation errors
- test call pending
- missing provider credentials

## 13.4 Call History Page

Route:
- `/calls`
- `/calls/:callId`

Purpose:
- review all calls across campaigns and batches

Layout:
- page title
- filter/search bar
- table
- transcript drawer or details view

Filters:
- status
- provider
- agent
- campaign
- date range

Table columns:
- student
- phone
- campaign or batch
- agent
- duration
- status
- provider
- started at
- actions

Actions:
- play recording
- view transcript
- copy call UUID

Call detail view:
- call UUID
- metadata summary
- waveform/audio player
- summary text
- extracted data block
- transcript turns
- webhook delivery history

## 13.5 My Numbers Page

Route:
- `/numbers`

Purpose:
- manage purchased or imported phone numbers
- assign labels
- map inbound number to agent if needed

Sections:
- numbers list
- add number modal
- provider filter

Each number card shows:
- E.164 number
- label
- provider
- active status
- outbound default status
- assigned agent, if any
- actions

## 13.6 Batches Page

Routes:
- `/batches`
- `/batches/new`
- `/batches/:batchId`

Purpose:
- run one-off bulk call jobs from CSV

List page:
- batch cards with progress bars and quick actions

Create page:
- multi-step flow
  - basic configuration
  - CSV upload
  - review and launch

Detail page tabs:
- overview
- items
- calls

Overview:
- progress stats
- failure breakdown
- queue status

Items:
- list of imported contacts and their latest state

Calls:
- call attempts related to the batch

## 13.7 Campaigns Page

Routes:
- `/campaigns`
- `/campaigns/new`
- `/campaigns/:campaignId/overview`
- `/campaigns/:campaignId/calls`
- `/campaigns/:campaignId/students`

Purpose:
- reusable recurring outreach containers

Campaign list:
- campaign cards
- summary stats
- quick actions

Create campaign:
- choose agent
- choose provider
- choose number
- configure retry window and call window
- optionally upload students immediately

Campaign detail:

Overview tab:
- agent
- provider
- number
- retries
- call window
- aggregated progress

Calls tab:
- call table filtered to campaign

Students tab:
- student list
- upload more CSV
- remove or retry student

## 13.8 Settings Page

Routes:
- `/settings/providers`
- `/settings/ai-services`
- `/settings/storage`
- `/settings/team`

This is where the provider dropdown strategy becomes real.

### 13.8.1 Providers Tab

This page must show both providers, even if one is inactive.

Sections:

1. Active provider selector
- dropdown or segmented control
- `Plivo`
- `Exotel`

2. Plivo configuration card
- Auth ID
- Auth Token
- default number
- optional app or webhook fields
- test connection button

3. Exotel configuration card
- Account SID
- API Key
- API Token
- subdomain or base URL
- app ID or voicebot applet reference
- default number
- test connection button

4. Save action

Important rule:
- do not hide one provider when another is selected
- both config cards stay visible so the manager can prepare both
- active provider only determines the default platform choice

### 13.8.2 AI Services Tab

Cards:
- OpenAI
- Deepgram
- ElevenLabs

Each card:
- masked API key input
- optional model defaults
- test button
- save button

### 13.8.3 Storage Tab

Card:
- AWS access key
- AWS secret key
- region
- bucket name
- optional path prefix
- test connection

### 13.8.4 Team Tab

Sections:
- organization info
- users table
- invite member
- role management

## 14. Component Inventory

These components should exist as reusable frontend building blocks:

- `AppShell`
- `SidebarNav`
- `TopUtilityBar`
- `PromoBanner`
- `PageHeader`
- `ContentCard`
- `PrimaryButton`
- `SecondaryButton`
- `IconButton`
- `InputField`
- `SelectField`
- `TextareaField`
- `SliderField`
- `SwitchField`
- `PillTabs`
- `StatusBadge`
- `MetricCard`
- `ProgressBar`
- `EmptyState`
- `SearchInput`
- `DataTable`
- `Pagination`
- `Drawer`
- `Modal`
- `AudioPlayer`
- `TranscriptTimeline`
- `ProviderConfigCard`
- `VoiceSettingControl`
- `AgentListItem`
- `AgentSummaryStrip`

## 15. Telephony Provider Abstraction

### 15.1 Product Requirement

The manager must be able to set up the system with either provider and switch at the configuration level without changing the rest of the app.

### 15.2 UI Pattern

There are three provider selection levels:

1. Global default in Settings
2. Agent-level preferred telephony provider
3. Campaign or Batch-level selected provider for execution

Selection precedence:

1. Campaign or Batch provider if explicitly chosen
2. Agent provider if set
3. Organization default provider

### 15.3 Backend Contract

Use one provider interface:

- `makeOutboundCall`
- `hangupCall`
- `fetchCallStatus`
- `fetchRecording`
- `normalizeWebhookPayload`
- `buildMediaStreamTarget`

Each provider implementation maps its own API specifics to this contract.

### 15.4 Important Boundary

The media bridge, scheduler, analytics pipeline, and UI must not know telephony-specific REST details.

Only the telephony service layer should know:
- request payload shape
- webhook signature rules
- provider event names
- recording retrieval mechanics

## 16. Conversation State and Media Bridge

### 16.1 Active Session Store

Per call UUID, keep:
- agent snapshot
- telephony provider
- deepgram socket state
- llm turn history
- pending tts playback queue
- voice activity timers
- silence timer
- partial transcript buffer

### 16.2 Call State Machine

Use this state model:

- `initiated`
- `ringing`
- `answered`
- `streaming`
- `listening`
- `thinking`
- `speaking`
- `completed`
- `no_answer`
- `busy`
- `failed`
- `timed_out`

### 16.3 Turn Processing Rules

- only send final utterances to LLM unless interruption logic requires otherwise
- keep partial transcript visible in live state but not as final persisted turn
- suppress duplicate final utterances from provider or STT edge cases
- cap response latency to acceptable range for phone conversation

### 16.4 Hangup Rules

Call should end when:
- interview flow is complete and final message is played
- user silence exceeds configured threshold
- max call timeout is reached
- operator terminates manually
- telephony provider signals call end

## 17. Queue and Scheduling Rules

### 17.1 Queue Types

- campaign dispatch queue
- call attempt queue
- post-call processing queue
- summary or extraction queue
- webhook delivery queue

### 17.2 Concurrency

Concurrency should be configurable per batch or campaign.

### 17.3 Retry Strategy

Suggested behavior:
- `no-answer`: retry after configured delay
- `busy`: retry after shorter delay
- transient provider error: retry with backoff
- completed: never retry

### 17.4 Call Window Logic

Calls should only be placed during allowed local hours.

Default:
- 9:00 AM to 9:00 PM IST

If a job becomes due outside the window:
- delay it to the next open slot

## 18. Recording, Summary, and Extraction Pipeline

### 18.1 Recording

After call end:
- retrieve provider recording or recording URL
- upload to S3
- store the durable storage key and URL

### 18.2 Transcript

Persist:
- full joined transcript text
- optionally turn-level transcript in `CallTurn`

### 18.3 Summary

If enabled:
- generate short recruiter summary
- store against the call

### 18.4 Extraction

If enabled:
- run structured extraction from custom prompt
- persist JSON output

### 18.5 Webhook Delivery

If analytics webhook URL exists:
- send post-call event
- persist delivery attempts and response status

## 19. CSV Upload Rules

CSV upload must support:
- `name`
- `phone`

Optional:
- `email`
- any extra columns mapped into `metadataJson`

Validation:
- dedupe within upload
- normalize phone to E.164 where possible
- reject rows with missing required phone values
- preview before confirmation

## 20. Filters, Search, and Sorting

### 20.1 Search

Required across major list pages:
- agents by name
- campaigns by name
- batches by name
- calls by student or phone
- numbers by label or number

### 20.2 Sorting

Tables should support at least default sorting by:
- most recent updated
- newest created
- recent calls first

## 21. Empty States and Error States

Every page must have an explicit empty state.

Examples:

- no agents
  - CTA to create first agent

- no provider credentials
  - CTA to go to Settings

- no phone numbers
  - CTA to add number

- no calls yet
  - CTA to launch first campaign or batch

## 22. Security and Secrets Handling

Minimum requirements:

- encrypt provider and service credentials at rest
- never return raw secrets in API responses after save
- use masked frontend fields after initial save
- validate webhook origin or signatures where supported
- require auth for all non-webhook routes
- support role-based write access later even if initial build is admin-first

## 23. Environment Variables

```bash
NODE_ENV=development
PORT=3000
SERVER_URL=https://your-public-domain
APP_URL=http://localhost:5173
JWT_SECRET=replace-with-long-secret
ENCRYPTION_KEY=replace-with-32-byte-key

DATABASE_URL=mongodb+srv://username:password@cluster.mongodb.net/voice_screening?appName=Screening
REDIS_URL=redis://localhost:6379

PLIVO_AUTH_ID=
PLIVO_AUTH_TOKEN=
PLIVO_DEFAULT_NUMBER=

EXOTEL_ACCOUNT_SID=
EXOTEL_API_KEY=
EXOTEL_API_TOKEN=
EXOTEL_SUBDOMAIN=
EXOTEL_APP_ID=
EXOTEL_DEFAULT_NUMBER=

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

DEEPGRAM_API_KEY=
DEEPGRAM_MODEL=nova-3

ELEVENLABS_API_KEY=
ELEVENLABS_DEFAULT_VOICE_ID=
ELEVENLABS_DEFAULT_MODEL=eleven_turbo_v2_5

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-south-1
AWS_BUCKET_NAME=voice-screening-recordings
AWS_BUCKET_PREFIX=prod
```

## 24. Local Development Setup

Use Docker Compose for:
- Redis

Development expectations:
- backend runs on `3000`
- frontend runs on `5173`
- ngrok or equivalent may be needed for local telephony webhook testing

## 25. Deployment Assumptions

Target:
- Railway

Requirements:
- public HTTPS
- WebSocket support
- background worker support
- environment variable management
- MongoDB service or Atlas connection
- Redis service

## 26. Delivery Phases

### Phase 1: Foundation

- monorepo setup
- auth shell
- app shell
- database schema
- settings pages
- provider credential storage
- agent list and builder shell

### Phase 2: Agent Builder UX

- all eight tabs
- draft save and edit flows
- numbers and providers integration

### Phase 3: Campaigns and Batches

- CSV upload
- validation
- creation flows
- queue integration

### Phase 4: Telephony and Media Bridge

- provider abstraction
- outbound call initiation
- media WebSocket
- deepgram integration

### Phase 5: Conversational Loop

- OpenAI turn generation
- ElevenLabs synthesis
- call lifecycle completion

### Phase 6: Post-Call Processing

- recordings to S3
- transcripts
- summaries
- extraction
- webhooks

### Phase 7: Analytics and Hardening

- dashboard metrics
- retries
- observability
- failure handling
- polishing

## 27. Acceptance Criteria

The build is successful when:

1. An admin can configure both Plivo and Exotel on the Providers page.
2. An admin can create an agent with all eight builder tabs.
3. A manager can choose telephony provider from a dropdown without editing code.
4. A batch can be created from CSV and queued.
5. A campaign can be created and managed separately from batches.
6. A call receives a unique UUID and persists full metadata.
7. The call history page shows status, transcript, and recording access.
8. The UI visually resembles the attached screenshots in layout and behavior.
9. Routing is page-specific and not collapsed into a single giant route.
10. The architecture remains provider-agnostic beyond the telephony adapter layer.

## 28. Notes for Codex

When implementing from this spec:

- do not invent a different UI direction
- follow the screenshot layout closely
- prefer reusable cards and field controls
- keep the agent builder shell visually consistent across all tabs
- use route-per-page and route-per-tab as specified
- implement provider abstraction early, not as an afterthought
- use UUIDs consistently in database models, route params, and call sessions
- keep business logic modular so that telephony can swap without touching queue or analytics code
