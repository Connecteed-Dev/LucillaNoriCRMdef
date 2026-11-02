import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { LoginForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/auth-shell";

export const metadata = { title: "Accedi" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  return (
    <AuthShell>
      <div className="eyebrow">Area riservata</div>
      <h1 className="mb-2 font-serif text-[36px] leading-tight text-wine-dark">Bentornata.</h1>
      <p className="mb-8 text-[13px] text-muted">Accedi per seguire il tuo percorso o gestire la scuola.</p>
      <LoginForm />
      <p className="mt-4 text-right text-xs">
        <Link className="font-semibold text-wine underline" href="/password-dimenticata">Password dimenticata?</Link>
      </p>
      <p className="mt-8 text-xs text-muted">Prima volta? Usa il link d’invito che hai ricevuto via email.</p>
    </AuthShell>
  );
}
