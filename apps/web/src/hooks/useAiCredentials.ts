import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type AiProvider = "openai" | "groq" | "cartesia" | "elevenlabs" | "deepgram" | "gemini";

export interface AiCredential {
  id: string;
  provider: AiProvider;
  name: string;
  isDefault: boolean;
  apiKey: string; // masked
  defaultModel: string;
  defaultVoiceId: string;
  sttModel: string;
  ttsModel: string;
  defaultVoice: string;
  modelId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAiCredentialPayload {
  provider: AiProvider;
  name: string;
  apiKey: string;
  defaultModel?: string;
  defaultVoiceId?: string;
  sttModel?: string;
  ttsModel?: string;
  defaultVoice?: string;
  modelId?: string;
  isDefault?: boolean;
}

export interface UpdateAiCredentialPayload {
  name?: string;
  apiKey?: string;
  defaultModel?: string;
  defaultVoiceId?: string;
  sttModel?: string;
  ttsModel?: string;
  defaultVoice?: string;
  modelId?: string;
  isDefault?: boolean;
}

export function useAiCredentials(provider?: AiProvider) {
  return useQuery({
    queryKey: ["ai-credentials", provider ?? "all"],
    queryFn: async () => {
      const url = provider ? `/ai-credentials?provider=${provider}` : "/ai-credentials";
      const response = await api.get<{ credentials: AiCredential[] }>(url);
      return response.data.credentials;
    }
  });
}

export function useCreateAiCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateAiCredentialPayload) => {
      const response = await api.post<{ credential: AiCredential }>("/ai-credentials", payload);
      return response.data.credential;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-credentials"] });
    }
  });
}

export function useUpdateAiCredential(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateAiCredentialPayload) => {
      const response = await api.patch<{ credential: AiCredential }>(`/ai-credentials/${id}`, payload);
      return response.data.credential;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-credentials"] });
    }
  });
}

export function useDeleteAiCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/ai-credentials/${id}`);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-credentials"] });
    }
  });
}

export function useSetDefaultAiCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post<{ credential: AiCredential }>(`/ai-credentials/${id}/set-default`);
      return response.data.credential;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-credentials"] });
    }
  });
}
