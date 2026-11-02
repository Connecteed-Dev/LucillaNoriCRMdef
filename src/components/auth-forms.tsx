"use client";

import { useActionState } from "react";
import { acceptInvite, login, requestPasswordReset } from "@/app/auth-actions";
import { Button } from "./ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="label">Email</span>
        <input className="input" name="email" type="email" autoComplete="email" required />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <input className="input" name="password" type="password" autoComplete="current-password" required />
      </label>
      {state?.error && <p role="alert" className="text-sm text-[#a4434a]">{state.error}</p>}
      <Button className="w-full" disabled={pending}>{pending ? "Accesso…" : "Accedi"}</Button>
    </form>
  );
}

export function ResetRequestForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  if (state?.ok) return <p role="status" className="text-sm leading-relaxed text-ink">{state.ok}</p>;
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="label">Email</span>
        <input className="input" name="email" type="email" autoComplete="email" required />
      </label>
      {state?.error && <p role="alert" className="text-sm text-[#a4434a]">{state.error}</p>}
      <Button className="w-full" disabled={pending}>{pending ? "Invio…" : "Inviami il link"}</Button>
    </form>
  );
}

export function InviteForm({ token, reset = false }: { token: string; reset?: boolean }) {
  const [state, action, pending] = useActionState(acceptInvite, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="block">
        <span className="label">{reset ? "Nuova password" : "Scegli una password"}</span>
        <input className="input" name="password" type="password" autoComplete="new-password" minLength={10} required />
        <span className="mt-1 block text-xs text-muted">Almeno 10 caratteri, con lettere e numeri.</span>
      </label>
      <label className="block">
        <span className="label">Ripeti la password</span>
        <input className="input" name="confirm" type="password" autoComplete="new-password" required />
      </label>
      {state?.error && <p role="alert" className="text-sm text-[#a4434a]">{state.error}</p>}
      <Button className="w-full" disabled={pending}>{pending ? "Salvataggio…" : reset ? "Salva la nuova password" : "Attiva il mio accesso"}</Button>
    </form>
  );
}
