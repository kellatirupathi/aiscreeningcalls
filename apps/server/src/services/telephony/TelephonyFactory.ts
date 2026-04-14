import type { TelephonyProvider } from "@screening/shared";
import { env } from "../../config/env.js";
import type { ITelephonyProvider } from "./ITelephonyProvider.js";
import { ExotelProvider } from "./ExotelProvider.js";
import { PlivoProvider } from "./PlivoProvider.js";

export function createTelephonyProvider(provider: TelephonyProvider): ITelephonyProvider {
  if (provider === "exotel") {
    return new ExotelProvider(
      env.EXOTEL_ACCOUNT_SID ?? "",
      env.EXOTEL_API_KEY ?? "",
      env.EXOTEL_API_TOKEN ?? "",
      env.EXOTEL_SUBDOMAIN ?? "api",
      env.EXOTEL_APP_ID ?? ""
    );
  }

  return new PlivoProvider(
    env.PLIVO_AUTH_ID ?? "",
    env.PLIVO_AUTH_TOKEN ?? ""
  );
}
