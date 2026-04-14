export type TelephonyProvider = "plivo" | "exotel";

export type AgentTabKey =
  | "agent"
  | "llm"
  | "audio"
  | "engine"
  | "call"
  | "analytics"
  | "inbound";

export interface AgentSummary {
  id: string;
  name: string;
  telephonyProvider: TelephonyProvider;
  updatedAt: string;
}
