// Next.js instrumentation hook — starts the watcher once, in the Node runtime (Doc 3 §3).
// Gated off with WATCHER=0 (e.g. for tests that drive ticks manually).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.WATCHER === "0") return;
  const { startWatcher } = await import("@/lib/watcher/loop");
  startWatcher();
}
