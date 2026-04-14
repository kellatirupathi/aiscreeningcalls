import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import type { CurrentUser } from "@/types";

export function useCurrentUser() {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ["auth", "me"],
    enabled: Boolean(token),
    retry: false,
    queryFn: async () => {
      const response = await api.get<CurrentUser | null>("/auth/me");
      return response.data;
    }
  });
}
