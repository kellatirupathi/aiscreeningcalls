import { create } from "zustand";
import type { CurrentUser, UserRole } from "@/types";

export const AUTH_TOKEN_STORAGE_KEY = "screening.auth.token";

function readStoredToken() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? "";
}

function persistToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
}

interface AuthState {
  isAuthenticated: boolean;
  isReady: boolean;
  token: string;
  userId: string;
  userName: string;
  email: string;
  role: UserRole;
  workspaceName: string;
  workspaceSlug: string;
  setToken: (token: string) => void;
  setReady: (ready: boolean) => void;
  setSession: (user: CurrentUser, token?: string) => void;
  clearSession: () => void;
}

const initialToken = readStoredToken();

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isReady: !initialToken,
  token: initialToken,
  userId: "",
  userName: "",
  email: "",
  role: "viewer",
  workspaceName: "Workspace",
  workspaceSlug: "workspace",
  setToken: (token) => {
    persistToken(token);
    set({
      token,
      isAuthenticated: false,
      isReady: !token
    });
  },
  setReady: (ready) => set({ isReady: ready }),
  setSession: (user, token) => {
    const nextToken = token ?? get().token;
    persistToken(nextToken);

    set({
      isAuthenticated: true,
      isReady: true,
      token: nextToken,
      userId: user.id,
      userName: user.name,
      email: user.email,
      role: user.role,
      workspaceName: user.organization?.name || "Workspace",
      workspaceSlug: user.organization?.slug || "workspace"
    });
  },
  clearSession: () => {
    persistToken("");
    set({
      isAuthenticated: false,
      isReady: true,
      token: "",
      userId: "",
      userName: "",
      email: "",
      role: "viewer",
      workspaceName: "Workspace",
      workspaceSlug: "workspace"
    });
  }
}));
