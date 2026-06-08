"use client";

import { type ReactNode } from "react";
import Modal from "@/components/overlay/Modal";
import { useRadioModalStore } from "@/stores/radioModalStore";
import { AmbientRadioControls } from "@/components/radio/AmbientRadioControls";

/**
 * RadioModal — abre quando o usuário clica no sprite do rádio de parede.
 *
 * Renderiza o `AmbientRadioControls` (mesma UI do painel lateral). O state
 * é compartilhado via `radioStore`, e o iframe único do
 * `AmbientRadioPlayer` (singleton) é movido pra dentro deste slot enquanto
 * o modal está aberto (prioridade `modal` > `sidebar`). Ao fechar, o
 * iframe volta sozinho pro slot do sidebar.
 */
export default function RadioModal(): ReactNode {
  const isOpen = useRadioModalStore((s) => s.isOpen);
  const close = useRadioModalStore((s) => s.close);

  if (!isOpen) {
    return <Modal isOpen={false} onClose={close} title="Rádio" size="md">
      <div />
    </Modal>;
  }

  return (
    <Modal isOpen={isOpen} onClose={close} title="Rádio" size="md">
      <AmbientRadioControls slotKind="modal" />
    </Modal>
  );
}
