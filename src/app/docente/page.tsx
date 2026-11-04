import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff, studentScope, editionScope } from "@/lib/auth";
import { certificateWhereForStaff, enrollmentWhereForStaff } from "@/lib/guards";
import { addDays, capitalize, relativeDay, shortName, startOfDay } from "@/lib/dates";
import { euro } from "@/lib/quote";
import { ActivityItem, Badge, ButtonLink, Card, DateBox, Empty, PageHeader, PanelTitle, Stat, fmtTime } from "@/components/ui";

export const metadata = { title: "Panoramica" };

export default async function Dashboard() {
  const user = await requireStaff();
  const scope = enrollmentWhereForStaff(user);
  const quoteScope = user.role === "ADMIN" ? {} : { teacherId: user.id };
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = startOfDay(now);

  const [students, newStudents, editions, toReview, waiting, certTotal, certMonth, upcoming, closing, quotesSent, quotesAccepted, activeEnrollments] = await Promise.all([
    db.student.count({ where: { ...studentScope(user), status: "ACTIVE" } }),
    db.student.count({ where: { ...studentScope(user), createdAt: { gte: monthStart } } }),
    db.courseEdition.findMany({ where: { ...editionScope(user), status: { in: ["PLANNED", "RUNNING"] } }, select: { courseTypeId: true } }),
    db.response.findMany({
      where: { status: "SUBMITTED", published: false, assignment: { enrollment: scope } },
      include: { assignment: { include: { version: { include: { template: true } }, enrollment: { include: { student: true } } } } },
      orderBy: { submittedAt: "desc" },
    }),
    db.assignment.count({ where: { enrollment: scope, status: { in: ["SENT", "OPENED", "IN_PROGRESS"] }, version: { template: { audience: "STUDENT" } } } }),
    db.certificate.count({ where: { ...certificateWhereForStaff(user), revokedAt: null } }),
    db.certificate.count({ where: { ...certificateWhereForStaff(user), revokedAt: null, issuedAt: { gte: monthStart } } }),
    db.lesson.findMany({
      where: { edition: { ...editionScope(user), status: { in: ["PLANNED", "RUNNING"] } }, date: { gte: today } },
      include: { edition: { include: { courseType: true, enrollments: { include: { student: true } } } } },
      orderBy: { date: "asc" },
      take: 4,
    }),
    db.enrollment.findMany({
      where: { ...scope, status: { in: ["IN_PROGRESS", "COMPLETED"] }, certificates: { none: { revokedAt: null } }, edition: { courseType: { certificateEnabled: true } } },
      include: { student: true, edition: { include: { lessons: true } } },
    }),
    db.quote.findMany({ where: { ...quoteScope, status: "SENT" }, orderBy: { sentAt: "desc" } }),
    db.quote.findMany({ where: { ...quoteScope, status: "ACCEPTED", editionId: null }, orderBy: { acceptedAt: "desc" } }),
    db.enrollment.findMany({
      where: { ...scope, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } },
      include: { attendances: true, edition: { include: { courseType: true, lessons: true } } },
    }),
  ]);

  // Percorsi vicini al termine: tutte le lezioni passate (o iscrizione completata) e nessun attestato.
  const nearEnd = closing.filter((e) => e.status === "COMPLETED" || (e.edition.lessons.length > 0 && e.edition.lessons.every((l) => l.date && l.date < now)));
  const lessonsThisWeek = upcoming.filter((l) => l.date && l.date < addDays(today, 7)).length;

  // Avanzamento per tipologia = lezioni frequentate / lezioni previste, sulle iscrizioni attive.
  const byCourse = new Map<string, { title: string; done: number; total: number }>();
  for (const e of activeEnrollments) {
    const row = byCourse.get(e.edition.courseTypeId) ?? { title: e.edition.courseType.title, done: 0, total: 0 };
    row.done += e.attendances.filter((a) => a.present).length;
    row.total += e.edition.lessons.length;
    byCourse.set(e.edition.courseTypeId, row);
  }

  const dateLabel = capitalize(new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now));
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const hour = now.getHours();
  const greeting = hour < 13 ? "Buongiorno" : hour < 18 ? "Buon pomeriggio" : "Buonasera";

  return (
    <>
      <PageHeader
        eyebrow="Il tuo atelier digitale"
        title="La tua scuola, in un solo luogo."
        subtitle="Ogni allieva ha un percorso unico. Qui puoi seguirlo, passo dopo passo."
        actions={<>
          <ButtonLink variant="secondary" icon="send" href="/docente/valutazioni/assegna">Assegna questionario</ButtonLink>
          <ButtonLink icon="plus" href="/docente/allieve/nuova">Nuova allieva</ButtonLink>
        </>}
      />

      <section className="relative overflow-hidden rounded-[13px] bg-wine-dark px-6 py-7 text-white sm:flex sm:min-h-[180px] sm:items-center sm:justify-between sm:gap-8 sm:px-9">
        <div className="relative z-10">
          <div className="eyebrow !text-[#d4b99c]">{dateLabel}</div>
          <h2 className="font-serif text-[32px] leading-tight sm:text-[36px]">{greeting}, {user.name.split(" ")[0]}.</h2>
          <p className="mt-2.5 max-w-xl text-[13px] leading-relaxed text-[#e6d9d9]">
            La bellezza di un percorso è vedere quanta strada si è fatta.{" "}
            {[
              toReview.length ? `hai ${plural(toReview.length, "valutazione", "valutazioni")} da completare` : "nessuna valutazione in attesa",
              lessonsThisWeek ? `${plural(lessonsThisWeek, "lezione", "lezioni")} nei prossimi sette giorni` : "nessuna lezione in agenda questa settimana",
            ].join(" e ").replace(/^./, (c) => c.toUpperCase())}.
          </p>
        </div>
        <Link href="/docente/calendario" className="relative z-10 mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-[13px] font-bold text-wine sm:mt-0">
          Visualizza l’agenda <span aria-hidden="true">↗</span>
        </Link>
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-6 right-6 font-serif text-[190px] italic leading-[0.7] text-white/[0.055] sm:right-24">LN</div>
      </section>

      <div className="my-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Allieve attive" value={students} icon="users" href="/docente/allieve" hint={newStudents ? `+${newStudents} nuovi ingressi questo mese` : "Nessun nuovo ingresso questo mese"} hintTone={newStudents ? "ok" : "muted"} />
        <Stat label="Percorsi in corso" value={editions.length} icon="book" href="/docente/corsi" hint={plural(new Set(editions.map((e) => e.courseTypeId)).size, "tipologia di corso", "tipologie di corso")} hintTone="muted" />
        <Stat label="Da valutare" value={toReview.length} icon="clipboard" href="/docente/valutazioni" hint={toReview.length ? "Richiedono attenzione" : "Tutto revisionato"} hintTone={toReview.length ? "wine" : "ok"} />
        <Stat label="Attestati emessi" value={certTotal} icon="award" href="/docente/attestati" hint={certMonth ? `+${certMonth} questo mese` : "Nessuno questo mese"} hintTone={certMonth ? "ok" : "muted"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.38fr_1fr]">
        <Card>
          <PanelTitle title="Le prossime lezioni" action={<Link href="/docente/calendario">Apri calendario ↗</Link>} />
          {upcoming.length ? (
            <ul>
              {upcoming.map((l) => {
                const who = l.edition.enrollments.map((e) => shortName(e.student.firstName, e.student.lastName));
                const time = fmtTime(l.date);
                return (
                  <li key={l.id}>
                    <Link href={`/docente/corsi/${l.editionId}`} className="flex items-center gap-3.5 border-b border-[#f2edeb] py-3.5 last:border-b-0 hover:bg-[#fdf9f7]">
                      <DateBox date={l.date!} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold">{l.topic || `Lezione ${l.number}`}</div>
                        <div className="mt-1 truncate text-xs text-muted">
                          {[time, who.length > 2 ? `${who.length} allieve` : who.join(", "), l.edition.courseType.title].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <Badge tone={relativeDay(l.date!) === "Domani" || relativeDay(l.date!) === "Oggi" ? "pink" : "neutral"}>{relativeDay(l.date!)}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <Empty icon="calendar">Nessuna lezione in calendario. Imposta le date nelle edizioni dei corsi.</Empty>}
        </Card>

        <Card>
          <PanelTitle title="La tua attenzione" action={<Link href="/docente/valutazioni">Gestisci tutto ↗</Link>} />
          {toReview.length + nearEnd.length + quotesSent.length + quotesAccepted.length + waiting === 0 ? (
            <Empty icon="check">Niente in sospeso. Ottimo lavoro!</Empty>
          ) : (
            <div>
              {toReview.length > 0 && (
                <ActivityItem icon="clipboard" href="/docente/valutazioni"
                  title={`${plural(toReview.length, "questionario", "questionari")} da revisionare`}
                  text="Risposte e valutazioni in attesa di approvazione."
                  time={toReview[0].submittedAt ? relativeDay(toReview[0].submittedAt) : undefined} />
              )}
              {quotesAccepted.length > 0 && (
                <ActivityItem icon="euro" href={`/docente/corsi/preventivi/${quotesAccepted[0].id}`}
                  title={`${plural(quotesAccepted.length, "preventivo accettato", "preventivi accettati")} da avviare`}
                  text={quotesAccepted.map((q) => `${q.prospectFirstName} ${q.prospectLastName}`).join(", ")}
                  time={quotesAccepted[0].acceptedAt ? relativeDay(quotesAccepted[0].acceptedAt) : undefined} />
              )}
              {nearEnd.length > 0 && (
                <ActivityItem icon="award" href="/docente/attestati"
                  title={`${plural(nearEnd.length, "percorso vicino", "percorsi vicini")} al termine`}
                  text="Controlla frequenza e completamento per l’attestato." />
              )}
              {quotesSent.length > 0 && (
                <ActivityItem icon="file" href="/docente/corsi/preventivi?stato=SENT"
                  title={`${plural(quotesSent.length, "preventivo", "preventivi")} da confermare`}
                  text={`Inviati e in attesa di accettazione · ${euro(quotesSent.reduce((s, q) => s + q.totalCents, 0))}`}
                  time={quotesSent[0].sentAt ? relativeDay(quotesSent[0].sentAt) : undefined} />
              )}
              {waiting > 0 && (
                <ActivityItem icon="send" href="/docente/valutazioni"
                  title={`${plural(waiting, "questionario", "questionari")} in attesa delle allieve`}
                  text="Inviati o aperti, non ancora consegnati." />
              )}
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-5">
        <PanelTitle title="Il percorso delle tue allieve" action={<span className="text-xs font-normal text-muted">Iscrizioni attive</span>} />
        {byCourse.size ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              {[...byCourse.values()].map((r) => {
                const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
                return (
                  <div key={r.title} className="flex items-center gap-3">
                    <span className="w-36 shrink-0 truncate text-xs text-[#665a58]">{r.title}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#f3eae8]"><span className="block h-full rounded-full bg-wine" style={{ width: `${pct}%` }} /></span>
                    <span className="w-10 text-right text-xs text-wine">{pct}%</span>
                  </div>
                );
              })}
            </div>
            <p className="callout">
              Le percentuali indicano le lezioni frequentate rispetto a quelle previste, sulle iscrizioni attive.
              Un questionario non è considerato automaticamente un esame: il risultato dipende dal tipo di scheda.
            </p>
          </div>
        ) : <Empty icon="chart">Nessuna iscrizione attiva al momento.</Empty>}
      </Card>
    </>
  );
}
