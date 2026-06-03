import React, { useState } from "react";
import { useAppStore } from "../store";

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const login = useAppStore((s) => s.login);
  const register = useAppStore((s) => s.register);
  const loading = useAppStore((s) => s.loading);
  const error = useAppStore((s) => s.error);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode === "login") {
      await login(username, password);
    } else {
      await register(username, password);
    }
  }

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Discord_v2</h1>
        <p>Einloggen oder Account erstellen</p>

        <input
          id="username"
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoComplete="username"
        />

        <input
          id="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />

        <button disabled={loading} type="submit">
          {loading
            ? "Bitte warten..."
            : mode === "login"
              ? "Login"
              : "Registrieren"}
        </button>

        {error && <div className="auth-error">{error}</div>}

        <button
          type="button"
          className="auth-switch"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login"
            ? "Noch kein Account? Registrieren"
            : "Schon Account? Login"}
        </button>
      </form>
    </main>
  );
}