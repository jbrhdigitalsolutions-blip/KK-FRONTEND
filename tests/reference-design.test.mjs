import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEvidenceCompanion, candidateFamily, classifyCandidate, normalizeReferenceUrl, renderDesignMd, UNKNOWN } from "../src/reference-design/design-md.mjs";
import { isPrivateOrRestrictedAddress } from "../src/reference-design/browserless.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function syntheticEvidence() {
  const desktopStyle = {
    display: "block", position: "relative", backgroundColor: "rgb(10, 10, 12)", color: "rgb(245, 245, 247)",
    fontFamily: "Inter", fontSize: "16px", lineHeight: "24px", paddingLeft: "24px", borderRadius: "0px",
    animationName: "none", overflow: "visible",
  };
  return {
    url: "https://example.com/",
    finalUrl: "https://example.com/",
    title: "Example",
    capturedAt: "2026-09-20T00:00:00.000Z",
    browser: "Remote Chromium",
    scope: "selected",
    selection: [{ label: "Header", selector: "header", kind: "Header" }],
    viewports: [
      {
        name: "desktop", targetViewport: { width: 1440, height: 900 }, viewport: { width: 1440, height: 900, devicePixelRatio: 1 },
        document: { width: 1440, height: 1800, horizontalOverflow: false },
        scopes: [{ selector: "header", tag: "header", label: "Header", rect: { x: 0, y: 0, width: 1440, height: 72 }, style: { ...desktopStyle, display: "flex", position: "sticky" } }],
        elements: [
          { selector: "body", tag: "body", rect: { x: 0, y: 0, width: 1440, height: 1800 }, style: desktopStyle },
          { selector: "header", tag: "header", role: "banner", label: "Header", rect: { x: 0, y: 0, width: 1440, height: 72 }, style: { ...desktopStyle, display: "flex", position: "sticky" } },
          { selector: "header button", tag: "button", label: "Menu", interactive: true, rect: { x: 1300, y: 16, width: 40, height: 40 }, style: { ...desktopStyle, cursor: "pointer" } },
        ],
      },
      {
        name: "tablet", targetViewport: { width: 820, height: 1180 }, viewport: { width: 820, height: 1180, devicePixelRatio: 1 },
        document: { width: 820, height: 1900, horizontalOverflow: false },
        scopes: [{ selector: "header", tag: "header", label: "Header", rect: { x: 0, y: 0, width: 820, height: 64 }, style: { display: "flex", position: "sticky" } }],
        elements: [{ selector: "header", tag: "header", rect: { x: 0, y: 0, width: 820, height: 64 }, style: { display: "flex", position: "sticky" } }],
      },
      {
        name: "mobile", targetViewport: { width: 390, height: 844 }, viewport: { width: 390, height: 844, devicePixelRatio: 1 },
        document: { width: 390, height: 2200, horizontalOverflow: false },
        scopes: [{ selector: "header", tag: "header", label: "Header", rect: { x: 0, y: 0, width: 390, height: 60 }, style: { display: "flex", position: "sticky" } }],
        elements: [{ selector: "header", tag: "header", rect: { x: 0, y: 0, width: 390, height: 60 }, style: { display: "flex", position: "sticky" } }],
      },
    ],
    interactions: [{
      selector: "header button",
      before: { color: "rgb(245, 245, 247)" },
      hover: { color: { before: "rgb(245, 245, 247)", after: "rgb(255, 255, 255)" } },
      focus: {},
    }],
    animations: [{
      selector: ".hero",
      timing: { duration: 3000, easing: "linear", iterations: 1 },
      keyframes: [{ opacity: 0 }, { opacity: 1 }],
    }],
    mediaQueries: ["(max-width: 768px)", "(min-width: 1024px)"],
    containerQueries: ["(min-width: 30rem)"],
    styleSheets: { total: 4, readable: 3, blocked: 1 },
    fonts: [{ family: "Inter", status: "loaded" }],
    assets: { svgs: [], images: [], videos: [], canvasCount: 0 },
    scroll: { behavior: "smooth", sticky: [{ selector: "header", position: "sticky", top: "0px" }] },
    coverage: {
      componentCoveragePercent: null,
      componentCoverageClaim: "NOT CLAIMED — capture is representative, not an exhaustive DOM census",
      interactionCoveragePercent: 100,
      meaningfulInteractionCount: 1,
      responsiveCoveragePercent: 100,
    },
    confidence: 93,
    confidenceReasons: ["All three requested viewports were browser-verified exactly."],
    restrictions: ["Synthetic test evidence"],
  };
}

test("reference URL validation rejects unsafe schemes and normalizes fragments", () => {
  assert.equal(normalizeReferenceUrl("https://example.com/page#hero"), "https://example.com/page");
  assert.throws(() => normalizeReferenceUrl("file:///etc/passwd"), /http\(s\)/);
  assert.throws(() => normalizeReferenceUrl("javascript:alert(1)"), /http\(s\)/);
});

test("network safety recognizes private, mapped and public addresses", () => {
  for (const address of ["127.0.0.1", "10.0.0.8", "100.64.1.2", "169.254.169.254", "192.168.1.9", "::1", "fc00::1", "::ffff:127.0.0.1", "ff02::1"]) {
    assert.equal(isPrivateOrRestrictedAddress(address), true, address);
  }
  assert.equal(isPrivateOrRestrictedAddress("8.8.8.8"), false);
  assert.equal(isPrivateOrRestrictedAddress("2606:4700:4700::1111"), false);
});

