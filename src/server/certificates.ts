"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { certificateWhereForStaff, getEnrollmentForStaff } from "@/lib/guards";
import { certificateRequirements, nextCertificateNumber } from "@/lib/certificates";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/notify";
import type { ActionState } from "./students";

export async function issueCertificate(enrollmentId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireStaff();
  await getEnrollmentForStaff(user, enrollmentId);
  const req = await certificateRequirements(enrollmentId);
  if (req.active) return { error: `Esiste già un attestato valido (${req.active.number}). Annullalo per riemetterlo.` };
  const overrideReason = String(form.get("overrideReason") ?? "").trim() || null;
  if (!req.ok && !overrideReason)
    return { error: "Requisiti non soddisfatti: per emettere comunque l’attestato indica la motivazione (resta tracciata)." };
  if (form.get("confirm") !== "on") return { error: "Conferma i dati dell’attestato prima di emetterlo." };

  const en = req.enrollment;
  const cert = await db.certificate.create({
    data: {
      number: await nextCertificateNumber(),
      enrollmentId,
      courseTitle: en.edition.courseType.title,
      studentName: `${en.student.firstName} ${en.student.lastName}`,
      periodFrom: req.periodFrom,
      periodTo: req.periodTo,
      hours: req.hours || null,
      issuedById: user.id,
      overrideReason: req.ok ? null : overrideReason,
    },
  });
  await audit(user.id, req.ok ? "certificate.issue" : "certificate.issue.override", "Certificate", cert.id, { overrideReason });
  await sendEmail(en.student.email, "Il tuo attestato di partecipazione è disponibile",
    `Ciao ${en.student.firstName},\n\nil tuo attestato per “${cert.courseTitle}” è disponibile nella tua area riservata:\n${process.env.APP_URL}/allieva`);
  revalidatePath("/docente/attestati");
  return { ok: `Attestato ${cert.number} emesso.` };
}

/** Attestato inserito a mano, per allieve non presenti nel gestionale: nessuna verifica dei requisiti. */
export async function issueManualCertificate(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const firstName = String(form.get("firstName") ?? "").trim();
  const lastName = String(form.get("lastName") ?? "").trim();
  const courseTypeId = String(form.get("courseTypeId") ?? "");
  const from = String(form.get("periodFrom") ?? "");
  const to = String(form.get("periodTo") ?? "");
  if (!firstName || !lastName) return { error: "Indica nome e cognome." };
  if (firstName.length > 80 || lastName.length > 80) return { error: "Nome o cognome troppo lunghi." };
  const ct = await db.courseType.findFirst({ where: { id: courseTypeId, status: "ACTIVE", certificateEnabled: true } });
  if (!ct) return { error: "Scegli il tipo di corso." };
  const periodFrom = /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T12:00:00`) : null;
  if (!periodFrom || isNaN(+periodFrom)) return { error: "Indica la data del corso." };
  const periodTo = /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T12:00:00`) : periodFrom;
  if (isNaN(+periodTo) || periodTo < periodFrom) return { error: "La data di fine non può precedere quella di inizio." };
  if (form.get("confirm") !== "on") return { error: "Conferma i dati dell’attestato prima di emetterlo." };

  const cert = await db.certificate.create({
    data: {
      number: await nextCertificateNumber(),
      courseTitle: ct.title,
      studentName: `${firstName} ${lastName}`,
      periodFrom,
      periodTo,
      issuedById: user.id,
    },
  });
  await audit(user.id, "certificate.issue.manual", "Certificate", cert.id);
  revalidatePath("/docente/attestati");
  return { ok: `Attestato ${cert.number} emesso per ${cert.studentName}.` };
}

export async function revokeCertificate(certificateId: string, form: FormData) {
  const user = await requireStaff();
  const cert = await db.certificate.findFirst({ where: { id: certificateId, ...certificateWhereForStaff(user) } });
  const reason = String(form.get("reason") ?? "").trim();
  if (!cert || !reason || cert.revokedAt) return;
  await db.certificate.update({ where: { id: certificateId }, data: { revokedAt: new Date(), revokeReason: reason } });
  await audit(user.id, "certificate.revoke", "Certificate", certificateId, { reason });
  revalidatePath("/docente/attestati");
}
