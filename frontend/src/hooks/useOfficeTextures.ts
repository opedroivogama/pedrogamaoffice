/**
 * Hook for loading all office sprite textures.
 *
 * Centralizes texture loading logic and provides a clean interface
 * for accessing loaded textures throughout the office game.
 */

import { useState, useEffect } from "react";
import { Assets, Texture } from "pixi.js";

export interface OfficeTextures {
  // Floor
  floorTile: Texture | null;
  bossRug: Texture | null;
  wall: Texture | null;

  // Furniture
  waterCooler: Texture | null;
  coffeeMachine: Texture | null;
  plant: Texture | null;
  chair: Texture | null;
  /** Variante vermelha (borgonha) da cadeira, usada só na mesa do Claudius. */
  chairRed: Texture | null;
  desk: Texture | null;
  /** Mesinha de canto usada como base pro rádio e pro printer. Sprite
   *  separado do `desk` pra permitir arte diferente sem afetar as desks
   *  de trabalho. */
  cornerTable: Texture | null;
  /** Caneca azul decorativa nas mesas de trabalho. */
  blueMug: Texture | null;
  /** Caneca preta decorativa nas mesas de trabalho (variante da blueMug
   *  com cores reconvertidas pra preserver luminância). */
  blackMug: Texture | null;
  keyboard: Texture | null;
  monitor: Texture | null;
  phone: Texture | null;
  printer: Texture | null;
  /** Impressora + mesinha integradas num único sprite (printer-station.png).
   *  Quando disponível, substitui o desenho separado de corner table + printer. */
  printerStation: Texture | null;
  radio: Texture | null;
  /** Lixeira de tela metálica usada como indicador de context utilization
   *  (papéis crumplados são desenhados por cima via Graphics). */
  trashCan: Texture | null;

  // Elevator
  elevatorFrame: Texture | null;
  elevatorDoor: Texture | null;

  // Wall items
  wallOutlet: Texture | null;
  whiteboard: Texture | null;
  /** Moldura+grades da janela. Overlay sobre o céu procedural. */
  windowFrame: Texture | null;
  /** Moldura do whiteboard (pixel art com tray de marcadores + magnets).
   *  Substitui a moldura procedural sem mexer no clique/modos. */
  whiteboardFrame: Texture | null;
  /** Moldura do WallCalendar (placa superior MÊS/ANO, painel preto pro DIA,
   *  placa inferior AGENDA). Texto continua sendo desenhado por código. */
  wallCalendarFrame: Texture | null;

  // Agent accessories
  headset: Texture | null;
  sunglasses: Texture | null;

  // Desk accessories
  coffeeMug: Texture | null;
  stapler: Texture | null;
  deskLamp: Texture | null;
  penHolder: Texture | null;
  magic8Ball: Texture | null;
  rubiksCube: Texture | null;
  rubberDuck: Texture | null;
  thermos: Texture | null;
}

interface UseOfficeTexturesResult {
  textures: OfficeTextures;
  loaded: boolean;
}

