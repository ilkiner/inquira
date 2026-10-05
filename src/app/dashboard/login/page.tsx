"use client";

import { useActionState } from "react";
import { login } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-4">
      <form action={action} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div>
          <h1 className="text-lg font-semibold">Coordinator login</h1>
          <p className="text-sm text-slate-500">Inquira dashboard</p>
        </div>
        <input
          type="password"
          name="password"
          required
          autoFocus
          placeholder="Password"
          aria-label="Password"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
        />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          disabled={pending}
          className="w-full rounded-lg bg-teal-600 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {pending ? "…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
