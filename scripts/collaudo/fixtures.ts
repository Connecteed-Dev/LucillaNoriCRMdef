// Dati aggiuntivi per il collaudo dei permessi (da eseguire DOPO il seed, solo su un database di test):
//   DATABASE_URL="file:./collaudo.db" npx tsx scripts/collaudo/fixtures.ts
// Crea una seconda docente con la propria allieva e percorso, più un attestato e un preventivo della prima docente,
// così da verificare che ogni utenza veda solo i propri dati.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD ?? "LnDemo2026!";

async function main() {
  if (!process.env.DATABASE_URL?.includes("collaudo")) throw new Error("Usare solo con un database di collaudo (DATABASE_URL deve contenere 'collaudo').");
  const hash = await bcrypt.hash(PASSWORD, 10);
  const teacher1 = await db.user.findUniqueOrThrow({ where: { email: "docente@ln.local" } });
  const stile = await db.courseType.findUniqueOrThrow({ where: { slug: "stile" } });
  const quiz = await db.templateVersion.findFirstOrThrow({ where: { template: { title: { contains: "Quiz" } } } });

  // Seconda docente con la sua allieva
  const teacher2 = await db.user.upsert({
    where: { email: "docente2@ln.local" }, update: {},
    create: { email: "docente2@ln.local", name: "Seconda Docente", role: "TEACHER", passwordHash: hash },
  });
  const u2 = await db.user.upsert({
    where: { email: "allieva2@ln.local" }, update: {},
    create: { email: "allieva2@ln.local", name: "Allieva Due", role: "STUDENT", passwordHash: hash },
  });
  let s2 = await db.student.findUnique({ where: { userId: u2.id } });
  if (!s2) {
    s2 = await db.student.create({ data: { userId: u2.id, teacherId: teacher2.id, firstName: "Allieva", lastName: "Due", email: u2.email, physicalNotes: "Dato riservato di prova" } });
    const ed2 = await db.courseEdition.create({
      data: {
        courseTypeId: stile.id, teacherId: teacher2.id, title: "Stile · Seconda docente", status: "RUNNING",
        lessons: { create: [{ number: 1, durationMin: 60, date: new Date(Date.now() + 3 * 86400_000) }] },
      },
    });
    const en2 = await db.enrollment.create({ data: { studentId: s2.id, editionId: ed2.id, status: "IN_PROGRESS" } });
    await db.assignment.create({ data: { versionId: quiz.id, enrollmentId: en2.id, assignedById: teacher2.id } });
  }

  // Attestati (uno da percorso, uno inserito a mano) e preventivo della prima docente
  const demo = await db.student.findFirstOrThrow({ where: { email: "allieva.demo@ln.local" } });
  const en1 = await db.enrollment.findFirstOrThrow({ where: { studentId: demo.id } });
  if (!(await db.certificate.findFirst({ where: { enrollmentId: en1.id } }))) {
    await db.certificate.create({
      data: { number: "LN-2026-9001", enrollmentId: en1.id, courseTitle: "Stile e Portamento", studentName: "Allieva Demo", issuedById: teacher1.id, overrideReason: "Collaudo" },
    });
  }
  if (!(await db.certificate.findFirst({ where: { number: "LN-2026-9002" } }))) {
    await db.certificate.create({
      data: { number: "LN-2026-9002", courseTitle: "Stile e Portamento", studentName: "Esterna Collaudo", periodFrom: new Date(), periodTo: new Date(), issuedById: teacher1.id },
    });
  }
  if (!(await db.quote.findFirst({ where: { number: "PREV-2026-9001" } }))) {
    await db.quote.create({
      data: {
        number: "PREV-2026-9001", teacherId: teacher1.id, courseTypeId: stile.id, prospectFirstName: "Prospect", prospectLastName: "Collaudo",
        prospectEmail: "prospect@ln.local", lessons: 4, lines: [{ label: "Pacchetto", qty: 1, unitCents: 30000 }],
        subtotalCents: 30000, discountCents: 0, vatCents: 0, totalCents: 30000, validUntil: new Date(Date.now() + 30 * 86400_000),
      },
    });
  }
  console.log("Fixture di collaudo pronte: docente2@ln.local, allieva2@ln.local (stessa password di prova).");
}

main().finally(() => db.$disconnect());
