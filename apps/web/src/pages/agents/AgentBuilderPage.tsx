import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AgentActionsRail } from "@/components/agent-builder/AgentActionsRail";
import { AgentChatPanel } from "@/components/agent-builder/AgentChatPanel";
import { AgentListPanel } from "@/components/agent-builder/AgentListPanel";
import { AgentSummaryCard } from "@/components/agent-builder/AgentSummaryCard";
import { AgentBuilderTabs } from "@/components/agent-builder/AgentBuilderTabs";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAgent, useAgentTestCall, useCreateAgent, useDeleteAgent, useUpdateAgent } from "@/hooks/useAgents";
import { useAgentEditorStore } from "@/stores/agentEditorStore";
import type { AgentRecord } from "@/types";
import AgentTabView from "./agent-tabs/AgentTabView";
import LLMTabView from "./agent-tabs/LLMTabView";
import AudioTabView from "./agent-tabs/AudioTabView";
import EngineTabView from "./agent-tabs/EngineTabView";
import CallTabView from "./agent-tabs/CallTabView";
import AnalyticsTabView from "./agent-tabs/AnalyticsTabView";
import InboundTabView from "./agent-tabs/InboundTabView";
import type { AgentTabKey } from "@screening/shared";
import { toast } from "@/components/ui/Toast";

interface AgentBuilderPageProps {
  tab: AgentTabKey;
}

function createDraftAgent(): AgentRecord {
  return {
    id: "",
    name: "My New Agent",
    updatedAt: "",
    conversationEngine: "pipeline",
    geminiModel: "gemini-2.0-flash-live-001",
    geminiVoice: "Kore",
    telephonyProvider: "plivo",
    telephonyCredentialId: "",
    welcomeMessage: "",
    prompt: "",
    llmProvider: "OpenAI",
    llmModel: "gpt-4o-mini",
    llmTokens: 450,
    llmTemperature: 0.2,
    llmCredentialId: "",
    language: "English",
    sttProvider: "cartesia",
    sttModel: "ink-whisper",
    sttCredentialId: "",
    keywords: "",
    ttsProvider: "cartesia",
    ttsModel: "sonic-2",
    ttsVoiceName: "",
    ttsCredentialId: "",
    geminiCredentialId: "",
    ttsBufferSize: 200,
    ttsSpeedRate: 1,
    ttsSampleRate: 8000,
    ttsSimilarityBoost: 0.75,
    ttsStability: 0.5,
    ttsStyleExaggeration: 0,
    preciseTranscript: false,
    interruptAfterWords: 2,
    responseRate: "Balanced",
    endpointingMs: 100,
    linearDelayMs: 200,
    userOnlineDetection: false,
    userOnlinePrompt: "",
    invokeAfterSeconds: 9,
    ambientNoise: "None",
    noiseCancellation: false,
    voicemailDetection: false,
    dtmfEnabled: false,
    autoReschedule: false,
    finalCallMessage: "",
    hangupOnSilence: true,
    hangupOnSilenceSeconds: 20,
    callTimeoutSeconds: 600,
    analyticsWebhookUrl: "",
    summarizationEnabled: false,
    extractionEnabled: false,
    extractionPrompt: ""
  };
}

function normalizeImportedAgent(payload: Partial<AgentRecord>) {
  const seed = createDraftAgent();

  return {
    ...seed,
    ...payload,
    prompt: payload.prompt ?? seed.prompt,
    finalCallMessage: payload.finalCallMessage ?? seed.finalCallMessage,
    ttsVoiceName: payload.ttsVoiceName ?? seed.ttsVoiceName
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === "object" &&
    "response" in error &&
    error.response &&
    typeof error.response === "object" &&
    "data" in error.response &&
    error.response.data &&
    typeof error.response.data === "object" &&
    "message" in error.response.data &&
    typeof error.response.data.message === "string"
  ) {
    return error.response.data.message;
  }

  return fallback;
}

