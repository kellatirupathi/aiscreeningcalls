import OpenAI from "openai";
import { env } from "../../config/env.js";
import type { ConversationMessage } from "./OpenAIService.js";

// Google exposes an OpenAI-compatible endpoint for Gemini models, so we can
// reuse the OpenAI SDK instead of pulling in @google/generative-ai. Same trick
// we already use for Groq.
// Docs: https://ai.google.dev/gemini-api/docs/openai
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

export class GeminiService {
  private getClient(apiKey?: string): OpenAI {
    const key = apiKey || env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }
    return new OpenAI({ apiKey: key, baseURL: GEMINI_BASE_URL });
  }

  private buildMessages(
    systemPrompt: string,
    history: ConversationMessage[]
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const voiceCallGuidelines = [
      "\n\n--- Voice Call Guidelines (always follow) ---",
      "This is a live phone call. You are an INTERVIEWER conducting a technical screening. The candidate's responses may arrive incomplete or cut short due to speech recognition.",
      "",
      "CRITICAL RULE — NEVER REVEAL ANSWERS:",
      "- You are an INTERVIEWER, NOT a teacher. Your job is to ASK questions and evaluate answers.",
      "- NEVER explain, teach, or reveal the answer to any technical question you have asked.",
      "- NEVER give hints, examples, or partial explanations that could help the candidate answer.",
      "- If the candidate says \"What?\", \"Pardon?\", \"Say again?\", \"Repeat please\", \"I didn't catch that\", \"Sorry?\", \"Come again?\", \"Could you repeat?\", or anything similar — ONLY REPEAT THE EXACT SAME QUESTION you asked before, word-for-word or slightly rephrased. DO NOT explain what the concept is. DO NOT give any hints.",
      "- If the candidate says \"I don't know\" or \"I'm not sure\" — respond with \"No problem\" or \"That's okay\" and MOVE ON to the NEXT question. DO NOT tell them the answer.",
      "- If the candidate gives a wrong answer — acknowledge neutrally (\"Okay\", \"Got it\", \"Thanks\") and move on. DO NOT correct them. DO NOT tell them what the right answer was.",
      "",
      "CONVERSATION STYLE:",
      "- Always START your response with a brief, natural acknowledgment (1-3 words) that reflects what the candidate just said, BEFORE asking the next question.",
      "- Good acknowledgment examples: \"Got it.\", \"That makes sense.\", \"Interesting.\", \"Good explanation.\", \"Thanks for sharing.\", \"I see.\", \"Alright.\", \"Perfect.\", \"Understood.\", \"No problem.\"",
      "- Vary your acknowledgments - don't use the same one every time.",
      "- Prefer ONE short spoken sentence whenever possible. Do not split a reply into separate filler sentences unless absolutely necessary.",
      "- When moving to the next question, combine the acknowledgment and the question into one compact response when you can.",
      "- Never respond with a standalone acknowledgment sentence followed by another sentence. Merge them into one compact spoken reply.",
      "- Treat the call as a live conversation, not isolated turns. If the candidate clearly continues the same answer across fragments, respond to the combined answer.",
      "- If the candidate interrupts, stop your previous thought immediately and listen. Never continue the interrupted sentence after the candidate speaks.",
      "- When the candidate only says a short acknowledgment like \"ok\", \"yes\", or \"sure\", respond naturally and do not sound abrupt or robotic.",
      "- After the candidate introduces themselves, ask only whether they are ready to begin. Do NOT list the interview topics at that point.",
      "- Once the candidate says they are ready, ask the first technical question immediately. Do NOT ask whether they are ready again.",
      "",
      "HANDLING INCOMPLETE ANSWERS:",
      "- If a candidate's answer seems too short, incomplete, or vague, ask them to \"please continue\" or \"tell me more\" WITHOUT revealing any part of the answer.",
      "- Do NOT use clarifier prompts like \"please continue\" during greeting, availability check, readiness confirmation, or self-introduction. Use them only after a technical question has already been asked.",
      "- NEVER say: \"Do you know the answer, or should we move to the next question?\"",
      "- Never skip ahead to the next question until the candidate has given a reasonably complete answer to the current one.",
      "- If after asking twice for more details the candidate still cannot answer, accept what they said and move to the next question. DO NOT reveal the answer.",
      "",
      "RESPONSE LENGTH:",
      "- Keep your responses short and conversational (usually 1 sentence, max 2 short sentences). This is a phone call, not a written message.",
      "- Ask only ONE question at a time. Wait for the answer before asking the next.",
      "- Never list multiple questions or bullet points. Speak naturally, as one continuous thought."
    ].join("\n");

    // Gemini (via the OpenAI-compat endpoint) only honours ONE system message.
    // Any additional system-role messages that MediaBridgeServer appends as
    // per-turn state dumps get silently demoted to user-role by Google's
    // proxy → Gemini then treats them as input and echoes them back to the
    // caller. We merge every system message into the primary system prompt
    // here so Gemini receives a single authoritative instruction and the
    // history contains only user/assistant turns.
    const extraSystemMessages: string[] = [];
    const nonSystemHistory = history.filter((m) => {
      if (m.role === "system") {
        extraSystemMessages.push(m.content);
        return false;
      }
      return true;
    });

    const mergedSystemContent = [
      systemPrompt + voiceCallGuidelines,
      ...extraSystemMessages.map((c) => `\n\n--- Turn-level directive ---\n${c}`)
    ].join("");

    return [
      { role: "system", content: mergedSystemContent },
      ...nonSystemHistory.map((m) => ({ role: m.role, content: m.content }))
    ];
  }

  async generateNextTurn(
    systemPrompt: string,
    history: ConversationMessage[],
    model: string,
    temperature: number,
    maxTokens: number,
    apiKey?: string
  ): Promise<string> {
    const client = this.getClient(apiKey);
    const messages = this.buildMessages(systemPrompt, history);

    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    });

    return completion.choices[0]?.message?.content?.trim() ?? "";
  }

  async streamNextTurn(
    systemPrompt: string,
    history: ConversationMessage[],
    model: string,
    temperature: number,
    maxTokens: number,
    onSentence: (sentence: string, isLast: boolean) => void,
    apiKey?: string,
    signal?: AbortSignal
  ): Promise<string> {
    const client = this.getClient(apiKey);
    const messages = this.buildMessages(systemPrompt, history);

    // Diagnostic: log exactly what we're about to send to Google. This lets
    // us see the model string, api-key prefix, and message shape when
    // Google rejects the call with an opaque 400.
    const effectiveKey = apiKey || env.GEMINI_API_KEY || "";
    const messageSummary = messages.map((m) => ({
      role: m.role,
      chars: typeof m.content === "string" ? m.content.length : -1
    }));
    console.log(
      `[Gemini] streamNextTurn → model="${model}" ` +
      `temp=${temperature} maxTokens=${maxTokens} ` +
      `keyPrefix=${effectiveKey.slice(0, 10)}... keyLen=${effectiveKey.length} ` +
      `messages=${JSON.stringify(messageSummary)}`
    );

    let stream;
    try {
      stream = await client.chat.completions.create(
        {
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: true
        },
        signal ? { signal } : undefined
      );
    } catch (err) {
      // Surface everything the OpenAI SDK wrapped up so we can see Google's
      // actual complaint (model not found / bad params / key invalid / etc.)
      const anyErr = err as {
        status?: number;
        message?: string;
        error?: unknown;
        response?: { data?: unknown; status?: number };
      };
      console.error(
        `[Gemini] Request FAILED — status=${anyErr.status ?? "?"} ` +
        `message="${anyErr.message ?? ""}" ` +
        `body=${JSON.stringify(anyErr.error ?? anyErr.response?.data ?? null)}`
      );
      throw err;
    }

    let buffer = "";
    let fullResponse = "";
    const sentenceEnders = /([.!?])\s/;

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? "";
      if (!token) continue;

      buffer += token;
      fullResponse += token;

      let match: RegExpExecArray | null;
      while ((match = sentenceEnders.exec(buffer)) !== null) {
        const sentenceEnd = match.index + match[1].length;
        const sentence = buffer.slice(0, sentenceEnd).trim();
        buffer = buffer.slice(sentenceEnd).trimStart();

        if (sentence) {
          onSentence(sentence, false);
        }
      }
    }

    const remaining = buffer.trim();
    if (remaining) {
      onSentence(remaining, true);
    } else {
      onSentence("", true);
    }

    return fullResponse.trim();
  }
}
