---
name: Telephony credentials refactor
description: Ongoing refactor to make telephony providers (Plivo, Exotel) support multiple credential accounts per org, mirroring the AI credentials pattern
type: project
---

Telephony providers are being refactored from single-env-var config to multi-credential DB-backed storage, mirroring the AiCredential pattern.

**Why:** User (psm@nxtwave.in) wants every external service (LLM/STT/TTS/Telephony) to follow one unified pattern: multiple accounts per org, one default, agent picks which account to use. Plivo/Exotel are the last holdouts stored in env vars only.

**How to apply:**
- Scope confirmed on 2026-04-21: applies to BOTH Plivo and Exotel
- Auto-seed existing `.env` Plivo values (PLIVO_AUTH_ID/TOKEN/DEFAULT_NUMBER) into DB as the first default credential on startup (like EnvCredentialSeeder does for AI creds)
- Existing agents without a `telephonyCredentialId` should fall back to the org's default telephony credential at call time
- Each telephony credential = Auth ID + Auth Token + Phone Number + Label + isDefault
- Agent creation UI (CallTabView): two-step dropdown — provider → account (showing label + number)
- Agent display must show provider + account label + number
- Runtime resolution: callWorker.ts / MediaBridgeServer.ts must resolve per-agent credential via CredentialResolver, not from env
