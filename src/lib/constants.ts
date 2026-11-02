export const ROLES = { ADMIN: "ADMIN", TEACHER: "TEACHER", STUDENT: "STUDENT" } as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

export const PHASE_LABELS: Record<string, string> = {
  PROFILE: "Scheda conoscitiva",
  INITIAL: "Iniziale",
  LESSON: "Fine lezione",
  FINAL: "Finale",
  EXERCISES: "Esercizi",
};

export const AUDIENCE_LABELS: Record<string, string> = {
  STUDENT: "Compila l'allieva",
  TEACHER: "Compila la docente",
};

export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  SENT: "Inviato",
  OPENED: "Aperto",
  IN_PROGRESS: "In compilazione",
  COMPLETED: "Completato",
  EXPIRED: "Scaduto",
};

export const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Da iniziare",
  IN_PROGRESS: "In corso",
  COMPLETED: "Completato",
  INTERRUPTED: "Interrotto",
};

export const EDITION_STATUS_LABELS: Record<string, string> = {
  PLANNED: "Pianificata",
  RUNNING: "In corso",
  COMPLETED: "Conclusa",
  CANCELLED: "Annullata",
};

export const TEMPLATE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Bozza",
  PUBLISHED: "Pubblicato",
  ARCHIVED: "Archiviato",
};

export const CONSENT_LABELS: Record<string, string> = {
  PRIVACY: "Informativa privacy",
  PHYSICAL_DATA: "Trattamento dati su condizioni fisiche",
  PHOTO: "Uso di foto e video",
  MARKETING: "Comunicazioni promozionali",
};

export const MODE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Individuale",
  GROUP: "Di gruppo",
  BOTH: "Individuale o di gruppo",
};

export const INVITE_TTL_DAYS = 7;
/** Validità del link di recupero password. */
export const RESET_TTL_MINUTES = 60;
