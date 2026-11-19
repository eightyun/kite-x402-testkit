export interface ReportCheck {
  id: string;
  status: "passed" | "failed";
  reasonCode?: string;
  expected?: string;
  actual?: string;
}

export interface KiteOfferSummary {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  domainName: string;
  domainVersion: string;
}

export interface CheckReport {
  schemaVersion: 1;
  status: "passed" | "failed";
  reasonCode: string;
  target?: {
    origin: string;
    pathname: string;
  };
  httpStatus?: number;
  checks: ReportCheck[];
  offers: KiteOfferSummary[];
}

export function formatText(report: CheckReport): string {
  const lines = [
    `Result: ${report.status.toUpperCase()} (${report.reasonCode})`,
  ];
  if (report.target)
    lines.push(`Target: ${report.target.origin}${report.target.pathname}`);
  if (report.httpStatus !== undefined)
    lines.push(`HTTP status: ${report.httpStatus}`);
  for (const check of report.checks) {
    const detail = check.actual === undefined ? "" : `: ${check.actual}`;
    lines.push(`- ${check.status.toUpperCase()} ${check.id}${detail}`);
  }
  return lines.join("\n");
}
