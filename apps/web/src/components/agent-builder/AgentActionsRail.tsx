import { useState } from "react";
import { Trash2, Phone, PhoneIncoming, Hash, List, Save, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { AgentRecord } from "@/types";

interface AgentActionsRailProps {
  agent?: AgentRecord;
  isDirty?: boolean;
  isSaving?: boolean;
  isDeleting?: boolean;
  isChatOpen?: boolean;
  onSave?: () => void;
  onDelete?: () => void;
  onSetInbound?: () => void;
  onRequestTest?: (mode: "call" | "browser", phoneNumber: string) => void;
  onToggleChat?: () => void;
}

export function AgentActionsRail({
  agent,
  isDirty,
  isSaving,
  isDeleting,
  isChatOpen,
  onSave,
  onDelete,
  onSetInbound,
  onRequestTest,
  onToggleChat
}: AgentActionsRailProps) {
  const [phoneNumber, setPhoneNumber] = useState("+91");

  return (
    <div className="ab-rail">
      {/* Test Call Section */}
      <div className="ab-rail__section">
        <div className="ab-rail__section-title">Test Call</div>
        <Input
          placeholder="+91XXXXXXXXXX"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
        />
        <Button
          variant="primary"
          fullWidth
          onClick={() => onRequestTest?.("call", phoneNumber)}
          disabled={!agent?.id || isSaving || phoneNumber.length < 10}
        >
          <Phone size={14} />
          <span>Get call from agent</span>
        </Button>
        <Button
          fullWidth
          variant={isChatOpen ? "primary" : undefined}
          onClick={onToggleChat}
          disabled={!agent?.id}
        >
          <MessageSquare size={14} />
          <span>{isChatOpen ? "Close chat" : "Chat with agent"}</span>
        </Button>
      </div>

      {/* Actions Section */}
      <div className="ab-rail__section">
        <div className="ab-rail__section-title">Actions</div>
        <Button fullWidth onClick={onSetInbound} disabled={!agent?.id}>
          <PhoneIncoming size={14} />
          <span>Set inbound agent</span>
        </Button>
        <Link to="/numbers" style={{ display: "block" }}>
          <Button fullWidth>
            <Hash size={14} />
            <span>Phone numbers</span>
          </Button>
        </Link>
        <Link to="/calls" style={{ display: "block" }}>
          <Button fullWidth>
            <List size={14} />
            <span>Call logs</span>
          </Button>
        </Link>
      </div>

      {/* Save/Delete Section */}
      <div className="ab-rail__section ab-rail__section--save">
        <div className="ab-rail__save-row">
          <Button variant="primary" fullWidth onClick={onSave} disabled={!agent?.id || isSaving}>
            <Save size={14} />
            <span>{isSaving ? "Saving..." : "Save agent"}</span>
          </Button>
          <Button
            className="ab-rail__delete-btn"
            aria-label="Delete agent"
            onClick={onDelete}
            disabled={!agent?.id || isDeleting}
          >
            <Trash2 size={14} />
          </Button>
        </div>
        <div className="ab-rail__status">
          {isDirty ? "Unsaved changes" : agent?.updatedAt || "Not saved yet"}
        </div>
      </div>
    </div>
  );
}
