import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  SERVER_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z
    .string()
    .default("mongodb+srv://username:password@cluster.mongodb.net/voice_screening?appName=Screening"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().default("replace-me"),
  ENCRYPTION_KEY: z.string().default("dev-encryption-key-change-this"),
  PLIVO_AUTH_ID: z.string().optional(),
  PLIVO_AUTH_TOKEN: z.string().optional(),
  PLIVO_DEFAULT_NUMBER: z.string().optional(),
  EXOTEL_ACCOUNT_SID: z.string().optional(),
  EXOTEL_API_KEY: z.string().optional(),
  EXOTEL_API_TOKEN: z.string().optional(),
  EXOTEL_SUBDOMAIN: z.string().optional(),
  EXOTEL_APP_ID: z.string().optional(),
  EXOTEL_DEFAULT_NUMBER: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().optional(),
  CARTESIA_API_KEY: z.string().optional(),
  CARTESIA_DEFAULT_VOICE_ID: z.string().optional(),
  CARTESIA_STT_MODEL: z.string().optional(),
  CARTESIA_TTS_MODEL: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  DEEPGRAM_MODEL: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_DEFAULT_VOICE_ID: z.string().optional(),
  ELEVENLABS_DEFAULT_MODEL: z.string().optional(),
  SARVAM_API_KEY: z.string().optional(),
  SARVAM_DEFAULT_VOICE_ID: z.string().optional(),
  SARVAM_TTS_MODEL: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_BUCKET_NAME: z.string().optional(),
  AWS_BUCKET_PREFIX: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  GEMINI_VOICE: z.string().optional()
});

export const env = envSchema.parse(process.env);

// Safety check: crash on startup if production uses default secrets
if (env.NODE_ENV === "production") {
  if (env.ENCRYPTION_KEY === "dev-encryption-key-change-this") {
    throw new Error("ENCRYPTION_KEY must be set to a strong random value in production.");
  }
  if (env.JWT_SECRET === "replace-me") {
    throw new Error("JWT_SECRET must be set to a strong random value in production.");
  }
}
