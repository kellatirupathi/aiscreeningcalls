import { OpenAIService } from "../llm/OpenAIService.js";
import { env } from "../../config/env.js";

export class AnalyticsService {
  private openai = new OpenAIService();

  async buildSummary(transcript: string, agentName: string): Promise<string> {
    if (!env.OPENAI_API_KEY || !transcript.trim()) {
      return "";
    }

    try {
      return await this.openai.summarize(transcript, agentName);
    } catch (err) {
      console.error("[AnalyticsService] summarize error:", (err as Error).message);
      return "";
    }
  }

  async extractData(
    transcript: string,
    extractionPrompt: string
  ): Promise<Record<string, unknown>> {
    if (!env.OPENAI_API_KEY || !transcript.trim() || !extractionPrompt.trim()) {
      return {};
    }

    try {
      return await this.openai.extract(transcript, extractionPrompt);
    } catch (err) {
      console.error("[AnalyticsService] extract error:", (err as Error).message);
      return {};
    }
  }
}
