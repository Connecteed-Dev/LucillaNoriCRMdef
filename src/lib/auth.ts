import "server-only";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { SESSION_COOKIE, signSession, verifySession, sessionCookieOptions } from "./session";
import { ROLES, INVITE_TTL_DAYS } from "./constants";

export async function getCurrentUser() {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.userId }, include: { student: true } });
  if (!user || !user.active) return null;
  return user;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Autorizzazione server-side: da chiamare in ogni pagina e server action protetta. */
export async function requireUser(...roles: string[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles.length && !roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}

export const requireStaff = () => requireUser(ROLES.ADMIN, ROLES.TEACHER);

export function homeFor(role: string) {
  return role === ROLES.STUDENT ? "/allieva" : "/docente";
}

export async function startSession(userId: string, role: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession({ userId, role }), sessionCookieOptions);
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
}

export async function endSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Crea un invito monouso; restituisce il link in chiaro (il DB conserva solo l'hash). Usato anche per il recupero password. */
export async function createInvite(userId: string, ttlMs = INVITE_TTL_DAYS * 86400_000) {
  const token = randomBytes(32).toString("base64url");
  await db.invite.updateMany({ where: { userId, usedAt: null }, data: { expiresAt: new Date() } });
  await db.invite.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return `${process.env.APP_URL ?? "http://localhost:3000"}/invito/${token}`;
}

/** Filtro Prisma sulle allieve visibili: l'admin vede tutto, la docente solo le proprie. */
export function studentScope(user: CurrentUser) {
  return user.role === ROLES.ADMIN ? {} : { teacherId: user.id };
}

export async function getStudentForStaff(user: CurrentUser, studentId: string) {
  const student = await db.student.findFirst({ where: { id: studentId, ...studentScope(user) } });
  if (!student) notFound();
  return student;
}

export function editionScope(user: CurrentUser) {
  return user.role === ROLES.ADMIN ? {} : { teacherId: user.id };
}
