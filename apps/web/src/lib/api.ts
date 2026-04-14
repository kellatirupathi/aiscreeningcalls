import axios from "axios";
import { AUTH_TOKEN_STORAGE_KEY, useAuthStore } from "@/stores/authStore";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3000/api"
});

api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined"
    ? window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    : null;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      useAuthStore.getState().clearSession();
    }

    return Promise.reject(error);
  }
);
