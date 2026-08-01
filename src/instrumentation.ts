// Next.js instrumentation hook — starts the watcher once, in the Node runtime (Doc 3 §3).
// Gated off with WATCHER=0 (e.g. for tests that drive ticks manually).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // recovery runs before the watcher, so no new trigger races an in-flight resume (Doc 3 §4)
  try {
    const { recoverInFlight } = await import("@/lib/executor/recovery");
    await recoverInFlight();
  } catch {
    /* recovery errors are audited per-row; don't block boot */
  }
  if (process.env.WATCHER === "0") return;
  const { startWatcher } = await import("@/lib/watcher/loop");
  startWatcher();
}
