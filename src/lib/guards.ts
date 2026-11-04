import "server-only";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { ROLES } from "./constants";
import type { CurrentUser } from "./auth";

// Autorizzazioni per record (spec §13): mai fidarsi degli id che arrivano dal client.

export function enrollmentWhereForStaff(user: CurrentUser) {
  if (user.role === ROLES.ADMIN) return {};
  return { OR: [{ edition: { teacherId: user.id } }, { student: { teacherId: user.id } }] };
}

/** Attestati visibili allo staff: quelli dei propri percorsi, più quelli inseriti a mano dalla stessa docente. */
export function certificateWhereForStaff(user: CurrentUser): Prisma.CertificateWhereInput {
  if (user.role === ROLES.ADMIN) return {};
  return { OR: [{ enrollment: enrollmentWhereForStaff(user) }, { enrollmentId: null, issuedById: user.id }] };
}

export async function getEnrollmentForStaff(user: CurrentUser, enrollmentId: string) {
  const e = await db.enrollment.findFirst({
    where: { id: enrollmentId, ...enrollmentWhereForStaff(user) },
    include: { student: true, edition: { include: { courseType: true, lessons: { orderBy: { number: "asc" } } } } },
  });
  if (!e) notFound();
  return e;
}

export async function getEditionForStaff(user: CurrentUser, editionId: string) {
  const e = await db.courseEdition.findFirst({
    where: { id: editionId, ...(user.role === ROLES.ADMIN ? {} : { teacherId: user.id }) },
  });
  if (!e) notFound();
  return e;
}

export async function getAssignmentForStaff(user: CurrentUser, assignmentId: string) {
  const a = await db.assignment.findFirst({
    where: { id: assignmentId, enrollment: enrollmentWhereForStaff(user) },
    include: {
      version: { include: { template: true } },
      enrollment: { include: { student: true, edition: { include: { courseType: true } } } },
      lesson: true,
      responses: { orderBy: { attempt: "desc" } },
    },
  });
  if (!a) notFound();
  return a;
}

/** L'allieva vede solo le proprie assegnazioni, e solo quelle destinate a lei (non le rubriche docente). */
export async function getAssignmentForStudent(user: CurrentUser, assignmentId: string) {
  if (!user.student) notFound();
  const a = await db.assignment.findFirst({
    where: { id: assignmentId, enrollment: { studentId: user.student.id }, version: { template: { audience: "STUDENT" } } },
    include: {
      version: { include: { template: true } },
      enrollment: { include: { edition: { include: { courseType: true } } } },
      lesson: true,
      responses: { orderBy: { attempt: "desc" } },
    },
  });
  if (!a) notFound();
  return a;
}

/** Scadenza calcolata in lettura: un'assegnazione non completata oltre la data di scadenza è "scaduta". */
export function effectiveStatus(a: { status: string; dueAt: Date | null }) {
  if (a.status !== "COMPLETED" && a.dueAt && a.dueAt < new Date()) return "EXPIRED";
  return a.status;
}
