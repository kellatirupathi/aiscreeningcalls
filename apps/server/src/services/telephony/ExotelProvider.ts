import { env } from "../../config/env.js";
import type { ITelephonyProvider, OutboundCallRequest } from "./ITelephonyProvider.js";

export class ExotelProvider implements ITelephonyProvider {
  private accountSid: string;
  private apiKey: string;
  private apiToken: string;
  private subdomain: string;
  private appId: string;

  constructor(accountSid: string, apiKey: string, apiToken: string, subdomain: string, appId: string) {
    this.accountSid = accountSid;
    this.apiKey = apiKey;
    this.apiToken = apiToken;
    this.subdomain = subdomain || "api";
    this.appId = appId;
  }

  private get baseUrl(): string {
    return `https://${this.apiKey}:${this.apiToken}@${this.subdomain}.exotel.com/v1/Accounts/${this.accountSid}`;
  }

  async makeOutboundCall(request: OutboundCallRequest): Promise<{ providerCallId: string }> {
    const statusCallbackUrl = `${env.SERVER_URL}/api/webhooks/exotel/status`;

    const body = new URLSearchParams({
      From: request.from,
      To: request.to,
      CallerId: request.from,
      StatusCallback: statusCallbackUrl,
      StatusCallbackEvents: "terminal",
      StatusCallbackContentType: "application/json",
      CustomField: request.callId
    });

    if (this.appId) {
      body.append("Url", `http://my.exotel.com/exoml/start/${this.appId}`);
    }

    const response = await fetch(`${this.baseUrl}/Calls/connect.json`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Exotel makeOutboundCall failed (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as { Call?: { Sid?: string } };
    return { providerCallId: data.Call?.Sid ?? `exotel-${request.callId}` };
  }

  async hangupCall(providerCallId: string): Promise<void> {
    const body = new URLSearchParams({ Status: "completed" });
    const response = await fetch(`${this.baseUrl}/Calls/${providerCallId}.json`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    if (!response.ok && response.status !== 404) {
      const errText = await response.text();
      console.error(`[Exotel] hangupCall failed (${response.status}): ${errText}`);
    }
  }

  async fetchCallStatus(providerCallId: string): Promise<{ status: string }> {
    const response = await fetch(`${this.baseUrl}/Calls/${providerCallId}.json`);
    if (!response.ok) return { status: "unknown" };
    const data = (await response.json()) as { Call?: { Status?: string } };
    return { status: data.Call?.Status?.toLowerCase() ?? "unknown" };
  }

  async fetchRecording(providerCallId: string): Promise<{ recordingUrl?: string }> {
    const response = await fetch(`${this.baseUrl}/Calls/${providerCallId}/Recordings.json`);
    if (!response.ok) return {};
    const data = (await response.json()) as {
      Recordings?: { Recording?: Array<{ Uri?: string }> };
    };
    const uri = data.Recordings?.Recording?.[0]?.Uri;
    if (!uri) return {};
    const recordingUrl = uri.startsWith("http") ? uri : `https://${this.subdomain}.exotel.com${uri}`;
    return { recordingUrl };
  }
}
