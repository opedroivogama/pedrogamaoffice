"use client";

import { type ReactNode } from "react";
import Modal from "@/components/overlay/Modal";
import { useElevatorModalStore } from "@/stores/elevatorModalStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { ALL_FLOOR_ID, LOBBY_FLOOR_ID } from "@/types/navigation";

/**
 * ElevatorModal — lista de andares disponíveis quando o usuário clica no
 * elevador. Renderiza o andar atual destacado em dourado JP. Clicar num
 * item navega via `goToFloor` e fecha o modal.
 *
 * Inclui também o item virtual "Todos os andares" (ALL_FLOOR_ID), que
 * agrega sessões de todas as áreas — útil pra Pedro ter visão geral.
 */
export default function ElevatorModal(): ReactNode {
  const isOpen = useElevatorModalStore((s) => s.isOpen);
  const close = useElevatorModalStore((s) => s.close);
  const buildingConfig = useNavigationStore((s) => s.buildingConfig);
  const floorId = useNavigationStore((s) => s.floorId);
  const goToFloor = useNavigationStore((s) => s.goToFloor);

  const floors = buildingConfig?.floors ?? [];

  const handlePick = (id: string) => {
    goToFloor(id);
    close();
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Selecionar andar" size="sm">
      <div className="flex flex-col gap-2 py-2">
        <FloorRow
          icon="🌐"
          name="Todos os andares"
          accent="#B8972A"
          active={floorId === ALL_FLOOR_ID}
          onClick={() => handlePick(ALL_FLOOR_ID)}
        />
        {floors.length > 0 &&
          floors.map((f) => (
            <FloorRow
              key={f.id}
              icon={f.icon}
              name={f.name}
              accent={f.accent}
              floorNumber={f.floorNumber}
              active={floorId === f.id}
              onClick={() => handlePick(f.id)}
            />
          ))}
        <FloorRow
          icon="🚪"
          name="Lobby"
          accent="#8b7355"
          subtitle="Sessões órfãs"
          active={floorId === LOBBY_FLOOR_ID}
          onClick={() => handlePick(LOBBY_FLOOR_ID)}
        />
        {floors.length === 0 && (
          <div className="px-3 py-3 text-xs text-jp-text-secondary text-center">
            Pra criar andares próprios, vá em Settings → Building.
          </div>
        )}
      </div>
    </Modal>
  );
}

interface FloorRowProps {
  icon: string;
  name: string;
  accent: string;
  floorNumber?: number;
  subtitle?: string;
  active: boolean;
  onClick: () => void;
}

function FloorRow({
  icon,
  name,
  accent,
  floorNumber,
  subtitle,
  active,
  onClick,
}: FloorRowProps): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors ${
        active
          ? "bg-jp-gold/15 border border-jp-gold/40"
          : "bg-jp-surface-1 hover:bg-jp-surface-2 border border-transparent"
      }`}
    >
      <span
        className="flex items-center justify-center w-9 h-9 rounded text-xl"
        style={{ background: `${accent}22`, color: accent }}
      >
        {icon}
      </span>
      <div className="flex-1">
        <div className="text-sm font-semibold text-jp-text-primary">{name}</div>
        {typeof floorNumber === "number" && (
          <div className="text-xs text-jp-text-secondary">
            Andar {floorNumber}
          </div>
        )}
        {subtitle && !floorNumber && (
          <div className="text-xs text-jp-text-secondary">{subtitle}</div>
        )}
      </div>
      {active && (
        <span className="text-xs font-mono text-jp-gold">atual</span>
      )}
    </button>
  );
}
