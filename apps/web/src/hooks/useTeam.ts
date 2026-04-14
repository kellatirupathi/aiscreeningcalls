import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TeamMember } from "@/types";

export function useCreateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; email: string; password: string; role: string }) => {
      const res = await api.post<TeamMember & { isActive: boolean }>("/settings/team", payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] })
  });
}

export function useUpdateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, payload }: { userId: string; payload: { role?: string; name?: string; isActive?: boolean } }) => {
      const res = await api.patch<TeamMember>(`/settings/team/${userId}`, payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] })
  });
}

export function useDeleteTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/settings/team/${userId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] })
  });
}
