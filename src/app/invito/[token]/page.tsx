import Link from "next/link";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/auth";
import { InviteForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/auth-shell";

export const metadata = { title: "Attiva l’accesso" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await db.invite.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  const valid = invite && !invite.usedAt && invite.expiresAt > new Date() && invite.user.active;
  // Utente che ha già una password: il link arriva da "Password dimenticata?"
  const reset = !!invite?.user.passwordHash;
  return (
    <AuthShell tagline="Ogni allieva ha un percorso unico. Da qui potrai seguirlo, passo dopo passo.">
      {valid ? (
        reset ? (
        <>
          <div className="eyebrow">Recupero password</div>
          <h1 className="mb-2 font-serif text-[36px] leading-tight text-wine-dark">Nuova password.</h1>
          <p className="mb-8 text-[13px] text-muted">Scegli la nuova password per {invite.user.email}.</p>
          <InviteForm token={token} reset />
        </>
        ) : (
        <>
          <div className="eyebrow">Attiva il tuo accesso</div>
          <h1 className="mb-2 font-serif text-[36px] leading-tight text-wine-dark">Benvenuta, {invite.user.name.split(" ")[0]}.</h1>
          <p className="mb-8 text-[13px] text-muted">Scegli una password per entrare nella tua area riservata ({invite.user.email}).</p>
          <InviteForm token={token} />
        </>
        )
      ) : (
        <>
          <h1 className="mb-3 font-serif text-[30px] leading-tight text-wine-dark">Link non più valido</h1>
          <p className="text-[13px] leading-relaxed text-muted">
            Il link è scaduto o è già stato usato. Richiedine uno nuovo da{" "}
            <Link className="font-semibold text-wine underline" href="/password-dimenticata">Password dimenticata?</Link>{" "}
            oppure chiedi alla tua insegnante di inviarti un nuovo invito.
          </p>
        </>
      )}
    </AuthShell>
  );
}
