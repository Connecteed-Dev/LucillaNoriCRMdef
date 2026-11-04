import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { certificateWhereForStaff, enrollmentWhereForStaff, getEnrollmentForStaff } from "@/lib/guards";
import { certificateRequirements, nextCertificateNumber } from "@/lib/certificates";
import { issueCertificate, issueManualCertificate, revokeCertificate } from "@/server/certificates";
import { ActionForm } from "@/components/action-form";
import { CertificatePreview } from "@/components/certificate-preview";
import { Icon } from "@/components/icons";
import { Badge, Button, Card, Empty, Field, PageHeader, PanelTitle, SectionHead, Table, Td, cx, fmtDate } from "@/components/ui";

export const metadata = { title: "Attestati" };

const longDate = (d: Date) => new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(d);
const monthYear = (d: Date) => new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(d);

/** Attestati (tavola 10): verifica requisiti, anteprima grafica e archivio con numerazione. */
export default async function CertificatesPage({ searchParams }: { searchParams: Promise<{ iscrizione?: string }> }) {
  const user = await requireStaff();
  const { iscrizione } = await searchParams;
  const scope = enrollmentWhereForStaff(user);

  const [candidates, certificates, courseTypes] = await Promise.all([
    db.enrollment.findMany({
      where: { ...scope, certificates: { none: { revokedAt: null } }, status: { not: "INTERRUPTED" }, edition: { courseType: { certificateEnabled: true } } },
      include: { student: true, edition: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    db.certificate.findMany({ where: certificateWhereForStaff(user), orderBy: { issuedAt: "desc" } }),
    db.courseType.findMany({ where: { status: "ACTIVE", certificateEnabled: true }, orderBy: { title: "asc" } }),
  ]);

  // Percorso selezionato: quello richiesto, altrimenti il primo completato
  const selectedId = iscrizione ?? candidates.find((c) => c.status === "COMPLETED")?.id ?? candidates[0]?.id;
  let req: Awaited<ReturnType<typeof certificateRequirements>> | null = null;
  if (selectedId) {
    await getEnrollmentForStaff(user, selectedId);
    req = await certificateRequirements(selectedId);
  }
  const nextNumber = await nextCertificateNumber();
  const valid = certificates.filter((c) => !c.revokedAt).length;

  const period = req?.periodFrom
    ? req.periodTo && monthYear(req.periodFrom) !== monthYear(req.periodTo) ? `${monthYear(req.periodFrom)} – ${monthYear(req.periodTo)}` : monthYear(req.periodFrom)
    : undefined;

  return (
    <>
      <PageHeader eyebrow="L’ultimo passo del percorso" title="Attestati di partecipazione" subtitle="Verifica i requisiti, genera il documento, conserva lo storico delle emissioni." />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Card>
          <PanelTitle title="Idoneità all’emissione" />
          {candidates.length ? (
            <form className="mb-5 flex gap-2">
              <select name="iscrizione" defaultValue={selectedId} className="input flex-1" aria-label="Percorso">
                {candidates.map((e) => <option key={e.id} value={e.id}>{e.student.firstName} {e.student.lastName} · {e.edition.title}{e.status === "COMPLETED" ? " ✓" : ""}</option>)}
              </select>
              <Button variant="secondary">Verifica</Button>
            </form>
          ) : <Empty icon="award">Nessun percorso in attesa di attestato.</Empty>}

          {req && (
            <>
              <ul className="divide-y divide-[#f2edeb]">
                {req.checks.map((c, i) => {
                  const [title, detail] = c.label.split(" – ");
                  return (
                    <li key={c.label} className="flex items-start gap-3 py-3">
                      <span className={cx("grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg text-xs font-bold", c.ok ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn")}>
                        {c.ok ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      <span className="text-[13px]"><b className="block font-semibold">{title}</b>
                        <span className="text-xs text-muted">{c.ok ? "Requisito soddisfatto" : detail ?? "Non ancora soddisfatto"}</span></span>
                    </li>
                  );
                })}
                <li className="flex items-start gap-3 py-3">
                  <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg bg-warn-bg text-xs font-bold text-warn">{req.checks.length + 1}</span>
                  <span className="text-[13px]"><b className="block font-semibold">Verifica della docente</b><span className="text-xs text-muted">Conferma i dati prima del rilascio</span></span>
                </li>
              </ul>

              <ActionForm action={issueCertificate.bind(null, req.enrollment.id)} className="mt-4 space-y-3">
                {!req.ok && (
                  <Field label="Motivazione per emettere senza tutti i requisiti" hint="L’override resta tracciato nel registro.">
                    <textarea className="input" name="overrideReason" />
                  </Field>
                )}
                <label className="flex items-center gap-2.5 text-[13px]"><input type="checkbox" name="confirm" className="h-4 w-4 accent-[var(--color-wine)]" /> Confermo i dati dell’attestato in anteprima</label>
                <Button icon="award" className="w-full">Emetti attestato {nextNumber}</Button>
              </ActionForm>
            </>
          )}

          <div className="mt-6 rounded-[10px] border border-[#f2e3df] bg-[#faf4f2] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Documenti emessi</div>
            <div className="font-serif text-[38px] leading-snug text-wine-dark">{valid}</div>
            <div className="text-xs text-muted">Gli attestati annullati rimangono tracciati.</div>
          </div>
        </Card>

        <div>
          {req ? (
            <CertificatePreview
              name={`${req.enrollment.student.firstName} ${req.enrollment.student.lastName}`}
              course={req.enrollment.edition.courseType.title}
              period={period}
              hours={req.hours || null}
              number={nextNumber}
              issuer={user.name}
              date={longDate(new Date())}
            />
          ) : <Empty icon="award">L’anteprima compare quando selezioni un percorso.</Empty>}
          <p className="mt-3 text-center text-xs text-muted">Anteprima indicativa: il PDF ufficiale viene generato all’emissione.</p>
        </div>
      </div>

      {courseTypes.length > 0 && (
        <Card className="mt-5">
          <PanelTitle title="Attestato inserito a mano" />
          <p className="-mt-2 mb-4 text-xs text-muted">Per allieve non presenti nel gestionale: nessuna verifica dei requisiti, l’emissione resta tracciata nel registro.</p>
          <ActionForm action={issueManualCertificate} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.3fr_0.8fr_0.8fr]">
            <Field label="Nome"><input className="input" name="firstName" required maxLength={80} autoComplete="off" /></Field>
            <Field label="Cognome"><input className="input" name="lastName" required maxLength={80} autoComplete="off" /></Field>
            <Field label="Tipo di corso">
              <select className="input" name="courseTypeId" required defaultValue="">
                <option value="" disabled>Scegli…</option>
                {courseTypes.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </Field>
            <Field label="Data del corso"><input className="input" type="date" name="periodFrom" required /></Field>
            <Field label="Fino al" hint="Facoltativa"><input className="input" type="date" name="periodTo" /></Field>
            <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 lg:col-span-5">
              <label className="flex items-center gap-2.5 text-[13px]"><input type="checkbox" name="confirm" className="h-4 w-4 accent-[var(--color-wine)]" /> Confermo nome, corso e date dell’attestato</label>
              <Button icon="award">Emetti attestato {nextNumber}</Button>
            </div>
          </ActionForm>
        </Card>
      )}

      <SectionHead title="Archivio attestati" />
      {certificates.length ? (
        <Table head={["Numero", "Allieva", "Corso", "Emissione", "Stato", ""]}>
          {certificates.map((c) => (
            <tr key={c.id}>
              <Td className="font-mono text-xs">{c.number}</Td>
              <Td className="font-bold">{c.studentName}</Td>
              <Td>{c.courseTitle}</Td>
              <Td>{fmtDate(c.issuedAt)}{!c.enrollmentId && <span className="block text-xs text-muted">Inserito a mano</span>}{c.overrideReason && <span className="block text-xs text-warn">Override: {c.overrideReason}</span>}</Td>
              <Td>{c.revokedAt ? <><Badge tone="red">Annullato</Badge><span className="block text-xs text-muted">{c.revokeReason}</span></> : <Badge tone="green">Valido</Badge>}</Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <a href={`/api/attestati/${c.id}`} target="_blank" className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs font-semibold text-[#654653]">
                    <Icon name="download" className="h-3.5 w-3.5" /> PDF
                  </a>
                  {!c.revokedAt && (
                    <details>
                      <summary className="cursor-pointer list-none rounded-lg px-2 py-1 text-xs text-[#a4434a] hover:bg-[#fbeaec]">Annulla</summary>
                      <form action={revokeCertificate.bind(null, c.id)} className="mt-1.5 flex w-64 gap-1.5">
                        <input className="input !min-h-9 !py-1.5 text-xs" name="reason" placeholder="Motivo dell’annullamento" required aria-label="Motivo dell’annullamento" />
                        <Button size="sm" variant="danger">Conferma</Button>
                      </form>
                    </details>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      ) : <Empty icon="award">Nessun attestato emesso.</Empty>}
    </>
  );
}
