/**
 * Elevator Component
 *
 * Renders the elevator with animated doors, indicator light, and agents inside.
 * The elevator has three layers:
 * 1. Frame (background)
 * 2. Agents inside (middle)
 * 3. Doors and indicator (foreground)
 */

import { type ReactNode, useState, useEffect, useRef } from "react";
import { Texture } from "pixi.js";
import { ELEVATOR_POSITION } from "@/systems/queuePositions";
import { AgentSprite } from "./AgentSprite";
import type { AgentAnimationState } from "@/stores/gameStore";

interface ElevatorProps {
  /** Whether the elevator doors are open */
  isOpen: boolean;
  /** Map of all agents to filter those inside elevator */
  agents: Map<string, AgentAnimationState>;
  /** Elevator frame texture */
  frameTexture: Texture | null;
  /** Elevator door texture */
  doorTexture: Texture | null;
  /** Headset texture for agents */
  headsetTexture: Texture | null;
  /** Sunglasses texture for agents */
  sunglassesTexture: Texture | null;
  /** Idle textura do cobre (sessão Claude). Usada pra agentes no elevador
   *  que NÃO são subagentes. Pedro 2026-06-09: sem isso o AgentSprite
   *  caía no fallback drawChibi e gerava sprite estilo Super Mario. */
  cobreIdleTexture: Texture | null;
  /** Idle textura do prata (subagente). Usada pra agentes no elevador
   *  com `characterType === "subagent"`. */
  prataIdleTexture: Texture | null;
  /** Quando definido, clicar no elevador (frame ou portas) dispara este
   *  callback. Usado pra abrir o ElevatorModal com a lista de andares. */
  onTap?: () => void;
}

/**
 * Check if an agent is inside the elevator bounds
 */
function isInsideElevator(
  agentX: number,
  agentY: number,
  elevatorX: number,
  elevatorY: number,
): boolean {
  const dx = Math.abs(agentX - elevatorX);
  const dy = Math.abs(agentY - elevatorY);
  return dx < 50 && dy < 80;
}

/**
 * Hook for animated door scale
 */
function useDoorAnimation(isOpen: boolean): number {
  const [doorScale, setDoorScale] = useState(0.09);
  const doorScaleRef = useRef(0.09);

  useEffect(() => {
    const targetScale = isOpen ? 0 : 0.09;
    const duration = 500; // 0.5 seconds
    const startScale = doorScaleRef.current;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const newScale = startScale + (targetScale - startScale) * eased;

      doorScaleRef.current = newScale;
      setDoorScale(newScale);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [isOpen]);

  return doorScale;
}

export function Elevator({
  isOpen,
  agents,
  frameTexture,
  doorTexture,
  headsetTexture,
  sunglassesTexture,
  cobreIdleTexture,
  prataIdleTexture,
  onTap,
}: ElevatorProps): ReactNode {
  const doorScale = useDoorAnimation(isOpen);

  // Agentes dentro da zona do elevador. Renderizados em IDLE com a textura
  // correta (cobre/prata) — Pedro 2026-06-09: antes ficavam sem textura
  // e caíam no fallback drawChibi (sprite "Super Mario").
  const agentsInside = Array.from(agents.values()).filter((agent) =>
    isInsideElevator(
      agent.currentPosition.x,
      agent.currentPosition.y,
      ELEVATOR_POSITION.x,
      ELEVATOR_POSITION.y,
    ),
  );

  return (
    <>
      {/* Elevator frame (background). Clicar dispara onTap → abre o
          ElevatorModal com a lista de andares. */}
      {frameTexture && (
        <pixiContainer
          x={ELEVATOR_POSITION.x}
          y={ELEVATOR_POSITION.y}
          eventMode={onTap ? "static" : "auto"}
          cursor={onTap ? "pointer" : undefined}
          onPointerTap={onTap}
        >
          <pixiSprite texture={frameTexture} anchor={0.5} scale={0.26} />
        </pixiContainer>
      )}

      {/* Agentes dentro do elevador (atrás das portas).
          Render só com idle — sem cycle de walking porque eles ficam
          parados esperando. Cobre por padrão, prata se for subagente.
          Mesmo size/foot offset que o loop principal de OfficeGame
          (240/60) pra ficar consistente quando entra/sai. */}
      {agentsInside.map((agent) => {
        const isSubagent = agent.characterType === "subagent";
        const idle = isSubagent ? prataIdleTexture : cobreIdleTexture;
        return (
          <AgentSprite
            key={agent.id}
            id={agent.id}
            name={agent.name}
            color={agent.color}
            number={agent.number}
            position={agent.currentPosition}
            phase={agent.phase}
            bubble={agent.bubble.content}
            headsetTexture={headsetTexture}
            sunglassesTexture={sunglassesTexture}
            characterTexture={idle}
            characterStepLeftTexture={idle}
            characterStepRightTexture={idle}
            characterSideIdleTexture={idle}
            characterSideStep1Texture={idle}
            characterSideStep2Texture={idle}
            characterBackIdleTexture={idle}
            characterBackStep1Texture={idle}
            characterBackStep2Texture={idle}
            characterRenderSize={idle ? 240 : 128}
            characterFeetOffsetY={idle ? 60 : 0}
            renderBubble={false}
            renderLabel={false}
            isTyping={false}
          />
        );
      })}

      {/* Elevator doors and indicator (in front of agents inside) */}
      {doorTexture && (
        <pixiContainer x={ELEVATOR_POSITION.x} y={ELEVATOR_POSITION.y}>
          {/* Left door - shrinks into left wall when open */}
          <pixiSprite
            texture={doorTexture}
            anchor={{ x: 0, y: 0.5 }}
            x={-50}
            y={9}
            scale={{ x: doorScale, y: 0.183 }}
          />
          {/* Right door - shrinks into right wall when open */}
          <pixiSprite
            texture={doorTexture}
            anchor={{ x: 1, y: 0.5 }}
            x={50}
            y={9}
            scale={{ x: doorScale, y: 0.183 }}
          />
          {/* Indicator light - square overlay on frame light */}
          <pixiGraphics
            draw={(g) => {
              g.clear();
              g.rect(-5, -67, 10, 8);
              g.fill(isOpen ? 0x48bb78 : 0xef4444);
            }}
          />
        </pixiContainer>
      )}
    </>
  );
}

/**
 * Check if an agent is inside the elevator (for external use)
 */
export function isAgentInElevator(agentX: number, agentY: number): boolean {
  return isInsideElevator(
    agentX,
    agentY,
    ELEVATOR_POSITION.x,
    ELEVATOR_POSITION.y,
  );
}
