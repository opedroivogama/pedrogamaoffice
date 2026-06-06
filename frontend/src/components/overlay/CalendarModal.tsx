"use client";

import { type ReactNode } from "react";
import Modal from "@/components/overlay/Modal";
import { useCalendarModalStore } from "@/stores/calendarModalStore";

/**
 * CalendarModal — abre quando o WallCalendar é clicado. Embarca o Google
 * Calendar do Pedro via iframe oficial. Funciona desde que ele esteja logado
 * no Google no mesmo browser (caso contrário só veria eventos públicos).
 *
 * Quando rolar bridge OAuth + API real, a gente troca o iframe por uma view
 * nativa Jurídico Pro. Por ora isso é o caminho mais curto pra ter agenda
 * funcionando no painel.
 */

const CALENDAR_EMAIL = "pedro@juridicopro.com";

// Time zone fixo em America/Sao_Paulo — o Pedro mora aqui e a API do Google
// não auto-detecta dentro de iframe.
const EMBED_URL =
  `https://calendar.google.com/calendar/embed` +
  `?src=${encodeURIComponent(CALENDAR_EMAIL)}` +
  `&ctz=${encodeURIComponent("America/Sao_Paulo")}` +
  `&mode=WEEK` +
  `&showTitle=0` +
  `&showPrint=0` +
  `&showTabs=1` +
  `&showCalendars=0` +
  `&showTz=0` +
  `&bgcolor=%23111111`;

export default function CalendarModal(): ReactNode {
  const isOpen = useCalendarModalStore((s) => s.isOpen);
  const close = useCalendarModalStore((s) => s.close);

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Agenda"
      size="lg"
      maximizable
      defaultMaximized
    >
      <div className="w-full h-full min-h-[60vh]">
        <iframe
          src={EMBED_URL}
          title="Google Calendar"
          className="w-full h-full min-h-[60vh] rounded-md border-0 bg-jp-surface-1"
        />
      </div>
    </Modal>
  );
}
