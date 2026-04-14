import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DashboardOverview } from "@/types";

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: async () => {
      const response = await api.get<DashboardOverview>("/dashboard/overview");
      return response.data;
    }
  });
}
