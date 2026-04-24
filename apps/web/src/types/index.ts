export type TelephonyProvider = "plivo" | "exotel";
export type UserRole = "admin" | "manager" | "recruiter" | "viewer" | string;

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  organization: {
    id: string;
    name: string;
    slug: string;
    _count: {
      users: number;
    };
  };
}

export interface MetricStat {
  label: string;
  value: string;
  change: string;
  tone?: "default" | "success" | "warning";
}

export type ConversationEngine = "pipeline" | "gemini-live";

export interface AgentRecord {
  id: string;
  name: string;
  updatedAt: string;
  conversationEngine: ConversationEngine;
  geminiModel: string;
  geminiVoice: string;
  telephonyProvider: TelephonyProvider;
  telephonyCredentialId: string;
  costPerMinute?: string;
  welcomeMessage: string;
  prompt: string;
  llmProvider: string;
  llmModel: string;
  llmTokens: number;
  llmTemperature: number;
  llmCredentialId: string;
  language: string;
  sttProvider: string;
  sttModel: string;
  sttCredentialId: string;
  keywords: string;
  ttsProvider: string;
  ttsModel: string;
  ttsVoiceName: string;
  ttsCredentialId: string;
  geminiCredentialId: string;
  ttsBufferSize: number;
  ttsSpeedRate: number;
  ttsSampleRate: number;
  ttsSimilarityBoost: number;
  ttsStability: number;
  ttsStyleExaggeration: number;
  preciseTranscript: boolean;
  interruptAfterWords: number;
  responseRate: string;
  endpointingMs: number;
  linearDelayMs: number;
  userOnlineDetection: boolean;
  userOnlinePrompt: string;
  invokeAfterSeconds: number;
  ambientNoise: string;
  noiseCancellation: boolean;
  voicemailDetection: boolean;
  dtmfEnabled: boolean;
  autoReschedule: boolean;
  finalCallMessage: string;
  hangupOnSilence: boolean;
  hangupOnSilenceSeconds: number;
  callTimeoutSeconds: number;
  analyticsWebhookUrl: string;
  summarizationEnabled: boolean;
  extractionEnabled: boolean;
  extractionPrompt: string;
  inboundNumberId?: string;
}

export interface CallRecord {
  id: string;
  studentName: string;
  phone: string;
  campaignName: string;
  agentName: string;
  duration: string;
  status: "Completed" | "No Answer" | "Failed" | "Running";
  provider: TelephonyProvider;
  startedAt: string;
  summary: string;
  transcript: Array<{ speaker: "Bot" | "Candidate"; text: string }>;
}

export interface CampaignRecord {
  id: string;
  name: string;
  agentName: string;
  telephonyProvider: TelephonyProvider;
  fromNumber: string;
  status: "Running" | "Paused" | "Completed" | "Draft";
  totalStudents: number;
  completedStudents: number;
  failedStudents: number;
  pendingStudents: number;
  createdAt: string;
}

export interface BatchRecord {
  id: string;
  name: string;
  agentName: string;
  telephonyProvider: TelephonyProvider;
  totalItems: number;
  processedItems: number;
  successCount: number;
  failedCount: number;
  status: "Running" | "Paused" | "Completed" | "Draft";
}

export interface SkillRating {
  rating: number | null;
  reason: string;
  evidence: string;
}

export interface RatingRow {
  id: string;
  ratingStatus: "pending" | "rated" | "failed" | "skipped" | string;
  callStatus: string;
  source: "test" | "campaign" | "batch";
  candidateName: string;
  candidatePhone?: string | null;
  phone: string;
  agentId: string;
  agentName: string;
  campaignName: string;
  provider: TelephonyProvider;
  durationSeconds: number;
  duration: string;
  startedAt: string;
  startedAtIso: string;
  endedAtIso: string | null;
  recordingUrl: string | null;
  agentSkills: string[];
  selfIntroRating: number | null;
  selfIntroReason: string;
  communicationRating: number | null;
  communicationReason: string;
  skillRatings: Record<string, SkillRating>;
  overallRating: number | null;
  ratingModel: string;
  ratingError: string | null;
  ratingGeneratedAt: string | null;
  endReason: string;
  subStatus: string | null;
  callbackNote: string | null;
}

export interface RatingsResponse {
  rows: RatingRow[];
  skillColumns: string[];
  pendingCount: number;
}

export interface RatingDetail extends RatingRow {
  transcript: Array<{ speaker: "Agent" | "Candidate"; text: string }>;
  summary: string;
}

export interface NumberRecord {
  id: string;
  provider: TelephonyProvider;
  phoneNumber: string;
  label: string;
  isActive: boolean;
  isDefaultOutbound: boolean;
  assignedAgentId?: string;
  assignedAgentName?: string;
}

export interface ProviderSettings {
  activeProvider: TelephonyProvider | "";
  plivo: {
    authId: string;
    authToken: string;
    defaultNumber: string;
  };
  exotel: {
    accountSid: string;
    apiKey: string;
    apiToken: string;
    subdomain: string;
    appId: string;
    defaultNumber: string;
  };
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface ServiceSettings {
  apiKey: string;
  defaultModel: string;
}

export interface StorageSettings {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucketName: string;
}

export interface CartesiaSettings {
  apiKey: string;
  defaultVoiceId: string;
  sttModel: string;
  ttsModel: string;
}

export interface GeminiSettings {
  apiKey: string;
  defaultModel: string;
  defaultVoice: string;
}

export interface SettingsRecord {
  providers: ProviderSettings;
  aiServices: {
    openai: ServiceSettings;
    gemini: GeminiSettings;
    cartesia: CartesiaSettings;
    deepgram: ServiceSettings;
    elevenlabs: ServiceSettings;
  };
  storage: StorageSettings;
  team: TeamMember[];
}

export interface StudentRecord {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  status: string;
  lastCalledAt: string;
}

export interface DashboardOverview {
  stats: MetricStat[];
  callVolume: Array<{ day: string; value: number }>;
  activeCampaigns: CampaignRecord[];
  recentCalls: CallRecord[];
  totalCost: number;
}
