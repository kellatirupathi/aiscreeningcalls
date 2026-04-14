import { env } from "../../config/env.js";
import type { ITelephonyProvider, OutboundCallRequest } from "./ITelephonyProvider.js";

export class PlivoProvider implements ITelephonyProvider {
  private authId: string;
  private authToken: string;
  private baseUrl: string;

  constructor(authId: string, authToken: string) {
    this.authId = authId;
    this.authToken = authToken;
    this.baseUrl = `https://api.plivo.com/v1/Account/${authId}`;
  }

  private get authHeader(): string {
    return `Basic ${Buffer.from(`${this.authId}:${this.authToken}`).toString("base64")}`;
  }

  async makeOutboundCall(request: OutboundCallRequest): Promise<{ providerCallId: string }> {
    const answerUrl = `${env.SERVER_URL}/api/webhooks/plivo/answer/${request.callId}`;
    const statusCallbackUrl = `${env.SERVER_URL}/api/webhooks/plivo/status`;

    const response = await fetch(`${this.baseUrl}/Call/`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: request.from,
        to: request.to,
        answer_url: answerUrl,
        answer_method: "GET",
        hangup_url: statusCallbackUrl,
        hangup_method: "POST",
        ring_timeout: 45,
        time_limit: 3600
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Plivo makeOutboundCall failed (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as { request_uuid: string };
    return { providerCallId: data.request_uuid };
  }

  async hangupCall(providerCallId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/Call/${providerCallId}/`, {
      method: "DELETE",
      headers: { Authorization: this.authHeader }
    });
    // 404 is OK — call may have already ended
    if (!response.ok && response.status !== 404) {
      const errText = await response.text();
      console.error(`[Plivo] hangupCall failed (${response.status}): ${errText}`);
    }
  }

  async fetchCallStatus(providerCallId: string): Promise<{ status: string }> {
    const response = await fetch(`${this.baseUrl}/Call/${providerCallId}/`, {
      headers: { Authorization: this.authHeader }
    });

    if (!response.ok) {
      return { status: "unknown" };
    }

    const data = (await response.json()) as { call_status?: string };
    return { status: data.call_status ?? "unknown" };
  }

  async fetchRecording(providerCallId: string): Promise<{ recordingUrl?: string }> {
    const response = await fetch(
      `${this.baseUrl}/Recording/?call_uuid=${providerCallId}&limit=1`,
      { headers: { Authorization: this.authHeader } }
    );

    if (!response.ok) {
      return {};
    }

    const data = (await response.json()) as { objects?: Array<{ media_url: string }> };
    const url = data.objects?.[0]?.media_url;
    return { recordingUrl: url };
  }
}
