"use client";

import { type ReactNode } from "react";
import Modal from "@/components/overlay/Modal";
import { useRadioModalStore } from "@/stores/radioModalStore";
import { AmbientRadio } from "@/components/radio/AmbientRadio";

/**
 * RadioModal — abre quando o usuário clica no sprite do rádio de parede.
 * Reusa o componente AmbientRadio dentro do Modal centralizado. O state do
 * playback (volume, fila, tocando/pausado) vive em `radioStore`, então o
 * controle aqui mantém sincronia com o panel da sidebar.
 *
 * Nota: o AmbientRadio cria um iframe do YouTube quando montado. Se o panel
 * lateral também estiver montado, haverá dois iframes — ambos compartilham
 * o radioStore mas tocam independentemente. Se virar problema, isolar
 * para uma instância única via portal.
 */
export default function RadioModal(): ReactNode {
  const isOpen = useRadioModalStore((s) => s.isOpen);
  const close = useRadioModalStore((s) => s.close);

  return (
    <Modal isOpen={isOpen} onClose={close} title="Rádio" size="md">
      <div className="w-full">
        <AmbientRadio />
      </div>
    </Modal>
  );
}
