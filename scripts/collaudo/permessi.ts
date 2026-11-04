// Matrice dei permessi: prova ogni pagina/API con tutte le utenze e confronta l'esito atteso.
//   BASE_URL=http://localhost:3100 DATABASE_URL="file:./collaudo.db" npx tsx scripts/collaudo/permessi.ts
// Richiede database di collaudo con seed + fixtures e lo stesso SESSION_SECRET del server.
import { PrismaClient } from "@prisma/client";
import { signSession } from "../../src/lib/session";
import { sign } from "../../src/lib/signing";

const db = new PrismaClient();
const BASE = process.env.BASE_URL ?? "http://localhost:3100";

type Persona = "anonimo" | "allieva" | "allieva2" | "docente" | "docente2" | "admin";
const PERSONAS: Persona[] = ["anonimo", "allieva", "allieva2", "docente", "docente2", "admin"];
const EMAILS: Record<Exclude<Persona, "anonimo">, string> = {
  allieva: "allieva.demo@ln.local", allieva2: "allieva2@ln.local", docente: "docente@ln.local", docente2: "docente2@ln.local", admin: "admin@ln.local",
};

/** Esito atteso: codice HTTP, "login" (redirect al login), "home" (redirect alla propria area), oppure codice + testo da trovare. */
type Expect = number | "login" | "home" | { status: number; contains?: string; absent?: string };
type Case = { name: string; path: string; expect: Partial<Record<Persona, Expect>> & { default?: Expect } };

