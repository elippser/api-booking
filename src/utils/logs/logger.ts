/**
 * Sin Winston ni escritura a disco: en Vercel no se puede crear `logs/`
 * (ENOENT en mkdir). Los logs van a la consola del runtime.
 */

function emit(
  level: "log" | "warn" | "error",
  message: string,
  extra?: unknown
): void {
  if (extra instanceof Error) {
    console[level](message, extra.message, extra.stack);
    return;
  }
  if (extra !== undefined && extra !== null) {
    console[level](message, extra);
    return;
  }
  console[level](message);
}

export const logger = {
  info: (message: string, extra?: unknown) => emit("log", message, extra),
  warn: (message: string, extra?: unknown) => emit("warn", message, extra),
  error: (message: string, extra?: unknown) => emit("error", message, extra),
};
