"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createInvite, endSession, hashToken, homeFor, startSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { clearFailures, rateLimited, recordFailure } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/notify";
import { RESET_TTL_MINUTES } from "@/lib/constants";

export type FormState = { error?: string; ok?: string } | undefined;

const LOGIN_WINDOW = 15 * 60_000;

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const keys = [`login:${email}`, `login-ip:${ip}`];
  const blocked = [rateLimited(keys[0], 5), rateLimited(keys[1], 20)].find((r) => r.limited);
  if (blocked) return { error: `Troppi tentativi non riusciti. Riprova tra ${Math.ceil(blocked.retryInMs / 60_000)} minuti.` };

  const user = await db.user.findUnique({ where: { email } });
  // Stesso messaggio in tutti i casi per non rivelare quali email esistono.
  if (!user || !user.active || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    keys.forEach((k) => recordFailure(k, LOGIN_WINDOW));
    await audit(user?.id ?? null, "login.failed", "User", user?.id ?? null, { email });
    return { error: "Email o password non corretti." };
  }
  clearFailures(keys[0]);
  await startSession(user.id, user.role);
  await audit(user.id, "login", "User", user.id);
  redirect(homeFor(user.role));
}

const RESET_WINDOW = 60 * 60_000;

/** Password dimenticata: invia un link monouso per sceglierne una nuova. */
export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return { error: "Inserisci un'email valida." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const keys = [`reset:${email}`, `reset-ip:${ip}`];
  const blocked = [rateLimited(keys[0], 3), rateLimited(keys[1], 10)].find((r) => r.limited);
  if (blocked) return { error: `Troppe richieste. Riprova tra ${Math.ceil(blocked.retryInMs / 60_000)} minuti.` };
  keys.forEach((k) => recordFailure(k, RESET_WINDOW));

  const user = await db.user.findUnique({ where: { email } });
  if (user?.active) {
    // Senza await: i tempi di risposta non rivelano se l'email esiste
    void (async () => {
      const link = await createInvite(user.id, RESET_TTL_MINUTES * 60_000);
      await audit(user.id, "password.reset.requested", "User", user.id);
      await sendEmail(user.email, "Reimposta la tua password · LN Stile e Portamento",
        `Ciao ${user.name.split(" ")[0]},\n\nabbiamo ricevuto una richiesta di reimpostare la password del tuo accesso.\nPer sceglierne una nuova apri questo link (valido ${RESET_TTL_MINUTES} minuti, utilizzabile una sola volta):\n${link}\n\nSe non hai fatto tu la richiesta, ignora questa email: la tua password resta invariata.`);
    })().catch((e) => console.error("[recupero password]", e));
  }
  // Stesso messaggio in tutti i casi per non rivelare quali email esistono.
  return { ok: "Se l'email è registrata, riceverai a breve un link per scegliere una nuova password. Controlla anche la posta indesiderata." };
}

export async function logout() {
  await endSession();
  redirect("/login");
}

const passwordSchema = z
  .string()
  .min(10, "La password deve avere almeno 10 caratteri.")
  .regex(/[A-Za-z]/, "Inserisci almeno una lettera.")
  .regex(/[0-9]/, "Inserisci almeno un numero.");

export async function acceptInvite(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "Le due password non coincidono." };
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const invite = await db.invite.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date() || !invite.user.active)
    return { error: "Link non valido o scaduto. Richiedine uno nuovo da “Password dimenticata?” nella pagina di accesso." };

  await db.$transaction([
    db.user.update({ where: { id: invite.userId }, data: { passwordHash: await bcrypt.hash(password, 10) } }),
    db.invite.update({ where: { id: invite.id }, data: { usedAt: new Date() } }),
  ]);
  await audit(invite.userId, invite.user.passwordHash ? "password.reset" : "invite.accepted", "User", invite.userId);
  await startSession(invite.userId, invite.user.role);
  redirect(homeFor(invite.user.role));
}
