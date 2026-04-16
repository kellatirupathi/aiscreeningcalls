interface AgentEntity {
  id: string;
  name: string;
  updatedAt: Date;
  conversationEngine: string;
  geminiModel: string;
  geminiVoice: string;
  telephonyProvider: string;
  welcomeMessage: string;
  systemPrompt: string;
  language: string;
  llmProvider: string;
  llmModel: string;
  llmMaxTokens: number;
  llmTemperature: number;
  llmCredentialId: string | null;
  sttProvider: string;
  sttModel: string;
  sttCredentialId: string | null;
  keywords: string | null;
  ttsProvider: string;
  ttsModel: string;
  ttsVoiceId: string | null;
  ttsCredentialId: string | null;
  geminiCredentialId: string | null;
  ttsBufferSize: number;
  ttsSpeedRate: number;
  ttsSimilarityBoost: number;
  ttsStability: number;
  ttsStyleExaggeration: number;
  preciseTranscript: boolean;
  interruptAfterWords: number;
  responseRate: string;
  endpointingMs: number;
  linearDelayMs: number;
  userOnlineDetection: boolean;
  userOnlinePrompt: string | null;
  invokeAfterSeconds: number;
  ambientNoise: string;
  noiseCancellation: boolean;
  voicemailDetection: boolean;
  dtmfEnabled: boolean;
  autoReschedule: boolean;
  hangupOnSilence: boolean;
  hangupOnSilenceSeconds: number;
  callTimeoutSeconds: number;
  finalMessage: string | null;
  analyticsWebhookUrl: string | null;
  summarizationEnabled: boolean;
  extractionEnabled: boolean;
  extractionPrompt: string | null;
  inboundNumberId: string | null;
}

interface PhoneNumberEntity {
  id: string;
  provider: string;
  phoneNumber: string;
  label: string;
  isActive: boolean;
  isDefaultOutbound: boolean;
  assignedAgentId: string | null;
}

interface StudentEntity {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  latestStatus: string;
  lastCalledAt: Date | null;
}

interface CampaignEntity {
  id: string;
  name: string;
  telephonyProvider: string;
  fromNumber: string;
  status: string;
  createdAt: Date;
}

interface BatchEntity {
  id: string;
  agentId: string;
  name: string;
  telephonyProvider: string;
  totalItems: number;
  processedItems: number;
  successCount: number;
  failedCount: number;
  status: string;
}

interface CallTurnEntity {
  speaker: string;
  text: string;
  sequence: number;
}

interface CallEntity {
  id: string;
  telephonyProvider: string;
  status: string;
  startedAt: Date;
  durationSeconds: number | null;
  summaryText: string | null;
  targetName: string | null;
  targetPhone: string | null;
  student: StudentEntity | null;
  campaign: CampaignEntity | null;
  agent: AgentEntity | null;
  turns: Array<CallTurnEntity>;
}

function sentenceCase(value: string) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function titleCase(value: string) {
  return value
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((part) => sentenceCase(part.toLowerCase()))
    .join(" ");
}

function presentCallStatus(status: string) {
  switch (status) {
    case "completed":
      return "Completed";
    case "no-answer":
      return "No Answer";
    case "failed":
      return "Failed";
    case "in-progress":
    case "ringing":
      return "Running";
    default:
      return titleCase(status);
  }
}

