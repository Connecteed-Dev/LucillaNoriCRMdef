import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { ResetRequestForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/auth-shell";

export const metadata = { title: "Password dimenticata" };

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  return (
    <AuthShell>
      <div className="eyebrow">Recupero password</div>
      <h1 className="mb-2 font-serif text-[36px] leading-tight text-wine-dark">Password dimenticata?</h1>
      <p className="mb-8 text-[13px] text-muted">Inserisci l’email del tuo accesso: ti invieremo un link per sceglierne una nuova.</p>
      <ResetRequestForm />
      <p className="mt-8 text-xs text-muted">
        <Link className="font-semibold text-wine underline" href="/login">Torna all’accesso</Link>
      </p>
    </AuthShell>
  );
}
