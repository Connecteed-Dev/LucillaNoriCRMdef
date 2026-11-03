import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import type { Certificate } from "@prisma/client";

const BORDEAUX = rgb(0.51, 0.165, 0.267);
const ROSE = rgb(0.945, 0.804, 0.831);
const INK = rgb(0.18, 0.165, 0.17);
const GREY = rgb(0.45, 0.43, 0.43);

const fmt = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(d) : "";

/** Attestato A4 orizzontale. Formula predefinita: partecipazione, senza qualifiche o certificazioni (spec §9). */
export async function renderCertificatePdf(cert: Certificate, issuerName: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${cert.title} ${cert.number}`);
  pdf.setAuthor("LN Stile e Portamento");
  const page = pdf.addPage([842, 595]);
  const { width, height } = page.getSize();
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.984, 0.973, 0.961) });
  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: BORDEAUX, borderWidth: 1.5 });
  page.drawRectangle({ x: 32, y: 32, width: width - 64, height: height - 64, borderColor: ROSE, borderWidth: 0.75 });

  const center = (text: string, y: number, font = serif, size = 14, color = INK, spacing = 0) => {
    const w = font.widthOfTextAtSize(text, size) + spacing * (text.length - 1);
    if (spacing) {
      let x = (width - w) / 2;
      for (const ch of text) {
        page.drawText(ch, { x, y, size, font, color });
        x += font.widthOfTextAtSize(ch, size) + spacing;
      }
    } else page.drawText(text, { x: (width - w) / 2, y, size, font, color });
  };

  center("L N", 500, serifBold, 34, BORDEAUX);
  center("STILE E PORTAMENTO", 478, sans, 9, GREY, 3);
  center(cert.title.toUpperCase(), 410, serifBold, 26, BORDEAUX, 1.5);
  center("Si attesta che", 365, serifItalic, 14, GREY);
  center(cert.studentName, 322, serifBold, 32, INK);
  page.drawLine({ start: { x: 220, y: 312 }, end: { x: width - 220, y: 312 }, color: ROSE, thickness: 1 });
  center("ha partecipato al percorso", 285, serifItalic, 14, GREY);
  center(`“${cert.courseTitle}”`, 255, serifBold, 20, BORDEAUX);

  const period =
    cert.periodFrom && cert.periodTo && fmt(cert.periodFrom) !== fmt(cert.periodTo)
      ? `dal ${fmt(cert.periodFrom)} al ${fmt(cert.periodTo)}`
      : cert.periodFrom ? `in data ${fmt(cert.periodFrom)}` : "";
  const hours = cert.hours ? ` · ${cert.hours.toLocaleString("it-IT", { maximumFractionDigits: 1 })} ${cert.hours === 1 ? "ora" : "ore"} di lezione` : "";
  if (period || hours) center(`${period}${hours}`, 225, serif, 13, INK);

  // Firma e dati
  page.drawText(`Rilasciato il ${fmt(cert.issuedAt)}`, { x: 90, y: 120, size: 11, font: serif, color: INK });
  page.drawText(`Attestato n. ${cert.number}`, { x: 90, y: 102, size: 9, font: sans, color: GREY });
  page.drawLine({ start: { x: width - 290, y: 128 }, end: { x: width - 90, y: 128 }, color: INK, thickness: 0.5 });
  const sig = issuerName;
  page.drawText(sig, { x: width - 190 - serif.widthOfTextAtSize(sig, 11) / 2, y: 110, size: 11, font: serif, color: INK });
  page.drawText("LN Stile e Portamento", { x: width - 190 - sans.widthOfTextAtSize("LN Stile e Portamento", 8) / 2, y: 96, size: 8, font: sans, color: GREY });

  page.drawText("Attestato di partecipazione: non costituisce titolo professionale né certificazione di competenze.", {
    x: 90, y: 56, size: 7.5, font: sans, color: GREY,
  });

  if (cert.revokedAt) {
    page.drawText("ANNULLATO", { x: 230, y: 260, size: 90, font: serifBold, color: rgb(0.8, 0.1, 0.1), opacity: 0.25, rotate: degrees(20) });
  }
  return pdf.save();
}
