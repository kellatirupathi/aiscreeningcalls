import { useCallback, useEffect, useRef, useState } from "react";
import { X, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import type { AgentRecord } from "@/types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AgentChatPanelProps {
  agent: AgentRecord;
  onClose: () => void;
}

export function AgentChatPanel({ agent, onClose }: AgentChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Send welcome message on mount
  useEffect(() => {
    if (messages.length === 0 && agent.welcomeMessage.trim()) {
      setMessages([{ role: "assistant", content: agent.welcomeMessage }]);
    }
  }, [agent.welcomeMessage]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setInput("");
    setIsLoading(true);

    try {
      // Call OpenAI via our backend to simulate agent conversation
      const res = await api.post<{ reply: string }>(`/agents/${agent.id}/chat`, {
        messages: updatedHistory.map((m) => ({ role: m.role, content: m.content })),
        systemPrompt: agent.prompt
      });

      setMessages((prev) => [...prev, { role: "assistant", content: res.data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I couldn't process that. Please try again." }
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [input, isLoading, messages, agent.id, agent.prompt]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function handleClear() {
    setMessages(
      agent.welcomeMessage.trim()
        ? [{ role: "assistant", content: agent.welcomeMessage }]
        : []
    );
  }

  return (
    <div className="ab-chat">
      {/* Header */}
      <div className="ab-chat__header">
        <span className="ab-chat__title">Chat with {agent.name || "Agent"}</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="ab-chat__icon-btn" onClick={handleClear} title="Clear chat">
            <Trash2 size={14} />
          </button>
          <button className="ab-chat__icon-btn" onClick={onClose} title="Close chat">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="ab-chat__messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="ab-chat__empty">
            Send a message to test your agent's prompt.
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`ab-chat__bubble ${msg.role === "user" ? "ab-chat__bubble--user" : "ab-chat__bubble--bot"}`}
          >
            {msg.content}
          </div>
        ))}
        {isLoading && (
          <div className="ab-chat__bubble ab-chat__bubble--bot ab-chat__bubble--loading">
            Thinking...
          </div>
        )}
      </div>

      {/* Input */}
      <div className="ab-chat__input-row">
        <input
          ref={inputRef}
          className="ab-chat__input"
          placeholder="Type your message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button
          className="ab-chat__send-btn"
          onClick={() => void sendMessage()}
          disabled={!input.trim() || isLoading}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
