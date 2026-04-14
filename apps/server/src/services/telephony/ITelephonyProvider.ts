export interface OutboundCallRequest {
  to: string;
  from: string;
  callId: string;
  mediaStreamUrl: string;
}

export interface ITelephonyProvider {
  makeOutboundCall(request: OutboundCallRequest): Promise<{ providerCallId: string }>;
  hangupCall(providerCallId: string): Promise<void>;
  fetchCallStatus(providerCallId: string): Promise<{ status: string }>;
  fetchRecording(providerCallId: string): Promise<{ recordingUrl?: string }>;
}
