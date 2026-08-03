import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_PRESETS,
  normalizeGuidedQuery,
  oppositeScenario,
  previewPrice,
  resolveExpiry,
  selectMandateId,
} from "./guided-demo.ts";

test("guided helpers preserve the demo contract", () => {
  assert.deepEqual(normalizeGuidedQuery({ guided: ["1"], scenario: "protection", mandate: " m-1 " }), {
    guided: true, scenario: "protection", mandateId: "m-1",
  });
  assert.equal(normalizeGuidedQuery({ scenario: "unknown" }).scenario, "success");
  assert.deepEqual(DEMO_PRESETS.success, { triggerCents: 18_000, capCents: 18_000 });
  assert.deepEqual(DEMO_PRESETS.protection, { triggerCents: 18_000, capCents: 17_000 });

  assert.equal(previewPrice(18_000, 18_000, 18_000, 1).outcome, "watching");
  assert.equal(previewPrice(17_400, 18_000, 18_000, 1).outcome, "eligible");
  assert.equal(previewPrice(17_400, 18_000, 17_000, 1).outcome, "protected");
  assert.deepEqual(previewPrice(8_000, 18_000, 17_000, 2), {
    totalCents: 16_000, triggerMet: true, outcome: "eligible",
  });

  const now = new Date("2026-08-03T10:00:00.000Z");
  const max = now.getTime() + 7 * 86_400_000;
  assert.equal(Date.parse(resolveExpiry("date", "2099-12-31", now)), max);
  assert.ok(Date.parse(resolveExpiry("today", "", now)) > now.getTime());

  const rows = [
    { mandate: { id: "completed", status: "fulfilled", created_at: "2026-08-03T12:00:00Z" } },
    { mandate: { id: "older-active", status: "armed", created_at: "2026-08-01T12:00:00Z" } },
    { mandate: { id: "new-active", status: "executing", created_at: "2026-08-02T12:00:00Z" } },
  ];
  assert.equal(selectMandateId(rows), "new-active");
  assert.equal(selectMandateId(rows, "completed"), "completed");
  assert.equal(selectMandateId([{ mandate: { id: "done", status: "failed", created_at: "2026-08-01T12:00:00Z" } }]), "done");
  assert.equal(selectMandateId([{ mandate: { id: "draft", status: "draft" } }]), null);
  assert.equal(oppositeScenario("fulfilled"), "protection");
  assert.equal(oppositeScenario("failed"), "success");
});
