"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function JoinForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Choose a password of at least 6 characters.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    setBusy(false);

    if (signUpError) {
      // The database refuses an uninvited address; say so plainly rather than leaking
      // whichever constraint fired.
      setError(
        /invited/i.test(signUpError.message)
          ? "That email has not been invited. Ask your manager to add you."
          : signUpError.message
      );
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form className="password-form" onSubmit={handleSubmit}>
      <div className="password-field">
        <label htmlFor="join-email">Email</label>
        <input
          id="join-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
        />
      </div>
      <div className="password-field">
        <label htmlFor="join-password">Choose a password</label>
        <input
          id="join-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 6 characters"
          required
        />
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="primary-button" type="submit" disabled={busy}>
        {busy ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