async function main() {
  const users = Object.fromEntries(await Promise.all(Object.entries(EMAILS).map(async ([p, email]) => [p, await db.user.findUniqueOrThrow({ where: { email } })])));
  const cookies: Partial<Record<Persona, string>> = {};
  for (const p of PERSONAS) if (p !== "anonimo") cookies[p] = `ln_session=${await signSession({ userId: users[p].id, role: users[p].role })}`;

  const s1 = await db.student.findFirstOrThrow({ where: { email: EMAILS.allieva } });
  const s2 = await db.student.findFirstOrThrow({ where: { email: EMAILS.allieva2 } });
  const e1 = await db.enrollment.findFirstOrThrow({ where: { studentId: s1.id } });
  const e2 = await db.enrollment.findFirstOrThrow({ where: { studentId: s2.id } });
  const a1 = await db.assignment.findFirstOrThrow({ where: { enrollmentId: e1.id } });
  const a2 = await db.assignment.findFirstOrThrow({ where: { enrollmentId: e2.id } });
  const l1 = await db.lesson.findFirstOrThrow({ where: { editionId: e1.editionId, date: { not: null } } });
  const cert = await db.certificate.findFirstOrThrow({ where: { enrollmentId: e1.id } });
  const manualCert = await db.certificate.findFirstOrThrow({ where: { number: "LN-2026-9002" } });
  const quote = await db.quote.findFirstOrThrow({ where: { number: "PREV-2026-9001" } });
  const tpl = await db.questionnaireTemplate.findFirstOrThrow();
  const ct = await db.courseType.findFirstOrThrow();

  const staffOnly = { default: "home" as Expect, anonimo: "login" as Expect, docente: 200, docente2: 200, admin: 200 };
  const studentOnly = { default: "home" as Expect, anonimo: "login" as Expect, allieva: 200, allieva2: 200 };
  const ownedBy1 = { ...staffOnly, docente2: 404 };
  const ownedBy2 = { ...staffOnly, docente: 404 };

  const cases: Case[] = [
    { name: "Login", path: "/login", expect: { default: "home", anonimo: 200 } },
    { name: "Home → area", path: "/", expect: { default: "home", anonimo: "login" } },
    { name: "Panoramica docente", path: "/docente", expect: staffOnly },
    { name: "Elenco allieve", path: "/docente/allieve", expect: staffOnly },
    { name: "Elenco allieve: solo le proprie (docente)", path: "/docente/allieve", expect: { ...staffOnly, docente: { status: 200, contains: "Allieva Demo", absent: "Allieva Due" }, docente2: { status: 200, contains: "Allieva Due", absent: "Allieva Demo" } } },
    { name: "Scheda allieva 1", path: `/docente/allieve/${s1.id}`, expect: ownedBy1 },
    { name: "Scheda allieva 2 (dati fisici)", path: `/docente/allieve/${s2.id}?tab=note`, expect: { ...ownedBy2, docente2: { status: 200, contains: "Dato riservato di prova" } } },
    { name: "Nuova allieva", path: "/docente/allieve/nuova", expect: staffOnly },
    { name: "Corsi", path: "/docente/corsi", expect: staffOnly },
    { name: "Edizione docente 1", path: `/docente/corsi/${e1.editionId}`, expect: ownedBy1 },
    { name: "Edizione docente 2", path: `/docente/corsi/${e2.editionId}`, expect: ownedBy2 },
    { name: "Tipologia corso", path: `/docente/corsi/tipologie/${ct.id}`, expect: staffOnly },
    { name: "Preventivi", path: "/docente/corsi/preventivi", expect: { ...staffOnly, docente: { status: 200, contains: "PREV-2026-9001" }, docente2: { status: 200, absent: "PREV-2026-9001" } } },
    { name: "Preventivo docente 1", path: `/docente/corsi/preventivi/${quote.id}`, expect: ownedBy1 },
    { name: "Vecchio URL preventivi", path: "/docente/preventivi", expect: { default: 308 } },
    { name: "Calendario", path: "/docente/calendario", expect: staffOnly },
    { name: "Pianifica lezione", path: "/docente/calendario/pianifica", expect: staffOnly },
    { name: "Pianifica lezione altrui", path: `/docente/calendario/pianifica?lezione=${l1.id}`, expect: ownedBy1 },
    { name: "Questionari", path: "/docente/questionari", expect: staffOnly },
    { name: "Editor modello", path: `/docente/questionari/${tpl.id}`, expect: staffOnly },
    { name: "Valutazioni", path: "/docente/valutazioni", expect: staffOnly },
    { name: "Assegna", path: "/docente/valutazioni/assegna", expect: staffOnly },
    { name: "Compilazione allieva 1 (docente)", path: `/docente/compilazioni/${a1.id}`, expect: ownedBy1 },
    { name: "Compilazione allieva 2 (docente)", path: `/docente/compilazioni/${a2.id}`, expect: ownedBy2 },
    { name: "Attestati", path: "/docente/attestati", expect: staffOnly },
    { name: "Ricerca: niente dati altrui", path: "/docente/cerca?q=Allieva", expect: { ...staffOnly, docente: { status: 200, absent: "Allieva Due" }, docente2: { status: 200, absent: "Allieva Demo" } } },
    { name: "Area allieva", path: "/allieva", expect: studentOnly },
    { name: "Questionario allieva 1", path: `/allieva/questionari/${a1.id}`, expect: { ...studentOnly, allieva2: 404 } },
    { name: "Questionario allieva 2", path: `/allieva/questionari/${a2.id}`, expect: { ...studentOnly, allieva: 404 } },
    { name: "PDF attestato", path: `/api/attestati/${cert.id}`, expect: { anonimo: "login", allieva: 200, allieva2: 404, docente: 200, docente2: 404, admin: 200 } },
    { name: "PDF attestato manuale", path: `/api/attestati/${manualCert.id}`, expect: { anonimo: "login", allieva: 404, allieva2: 404, docente: 200, docente2: 404, admin: 200 } },
    { name: "ICS lezione senza firma", path: `/api/calendario/lezione/${l1.id}.ics`, expect: { default: 403 } },
    { name: "ICS lezione firmato", path: `/api/calendario/lezione/${l1.id}.ics?sig=${sign("lesson", l1.id)}`, expect: { default: { status: 200, contains: "BEGIN:VCALENDAR" } } },
    { name: "ICS firma di altra lezione", path: `/api/calendario/lezione/${l1.id}.ics?sig=${sign("lesson", "altro")}`, expect: { default: 403 } },
    { name: "Feed calendario con firma altrui", path: `/api/calendario/feed/${users.allieva.id}.ics?sig=${sign("feed", users.allieva2.id)}`, expect: { default: 403 } },
    { name: "Feed calendario allieva 2", path: `/api/calendario/feed/${users.allieva2.id}.ics?sig=${sign("feed", users.allieva2.id)}`, expect: { default: { status: 200, absent: "Portamento Sposa" } } },
    { name: "Preventivo pubblico con token falso", path: "/preventivo/token-falso", expect: { default: { status: 200, contains: "non è più attivo" } } },
    { name: "Invito con token falso", path: "/invito/token-falso", expect: { default: { status: 200, contains: "non più valido" } } },
    { name: "Manifest PWA", path: "/manifest.webmanifest", expect: { default: 200 } },
    { name: "Icona app", path: "/icons/192", expect: { default: 200 } },
    { name: "Pagina inesistente", path: "/docente/nonesiste", expect: { ...staffOnly, docente: 404, docente2: 404, admin: 404 } },
  ];

  const homeOf = (p: Persona) => (p === "allieva" || p === "allieva2" ? "/allieva" : "/docente");
  let fails = 0;
  const rows: string[] = [];
  for (const c of cases) {
    const cells: string[] = [];
    for (const p of PERSONAS) {
      const exp = c.expect[p] ?? c.expect.default ?? 200;
      const res = await fetch(BASE + c.path, { redirect: "manual", headers: cookies[p] ? { cookie: cookies[p]! } : {} });
      const loc = res.headers.get("location") ?? "";
      // React separa i testi interpolati con <!-- -->: si tolgono per cercare frasi intere
      const body = res.status === 200 ? (await res.text()).replace(/<!-- -->/g, "") : "";
      let ok: boolean;
      if (exp === "login") ok = [302, 303, 307].includes(res.status) && loc.includes("/login");
      else if (exp === "home") ok = [302, 303, 307].includes(res.status) && new URL(loc, BASE).pathname === homeOf(p);
      else if (typeof exp === "number") ok = res.status === exp;
      else ok = res.status === exp.status && (!exp.contains || body.includes(exp.contains)) && (!exp.absent || !body.includes(exp.absent));
      if (!ok) fails++;
      cells.push(`${ok ? "✓" : "✗"} ${res.status}${loc ? `→${new URL(loc, BASE).pathname}` : ""}`);
    }
    rows.push(`${c.name.padEnd(42)} ${cells.map((x) => x.padEnd(16)).join("")}`);
  }
  console.log(`${"Caso".padEnd(42)} ${PERSONAS.map((p) => p.padEnd(16)).join("")}`);
  console.log(rows.join("\n"));
  console.log(`\n${cases.length * PERSONAS.length - fails}/${cases.length * PERSONAS.length} verifiche superate`);
  process.exitCode = fails ? 1 : 0;
}

main().finally(() => db.$disconnect());
