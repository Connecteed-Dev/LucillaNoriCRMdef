import Link from "next/link";
import { db } from "@/lib/db";
import { getStudentForStaff, requireStaff, editionScope, type CurrentUser } from "@/lib/auth";
import { effectiveStatus } from "@/lib/guards";
import { loadProgress } from "@/lib/progress";
import { dayAndDate } from "@/lib/dates";
import { fmtScore } from "@/lib/format";
import { ASSIGNMENT_STATUS_LABELS, CONSENT_LABELS, ENROLLMENT_STATUS_LABELS } from "@/lib/constants";
import { QUOTE_STATUS_LABELS, euro, quoteEffectiveStatus } from "@/lib/quote";
import { addTeacherNote, inviteStudent, recordConsent, revokeAccess, updateStudent } from "@/server/students";
import { enrollStudent } from "@/server/courses";
import { ActionForm } from "@/components/action-form";
import { StudentForm } from "@/components/student-form";
import { ProgressTable } from "@/components/progress-table";
import { Badge, Button, ButtonLink, Card, Empty, Initials, PanelTitle, Table, Tabs, Td, fmtDate, fmtDateTime, fmtTime, statusTone } from "@/components/ui";

const TABS = [
  { value: "percorso", label: "Percorso" },
  { value: "questionari", label: "Questionari" },
  { value: "valutazioni", label: "Valutazioni" },
  { value: "documenti", label: "Documenti" },
  { value: "anagrafica", label: "Anagrafica" },
  { value: "note", label: "Note e consensi" },
];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await db.student.findUnique({ where: { id }, select: { firstName: true, lastName: true } });
  return { title: s ? `${s.firstName} ${s.lastName}` : "Allieva" };
}

