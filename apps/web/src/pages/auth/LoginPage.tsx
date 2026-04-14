import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import type { CurrentUser } from "@/types";

export default function LoginPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setSession = useAuthStore((state) => state.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    setIsSubmitting(true);
    setError("");

    try {
      const response = await api.post<{ token: string; user: CurrentUser | null }>("/auth/login", {
        email,
        password
      });

      if (!response.data.user) {
        setError("No account exists yet. Create an admin user first.");
        return;
      }

      setSession(response.data.user, response.data.token);
      navigate("/dashboard", { replace: true });
    } catch {
      setError("Unable to sign in right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="auth-shell">
      <Card className="auth-card">
        <h1>Sign in</h1>
        <p>Access the NxtWave voice screening platform.</p>
        <Input placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <Input placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        {error ? <p className="auth-card__error">{error}</p> : null}
        <Button variant="primary" fullWidth onClick={handleLogin} disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Continue"}
        </Button>
        <p className="auth-card__footer">
          Need an account? <Link to="/register">Register</Link>
        </p>
      </Card>
    </div>
  );
}