export default function AgentBuilderPage({ tab }: AgentBuilderPageProps) {
  const navigate = useNavigate();
  const { agentId } = useParams();
  const isDraftRoute = !agentId;
  const { data: fetchedAgent, isLoading } = useAgent(agentId);
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent(agentId ?? "");
  const deleteAgent = useDeleteAgent();
  const requestTestCall = useAgentTestCall(agentId);
  const creationStartedRef = useRef(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const { drafts, hydrateDraft, replaceDraft, updateDraft, clearDraft } = useAgentEditorStore();

  useEffect(() => {
    if (!agentId || !fetchedAgent) {
      return;
    }

    hydrateDraft(agentId, fetchedAgent);
  }, [agentId, fetchedAgent, hydrateDraft]);

  useEffect(() => {
    if (!isDraftRoute || creationStartedRef.current) {
      return;
    }

    creationStartedRef.current = true;
    createAgent.mutate(createDraftAgent(), {
      onSuccess: (agent) => {
        replaceDraft(agent.id, agent, false);
        navigate(`/agents/${agent.id}/${tab}`, { replace: true });
      },
      onError: (error) => {
        creationStartedRef.current = false;
        window.alert(getErrorMessage(error, "Unable to create a new agent draft right now."));
      }
    });
  }, [createAgent, isDraftRoute, navigate, replaceDraft, tab]);

  const draftEntry = agentId ? drafts[agentId] : undefined;
  const agent = useMemo(() => {
    if (isDraftRoute) {
      return null;
    }

    return draftEntry?.draft ?? fetchedAgent ?? null;
  }, [draftEntry?.draft, fetchedAgent, isDraftRoute]);
  const isDirty = draftEntry?.dirty ?? false;

  function handleAgentChange(changes: Partial<AgentRecord>) {
    if (!agentId) {
      return;
    }

    updateDraft(agentId, changes);
  }

  function handleSave() {
    if (!agentId || !agent) {
      return;
    }

    updateAgent.mutate(agent, {
      onSuccess: (savedAgent) => {
        replaceDraft(savedAgent.id, savedAgent, false);
      },
      onError: (error) => {
        window.alert(getErrorMessage(error, "Unable to save this agent right now."));
      }
    });
  }

  function handleDelete() {
    if (!agentId || !agent) {
      return;
    }

    const confirmed = window.confirm(`Delete ${agent.name || "this agent"}? This action cannot be undone.`);

    if (!confirmed) {
      return;
    }

    deleteAgent.mutate(agentId, {
      onSuccess: () => {
        clearDraft(agentId);
        navigate("/agents", { replace: true });
      },
      onError: (error) => {
        window.alert(getErrorMessage(error, "Unable to delete this agent."));
      }
    });
  }

  function handleImport(payload: Partial<AgentRecord>) {
    const importedAgent = normalizeImportedAgent(payload);

    createAgent.mutate(importedAgent, {
      onSuccess: (createdAgent) => {
        replaceDraft(createdAgent.id, createdAgent, false);
        navigate(`/agents/${createdAgent.id}/agent`);
      },
      onError: (error) => {
        window.alert(getErrorMessage(error, "Unable to import this agent right now."));
      }
    });
  }

  async function handleCopyId() {
    if (!agent?.id) return;
    await navigator.clipboard.writeText(agent.id);
    toast("Agent ID copied");
  }

  async function handleShare() {
    if (!agent?.id) return;
    await navigator.clipboard.writeText(`${window.location.origin}/agents/${agent.id}/${tab}`);
    toast("Agent link copied");
  }

  function handlePromptAssist() {
    if (!agent) {
      return;
    }

    const instruction = window.prompt("Describe the update you want to add to this agent prompt.");

    if (!instruction?.trim()) {
      return;
    }

    const nextPrompt = agent.prompt.trim()
      ? `${agent.prompt.trim()}\n\nAdditional instruction:\n- ${instruction.trim()}`
      : instruction.trim();

    handleAgentChange({ prompt: nextPrompt });
  }

  function handleSetInbound() {
    if (!agent?.id) {
      return;
    }

    navigate(`/agents/${agent.id}/inbound`);
  }

  function handleRequestTest(mode: "call" | "browser", phoneNumber: string) {
    if (!agent?.id || !phoneNumber.trim()) {
      return;
    }

    requestTestCall.mutate(
      {
        phoneNumber: phoneNumber.trim(),
        mode
      },
      {
        onSuccess: (response) => {
          window.alert(response.message);
        },
        onError: (error) => {
          window.alert(getErrorMessage(error, "Unable to start a test call right now."));
        }
      }
    );
  }

  if (isDraftRoute) {
    return (
      <div className="agent-workspace">
        <div className="agent-workspace__header">
          <PageHeader title="Agent Setup" subtitle="Fine tune your agents" />
        </div>
        <div className="agent-workspace__body">
          <AgentListPanel isImporting={createAgent.isPending} onImport={handleImport} />
          <Card className="agent-workspace__placeholder">Creating a new draft agent...</Card>
          <AgentActionsRail />
        </div>
      </div>
    );
  }

  if (!isDraftRoute && isLoading && !draftEntry) {
    return (
      <div className="agent-workspace">
        <div className="agent-workspace__header">
          <PageHeader title="Agent Setup" subtitle="Fine tune your agents" />
        </div>
        <div className="agent-workspace__body">
          <AgentListPanel isImporting={createAgent.isPending} onImport={handleImport} />
          <Card className="agent-workspace__placeholder">Loading agent...</Card>
          <AgentActionsRail />
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="agent-workspace">
        <div className="agent-workspace__header">
          <PageHeader title="Agent Setup" subtitle="Fine tune your agents" />
        </div>
        <div className="agent-workspace__body">
          <AgentListPanel isImporting={createAgent.isPending} onImport={handleImport} />
          <EmptyState
            title="Agent not found"
            description="This agent record is not available in the database. Select another agent or create a new one."
          />
          <AgentActionsRail />
        </div>
      </div>
    );
  }

  const tabContent = {
    agent: <AgentTabView agent={agent} onAgentChange={handleAgentChange} onAiEdit={handlePromptAssist} />,
    llm: <LLMTabView agent={agent} onAgentChange={handleAgentChange} />,
    audio: <AudioTabView agent={agent} onAgentChange={handleAgentChange} />,
    engine: <EngineTabView agent={agent} onAgentChange={handleAgentChange} />,
    call: <CallTabView agent={agent} onAgentChange={handleAgentChange} />,
    analytics: <AnalyticsTabView agent={agent} onAgentChange={handleAgentChange} />,
    inbound: <InboundTabView agent={agent} />
  }[tab];

  return (
    <div className="agent-workspace">
      <div className="agent-workspace__body">
        <AgentListPanel isImporting={createAgent.isPending} onImport={handleImport} />
        <div className="agent-workspace__center">
          <AgentSummaryCard
            agent={agent}
            onAgentChange={handleAgentChange}
            onCopyId={handleCopyId}
            onShare={handleShare}
          />
          <AgentBuilderTabs agentId={agent.id} />
          <div className="agent-workspace__tab-scroll">
            {tabContent}
          </div>
        </div>
        {isChatOpen && agent ? (
          <AgentChatPanel agent={agent} onClose={() => setIsChatOpen(false)} />
        ) : (
          <AgentActionsRail
            agent={agent}
            isDirty={isDirty}
            isSaving={updateAgent.isPending}
            isDeleting={deleteAgent.isPending}
            isChatOpen={isChatOpen}
            onSave={handleSave}
            onDelete={handleDelete}
            onSetInbound={handleSetInbound}
            onRequestTest={handleRequestTest}
            onToggleChat={() => setIsChatOpen(!isChatOpen)}
          />
        )}
      </div>
    </div>
  );
}
