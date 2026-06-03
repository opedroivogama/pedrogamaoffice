/**
 * Dispara o endpoint POST /api/v1/launcher/restart-backend.
 *
 * O backend responde 200 e em ~1s chama os._exit(0); um script auxiliar
 * desacoplado sobe um novo uvicorn ~3s depois. Total ~5s de downtime.
 *
 * "Failed to fetch" / NetworkError são tratados como sucesso — esperados
 * quando o backend morre exatamente durante a resposta.
 */
export async function restartBackend(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const res = await fetch(
      "http://localhost:8000/api/v1/launcher/restart-backend",
      { method: "POST" },
    );
    if (res.ok || res.status === 0) return { ok: true };
    const body = (await res.json().catch(() => null)) as
      | { detail?: string }
      | null;
    return { ok: false, error: body?.detail ?? res.statusText };
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      return { ok: true };
    }
    return { ok: false, error: msg };
  }
}
