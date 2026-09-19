import fs from "node:fs/promises";
import path from "node:path";
import { writeText } from "../fs-utils.mjs";

function md(v) {
  if (v == null) return "—";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export async function writeAuditMarkdown(auditFile, outFile, title = "Frontend Audit") {
  const a = JSON.parse(await fs.readFile(auditFile, "utf8"));
  const lines = [
    `# ${title}`, "",
    `- Target: \`${md(a.target)}\``,
    `- Captured: ${md(a.capturedAt)}`,
    `- Evidence: **${md(a.evidenceStatus)}**`,
    `- Raw routes discovered: ${md(a.coverage?.rawRoutesDiscovered ?? a.coverage?.routesDiscovered)}`,
    `- Canonical route families: ${md(a.coverage?.canonicalRouteFamilies ?? a.coverage?.routesScanned)}`,
    `- Unique visual clusters: ${md(a.coverage?.uniqueVisualClusters)}`,
    `- Route failures: ${md(a.coverage?.routeFailures)}`,
    "",
    "## Technology", "",
    "| Name | Evidence status | Evidence |",
    "|---|---|---|",
    ...(a.technology || []).map(x => `| ${md(x.name)} | ${md(x.confidence)} | ${md(x.evidence)} |`),
    "",
    "## Route coverage", "",
    "| Route | Evidence | Profiles | Breakpoints |",
    "|---|---|---:|---|",
    ...((a.representativeRoutes?.length ? a.representativeRoutes : a.routes) || []).map(r => `| \`${md(r.url)}\` | ${md(r.evidenceStatus)} | ${md(r.viewports)} | ${md((r.breakpoints||[]).join(", "))} |`),
    "",
    "## Assets", "",
    `- Discovered: ${md(a.assets?.discovered)}`,
    `- Downloaded: ${md(a.assets?.downloaded)}`,
    `- Bytes written: ${md(a.assets?.bytesWritten)}`,
    "",
    "## Restrictions", "",
    ...(a.restrictions || []).map(x => `- ${md(x)}`),
    ""
  ];
  return await writeText(outFile, lines.join("\n"));
}

export async function writeComparisonMarkdown(comparisonFile, outFile) {
  const c = JSON.parse(await fs.readFile(comparisonFile, "utf8"));
  const lines = [
    "# Reference vs Target Comparison", "",
    `- Reference: \`${md(c.reference)}\``,
    `- Target: \`${md(c.target)}\``,
    `- Differences: ${c.entries?.length || 0}`,
    "",
    "| ID | Route | Category | Subcategory | Difference | Impact | Risk | Evidence |",
    "|---|---|---|---|---|---|---|---|",
    ...(c.entries || []).map(e => `| ${md(e.id)} | \`${md(e.route)}\` | ${md(e.category)} | ${md(e.subcategory)} | ${md(e.difference)} | ${md(e.impact)} | ${md(e.risk)} | ${md(e.evidence?.status)} |`),
    "",
    "## Visual diffs", "",
    ...(c.visualDiffs || []).map(v => `- ${md(v.route)} @ ${md(v.viewport)}: ${md(v.pct)}% mismatched → \`${md(v.file)}\``),
    ""
  ];
  return await writeText(outFile, lines.join("\n"));
}
