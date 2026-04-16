import OpenAI from "openai";
import { env } from "../../config/env.js";

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export class OpenAIService {
  private getClient(apiKey?: string): OpenAI {
    const key = apiKey || env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }
    return new OpenAI({ apiKey: key });
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
      "- Example of WRONG behavior: Candidate says \"What?\" → Agent explains \"Props are used to pass data from parent to child...\" ❌",
      "- Example of CORRECT behavior: Candidate says \"What?\" → Agent says \"Let me repeat. What is the difference between props and state in ReactJS?\" ✓",
      "",
      "CONVERSATION STYLE:",
      "- Always START your response with a brief, natural acknowledgment (1-3 words) that reflects what the candidate just said, BEFORE asking the next question. This makes you sound like a real interviewer who is actually listening.",
      "- Good acknowledgment examples: \"Got it.\", \"That makes sense.\", \"Interesting.\", \"Good explanation.\", \"Thanks for sharing.\", \"I see.\", \"Alright.\", \"Perfect.\", \"Understood.\", \"No problem.\"",
      "- Vary your acknowledgments — don't use the same one every time.",
      "- Match the tone to the answer: if candidate struggled, say \"No problem\" or \"That's okay\". If they explained well, say \"Good explanation\" or \"Great\". If neutral, say \"Got it\" or \"I see\".",
      "",
      "HANDLING INCOMPLETE ANSWERS:",
      "- If a candidate's answer seems too short, incomplete, or vague (e.g. just a few words when a longer answer was expected), ask them to \"please continue\" or \"tell me more\" WITHOUT revealing any part of the answer.",
      "- Never skip ahead to the next question until the candidate has given a reasonably complete answer to the current one.",
      "- If after asking twice for more details the candidate still cannot answer, accept what they said and move to the next question. DO NOT reveal the answer.",
      "",
      "RESPONSE LENGTH:",
      "- Keep your responses short and conversational (1-3 sentences max). This is a phone call, not a written message.",
      "- Ask only ONE question at a time. Wait for the answer before asking the next.",
      "- Never list multiple questions or bullet points. Speak naturally, as one continuous thought."
    ].join("\n");

    return [
      { role: "system", content: systemPrompt + voiceCallGuidelines },
      ...history.map((m) => ({ role: m.role, content: m.content }))
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

  /**
   * Streams LLM response and calls onSentence() for each complete sentence.
   * This allows TTS to start synthesizing the first sentence while the LLM
   * is still generating the rest — cutting latency by 1-2 seconds.
   * Returns the full response text when done.
   */
  async streamNextTurn(
    systemPrompt: string,
    history: ConversationMessage[],
    model: string,
    temperature: number,
    maxTokens: number,
    onSentence: (sentence: string, isLast: boolean) => void,
    apiKey?: string
  ): Promise<string> {
    const client = this.getClient(apiKey);
    const messages = this.buildMessages(systemPrompt, history);

    const stream = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true
    });

    let buffer = "";
    let fullResponse = "";
    const sentenceEnders = /([.!?])\s/;

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? "";
      if (!token) continue;

      buffer += token;
      fullResponse += token;

      // Check if buffer contains a complete sentence
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

    // Flush remaining buffer as the last sentence
    const remaining = buffer.trim();
    if (remaining) {
      onSentence(remaining, true);
    } else {
      // Signal completion even if buffer was empty (last sentence already sent)
      onSentence("", true);
    }

    return fullResponse.trim();
  }

  async summarize(transcript: string, agentName: string): Promise<string> {
    const client = this.getClient();
    const model = env.OPENAI_MODEL ?? "gpt-4o-mini";

    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: `Summarize this voice screening call conducted by AI agent "${agentName}" in 2-3 concise sentences. Focus on candidate's key responses and overall outcome.\n\nTranscript:\n${transcript}`
        }
      ],
      temperature: 0.3,
      max_tokens: 200
    });

    return completion.choices[0]?.message?.content?.trim() ?? "";
  }

  async extract(transcript: string, extractionPrompt: string): Promise<Record<string, unknown>> {
    const client = this.getClient();
    const model = env.OPENAI_MODEL ?? "gpt-4o-mini";

    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "You are a data extraction assistant. Extract information from call transcripts and return valid JSON only."
        },
        {
          role: "user",
          content: `${extractionPrompt}\n\nCall transcript:\n${transcript}\n\nReturn only valid JSON, no markdown.`
        }
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });

    try {
      const raw = completion.choices[0]?.message?.content ?? "{}";
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
