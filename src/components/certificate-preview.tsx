/** Anteprima HTML dell'attestato, coerente con il PDF generato da src/lib/certificate-pdf.ts. */
export function CertificatePreview({ name, course, period, hours, number, issuer, date }: {
  name: string; course: string; period?: string; hours?: number | null; number: string; issuer: string; date: string;
}) {
  return (
    <div className="rounded-[10px] bg-[#f3ede9] p-4 sm:p-6">
      <div className="aspect-[1.414] w-full border border-[#8f3752] bg-[#fffdfa] p-2 text-[#4b3d40] shadow-[0_8px_26px_#3c252217] sm:p-2.5">
        <div className="flex h-full flex-col items-center justify-between border border-[#e4cfc7] px-3 py-3 text-center sm:px-6 sm:py-5">
          <div>
            <div className="font-serif text-2xl leading-none text-wine sm:text-[39px]">LN</div>
            <div className="mt-1 text-[6px] tracking-[0.4em] text-[#877d73] sm:text-[8px]">STILE E PORTAMENTO</div>
          </div>
          <div className="font-serif text-sm tracking-[0.12em] text-wine sm:text-[26px]">ATTESTATO DI PARTECIPAZIONE</div>
          <div className="w-full">
            <p className="font-serif text-[9px] italic text-[#867a74] sm:text-[13px]">Si attesta che</p>
            <div className="mx-auto min-w-[62%] max-w-[80%] border-b border-[#e9cfd1] pb-1 font-serif text-lg sm:text-[34px]">{name}</div>
            <p className="mt-1 font-serif text-[9px] italic text-[#867a74] sm:text-[13px]">ha partecipato al percorso</p>
            <div className="font-serif text-sm text-wine sm:text-[21px]">« {course} »</div>
            {(period || hours) && <div className="mt-1 text-[8px] sm:text-[11px]">{[period, hours ? `${hours.toLocaleString("it-IT")} ${hours === 1 ? "ora" : "ore"} di lezione` : null].filter(Boolean).join(" · ")}</div>}
          </div>
          <div className="flex w-[92%] items-end justify-between text-left text-[7px] sm:text-[10px]">
            <div>Attestato n. {number}<br />Data: {date}</div>
            <div className="w-24 border-t border-[#958787] pt-1 text-center sm:w-32">{issuer}<br /><span className="text-[#aa9e9b]">Stile e Portamento</span></div>
          </div>
          <div className="text-[6px] text-[#aa9e9b] sm:text-[8px]">Attestato di partecipazione. Non costituisce titolo professionale né certificazione di competenze.</div>
        </div>
      </div>
    </div>
  );
}
