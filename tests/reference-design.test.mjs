import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyCandidate, normalizeReferenceUrl, renderDesignMd, UNKNOWN } from "../src/reference-design/design-md.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("reference URL validation rejects unsafe schemes and normalizes fragments", () => {
  assert.equal(normalizeReferenceUrl("https://example.com/page#hero"), "https://example.com/page");
  assert.throws(() => normalizeReferenceUrl("file:///etc/passwd"), /http\(s\)/);
  assert.throws(() => normalizeReferenceUrl("javascript:alert(1)"), /http\(s\)/);
});

test("candidate classification covers requested design scopes", () => {
  assert.equal(classifyCandidate({ tag: "header" }), "Header");
  assert.equal(classifyCandidate({ tag: "aside", className: "app-sidebar" }), "Sidebar");
  assert.equal(classifyCandidate({ tag: "main", className: "workspace" }), "Workspace");
  assert.equal(classifyCandidate({ tag: "div", animation: true }), "Animation");
});

test("DESIGN.md renderer fills the supplied template without inventing missing evidence", async () => {
  const template = await fs.readFile(path.join(root, "src", "reference-design", "DESIGN-TEMPLATE.md"), "utf8");
  const evidence = {
    url: "https://example.com/",
    finalUrl: "https://example.com/",
    title: "Example",
    capturedAt: "2026-09-20T00:00:00.000Z",
    browser: "Remote Chromium",
    scope: "selected",
    selection: [{ label: "Header", selector: "header", kind: "Header" }],
    viewports: [
      { name: "desktop", viewport: { width: 1440, height: 900 }, document: { width: 1440, height: 1800, horizontalOverflow: false }, scopes: [{ selector: "header", tag: "header", label: "Header", rect: { x: 0, y: 0, width: 1440, height: 72 }, style: { backgroundColor: "rgb(10, 10, 12)", color: "rgb(245, 245, 247)", fontFamily: "Inter", fontSize: "16px", lineHeight: "24px", paddingLeft: "24px" } }], elements: [{ selector: "body", tag: "body", rect: { width: 1440, height: 1800 }, style: { backgroundColor: "rgb(10, 10, 12)", color: "rgb(245, 245, 247)", fontFamily: "Inter", fontSize: "16px", lineHeight: "24px", paddingLeft: "24px" } }, { selector: "header", tag: "header", kind: "Header", rect: { width: 1440, height: 72 }, style: { backgroundColor: "rgb(10, 10, 12)", color: "rgb(245, 245, 247)", fontFamily: "Inter", fontSize: "16px" } }] },
      { name: "tablet", viewport: { width: 820, height: 1180 }, document: { width: 820, height: 1900, horizontalOverflow: false }, scopes: [{ selector: "header", rect: { x: 0, y: 0, width: 820, height: 64 }, style: { display: "flex", position: "sticky" } }], elements: [] },
      { name: "mobile", viewport: { width: 390, height: 844 }, document: { width: 390, height: 2200, horizontalOverflow: false }, scopes: [{ selector: "header", rect: { x: 0, y: 0, width: 390, height: 60 }, style: { display: "flex", position: "sticky" } }], elements: [] },
    ],
    interactions: [], animations: [], mediaQueries: ["(max-width: 768px)"], containerQueries: [], fonts: [{ family: "Inter", status: "loaded" }], assets: { svgs: [], images: [], videos: [] }, scroll: { behavior: "smooth", sticky: [{ selector: "header", position: "sticky", top: "0px" }] }, coverage: { componentCoveragePercent: 100, interactionCoveragePercent: 100 }, confidence: 94, restrictions: ["Synthetic test evidence"]
  };
  const md = renderDesignMd({ template, evidence });
  assert.match(md, /# Verified Reference Evidence/);
  assert.match(md, /Header/);
  assert.match(md, /1440×900/);
  assert.match(md, /rgb\(10, 10, 12\)/);
  assert.ok(md.includes(UNKNOWN));
  assert.equal(md.includes("{{"), false, "no unresolved template placeholders may remain");
  assert.equal(md.includes(`${UNKNOWN}px`), false, "unknown values must not be suffixed with misleading units");
});

test("local and Vercel static copies stay byte-identical", async () => {
  for (const name of ["reference-design.html", "reference-design.css", "reference-design.js"]) {
    const [a, b] = await Promise.all([
      fs.readFile(path.join(root, "src", "web", name), "utf8"),
      fs.readFile(path.join(root, "public", name), "utf8"),
    ]);
    assert.equal(a, b, `${name} must stay in sync`);
  }
});
