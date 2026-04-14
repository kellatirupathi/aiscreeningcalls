import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SettingsRecord } from "@/types";

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const response = await api.get<SettingsRecord>("/settings");
      return response.data;
    }
  });
}

export function useSaveProviders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.put("/settings/providers", payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] })
  });
}

export function useSaveOpenAI() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { apiKey: string; defaultModel: string }) => {
      const res = await api.put("/settings/openai", payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] })
  });
}

export function useSaveGemini() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { apiKey: string; defaultModel: string; defaultVoice: string }) => {
      const res = await api.put("/settings/gemini", payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] })
  });
}

export function useSaveCartesia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { apiKey: string; defaultVoiceId: string; sttModel: string; ttsModel: string }) => {
      const res = await api.put("/settings/cartesia", payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] })
  });
}

export function useSaveDeepgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { apiKey: string; defaultModel: string }) => {
      const res = await api.put("/settings/deepgram", payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] })
  });
}

export function useSaveElevenLabs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { apiKey: string; defaultModel: string }) => {
      const res = await api.put("/settings/elevenlabs", payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] })
  });
}

export function useSaveStorage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { accessKeyId: string; secretAccessKey: string; region: string; bucketName: string }) => {
      const res = await api.put("/settings/storage", payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] })
  });
}

export function useTestProviders() {
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ success: boolean; message: string }>("/settings/providers/test");
      return res.data;
    }
  });
}

export function useTestAI() {
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ success: boolean; message: string }>("/settings/ai-services/test");
      return res.data;
    }
  });
}

export function useTestStorage() {
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ success: boolean; message: string }>("/settings/storage/test");
      return res.data;
    }
  });
}
