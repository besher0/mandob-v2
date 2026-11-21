"use client";

import { FormEvent, useState } from "react";

export function LoginView({
  loading,
  error,
  onLogin,
}: {
  loading: boolean;
  error: string;
  onLogin: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onLogin(username, password);
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <div className="logo">M</div>
          <div>
            <strong>MedREP</strong>
            <span>المساعد اليومي للمندوب الطبي</span>
          </div>
        </div>

        <div className="login-copy">
          <small>MEDICAL FIELD APP</small>
          <h1>تسجيل الدخول</h1>
          <p>ادخل إلى مساحة عملك الميدانية وتابع السايكل والجولات.</p>
        </div>

        <label>
          <span>اسم المستخدم</span>
          <input
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>

        <label>
          <span>كلمة المرور</span>
          <input
            required
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <div className="error">{error}</div>}

        <button className="primary login-button" disabled={loading}>
          {loading ? "جارِ الدخول..." : "تسجيل الدخول"}
        </button>
      </form>
    </main>
  );
}
