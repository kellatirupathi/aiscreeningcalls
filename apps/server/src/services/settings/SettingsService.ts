import { env } from "../../config/env.js";

export class SettingsService {
  async getProviderSettings() {
    if (env.PLIVO_AUTH_ID || env.PLIVO_AUTH_TOKEN) {
      return { activeProvider: "plivo" };
    }
    if (env.EXOTEL_ACCOUNT_SID || env.EXOTEL_API_KEY || env.EXOTEL_API_TOKEN) {
      return { activeProvider: "exotel" };
    }
    return { activeProvider: "" };
  }
}
