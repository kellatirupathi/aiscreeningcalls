import { useState } from "react";
import { Copy, Check, Share2, Cpu } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { AgentRecord } from "@/types";

interface AgentSummaryCardProps {
  agent: AgentRecord;
  onAgentChange: (changes: Partial<AgentRecord>) => void;
  onCopyId: () => void;
  onShare: () => void;
}

export function AgentSummaryCard({ agent, onAgentChange, onCopyId, onShare }: AgentSummaryCardProps) {
  const [idCopied, setIdCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  function handleCopyId() {
    onCopyId();
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 2000);
  }

  function handleShare() {
    onShare();
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  return (
    <div className="ab-summary">
      <div className="ab-summary__top">
        <input
          className="ab-summary__name"
          value={agent.name}
          placeholder="My New Agent"
          onChange={(event) => onAgentChange({ name: event.target.value })}
        />
        <div className="ab-summary__actions">
          <Button onClick={handleCopyId}>
            {idCopied ? <><Check size={14} /><span>Copied</span></> : <><Copy size={14} /><span>ID</span></>}
          </Button>
          <Button onClick={handleShare}>
            {shareCopied ? <><Check size={14} /><span>Copied</span></> : <><Share2 size={14} /><span>Share</span></>}
          </Button>
        </div>
      </div>

      <div className="ab-summary__chips">
        <div className="ab-summary__chip ab-summary__chip--provider">
          <Cpu size={13} />
          <span>{agent.telephonyProvider === "plivo" ? "Plivo" : "Exotel"}</span>
        </div>
        <div className="ab-summary__chip">
          <span>{agent.llmProvider} / {agent.llmModel}</span>
        </div>
        <div className="ab-summary__chip">
          <span>STT: {agent.sttProvider}</span>
        </div>
        <div className="ab-summary__chip">
          <span>TTS: {agent.ttsProvider}</span>
        </div>
      </div>

      <div className="ab-summary__bar">
        <span className="segment segment--green" />
        <span className="segment segment--orange" />
        <span className="segment segment--slate" />
        <span className="segment segment--amber" />
        <span className="segment segment--blue" />
      </div>
      <div className="ab-summary__legend">
        <span>Transcriber</span>
        <span>LLM</span>
        <span>Voice</span>
        <span>Telephony</span>
        <span>Platform</span>
      </div>
    </div>
  );
}
