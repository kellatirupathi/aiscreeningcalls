import { create } from "zustand";
import type { AgentRecord } from "@/types";

interface AgentDraftEntry {
  draft: AgentRecord;
  dirty: boolean;
}

interface AgentEditorState {
  drafts: Record<string, AgentDraftEntry>;
  hydrateDraft: (agentId: string, draft: AgentRecord) => void;
  replaceDraft: (agentId: string, draft: AgentRecord, dirty?: boolean) => void;
  updateDraft: (agentId: string, changes: Partial<AgentRecord>) => void;
  clearDraft: (agentId: string) => void;
}

export const useAgentEditorStore = create<AgentEditorState>((set) => ({
  drafts: {},
  hydrateDraft: (agentId, draft) =>
    set((state) => {
      const currentEntry = state.drafts[agentId];

      if (currentEntry?.dirty) {
        return state;
      }

      return {
        drafts: {
          ...state.drafts,
          [agentId]: {
            draft,
            dirty: false
          }
        }
      };
    }),
  replaceDraft: (agentId, draft, dirty = false) =>
    set((state) => ({
      drafts: {
        ...state.drafts,
        [agentId]: {
          draft,
          dirty
        }
      }
    })),
  updateDraft: (agentId, changes) =>
    set((state) => {
      const currentEntry = state.drafts[agentId];

      if (!currentEntry) {
        return state;
      }

      return {
        drafts: {
          ...state.drafts,
          [agentId]: {
            draft: {
              ...currentEntry.draft,
              ...changes
            },
            dirty: true
          }
        }
      };
    }),
  clearDraft: (agentId) =>
    set((state) => {
      const nextDrafts = { ...state.drafts };
      delete nextDrafts[agentId];
      return {
        drafts: nextDrafts
      };
    })
}));
