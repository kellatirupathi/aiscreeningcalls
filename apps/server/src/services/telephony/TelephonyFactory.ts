import type { TelephonyProvider } from "@screening/shared";
import type { ITelephonyProvider } from "./ITelephonyProvider.js";
import { ExotelProvider } from "./ExotelProvider.js";
import { PlivoProvider } from "./PlivoProvider.js";
import type { ResolvedTelephonyCredential } from "../credentials/CredentialResolver.js";
import { resolveTelephonyCredential } from "../credentials/CredentialResolver.js";

/**
 * Build a telephony provider from resolved credentials (DB or env fallback).
 * Throws if the credential is missing required fields.
 */
export function createTelephonyProviderFromCredential(
  cred: ResolvedTelephonyCredential
): ITelephonyProvider {
  if (cred.provider === "exotel") {
    return new ExotelProvider(
      cred.accountSid ?? "",
      cred.apiKey ?? "",
      cred.apiToken ?? "",
      cred.subdomain ?? "api",
      cred.appId ?? ""
    );
  }
  return new PlivoProvider(cred.authId ?? "", cred.authToken ?? "");
}

/**
 * Legacy helper: resolve the org's default telephony credential for the given
 * provider and build a provider instance. Used by webhook handlers that don't
 * carry an agent-level credentialId.
 */
export async function createDefaultTelephonyProvider(
  organizationId: string,
  provider: TelephonyProvider
): Promise<ITelephonyProvider> {
  const cred = await resolveTelephonyCredential(organizationId, provider, null);
  return createTelephonyProviderFromCredential(cred);
}