const TEXTURE_PATHS: Record<keyof OfficeTextures, string> = {
  floorTile: "/sprites/floor-carpet.png?v=17",
  bossRug: "/sprites/boss-rug.png",
  wall: "/sprites/wall.png?v=5",
  waterCooler: "/sprites/watercooler.png?v=5",
  coffeeMachine: "/sprites/coffee-machine.png?v=3",
  plant: "/sprites/plant.png?v=2",
  chair: "/sprites/chair.png?v=2",
  chairRed: "/sprites/chair-red.png?v=3",
  desk: "/sprites/desk.png",
  cornerTable: "/sprites/corner-table.png?v=3",
  blueMug: "/sprites/blue-mug.png?v=2",
  blackMug: "/sprites/black-mug.png?v=1",
  keyboard: "/sprites/keyboard_back.png",
  monitor: "/sprites/monitor_back.png",
  phone: "/sprites/phone.png",
  printer: "/sprites/old-printer.png",
  printerStation: "/sprites/printer-station.png?v=1",
  radio: "/sprites/radio.png?v=7",
  trashCan: "/sprites/trash-can.png?v=1",
  elevatorFrame: "/sprites/elevator_frame.png",
  elevatorDoor: "/sprites/elevator_door.png",
  wallOutlet: "/sprites/wall-outlet.png?v=2",
  whiteboard: "/sprites/whiteboard.png?v=1",
  windowFrame: "/sprites/window-frame.png?v=3",
  whiteboardFrame: "/sprites/whiteboard-frame.png?v=1",
  wallCalendarFrame: "/sprites/wall-calendar-frame.png?v=1",
  headset: "/sprites/headset_small.png",
  sunglasses: "/sprites/sunglasses.png",
  coffeeMug: "/sprites/coffee-mug.png",
  stapler: "/sprites/stapler.png",
  deskLamp: "/sprites/desk-lamp.png",
  penHolder: "/sprites/pen-holder.png",
  magic8Ball: "/sprites/magic-8-ball.png",
  rubiksCube: "/sprites/rubiks-cube.png",
  rubberDuck: "/sprites/rubber-duck.png",
  thermos: "/sprites/thermos.png",
};

const EMPTY_TEXTURES: OfficeTextures = {
  floorTile: null,
  bossRug: null,
  wall: null,
  waterCooler: null,
  coffeeMachine: null,
  plant: null,
  chair: null,
  chairRed: null,
  desk: null,
  cornerTable: null,
  blueMug: null,
  blackMug: null,
  keyboard: null,
  monitor: null,
  phone: null,
  printer: null,
  printerStation: null,
  radio: null,
  trashCan: null,
  elevatorFrame: null,
  elevatorDoor: null,
  wallOutlet: null,
  whiteboard: null,
  windowFrame: null,
  whiteboardFrame: null,
  wallCalendarFrame: null,
  headset: null,
  sunglasses: null,
  coffeeMug: null,
  stapler: null,
  deskLamp: null,
  penHolder: null,
  magic8Ball: null,
  rubiksCube: null,
  rubberDuck: null,
  thermos: null,
};

/**
 * Hook to load all office sprite textures.
 * Returns textures object and loaded state.
 */
export function useOfficeTextures(): UseOfficeTexturesResult {
  const [textures, setTextures] = useState<OfficeTextures>(EMPTY_TEXTURES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loadTextures = async () => {
      try {
        const keys = Object.keys(TEXTURE_PATHS) as (keyof OfficeTextures)[];
        const paths = keys.map((key) => TEXTURE_PATHS[key]);

        const loadedTextures = await Promise.all(
          paths.map((path) => Assets.load(path)),
        );

        // Rádio é arte renderizada (não pixel art). Source pré-resized
        // pra 256x177 com Lanczos (era 1354x934, Pedro 2026-06-06 — render
        // alvo ~118px ficava com a grade do alto-falante toda aliased).
        // Linear mantém o antialiasing suave no downscale residual ~2×.
        const textureMap = keys.reduce(
          (acc, key, index) => {
            const tex = loadedTextures[index];
            if ((key === "radio" || key === "cornerTable" || key === "windowFrame" || key === "whiteboardFrame" || key === "printerStation" || key === "wallCalendarFrame") && tex?.source) {
              tex.source.scaleMode = "linear";
            }
            // Canecas são pixel art com pixels grandes — nearest preserva
            // o look chunky.
            if ((key === "blueMug" || key === "blackMug") && tex?.source) {
              tex.source.scaleMode = "nearest";
            }
            // Lixeira é pixel art chunky — nearest preserva os fios da grade.
            if (key === "trashCan" && tex?.source) {
              tex.source.scaleMode = "nearest";
            }
            acc[key] = tex;
            return acc;
          },
          {} as Record<keyof OfficeTextures, Texture>,
        );

        setTextures(textureMap as OfficeTextures);
        setLoaded(true);
      } catch {
        // Still mark as loaded to show fallback graphics
        setLoaded(true);
      }
    };

    loadTextures();
  }, []);

  return { textures, loaded };
}
