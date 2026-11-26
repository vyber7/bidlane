import { ApiRequestError, isJsonObject, readBoundedBody } from "@/app/libs/api-request";
import { logger } from "@/app/libs/logger";

const MAX_REPORT_BYTES = 16 * 1024;
const MAX_REPORTS_PER_REQUEST = 10;

/** Keep only origin and path: query strings can carry reset and verification tokens. */
function withoutQuery(value: unknown) {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, 300);
  } catch {
    // Keywords such as "inline" or "eval" are not URLs.
    return value.slice(0, 40);
  }
}

function text(value: unknown, max = 120) {
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

/**
 * Normalize both report shapes: the legacy report-uri body ({ "csp-report": {...} },
 * kebab-case keys) and the Reporting API batch ([{ type, body }], camelCase keys).
 */
function violations(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((report) => isJsonObject(report) && report.type === "csp-violation" && isJsonObject(report.body))
      .map((report) => {
        const body = report.body as Record<string, unknown>;
        return {
          directive: text(body.effectiveDirective),
          blocked: withoutQuery(body.blockedURL),
          document: withoutQuery(body.documentURL),
          source: withoutQuery(body.sourceFile),
          line: typeof body.lineNumber === "number" ? body.lineNumber : undefined,
          disposition: text(body.disposition, 20),
        };
      });
  }
  if (isJsonObject(payload) && isJsonObject(payload["csp-report"])) {
    const body = payload["csp-report"];
    return [{
      directive: text(body["effective-directive"] ?? body["violated-directive"]),
      blocked: withoutQuery(body["blocked-uri"]),
      document: withoutQuery(body["document-uri"]),
      source: withoutQuery(body["source-file"]),
      line: typeof body["line-number"] === "number" ? body["line-number"] : undefined,
      disposition: text(body.disposition, 20),
    }];
  }
  return [];
}

/** Collects Content Security Policy violations from browsers into the logs. */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, MAX_REPORT_BYTES)));
  } catch (error) {
    return new Response(null, { status: error instanceof ApiRequestError ? error.status : 400 });
  }
  const reports = violations(payload);
  if (!reports.length) return new Response(null, { status: 400 });
  for (const report of reports.slice(0, MAX_REPORTS_PER_REQUEST)) logger.warn("csp.violation", report);
  return new Response(null, { status: 204 });
}
