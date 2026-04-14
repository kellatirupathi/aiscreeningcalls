import { Navigate, createBrowserRouter } from "react-router-dom";
import { ProtectedRoutes } from "./protected-routes";
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import AgentsIndexPage from "@/pages/agents/AgentsIndexPage";
import AgentBuilderPage from "@/pages/agents/AgentBuilderPage";
import CampaignsPage from "@/pages/campaigns/CampaignsPage";
import CampaignCreatePage from "@/pages/campaigns/CampaignCreatePage";
import CampaignDetailPage from "@/pages/campaigns/CampaignDetailPage";
import BatchesPage from "@/pages/batches/BatchesPage";
import BatchCreatePage from "@/pages/batches/BatchCreatePage";
import BatchDetailPage from "@/pages/batches/BatchDetailPage";
import CallHistoryPage from "@/pages/calls/CallHistoryPage";
import DocumentationPage from "@/pages/documentation/DocumentationPage";
import NumbersPage from "@/pages/numbers/NumbersPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import NotFoundPage from "@/pages/NotFoundPage";
import { RoleGuard } from "./role-guard";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/dashboard" replace />
  },
  {
    path: "/login",
    element: <LoginPage />
  },
  {
    path: "/register",
    element: <RegisterPage />
  },
  {
    element: <ProtectedRoutes />,
    children: [
      { path: "/dashboard", element: <DashboardPage /> },
      { path: "/agents", element: <RoleGuard allowedRoles={["admin", "manager"]}><AgentsIndexPage /></RoleGuard> },
      { path: "/agents/new", element: <RoleGuard allowedRoles={["admin", "manager"]}><AgentBuilderPage tab="agent" /></RoleGuard> },
      { path: "/agents/:agentId", element: <Navigate to="agent" replace /> },
      { path: "/agents/:agentId/agent", element: <RoleGuard allowedRoles={["admin", "manager"]}><AgentBuilderPage tab="agent" /></RoleGuard> },
      { path: "/agents/:agentId/llm", element: <RoleGuard allowedRoles={["admin", "manager"]}><AgentBuilderPage tab="llm" /></RoleGuard> },
      { path: "/agents/:agentId/audio", element: <RoleGuard allowedRoles={["admin", "manager"]}><AgentBuilderPage tab="audio" /></RoleGuard> },
      { path: "/agents/:agentId/engine", element: <RoleGuard allowedRoles={["admin", "manager"]}><AgentBuilderPage tab="engine" /></RoleGuard> },
      { path: "/agents/:agentId/call", element: <RoleGuard allowedRoles={["admin", "manager"]}><AgentBuilderPage tab="call" /></RoleGuard> },
      { path: "/agents/:agentId/analytics", element: <RoleGuard allowedRoles={["admin", "manager"]}><AgentBuilderPage tab="analytics" /></RoleGuard> },
      { path: "/agents/:agentId/inbound", element: <RoleGuard allowedRoles={["admin", "manager"]}><AgentBuilderPage tab="inbound" /></RoleGuard> },
      { path: "/campaigns", element: <RoleGuard allowedRoles={["admin", "manager", "recruiter", "viewer"]}><CampaignsPage /></RoleGuard> },
      { path: "/campaigns/new", element: <RoleGuard allowedRoles={["admin", "manager", "recruiter"]}><CampaignCreatePage /></RoleGuard> },
      { path: "/campaigns/:campaignId", element: <Navigate to="overview" replace /> },
      { path: "/campaigns/:campaignId/overview", element: <RoleGuard allowedRoles={["admin", "manager", "recruiter", "viewer"]}><CampaignDetailPage tab="overview" /></RoleGuard> },
      { path: "/campaigns/:campaignId/calls", element: <RoleGuard allowedRoles={["admin", "manager", "recruiter", "viewer"]}><CampaignDetailPage tab="calls" /></RoleGuard> },
      { path: "/campaigns/:campaignId/students", element: <RoleGuard allowedRoles={["admin", "manager", "recruiter", "viewer"]}><CampaignDetailPage tab="students" /></RoleGuard> },
      { path: "/batches", element: <RoleGuard allowedRoles={["admin", "manager", "recruiter", "viewer"]}><BatchesPage /></RoleGuard> },
      { path: "/batches/new", element: <RoleGuard allowedRoles={["admin", "manager", "recruiter"]}><BatchCreatePage /></RoleGuard> },
      { path: "/batches/:batchId", element: <Navigate to="overview" replace /> },
      { path: "/batches/:batchId/overview", element: <RoleGuard allowedRoles={["admin", "manager", "recruiter", "viewer"]}><BatchDetailPage tab="overview" /></RoleGuard> },
      { path: "/batches/:batchId/items", element: <RoleGuard allowedRoles={["admin", "manager", "recruiter", "viewer"]}><BatchDetailPage tab="items" /></RoleGuard> },
      { path: "/calls", element: <CallHistoryPage /> },
      { path: "/calls/:callId", element: <CallHistoryPage /> },
      { path: "/numbers", element: <RoleGuard allowedRoles={["admin", "manager"]}><NumbersPage /></RoleGuard> },
      { path: "/settings", element: <Navigate to="/settings/providers" replace /> },
      { path: "/settings/workspace", element: <RoleGuard allowedRoles={["admin"]}><SettingsPage tab="workspace" /></RoleGuard> },
      { path: "/settings/providers", element: <RoleGuard allowedRoles={["admin"]}><SettingsPage tab="providers" /></RoleGuard> },
      { path: "/settings/ai-services", element: <RoleGuard allowedRoles={["admin"]}><SettingsPage tab="ai-services" /></RoleGuard> },
      { path: "/settings/storage", element: <RoleGuard allowedRoles={["admin"]}><SettingsPage tab="storage" /></RoleGuard> },
      { path: "/settings/team", element: <RoleGuard allowedRoles={["admin"]}><SettingsPage tab="team" /></RoleGuard> }
    ]
  },
  {
    element: <ProtectedRoutes withLayout={false} />,
    children: [
      { path: "/documentation", element: <RoleGuard allowedRoles={["admin", "manager", "recruiter", "viewer"]}><DocumentationPage /></RoleGuard> }
    ]
  },
  {
    path: "*",
    element: <NotFoundPage />
  }
]);
