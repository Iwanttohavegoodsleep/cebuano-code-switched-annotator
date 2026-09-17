"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentProfile, signIn } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
      const profile = await getCurrentProfile();
      router.replace(profile?.role === "admin" ? "/admin" : profile?.role === "adjudicator" ? "/adjudicate" : "/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand"><span className="brand-mark">A</span><div><strong>Review Annotator</strong><span>Cebuano–English Study</span></div></div>
        <p className="eyebrow">PRIVATE WORKSPACE</p>
        <h1>Welcome back</h1>
        <p className="login-intro">Sign in with the account given to you by the research team.</p>
        {!isSupabaseConfigured && <div className="demo-notice">Preview mode is active. Add Supabase keys to enable private accounts.</div>}
        <form onSubmit={submit}>
          <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error && <div className="error-banner" role="alert">{error}</div>}
          <button className="primary-button" disabled={busy || !isSupabaseConfigured}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="privacy-note">Labels are saved privately and are never shown to the other annotator.</p>
      </section>
    </main>
  );
}
