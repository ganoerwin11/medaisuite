import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const AuthContext = createContext(null);
const TOKEN_KEY = "medaiAuthToken";

// Wraps fetch for /api calls: attaches the bearer token and signs the caller out on a 401.
function createApiFetch(token, onUnauthorized) {
  return async function apiFetch(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(path, { ...options, headers });
    if (response.status === 401) {
      onUnauthorized();
    }
    return response;
  };
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | signedIn | signedOut

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setStatus("signedOut");
  }, []);

  const apiFetch = useMemo(() => createApiFetch(token, logout), [token, logout]);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      if (!token) {
        setStatus("signedOut");
        return;
      }
      try {
        const response = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (!response.ok) {
          logout();
          return;
        }
        setUser(await response.json());
        setStatus("signedIn");
      } catch (error) {
        if (!cancelled) logout();
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  async function login(email, password) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || "Could not sign in.");
    }
    localStorage.setItem(TOKEN_KEY, body.token);
    setToken(body.token);
    setUser(body.user);
    setStatus("signedIn");
    return body.user;
  }

  const value = { user, status, login, logout, apiFetch };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}
