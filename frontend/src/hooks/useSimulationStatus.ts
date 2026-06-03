"use client";

import { useEffect, useState } from "react";

/**
 * Polls the backend every 3s to learn whether the background event simulator
 * is currently running. Used by the HeaderControls SIMULAR toggle to show the
 * start/stop variant of the button.
 */
export function useSimulationStatus(): {
  running: boolean;
  refresh: () => Promise<void>;
} {
  const [running, setRunning] = useState(false);

  const refresh = async (): Promise<void> => {
    try {
      const res = await fetch(
        "http://localhost:8000/api/v1/sessions/simulate/status",
      );
      if (!res.ok) return;
      const data = (await res.json()) as { running: boolean };
      setRunning(Boolean(data.running));
    } catch {
      // Silently ignore — keep the last known state if the backend hiccups.
    }
  };

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return { running, refresh };
}
