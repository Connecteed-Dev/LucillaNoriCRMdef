# LN Stile e Portamento · Piattaforma corsi

MVP (P0) della piattaforma descritta in `../Flusso_Piattaforma_LN_Portamento.pdf` (spec v1.0, 22/10/2026).

**Stack:** Next.js 15 (App Router, server actions) · TypeScript · Prisma · SQLite in sviluppo (Postgres in produzione) · Tailwind 4 · pdf-lib.

## Avvio

```bash
npm install
cp .env.example .env          # imposta SESSION_SECRET (≥ 32 caratteri casuali)
npx prisma migrate dev        # crea il DB ed esegue il seed
npm run dev                   # http://localhost:3000
```

Utenti di prova (password `LnDemo2026!`, cambiabile con `SEED_PASSWORD`): `admin@ln.local`, `docente@ln.local`, `allieva.demo@ln.local`.

| Comando | |
|---|---|
| `npm test` | test unitari (punteggi, libreria modelli, protezione chiavi del quiz, confronti prima/dopo) |
| `npm run typecheck` / `npm run lint` | controlli statici |
| `npm run db:reset` | ricrea il DB locale da zero con il seed |

In sviluppo le email (inviti, notifiche) vengono salvate nella tabella `Notification` e stampate in console; il link d'invito compare anche nella pagina dell'allieva.

## Copertura della specifica

| § | Ambito | Stato |
|---|---|---|
| 1–2 | Flusso end-to-end, ruoli Admin / Docente / Allieva | ✅ autorizzazioni server-side per record (`src/lib/guards.ts`) |
| 3 | Anagrafiche: ricerca, filtri, duplicati email/telefono, campi Sposa, dati fisici riservati, minori + tutore, consensi, note docente | ✅ |
| 4 | Tipologie corso configurabili, edizioni, lezioni, iscrizioni, presenze | ✅ |
| 5 | Builder: 8 tipi di campo, sezioni, ordine, obbligatorietà, punteggi, anteprima mobile, versioni immutabili, duplicazione | ✅ (sezioni condizionali: non ancora) |
| 6 | Libreria iniziale dai 7 allegati unici (`prisma/library.ts`), **solo struttura, senza i dati compilati** | ✅ |
| 7 | Area allieva mobile: form a sezioni, progress bar, bozza, riepilogo, invio, dashboard | ✅ |
| 8 | Punteggio automatico, revisione tracciata, pubblicazione separata, confronto prima/dopo per domande equivalenti | ✅ (report PDF: P1) |
| 9 | Attestato PDF con verifica requisiti, override motivato, annullamento; attestato inserito a mano (nome, cognome, tipo di corso, date) | ✅ (QR di verifica: P2) |
| 10 | Dashboard e navigazione docente | ✅ |
| 12 | Inviti scaduti/rinnovo, proroga, sollecito, riapertura, cambio email, revoca accesso | ✅ |
| 13 | Audit log, cookie di sessione firmati, password hashate, token d'invito salvati solo come hash | ✅ base |

### Scelte da validare (spec §16)

Ho applicato questi default, tutti modificabili:
- **Corsi:** individuali e di gruppo, entrambi supportati.
- **Accesso:** invito via email con link monouso valido 7 giorni e password scelta dall'allieva. OTP e WhatsApp non sono inclusi.
- **Frequenza minima per l'attestato:** 80% di default, impostabile per edizione. L'override della docente è motivato e tracciato.
- **Risultati:** non sono mai visibili all'allieva finché la docente non li pubblica, quiz compresi.
- **Domande senza risposta nei quiz:** valgono 0 punti.

### Concetti chiave
- **Modello → Versione → Assegnazione → Risposta.** Una versione pubblicata non si modifica mai: per cambiare un modello si crea una nuova bozza e la si pubblica. Le compilazioni restano sempre legate alla loro versione.
- **Confronti nel tempo.** Le domande a scala con la stessa chiave `dimension` vengono confrontate tra loro, per esempio `sposa_tacchi` nel test di arrivo e in quello di fine incontro. Le rubriche della docente stanno in righe separate dall'autovalutazione dell'allieva.
- **Quiz.** Le risposte corrette vengono tolte dal contenuto prima di inviarlo al browser dell'allieva (`stripAnswerKey`).

## Design system "LN Studio"

L'interfaccia segue il pacchetto `../LN_Studio_Pacchetto_UIUX` (tavole e prototipo del 22/10/2026):
- **Token** in `src/app/globals.css`: bordeaux `#742D43`, prugna `#542033`, avorio `#F8F6F3`, bianco caldo, rosa cipria, champagne `#AF9570`. I font sono EB Garamond per i titoli e Inter per l'interfaccia, entrambi da validare con il brand ufficiale.
- **Componenti** in `src/components/ui.tsx`: pulsanti, card, tabelle, badge, indicatori, filtri, tab, stepper, data in riquadro, iniziali, barra di avanzamento. Le icone sono in `src/components/icons.tsx`.
- **Struttura:** sidebar raggruppata in Workspace, Gestione didattica e Amministrazione, con breadcrumb, ricerca globale (`/docente/cerca`) e menu a scomparsa su mobile.
- **Rispetto al prototipo:**
  - i dati sono tutti reali: le percentuali derivano dalle presenze, l'evoluzione dalle sole domande equivalenti;
  - i moduli lunghi (anagrafica, corso, edizione, assegnazione) sono pagine dedicate invece di finestre modali, perché si leggono meglio, hanno un link proprio e funzionano su mobile;
  - è stata aggiunta la pagina **Calendario**, con la vista settimanale e "Valuta lezione".

