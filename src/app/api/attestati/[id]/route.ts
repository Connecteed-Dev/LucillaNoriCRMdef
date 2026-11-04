import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { certificateWhereForStaff } from "@/lib/guards";
import { ROLES } from "@/lib/constants";
import { renderCertificatePdf } from "@/lib/certificate-pdf";
import { audit } from "@/lib/audit";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Non autenticato", { status: 401 });

  const where =
    user.role === ROLES.STUDENT
      ? { id, revokedAt: null, enrollment: { studentId: user.student?.id ?? "-" } }
      : { id, ...certificateWhereForStaff(user) };
  const cert = await db.certificate.findFirst({ where });
  if (!cert) return new NextResponse("Non trovato", { status: 404 });

  const issuer = await db.user.findUnique({ where: { id: cert.issuedById } });
  const bytes = await renderCertificatePdf(cert, issuer?.name ?? "LN Stile e Portamento");
  await audit(user.id, "certificate.download", "Certificate", cert.id);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Attestato-${cert.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
