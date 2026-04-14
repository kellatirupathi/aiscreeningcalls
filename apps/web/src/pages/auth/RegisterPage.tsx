import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import type { CurrentUser } from "@/types";

export default function RegisterPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setSession = useAuthStore((state) => state.setSession);
  const [organizationName, setOrganizationName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRegister() {
    setIsSubmitting(true);
    setError("");

    try {
      const response = await api.post<{ token: string; user: CurrentUser }>("/auth/register", {
        organizationName,
        name,
        email,
        password
      });

      setSession(response.data.user, response.data.token);
      navigate("/dashboard", { replace: true });
    } catch {
      setError("Unable to create your workspace right now.");
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
        <h1>Create workspace</h1>
        <p>Set up your team and provider credentials later in Settings.</p>
        <Input placeholder="Organization name" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} />
        <Input placeholder="Admin full name" value={name} onChange={(event) => setName(event.target.value)} />
        <Input placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <Input placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        {error ? <p className="auth-card__error">{error}</p> : null}
        <Button variant="primary" fullWidth onClick={handleRegister} disabled={isSubmitting}>
          {isSubmitting ? "Creating workspace..." : "Create account"}
        </Button>
        <p className="auth-card__footer">
          Already have access? <Link to="/login">Sign in</Link>
        </p>
      </Card>
    </div>
  );
}
