"use client";

import { ShieldCheck } from "lucide-react";
import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

const initialState: LoginState = { error: "" };

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction, isPending] = useActionState(signIn, initialState);

  return (
    <main className="access-shell">
      <section className="password-card" aria-label="Sign in">
        <span className="access-icon">
          <ShieldCheck aria-hidden="true" size={24} />
        </span>
        <div>
          <p className="eyebrow">ShiftFlow</p>
          <h1>Manager sign in</h1>
          <p className="access-copy">
            Sign in with your manager account to open the business dashboard.
          </p>
        </div>
        <form className="password-form" action={formAction}>
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <div className="password-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="password-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter password"
              required
            />
          </div>
          {state.error ? (
            <p className="form-error" role="alert">
              {state.error}
            </p>
          ) : null}
          <button className="primary-button" type="submit" disabled={isPending}>
            {isPending ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="access-note">
          Accounts are created by an administrator. Contact your manager if you need access.
        </p>
      </section>
    </main>
  );
}