## Messa in produzione

### Già pronto (verificato nel collaudo del 26/10/2026 su build di produzione)
- Permessi: `scripts/collaudo/permessi.ts` prova 40 pagine e API con 6 utenze (anonimo, 2 allieve, 2 docenti, admin). Esito: 240 verifiche su 240.
- Intestazioni di sicurezza attive: CSP, HSTS, X-Frame-Options, Referrer-Policy, nosniff; `X-Powered-By` disattivato.
- Login: massimo 5 tentativi falliti per email e 20 per IP ogni 15 minuti; i tentativi falliti finiscono nel registro operazioni.
- Recupero password: "Password dimenticata?" nella pagina di accesso (`/password-dimenticata`) invia un link monouso valido 60 minuti; stesso messaggio che l'email esista o no; massimo 3 richieste per email e 10 per IP all'ora. Richiede l'invio email (`SMTP_URL`). Le sessioni già aperte su altri dispositivi restano valide fino alla scadenza (7 giorni).
- Email: invio reale via SMTP con 3 tentativi e allegati (inviti calendario `.ics`). Senza `SMTP_URL`, in produzione le email non vengono segnate come inviate e la docente vede un avviso.

### Pubblicazione su Dokploy
Il `Dockerfile` crea l'immagine; all'avvio `docker-entrypoint.sh` applica le migrazioni, carica il catalogo (tipologie corso e libreria modelli) se il database è vuoto e avvia Next sulla porta 3000. In produzione il seed **non** crea utenti demo.

1. Su Dokploy: nuova *Application*, sorgente il repository git di `piattaforma`, Build Type **Dockerfile**.
2. **Environment:** `SESSION_SECRET` (almeno 32 caratteri casuali, es. `openssl rand -hex 32`), `APP_URL` (es. `https://gestionale.dominio.it`), `SMTP_URL`, `EMAIL_FROM`. `DATABASE_URL` è già impostata nell'immagine (`file:/app/data/ln.db`).
3. **Mounts:** volume persistente con mount path `/app/data` (contiene il database SQLite). Senza volume i dati si perdono a ogni deploy.
4. **Domains:** dominio con HTTPS attivo, container port `3000`.
5. Dopo il primo deploy, dal terminale del container in Dokploy: `npx tsx scripts/crea-utente.ts --email … --nome "…" --ruolo ADMIN` e aprire il link d'invito stampato.
6. Backup: pianificare la copia del volume `/app/data`. Una sola istanza: il limite dei tentativi di login è in memoria e SQLite non regge più repliche.

### Procedura (server senza Docker)
1. Variabili d'ambiente: `DATABASE_URL`, `SESSION_SECRET` (almeno 32 caratteri casuali), `APP_URL` (indirizzo pubblico https), `SMTP_URL`, `EMAIL_FROM`.
2. `npx prisma migrate deploy && npx prisma db seed` (in produzione il seed carica solo il catalogo, nessun utente demo).
3. Prima amministratrice: `npx tsx scripts/crea-utente.ts --email … --nome "…" --ruolo ADMIN`, poi si apre il link d'invito e si sceglie la password. Lo stesso script crea le docenti (`--ruolo TEACHER`) e rigenera l'invito se una docente dimentica la password.
4. Collaudo prima di ogni rilascio, su un database di prova:
   ```bash
   DATABASE_URL="file:./collaudo.db" npx prisma migrate deploy && DATABASE_URL="file:./collaudo.db" npx tsx prisma/seed.ts
   DATABASE_URL="file:./collaudo.db" npx tsx scripts/collaudo/fixtures.ts
   NEXT_DIST_DIR=.next-prod DATABASE_URL="file:./collaudo.db" npx next build && NEXT_DIST_DIR=.next-prod DATABASE_URL="file:./collaudo.db" npx next start -p 3100
   BASE_URL=http://localhost:3100 DATABASE_URL="file:./collaudo.db" npx tsx scripts/collaudo/permessi.ts
   ```

### Ancora da fare / decidere
- **Provider email e dominio mittente:** scegliere il provider SMTP e configurare SPF/DKIM sul dominio.
- **Hosting e database:** SQLite va bene solo su un server singolo con disco persistente e backup giornalieri; altrimenti Postgres. Il limite dei tentativi di login è in memoria: con più istanze serve un archivio condiviso.
- **Informativa privacy:** testo e pagina pubblica da collegare alle caselle di consenso (preventivo e anagrafica), da validare con il DPO, così come la base giuridica per i dati fisici (§13).
- **Gestione utenti in app:** oggi docenti e amministratrici si creano dallo script; manca una pagina "Utenti" per l'amministratrice.
- **Diritti GDPR:** esportazione e cancellazione dei dati di un'allieva non sono ancora disponibili in app.
- **Permessi sul catalogo:** oggi ogni docente può modificare corsi, listino e modelli di questionario di tutta la scuola. Decidere se riservarlo all'amministratrice.
- Branding definitivo, firma e testo dell'attestato (§16).