export function formatDuration(durationSeconds?: number | null) {
  if (durationSeconds == null) {
    return "--";
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;

  return `${minutes}m ${seconds}s`;
}

export function formatRelativeTime(value?: Date | null) {
  if (!value) {
    return "--";
  }

  const diff = Date.now() - value.getTime();
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;

  if (diff < hour) {
    const minutes = Math.max(1, Math.floor(diff / minute));
    return `${minutes}m ago`;
  }

  if (diff < day) {
    const hours = Math.max(1, Math.floor(diff / hour));
    return `${hours}h ago`;
  }

  if (diff < day * 7) {
    const days = Math.max(1, Math.floor(diff / day));
    return `${days}d ago`;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(value);
}

export function formatUpdatedAt(value?: Date | null) {
  if (!value) {
    return "";
  }

  const diff = Date.now() - value.getTime();
  const day = 1000 * 60 * 60 * 24;
  const days = Math.max(0, Math.floor(diff / day));

  if (days === 0) {
    return "Updated today";
  }

  if (days === 1) {
    return "Updated 1 day ago";
  }

  return `Updated ${days} days ago`;
}

export function maskSecret(value?: string | null) {
  if (!value) {
    return "";
  }

  const visibleTail = value.slice(-4);

  return `${"•".repeat(Math.max(8, value.length - 4))}${visibleTail}`;
}

export function computeCompletionRate(calls: Array<{ status: string }>) {
  if (calls.length === 0) {
    return "0%";
  }

  const completed = calls.filter((call) => call.status === "completed").length;

  return `${Math.round((completed / calls.length) * 100)}%`;
}

export function summarizeTranscript(turns: Array<CallTurnEntity>) {
  return turns.map((turn: CallTurnEntity) => `${titleCase(turn.speaker)}: ${turn.text}`).join("\n");
}

export function mapAgent(agent: AgentEntity) {
  return {
    id: agent.id,
    name: agent.name,
    updatedAt: formatUpdatedAt(agent.updatedAt),
    conversationEngine: agent.conversationEngine as "pipeline" | "gemini-live",
    geminiModel: agent.geminiModel,
    geminiVoice: agent.geminiVoice,
    telephonyProvider: agent.telephonyProvider as "plivo" | "exotel",
    costPerMinute: "",
    welcomeMessage: agent.welcomeMessage,
    prompt: agent.systemPrompt,
    llmProvider: titleCase(agent.llmProvider),
    llmModel: agent.llmModel,
    llmTokens: agent.llmMaxTokens,
    llmTemperature: agent.llmTemperature,
    llmCredentialId: agent.llmCredentialId ?? "",
    language: agent.language,
    sttProvider: titleCase(agent.sttProvider),
    sttModel: agent.sttModel,
    sttCredentialId: agent.sttCredentialId ?? "",
    keywords: agent.keywords ?? "",
    ttsProvider: titleCase(agent.ttsProvider),
    ttsModel: agent.ttsModel,
    ttsVoiceName: agent.ttsVoiceId ?? "Not configured",
    ttsCredentialId: agent.ttsCredentialId ?? "",
    geminiCredentialId: agent.geminiCredentialId ?? "",
    ttsBufferSize: agent.ttsBufferSize,
    ttsSpeedRate: agent.ttsSpeedRate,
    ttsSimilarityBoost: agent.ttsSimilarityBoost,
    ttsStability: agent.ttsStability,
    ttsStyleExaggeration: agent.ttsStyleExaggeration,
    preciseTranscript: agent.preciseTranscript,
    interruptAfterWords: agent.interruptAfterWords,
    responseRate: agent.responseRate,
    endpointingMs: agent.endpointingMs,
    linearDelayMs: agent.linearDelayMs,
    userOnlineDetection: agent.userOnlineDetection,
    userOnlinePrompt: agent.userOnlinePrompt ?? "",
    invokeAfterSeconds: agent.invokeAfterSeconds,
    ambientNoise: agent.ambientNoise,
    noiseCancellation: agent.noiseCancellation,
    voicemailDetection: agent.voicemailDetection,
    dtmfEnabled: agent.dtmfEnabled,
    autoReschedule: agent.autoReschedule,
    finalCallMessage: agent.finalMessage ?? "",
    hangupOnSilence: agent.hangupOnSilence,
    hangupOnSilenceSeconds: agent.hangupOnSilenceSeconds,
    callTimeoutSeconds: agent.callTimeoutSeconds,
    analyticsWebhookUrl: agent.analyticsWebhookUrl ?? "",
    summarizationEnabled: agent.summarizationEnabled,
    extractionEnabled: agent.extractionEnabled,
    extractionPrompt: agent.extractionPrompt ?? "",
    inboundNumberId: agent.inboundNumberId ?? undefined
  };
}

export function mapPhoneNumber(number: PhoneNumberEntity, assignedAgentName?: string) {
  return {
    id: number.id,
    provider: number.provider as "plivo" | "exotel",
    phoneNumber: number.phoneNumber,
    label: number.label,
    isActive: number.isActive,
    isDefaultOutbound: number.isDefaultOutbound,
    assignedAgentId: number.assignedAgentId ?? undefined,
    assignedAgentName
  };
}

export function mapCall(call: CallEntity) {
  return {
    id: call.id,
    studentName: call.student?.name ?? call.targetName ?? "Unknown student",
    phone: call.student?.phone ?? call.targetPhone ?? "--",
    campaignName: call.campaign?.name ?? "--",
    agentName: call.agent?.name ?? "--",
    duration: formatDuration(call.durationSeconds),
    status: presentCallStatus(call.status) as "Completed" | "No Answer" | "Failed" | "Running",
    provider: call.telephonyProvider as "plivo" | "exotel",
    startedAt: formatRelativeTime(call.startedAt),
    summary: call.summaryText ?? "",
    transcript: call.turns.map((turn) => ({
      speaker: turn.speaker === "assistant" ? ("Bot" as const) : ("Candidate" as const),
      text: turn.text
    }))
  };
}

export function mapCampaign(
  campaign: CampaignEntity & {
    agent: AgentEntity;
    students: Array<StudentEntity>;
  }
) {
  const completedStudents = campaign.students.filter((student) => student.latestStatus === "completed").length;
  const failedStudents = campaign.students.filter((student) =>
    ["failed", "no-answer", "busy"].includes(student.latestStatus)
  ).length;
  const pendingStudents = Math.max(0, campaign.students.length - completedStudents - failedStudents);

  return {
    id: campaign.id,
    name: campaign.name,
    agentName: campaign.agent.name,
    telephonyProvider: campaign.telephonyProvider as "plivo" | "exotel",
    fromNumber: campaign.fromNumber,
    status: titleCase(campaign.status) as "Running" | "Paused" | "Completed" | "Draft",
    totalStudents: campaign.students.length,
    completedStudents,
    failedStudents,
    pendingStudents,
    createdAt: formatRelativeTime(campaign.createdAt)
  };
}

export function mapStudent(student: StudentEntity) {
  return {
    id: student.id,
    name: student.name,
    phone: student.phone,
    email: student.email,
    status: titleCase(student.latestStatus),
    lastCalledAt: formatRelativeTime(student.lastCalledAt)
  };
}

export interface CallRatingEntity {
  id: string;
  callId: string;
  candidatePhone: string | null;
  candidateName: string | null;
  selfIntroRating: number | null;
  selfIntroReason: string | null;
  communicationRating: number | null;
  communicationReason: string | null;
  skillRatings: unknown;
  overallRating: number | null;
  model: string;
  status: string;
  errorMessage: string | null;
  generatedAt: Date;
}

export interface RatedCallEntity {
  id: string;
  telephonyProvider: string;
  status: string;
  subStatus: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  recordingUrl: string | null;
  ratingStatus: string;
  campaignId: string | null;
  organizationId: string;
  targetName: string | null;
  targetPhone: string | null;
  extractedDataJson: unknown;
  student: StudentEntity | null;
  campaign: CampaignEntity | null;
  agent: (AgentEntity & { ratingSkills?: unknown }) | null;
  rating: CallRatingEntity | null;
}

export function mapRatedCall(call: RatedCallEntity) {
  const skillRatings =
    call.rating?.skillRatings && typeof call.rating.skillRatings === "object"
      ? (call.rating.skillRatings as Record<string, { rating: number | null; reason: string; evidence: string }>)
      : {};

  const source: "test" | "campaign" | "batch" = call.campaignId ? "campaign" : "test";
  const agentSkills = Array.isArray(call.agent?.ratingSkills)
    ? ((call.agent?.ratingSkills as unknown[]).filter((v): v is string => typeof v === "string"))
    : [];

  const resolvedPhone = call.student?.phone ?? call.targetPhone ?? call.rating?.candidatePhone ?? null;
  const resolvedName = call.student?.name ?? call.targetName ?? call.rating?.candidateName ?? null;

  return {
    id: call.id,
    ratingStatus: call.ratingStatus,
    callStatus: presentCallStatus(call.status),
    source,
    candidateName: resolvedName ?? "Test Caller",
    candidatePhone: resolvedPhone,
    phone: resolvedPhone ?? "--",
    agentId: call.agent?.id ?? "",
    agentName: call.agent?.name ?? "--",
    campaignName: call.campaign?.name ?? "--",
    provider: call.telephonyProvider as "plivo" | "exotel",
    durationSeconds: call.durationSeconds ?? 0,
    duration: formatDuration(call.durationSeconds),
    startedAt: formatRelativeTime(call.startedAt),
    startedAtIso: call.startedAt.toISOString(),
    endedAtIso: call.endedAt ? call.endedAt.toISOString() : null,
    recordingUrl: call.recordingUrl ?? null,
    agentSkills,
    selfIntroRating: call.rating?.selfIntroRating ?? null,
    selfIntroReason: call.rating?.selfIntroReason ?? "",
    communicationRating: call.rating?.communicationRating ?? null,
    communicationReason: call.rating?.communicationReason ?? "",
    skillRatings,
    overallRating: call.rating?.overallRating ?? null,
    ratingModel: call.rating?.model ?? "",
    ratingError: call.rating?.errorMessage ?? null,
    ratingGeneratedAt: call.rating?.generatedAt ? formatRelativeTime(call.rating.generatedAt) : null,
    endReason: presentEndReason(call.status, call.subStatus),
    subStatus: call.subStatus ?? null,
    callbackNote: extractCallbackNote(call.extractedDataJson)
  };
}

function presentEndReason(status: string, subStatus: string | null): string {
  if (subStatus === "callback-requested") return "Callback requested";
  switch (status) {
    case "completed": return "Completed all questions";
    case "silence-timeout": return "Candidate went silent";
    case "timeout": return "Call time limit reached";
    case "no-answer": return "No answer";
    case "busy": return "Line busy";
    case "failed": return "Call failed";
    case "disconnected": return "Call dropped";
    default: return presentCallStatus(status);
  }
}

function extractCallbackNote(data: unknown): string | null {
  if (data && typeof data === "object" && "callbackNote" in data) {
    return String((data as Record<string, unknown>).callbackNote);
  }
  return null;
}

export function mapBatch(batch: BatchEntity, agentName?: string) {
  return {
    id: batch.id,
    name: batch.name,
    agentName: agentName ?? "--",
    telephonyProvider: batch.telephonyProvider as "plivo" | "exotel",
    totalItems: batch.totalItems,
    processedItems: batch.processedItems,
    successCount: batch.successCount,
    failedCount: batch.failedCount,
    status: titleCase(batch.status) as "Running" | "Paused" | "Completed" | "Draft"
  };
}
