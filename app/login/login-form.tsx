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
          <h1>Sign in</h1>
          <p className="access-copy">
            Managers open the business dashboard. Staff see their own tips.
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
          Been invited but never signed up? <a href="/join">Create your account</a>.
          Otherwise ask your manager for an invitation.
        </p>
      </section>
    </main>
  );
}
