"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Building2, MoreVertical } from "lucide-react";
import { useNavigationStore } from "@/stores/navigationStore";
import { ALL_FLOOR_ID, LOBBY_FLOOR_ID } from "@/types/navigation";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Compact dropdown showing the current building location.
 * Click to open a menu with all floors + Lobby + "All sessions".
 * The menu uses fixed positioning so it escapes any overflow:hidden ancestor.
 */
export function Breadcrumb(): React.ReactNode {
  const view = useNavigationStore((s) => s.view);
  const floorId = useNavigationStore((s) => s.floorId);
  const buildingConfig = useNavigationStore((s) => s.buildingConfig);
  const goToBuilding = useNavigationStore((s) => s.goToBuilding);
  const goToFloor = useNavigationStore((s) => s.goToFloor);
  const setTransitionOrigin = useNavigationStore((s) => s.setTransitionOrigin);
  const { t } = useTranslation();

  const [open, setOpen] = useState(false);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handleResize() {
      if (triggerRef.current) {
        setTriggerRect(triggerRef.current.getBoundingClientRect());
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [open]);

  if (view === "single") return null;

  const buildingName = buildingConfig?.buildingName ?? t("navigation.building");
  const isLobby = floorId === LOBBY_FLOOR_ID;
  const isAll = floorId === ALL_FLOOR_ID;
  const currentFloor = isLobby || isAll
    ? null
    : buildingConfig?.floors.find((f) => f.id === floorId);

  // Build the label shown on the trigger button
  let triggerIcon: string | React.ReactNode = <Building2 size={14} />;
  let triggerLabel = buildingName;
  if (view === "floor") {
    if (isAll) {
      triggerIcon = "\u{1F310}";
      triggerLabel = "Todas";
    } else if (isLobby) {
      triggerIcon = "\u{1F6AA}";
      triggerLabel = "Lobby";
    } else if (currentFloor) {
      triggerIcon = currentFloor.icon;
      triggerLabel = currentFloor.name;
    }
  }

  function toggle() {
    if (!open && triggerRef.current) {
      setTriggerRect(triggerRef.current.getBoundingClientRect());
    }
    setOpen((o) => !o);
  }

  function handleSelect(action: () => void, e: React.MouseEvent) {
    setTransitionOrigin({ x: e.clientX, y: e.clientY });
    setOpen(false);
    action();
  }

  const sortedFloors = [...(buildingConfig?.floors ?? [])].sort(
    (a, b) => b.floorNumber - a.floorNumber,
  );

  return (
    <>
      <button
        ref={triggerRef}
        onClick={toggle}
        data-tour-id="breadcrumb-building"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-sm font-mono text-jp-fg-muted hover:text-white hover:bg-jp-surface-2/60 transition-colors whitespace-nowrap"
      >
        {/* Compact form (below xl) — just 3 vertical dots */}
        <MoreVertical size={16} className="min-[1700px]:hidden" />

        {/* Full form (xl+) — icon + label + chevron */}
        <span className="hidden min-[1700px]:flex items-center gap-1.5">
          <span className="flex items-center justify-center w-4">
            {triggerIcon}
          </span>
          <span>{triggerLabel}</span>
          <ChevronDown
            size={12}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open && triggerRect && (
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: "fixed",
            top: triggerRect.bottom + 4,
            left: triggerRect.left,
          }}
          className="min-w-[220px] bg-jp-surface-1 border border-jp-border-light/40 rounded shadow-lg py-1 z-50"
        >
          {/* Building overview */}
          <button
            role="menuitem"
            onClick={(e) => handleSelect(goToBuilding, e)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold hover:bg-jp-surface-2 transition-colors whitespace-nowrap ${
              view === "building" ? "text-jp-gold" : "text-jp-fg-muted"
            }`}
          >
            <Building2 size={14} />
            <span>{buildingName}</span>
            <span className="ml-auto text-[10px] font-mono text-jp-fg-dim">
              Visão Geral
            </span>
          </button>

          {sortedFloors.length > 0 && (
            <div className="my-1 border-t border-jp-border-light/30" />
          )}

          {/* Floors */}
          {sortedFloors.map((floor) => {
            const isActive = view === "floor" && floorId === floor.id;
            return (
              <button
                key={floor.id}
                role="menuitem"
                onClick={(e) => handleSelect(() => goToFloor(floor.id), e)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold hover:bg-jp-surface-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "text-white bg-jp-surface-2/60"
                    : "text-jp-fg-muted"
                }`}
              >
                <span className="flex items-center justify-center w-4">
                  {floor.icon}
                </span>
                <span>{floor.name}</span>
                <span className="ml-auto text-[10px] font-mono text-jp-fg-dim">
                  {floor.floorNumber}
                </span>
              </button>
            );
          })}

          <div className="my-1 border-t border-jp-border-light/30" />

          {/* All sessions */}
          <button
            role="menuitem"
            onClick={(e) => handleSelect(() => goToFloor(ALL_FLOOR_ID), e)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold hover:bg-jp-surface-2 transition-colors whitespace-nowrap ${
              isAll ? "text-white bg-jp-surface-2/60" : "text-jp-gold"
            }`}
          >
            <span className="flex items-center justify-center w-4">
              {"\u{1F310}"}
            </span>
            <span>Todas as Sessões</span>
            <span className="ml-auto text-[10px] font-mono text-jp-fg-dim">
              tudo
            </span>
          </button>

          {/* Lobby */}
          <button
            role="menuitem"
            onClick={(e) => handleSelect(() => goToFloor(LOBBY_FLOOR_ID), e)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold hover:bg-jp-surface-2 transition-colors whitespace-nowrap ${
              isLobby ? "text-white bg-jp-surface-2/60" : "text-jp-fg-muted"
            }`}
          >
            <span className="flex items-center justify-center w-4">
              {"\u{1F6AA}"}
            </span>
            <span>Lobby</span>
            <span className="ml-auto text-[10px] font-mono text-jp-fg-dim">
              órfãs
            </span>
          </button>
        </div>
      )}
    </>
  );
}
