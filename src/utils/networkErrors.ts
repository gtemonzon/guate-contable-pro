// Helpers to detect and format network/connectivity errors consistently.

export function isNetworkError(error: unknown): boolean {
  if (!error) return false;

  // Browser offline
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }

  const err = error as { message?: unknown; name?: unknown; code?: unknown };
  const message = String(err?.message ?? "").toLowerCase();
  const name = String(err?.name ?? "").toLowerCase();
  const code = String(err?.code ?? "").toLowerCase();

  const patterns = [
    "failed to fetch",
    "networkerror",
    "network error",
    "load failed",
    "fetch failed",
    "err_internet_disconnected",
    "err_network",
    "err_name_not_resolved",
    "err_connection",
    "socket hang up",
    "econnrefused",
    "econnreset",
    "etimedout",
    "enetunreach",
  ];

  if (patterns.some((p) => message.includes(p) || code.includes(p))) {
    return true;
  }

  // TypeError thrown by fetch when network fails
  if (name === "typeerror" && (message.includes("fetch") || message.includes("load"))) {
    return true;
  }

  return false;
}

export function formatNetworkError(error: unknown, fallback?: string): string {
  if (isNetworkError(error)) {
    return "Sin conexión a internet. Intenta de nuevo en unos momentos.";
  }
  if (fallback) return fallback;
  if (error instanceof Error && error.message) return error.message;
  return "Ocurrió un error. Por favor intente nuevamente.";
}
