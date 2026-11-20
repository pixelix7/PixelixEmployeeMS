import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { getErrorMessage } from "../api/client";
import { APP_NAME } from "../config";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  LogoMark,
  ShieldIcon,
  UsersIcon,
} from "../components/Icons";
import "./Login.css";

const YEAR = new Date().getFullYear();

const PORTALS = {
  admin: {
    title: "Admin Portal",
    hint: "Manage users, roles and the whole system",
    Icon: ShieldIcon,
  },
  employee: {
    title: "Employee Portal",
    hint: "Telecaller and Digital Marketing teams",
    Icon: UsersIcon,
  },
};

export default function Login() {
  const { user, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  const portal = PORTALS[params.get("portal")] ? params.get("portal") : null;

  if (loading) return <div className="page-loader">Loading…</div>;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="login">
      <aside className="login-hero">
        <div className="login-brand">
          <LogoMark />
          <span>{APP_NAME}</span>
        </div>

        <div className="login-hero-copy">
          <h1>
            Employee
            <br />
            Management System
          </h1>
          <p>
            Bring your admins, telecallers and digital marketing team together.
            Manage people, roles and access from one secure place.
          </p>
        </div>

        <ul className="login-roles" aria-label="Supported roles">
          <li>Admin</li>
          <li>Telecaller</li>
          <li>Digital Marketing</li>
        </ul>
      </aside>

      <main className="login-panel">
        <div className="login-box">
          {portal ? (
            <LoginForm portal={portal} onBack={() => setParams({})} />
          ) : (
            <PortalPicker onPick={(key) => setParams({ portal: key })} />
          )}
          <p className="login-footer">
            © {YEAR} {APP_NAME}. All rights reserved.
          </p>
        </div>
      </main>
    </div>
  );
}

function PortalPicker({ onPick }) {
  return (
    <>
      <h2 className="login-title">Welcome Back</h2>
      <p className="login-subtitle">Select your portal to securely access the system.</p>

      <div className="portal-list">
        {Object.entries(PORTALS).map(([key, { title, hint, Icon }]) => (
          <button key={key} type="button" className="portal-card" onClick={() => onPick(key)}>
            <span className="portal-icon">
              <Icon />
            </span>
            <span className="portal-text">
              <span className="portal-title">{title}</span>
              <span className="portal-hint">{hint}</span>
            </span>
            <ArrowRightIcon className="portal-arrow" />
          </button>
        ))}
      </div>
    </>
  );
}

function LoginForm({ portal, onBack }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password, portal);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.response ? getErrorMessage(err) : err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button type="button" className="login-back" onClick={onBack}>
        <ArrowLeftIcon /> Change portal
      </button>

      <h2 className="login-title">{PORTALS[portal].title}</h2>
      <p className="login-subtitle">Sign in with your work email and password.</p>

      <form className="login-form" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>

        <label className="field">
          <span>Password</span>
          <div className="password-wrap">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </label>

        <button type="submit" className="btn-primary" disabled={submitting || !email || !password}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </>
  );
}
