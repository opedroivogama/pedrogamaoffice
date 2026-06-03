/**
 * ZoomControls Component
 *
 * Provides zoom in / zoom out for the game canvas.
 * The canvas itself is locked (no panning); only scale changes.
 */

import { type ReactNode } from "react";
import { useControls } from "react-zoom-pan-pinch";
import { useTranslation } from "@/hooks/useTranslation";

export function ZoomControls(): ReactNode {
  const { zoomIn, zoomOut } = useControls();
  const { t } = useTranslation();

  const buttonClass =
    "w-9 h-9 bg-jp-surface-2/90 hover:bg-jp-surface-3 text-jp-fg rounded-md flex items-center justify-center text-lg font-semibold border border-jp-divider shadow-lg active:scale-95 transition-transform";

  return (
    <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-10">
      <button
        onClick={() => zoomIn()}
        className={buttonClass}
        aria-label={t("zoom.in")}
        title={t("zoom.in")}
      >
        +
      </button>
      <button
        onClick={() => zoomOut()}
        className={buttonClass}
        aria-label={t("zoom.out")}
        title={t("zoom.out")}
      >
        −
      </button>
    </div>
  );
}
