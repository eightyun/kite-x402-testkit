import type { SimulationReport } from "./simulation.js";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function formatJUnit(report: SimulationReport): string {
  const failures = report.scenarios.filter(
    (scenario) => scenario.status === "failed",
  ).length;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="kite-x402.simulation" tests="${report.scenarios.length}" failures="${failures}" errors="0" skipped="0">`,
  ];
  for (const scenario of report.scenarios) {
    const opening = `  <testcase classname="kite-x402.simulation" name="${escapeXml(scenario.id)}"`;
    if (scenario.status === "passed") {
      lines.push(`${opening}/>`);
    } else {
      const detail = [
        `Expected HTTP ${scenario.expectedHttpStatus}, observed ${scenario.httpStatus ?? "unavailable"}.`,
        `Expected calls: ${scenario.expectedCalls.join(" → ")}.`,
        `Observed calls: ${scenario.calls.join(" → ") || "none"}.`,
      ].join(" ");
      lines.push(
        `${opening}>`,
        `    <failure message="${escapeXml(scenario.reasonCode)}">${escapeXml(detail)}</failure>`,
        "  </testcase>",
      );
    }
  }
  lines.push("</testsuite>");
  return lines.join("\n");
}
