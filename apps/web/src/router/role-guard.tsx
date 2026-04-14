import type { PropsWithChildren } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuthStore } from "@/stores/authStore";
import type { UserRole } from "@/types";

interface RoleGuardProps extends PropsWithChildren {
  allowedRoles: UserRole[];
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const role = useAuthStore((state) => state.role);

  if (!allowedRoles.includes(role)) {
    return (
      <div className="page-stack">
        <PageHeader title="Access Restricted" subtitle="Your role does not have permission to view this page." />
        <Card className="form-card">
          Only users with one of these roles can access this page: {allowedRoles.join(", ")}.
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