test("design taxonomy detects meaningful regions before generic motion", () => {
  assert.equal(classifyCandidate({ tag: "header", animation: true }), "Header");
  assert.equal(classifyCandidate({ tag: "aside", className: "app-sidebar", animation: true }), "Sidebar");
  assert.equal(classifyCandidate({ tag: "section", className: "hero-section" }), "Hero");
  assert.equal(classifyCandidate({ tag: "article", className: "pricing-card" }), "Section");
  assert.equal(classifyCandidate({ tag: "button", className: "primary-cta", interactive: true }), "Button");
  assert.equal(classifyCandidate({ tag: "input", className: "search-box" }), "Search");
  assert.equal(classifyCandidate({ tag: "img", className: "cover-image" }), "Image");
  assert.equal(classifyCandidate({ tag: "h2", className: "section-title" }), "Typography");
  assert.equal(classifyCandidate({ tag: "div", animation: true }), "Animation");
  assert.equal(candidateFamily("Hero"), "Structure");
  assert.equal(candidateFamily("Button"), "Controls");
  assert.equal(candidateFamily("Typography"), "Content");
  assert.equal(candidateFamily("Image"), "Media");
  assert.equal(candidateFamily("Animation"), "Motion");
});

test("DESIGN.md is concise, professional and does not invent semantic measurements", async () => {
  const template = await fs.readFile(path.join(root, "src", "reference-design", "DESIGN-TEMPLATE.md"), "utf8");
  const evidence = syntheticEvidence();
  const md = renderDesignMd({ template, evidence });

  assert.match(md, /^---\nschema: kk-reference-design-md\/v2/m);
  assert.match(md, /# DESIGN\.md/);
  assert.equal(md.includes("# DEISGN.md"), false);
  assert.match(md, /## Verified Evidence Summary/);
  assert.match(md, /desktop \| 1440×900 \| 1440×900/);
  assert.match(md, /Breakpoint names such as XS\/SM\/MD\/LG are not inferred/);
  assert.match(md, /Reference Viewport:\s*\n1440 × 900/);
  assert.match(md, /Extra Small: `UNKNOWN — DO NOT INVENT`/);
  assert.match(md, /Normal Duration: `UNKNOWN — DO NOT INVENT`/);
  assert.match(md, /Not measured — this extractor records evidence confidence, not a pixel-similarity score/);
  assert.match(md, /rgb\(10, 10, 12\)/);
  assert.ok(md.includes(UNKNOWN));
  assert.equal(md.includes("{{"), false, "no unresolved template placeholders may remain");
  assert.equal(md.includes(UNKNOWN + "px"), false, "unknown values must not carry fake units");
  assert.ok(Buffer.byteLength(md, "utf8") < 500_000, "professional DESIGN.md should not contain raw multi-megabyte evidence");
});

test("compact evidence companion preserves machine evidence without raw DOM bloat", () => {
  const evidence = syntheticEvidence();
  for (let i = 0; i < 500; i++) {
    evidence.viewports[0].elements.push({
      selector: ".noise-" + i,
      tag: "div",
      label: "noise",
      interactive: false,
      rect: { x: 0, y: i, width: 10, height: 10 },
      style: { display: "block", backgroundImage: "none", fontSize: "12px" },
    });
  }
  const companion = buildEvidenceCompanion(evidence);
  const json = JSON.stringify(companion);
  assert.equal(companion.schema, "kk-reference-design-evidence-compact/v2");
  assert.equal(companion.viewports[0].viewport.width, 1440);
  assert.ok(companion.viewports[0].representativeElements.length < evidence.viewports[0].elements.length);
  assert.ok(json.includes("(max-width: 768px)"));
  assert.ok(json.includes("header button"));
  assert.ok(Buffer.byteLength(json, "utf8") < 1_000_000);
});

test("Design Explorer exposes filters, presets and explicit custom-selection limits", async () => {
  const [html, js, browserless] = await Promise.all([
    fs.readFile(path.join(root, "src", "web", "reference-design.html"), "utf8"),
    fs.readFile(path.join(root, "src", "web", "reference-design.js"), "utf8"),
    fs.readFile(path.join(root, "src", "reference-design", "browserless.mjs"), "utf8"),
  ]);
  for (const marker of ["familyFilters", "selectFiltered", "Essential design", "Custom design", "No coding agent required"]) {
    assert.ok(html.includes(marker), "missing Design Explorer marker: " + marker);
  }
  assert.ok(js.includes("MAX_CUSTOM_SELECTION = 30"));
  assert.ok(js.includes("pickBalancedEssential"));
  assert.ok(browserless.includes('schema: "kk-reference-design-inspection/v2"'));
  assert.ok(browserless.includes("familyCounts"));
  assert.ok(browserless.includes("selection = []"));
  assert.ok(browserless.includes("supports up to 30 regions"));
});

test("local and Vercel static copies stay byte-identical", async () => {
  for (const name of ["reference-design.html", "reference-design.css", "reference-design.js"]) {
    const [a, b] = await Promise.all([
      fs.readFile(path.join(root, "src", "web", name), "utf8"),
      fs.readFile(path.join(root, "public", name), "utf8"),
    ]);
    assert.equal(a, b, name + " must stay in sync");
  }
});
