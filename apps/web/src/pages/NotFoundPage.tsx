import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function NotFoundPage() {
  return (
    <div className="auth-shell">
      <Card className="auth-card">
        <h1>Page not found</h1>
        <p>The route you requested does not exist in this workspace.</p>
        <Link to="/dashboard">
          <Button variant="primary" fullWidth>
            Back to dashboard
          </Button>
        </Link>
      </Card>
    </div>
  );
}