/** Fascicolo formativo dell'allieva (tavola 14): un profilo unico con tab. */
export default async function StudentDossier({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ creata?: string; tab?: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  const { creata, tab = "percorso" } = await searchParams;
  await getStudentForStaff(user, id);

  const student = await db.student.findUniqueOrThrow({
    where: { id },
    include: {
      user: { include: { invites: { orderBy: { createdAt: "desc" }, take: 1 } } },
      enrollments: {
        include: {
          edition: { include: { courseType: true, lessons: { orderBy: { number: "asc" } } } },
          attendances: true,
          certificates: { orderBy: { issuedAt: "desc" } },
          assignments: { include: { version: { include: { template: true } }, responses: { orderBy: { attempt: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" } },
        },
        orderBy: { createdAt: "desc" },
      },
      consents: { orderBy: { createdAt: "desc" } },
      teacherNotes: { orderBy: { createdAt: "desc" } },
      quotes: { include: { courseType: true }, orderBy: { createdAt: "desc" } },
    },
  });
  const fullName = `${student.firstName} ${student.lastName}`;
  const account = student.user;
  const current = student.enrollments.find((e) => ["NOT_STARTED", "IN_PROGRESS"].includes(e.status)) ?? student.enrollments[0];
  const assignments = student.enrollments.flatMap((e) => e.assignments.map((a) => ({ ...a, edition: e.edition })));
  const certificates = student.enrollments.flatMap((e) => e.certificates);
  const pending = assignments.filter((a) => a.version.template.audience === "STUDENT" && !["COMPLETED", "EXPIRED"].includes(effectiveStatus(a))).length;

  const accessBadge = !account ? <Badge>Nessun accesso</Badge> : !account.active ? <Badge tone="red">Accesso revocato</Badge>
    : account.passwordHash ? <Badge tone="green">Area riservata attiva</Badge> : <Badge tone="amber">Invito in attesa</Badge>;
  const tabItems = TABS.map((t) => ({
    ...t,
    href: `?tab=${t.value}`,
    label: t.value === "questionari" && pending ? <>{t.label} <span className="ml-1 rounded-full bg-blush px-1.5 text-[10px] text-wine">{pending}</span></> : t.label,
  }));

  return (
    <>
      {creata && <p role="status" className="mb-4 rounded-xl bg-ok-bg p-3 text-[13px] text-ok">Anagrafica creata. Ora puoi inviare l’invito e iscriverla a un percorso.</p>}

      <div className="mb-6 flex flex-col gap-4 rounded-xl border border-[#f2e3df] bg-[#faf4f2] p-5 sm:flex-row sm:items-center sm:p-6">
        <Initials name={fullName} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="eyebrow mb-1">Fascicolo formativo</div>
          <h1 className="font-serif text-[32px] leading-tight text-wine-dark">{fullName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            {student.email}{student.phone && <> · {student.phone}</>}
            {current && <Badge tone={statusTone(current.status)}>{ENROLLMENT_STATUS_LABELS[current.status]}</Badge>}
            {accessBadge}
            {student.isMinor && <Badge tone="amber">Minorenne</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink variant="secondary" icon="file" href={`/docente/corsi/preventivi/nuovo?allieva=${id}`}>Preventivo</ButtonLink>
          <ButtonLink icon="send" href={`/docente/valutazioni/assegna?allieva=${id}`}>Assegna questionario</ButtonLink>
        </div>
      </div>

      <Tabs items={tabItems} active={tab} />

      {tab === "percorso" && (
        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            {student.enrollments.length ? student.enrollments.map((en) => {
              const total = en.edition.lessons.length;
              const present = en.attendances.filter((a) => a.present).length;
              const pct = total ? Math.round((present / total) * 100) : 0;
              const next = en.edition.lessons.find((l) => l.date && l.date >= new Date());
              return (
                <Card key={en.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="eyebrow mb-1">{["NOT_STARTED", "IN_PROGRESS"].includes(en.status) ? "Corso attuale" : "Percorso"}</div>
                      <h2 className="font-serif text-[24px] leading-tight text-wine-dark">{en.edition.courseType.title}</h2>
                      <Link href={`/docente/corsi/${en.editionId}`} className="text-xs text-muted hover:text-wine">{en.edition.title} →</Link>
                    </div>
                    <Badge tone={statusTone(en.status)}>{ENROLLMENT_STATUS_LABELS[en.status]}</Badge>
                  </div>
                  <div className="mt-5 flex items-center gap-3">
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#f3eae8]"><span className="block h-full rounded-full bg-wine" style={{ width: `${pct}%` }} /></span>
                    <span className="text-xs text-wine">{pct}%</span>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    Lezioni frequentate {present} di {total}
                    {next && <> · Prossimo incontro {dayAndDate(next.date!)}{fmtTime(next.date) && ` alle ${fmtTime(next.date)}`}</>}
                    {en.certificates.some((c) => !c.revokedAt) && " · attestato emesso"}
                  </p>
                </Card>
              );
            }) : <Empty icon="book">Non è ancora iscritta a nessun percorso.</Empty>}
            <EnrollForm studentId={id} user={user} />
          </div>

          <aside>
            <Card>
              <PanelTitle title="Area riservata" />
              <div className="mb-3">{accessBadge}</div>
              {account?.invites[0] && !account.passwordHash && (
                <p className="mb-3 text-xs text-muted">Ultimo invito {fmtDateTime(account.invites[0].createdAt)} · scade {fmtDate(account.invites[0].expiresAt)}</p>
              )}
              <ActionForm action={inviteStudent.bind(null, id)}>
                <Button icon="send" className="w-full">{account?.passwordHash ? "Invia link per reimpostare l’accesso" : account ? "Rinnova invito" : "Invia invito"}</Button>
              </ActionForm>
              {account?.active && (
                <form action={revokeAccess.bind(null, id)} className="mt-2"><Button variant="danger" className="w-full">Revoca accesso</Button></form>
              )}
            </Card>
          </aside>
        </div>
      )}

      {tab === "questionari" && (
        assignments.length ? (
          <Table head={["Questionario", "Percorso", "Assegnato", "Stato", "Esito", ""]}>
            {assignments.map((a) => {
              const r = a.responses[0];
              const st = effectiveStatus(a);
              const teacherSheet = a.version.template.audience === "TEACHER";
              const toFill = teacherSheet && st !== "COMPLETED";
              return (
                <tr key={a.id}>
                  <Td><b>{a.version.template.title}</b><span className="block text-xs text-muted">v{a.version.version}{teacherSheet && " · compila la docente"}</span></Td>
                  <Td>{a.edition.courseType.title}</Td>
                  <Td className="text-muted">{fmtDate(a.createdAt)}{a.dueAt && <span className="block text-xs">entro {fmtDate(a.dueAt)}</span>}</Td>
                  <Td><Badge tone={statusTone(st)}>{ASSIGNMENT_STATUS_LABELS[st]}</Badge></Td>
                  <Td>
                    {r?.maxScore != null && r.status === "SUBMITTED" && <span className="mr-2 text-[13px]">{fmtScore(r.manualScore ?? r.autoScore, r.maxScore)}</span>}
                    {r?.published ? <Badge tone="pink">Pubblicato</Badge> : r?.status === "SUBMITTED" ? <Badge tone="amber">Da rivedere</Badge> : null}
                  </Td>
                  <Td className="text-right">
                    <ButtonLink size="sm" variant="secondary" href={toFill ? `/docente/compila/${a.id}` : `/docente/compilazioni/${a.id}`}>
                      {toFill ? "Compila" : r?.status === "SUBMITTED" && !r.published ? "Rivedi" : "Apri"}
                    </ButtonLink>
                  </Td>
                </tr>
              );
            })}
          </Table>
        ) : <Empty icon="clipboard">Nessun questionario assegnato. <Link className="text-wine underline" href={`/docente/valutazioni/assegna?allieva=${id}`}>Assegnane uno</Link></Empty>
      )}

      {tab === "valutazioni" && <ProgressPanel studentId={id} />}

      {tab === "documenti" && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <PanelTitle title="Attestati" action={<Link href="/docente/attestati">Gestisci ↗</Link>} />
            {certificates.length ? (
              <ul className="divide-y divide-[#f2edeb]">
                {certificates.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-3 text-[13px]">
                    <span><b className="font-mono text-xs">{c.number}</b> · {c.courseTitle}<span className="block text-xs text-muted">Emesso il {fmtDate(c.issuedAt)}</span></span>
                    <span className="flex items-center gap-2">
                      {c.revokedAt ? <Badge tone="red">Annullato</Badge> : <Badge tone="green">Valido</Badge>}
                      <a href={`/api/attestati/${c.id}`} target="_blank" className="text-xs font-semibold text-wine">PDF ↗</a>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <Empty icon="award">Nessun attestato emesso.</Empty>}
          </Card>
          <Card>
            <PanelTitle title="Preventivi" action={<Link href={`/docente/corsi/preventivi/nuovo?allieva=${id}`}>+ Nuovo</Link>} />
            {student.quotes.length ? (
              <ul className="divide-y divide-[#f2edeb]">
                {student.quotes.map((q) => {
                  const st = quoteEffectiveStatus(q);
                  return (
                    <li key={q.id}>
                      <Link href={`/docente/corsi/preventivi/${q.id}`} className="flex items-center justify-between gap-3 py-3 text-[13px] hover:text-wine">
                        <span><b className="font-mono text-xs">{q.number}</b> · {q.courseType.title}<span className="block text-xs text-muted">{euro(q.totalCents)}</span></span>
                        <Badge tone={statusTone(st)}>{QUOTE_STATUS_LABELS[st]}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <Empty icon="file">Nessun preventivo.</Empty>}
          </Card>
        </div>
      )}

      {tab === "anagrafica" && (
        <div className="max-w-4xl"><StudentForm action={updateStudent.bind(null, id)} student={student} /></div>
      )}

      {tab === "note" && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <PanelTitle title="Note della docente" />
            <form action={addTeacherNote.bind(null, id)} className="mb-4 space-y-2">
              <textarea name="text" className="input" placeholder="Aggiungi una nota (non visibile all’allieva)" required aria-label="Nuova nota" />
              <Button variant="secondary">Aggiungi nota</Button>
            </form>
            {student.teacherNotes.length ? (
              <ul className="space-y-2">
                {student.teacherNotes.map((n) => (
                  <li key={n.id} className="rounded-lg bg-[#faf8f7] p-3 text-[13px]"><div className="mb-1 text-[11px] text-muted">{fmtDateTime(n.createdAt)}</div><div className="whitespace-pre-wrap">{n.text}</div></li>
                ))}
              </ul>
            ) : <Empty>Nessuna nota.</Empty>}
          </Card>
          <div className="space-y-5">
            <Card>
              <PanelTitle title="Consensi" />
              <ul className="divide-y divide-[#f2edeb]">
                {Object.entries(CONSENT_LABELS).map(([type, label]) => {
                  const c = student.consents.find((x) => x.type === type);
                  return (
                    <li key={type} className="flex items-center justify-between gap-3 py-3 text-[13px]">
                      <span>{label}<span className="block text-xs text-muted">{c ? `${c.granted ? "Concesso" : "Revocato"} il ${fmtDate(c.createdAt)}` : "Non registrato"}</span></span>
                      <form action={recordConsent.bind(null, id)}>
                        <input type="hidden" name="type" value={type} />
                        <input type="hidden" name="granted" value={c?.granted ? "false" : "true"} />
                        <Button size="sm" variant={c?.granted ? "danger" : "secondary"}>{c?.granted ? "Revoca" : "Registra"}</Button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card>
              <PanelTitle title="Dati riservati" />
              <dl className="space-y-3 text-[13px]">
                <div><dt className="text-xs text-muted">Limitazioni fisiche</dt><dd>{student.physicalNotes ?? "—"}</dd></div>
                {student.isMinor && <div><dt className="text-xs text-muted">Genitore / tutore</dt><dd>{student.guardianName} · {student.guardianEmail} {student.guardianPhone}</dd></div>}
                <div><dt className="text-xs text-muted">Contatto di emergenza</dt><dd>{student.emergencyContact ?? "—"}</dd></div>
              </dl>
              <p className="callout mt-4">Visibili solo alla docente di riferimento e all’amministratrice. Revocando il consenso ai dati fisici, il campo viene cancellato.</p>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

async function EnrollForm({ studentId, user }: { studentId: string; user: CurrentUser }) {
  const [editions, types] = await Promise.all([
    db.courseEdition.findMany({
      where: { ...editionScope(user), status: { in: ["PLANNED", "RUNNING"] }, enrollments: { none: { studentId } } },
      include: { courseType: true },
    }),
    db.courseType.findMany({ where: { status: "ACTIVE" }, orderBy: { title: "asc" } }),
  ]);
  if (!editions.length && !types.length) return null;
  return (
    <Card>
      <PanelTitle title="Iscrivi a un corso" />
      <form action={enrollStudent} className="space-y-3">
        <input type="hidden" name="studentId" value={studentId} />
        <label className="block">
          <span className="label">Corso</span>
          <select name="editionId" className="input" required>
            {types.length > 0 && (
              <optgroup label="Nuovo percorso individuale">
                {types.map((t) => <option key={t.id} value={`new:${t.id}`}>{t.title}{t.durationLessons ? ` · ${t.durationLessons} lezioni` : ""}</option>)}
              </optgroup>
            )}
            {editions.length > 0 && (
              <optgroup label="Edizioni aperte">
                {editions.map((e) => <option key={e.id} value={e.id}>{e.title} ({e.courseType.title})</option>)}
              </optgroup>
            )}
          </select>
        </label>
        <label className="block">
          <span className="label">Prima lezione</span>
          <input className="input" type="datetime-local" name="startDate" />
          <span className="mt-1 block text-xs text-muted">Facoltativa, solo per un nuovo percorso: le lezioni successive vengono fissate ogni settimana alla stessa ora.</span>
        </label>
        <Button variant="secondary" icon="plus">Iscrivi</Button>
      </form>
    </Card>
  );
}

async function ProgressPanel({ studentId }: { studentId: string }) {
  const progress = await loadProgress(studentId);
  return (
    <Card>
      <PanelTitle title="Evoluzione del percorso" action={<span className="text-xs font-normal text-muted">Solo domande equivalenti</span>} />
      <ProgressTable {...progress} />
      <p className="callout mt-5">
        Si confrontano solo domande con lo stesso significato su scale omogenee. Autovalutazione dell’allieva e competenze
        osservate dalla docente restano separate; i questionari di benessere e feedback non producono un voto di competenza.
      </p>
    </Card>
  );
}
