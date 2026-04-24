import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type TelephonyProviderId = "plivo" | "exotel";

export interface TelephonyCredential {
  id: string;
  provider: TelephonyProviderId;
  name: string;
  isDefault: boolean;
  status: string;
  phoneNumber: string;
  // Plivo
  authId: string;
  authToken: string;
  // Exotel
  accountSid: string;
  apiKey: string;
  apiToken: string;
  subdomain: string;
  appId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTelephonyCredentialPayload {
  provider: TelephonyProviderId;
  name: string;
  phoneNumber: string;
  authId?: string;
  authToken?: string;
  accountSid?: string;
  apiKey?: string;
  apiToken?: string;
  subdomain?: string;
  appId?: string;
  isDefault?: boolean;
}

export interface UpdateTelephonyCredentialPayload {
  name?: string;
  phoneNumber?: string;
  authId?: string;
  authToken?: string;
  accountSid?: string;
  apiKey?: string;
  apiToken?: string;
  subdomain?: string;
  appId?: string;
  isDefault?: boolean;
}

export function useTelephonyCredentials(provider?: TelephonyProviderId) {
  return useQuery({
    queryKey: ["telephony-credentials", provider ?? "all"],
    queryFn: async () => {
      const url = provider ? `/telephony-credentials?provider=${provider}` : "/telephony-credentials";
      const response = await api.get<{ credentials: TelephonyCredential[] }>(url);
      return response.data.credentials;
    }
  });
}

export function useCreateTelephonyCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateTelephonyCredentialPayload) => {
      const response = await api.post<{ credential: TelephonyCredential }>("/telephony-credentials", payload);
      return response.data.credential;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telephony-credentials"] });
    }
  });
}

export function useUpdateTelephonyCredential(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateTelephonyCredentialPayload) => {
      const response = await api.patch<{ credential: TelephonyCredential }>(`/telephony-credentials/${id}`, payload);
      return response.data.credential;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telephony-credentials"] });
    }
  });
}

export function useDeleteTelephonyCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/telephony-credentials/${id}`);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telephony-credentials"] });
    }
  });
}

export function useSetDefaultTelephonyCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post<{ credential: TelephonyCredential }>(`/telephony-credentials/${id}/set-default`);
      return response.data.credential;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telephony-credentials"] });
    }
  });
}
