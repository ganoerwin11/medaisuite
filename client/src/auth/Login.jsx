import { useState } from "react";
import { Activity, ShieldCheck } from "lucide-react";
import { useAuth } from "./AuthContext.jsx";

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (submitError) {
      setError(submitError.message || "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card glass" onSubmit={handleSubmit}>
        <span className="brand-mark" aria-hidden="true">
          <Activity />
        </span>
        <h1>MedAI Suite</h1>
        <p className="login-subtitle">Sign in to the clinic staff dashboard</p>

        <label>
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="primary-button" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>

        <div className="login-note">
          <ShieldCheck />
          <span>Access is limited to authorized clinic staff.</span>
        </div>
      </form>
    </div>
  );
}

export default Login;
