/**
 * ZoomControls Component
 *
 * Provides zoom in / zoom out for the game canvas.
 * The canvas itself is locked (no panning); only scale changes.
 */

import { type ReactNode } from "react";
import { useControls } from "react-zoom-pan-pinch";
import { useTranslation } from "@/hooks/useTranslation";

interface ZoomControlsProps {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFit?: () => void;
}

export function ZoomControls({
  onZoomIn,
  onZoomOut,
  onFit,
}: ZoomControlsProps = {}): ReactNode {
  const { zoomIn, zoomOut } = useControls();
  const { t } = useTranslation();

  const handleZoomIn = onZoomIn ?? (() => zoomIn());
  const handleZoomOut = onZoomOut ?? (() => zoomOut());

  const buttonClass =
    "w-9 h-9 bg-jp-surface-2/90 hover:bg-jp-surface-3 text-jp-fg rounded-md flex items-center justify-center text-lg font-semibold border border-jp-divider shadow-lg active:scale-95 transition-transform";

  return (
    <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-10">
      <button
        onClick={handleZoomIn}
        className={buttonClass}
        aria-label={t("zoom.in")}
        title={t("zoom.in")}
      >
        +
      </button>
      <button
        onClick={handleZoomOut}
        className={buttonClass}
        aria-label={t("zoom.out")}
        title={t("zoom.out")}
      >
        −
      </button>
      {onFit && (
        <button
          onClick={onFit}
          className={`${buttonClass} text-[11px]`}
          aria-label={t("zoom.fit")}
          title={t("zoom.fit")}
        >
          1:1
        </button>
      )}
    </div>
  );
}
