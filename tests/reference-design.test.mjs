import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { buildEvidenceCompanion, candidateFamily, classifyCandidate, normalizeReferenceUrl, renderDesignMd, UNKNOWN } from "../src/reference-design/design-md.mjs";
import { encodeReferenceEvidenceForTransport, isPrivateOrRestrictedAddress } from "../src/reference-design/browserless.mjs";
import { containsReferenceAuthSecret, normalizeReferenceAuth, parseCookieHeader, referenceAuthHeader, referenceAuthSummary } from "../src/reference-design/auth.mjs";

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
          { selector: "header button", parentSelector:"header", ancestorSelectors:["header"], childIndex:0, depth:2, tag: "button", label: "Menu", text:"Menu", interactive: true, rect: { x: 1300, y: 16, width: 40, height: 40 }, style: { ...desktopStyle, cursor: "pointer" } },
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

test("reference authentication normalizes supported modes without exposing secrets", () => {
  const target="https://app.example.com/dashboard";

  const login=normalizeReferenceAuth({
    mode:"login",
    loginUrl:"https://app.example.com/login",
    username:"user@example.com",
    password:"super-secret",
    usernameSelector:"#email",
    successSelector:".dashboard"
  },target);
  assert.equal(login.mode,"login");
  assert.equal(login.loginUrl,"https://app.example.com/login");
  assert.equal(login.loginUrlExplicit,true);
  assert.equal(referenceAuthSummary(login).method,"form-login");
  assert.equal(JSON.stringify(referenceAuthSummary(login)).includes("super-secret"),false);

  const implicitLogin=normalizeReferenceAuth({mode:"login",username:"u",password:"p"},target);
  assert.equal(implicitLogin.loginUrlExplicit,false);
  assert.equal(implicitLogin.loginUrl,target);

  const cookie=normalizeReferenceAuth({mode:"cookie",cookieHeader:"sid=abc123; theme=dark"},target);
  assert.deepEqual(parseCookieHeader(cookie.cookieHeader,target).map(x=>x.name),["sid","theme"]);
  assert.equal(containsReferenceAuthSecret(referenceAuthSummary(cookie),cookie),false);

  const basic=normalizeReferenceAuth({mode:"basic",username:"a",password:"b"},target);
  assert.match(referenceAuthHeader(basic).value,/^Basic /);

  const header=normalizeReferenceAuth({mode:"header",headerName:"Authorization",headerValue:"Bearer secret-token"},target);
  assert.equal(referenceAuthHeader(header).name,"Authorization");
  assert.equal(containsReferenceAuthSecret({summary:referenceAuthSummary(header)},header),false);

  assert.throws(()=>normalizeReferenceAuth({mode:"header",headerName:"Host",headerValue:"x"},target),/not allowed/);
  assert.throws(()=>normalizeReferenceAuth({mode:"login",username:"a",password:"b",loginUrl:"file:///tmp/x"},target),/http\(s\)/);
});

test("design taxonomy detects meaningful regions before generic motion", () => {
  assert.equal(classifyCandidate({ tag: "header", animation: true }), "Header");
  assert.equal(classifyCandidate({ tag: "aside", className: "app-sidebar", animation: true }), "Sidebar");
  assert.equal(classifyCandidate({ tag: "section", className: "hero-section" }), "Hero");
  assert.equal(classifyCandidate({ tag: "article", className: "pricing-card" }), "Card");
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
  const button=companion.viewports[0].representativeElements.find(x=>x.selector==="header button");
  assert.equal(button.parentSelector,"header");
  assert.deepEqual(button.ancestorSelectors,["header"]);
  assert.equal(button.text,"Menu");
  assert.ok(Buffer.byteLength(json, "utf8") < 1_000_000);
});

test("reference evidence transport preserves small payloads directly", () => {
  const evidenceJson=JSON.stringify({schema:"kk-reference-design-evidence-compact/v2",viewports:[{name:"desktop"}]});
  const encoded=encodeReferenceEvidenceForTransport({markdown:"# DESIGN.md",evidenceJson});
  assert.equal(encoded.evidenceEncoding,"identity");
  assert.equal(encoded.evidenceJson,evidenceJson);
  assert.equal(encoded.evidenceGzipBase64,"");
  assert.equal(encoded.rawEvidenceBytes,Buffer.byteLength(evidenceJson,"utf8"));
});

test("large whole-page evidence uses lossless gzip transport instead of a 400 response", () => {
  const evidenceJson=JSON.stringify({
    schema:"kk-reference-design-evidence-compact/v2",
    viewports:["desktop","tablet","mobile"].map((name,viewportIndex)=>({
      name,
      representativeElements:Array.from({length:480},(_,index)=>({
        selector:`main > section:nth-child(${index+1}) > div[data-viewport="${viewportIndex}"]`,
        text:"Reference content ".repeat(36),
        directText:"Reference content ".repeat(18),
        rect:{x:index%12*80,y:index*12,width:760,height:64},
        styleRef:index%24,
      }))
    })),
    styles:Array.from({length:24},(_,index)=>({
      display:"flex",fontFamily:"Inter, sans-serif",fontSize:`${14+(index%5)}px`,
      backgroundImage:`url("https://example.com/assets/background-${index}.webp")`,
    })),
  });
  assert.ok(Buffer.byteLength(evidenceJson,"utf8")>2_750_000,"fixture must exercise compressed transport");
  const encoded=encodeReferenceEvidenceForTransport({markdown:"# DESIGN.md\nWhole page",evidenceJson});
  assert.equal(encoded.evidenceEncoding,"gzip-base64");
  assert.equal(encoded.evidenceJson,"");
  assert.ok(encoded.evidenceGzipBase64.length>0);
  assert.ok(encoded.wireResponseBytes<3_750_000);
  const decoded=gunzipSync(Buffer.from(encoded.evidenceGzipBase64,"base64")).toString("utf8");
  assert.equal(decoded,evidenceJson,"compression transport must be lossless");
});

test("Design Explorer exposes filters, presets and explicit custom-selection limits", async () => {
  const [html, js, browserless] = await Promise.all([
    fs.readFile(path.join(root, "src", "web", "reference-design.html"), "utf8"),
    fs.readFile(path.join(root, "src", "web", "reference-design.js"), "utf8"),
    fs.readFile(path.join(root, "src", "reference-design", "browserless.mjs"), "utf8"),
  ]);
  for (const marker of ["familyFilters", "selectFiltered", "Essential design", "Custom design", "Build the page yourself.", "buildPageButton", "downloadProjectButton", "authToggle", "authMode", "Session cookie", "HTTP Basic", "referenceIntentPanel", "Use entire collection page", "projectFitTitle", "projectFiles", "projectFolder", "GitHub repository", "Current website", "scanGithubButton", "scanWebsiteButton", "fitTargetMapping", "Analyze Project Fit", "Auto — match project", "certifyBuildButton", "Overlay", "Diff"]) {
    assert.ok(html.includes(marker), "missing Design Explorer marker: " + marker);
  }
  assert.ok(js.includes("MAX_CUSTOM_SELECTION = 30"));
  assert.ok(js.includes("pickBalancedEssential"));
  assert.ok(browserless.includes('schema: "kk-reference-design-inspection/v2"'));
  assert.ok(browserless.includes("familyCounts"));
  assert.ok(browserless.includes("selection = []"));
  assert.ok(browserless.includes("supports up to 30 regions"));
  assert.ok(browserless.includes("establishReferenceSession"));
  assert.ok(browserless.includes("performFormLogin"));
  assert.ok(browserless.includes("Authentication secret safety check failed"));
  assert.ok(browserless.includes("assertCredentialOrigin"));
  assert.ok(browserless.includes("credentials were not entered"));
  assert.ok(browserless.includes("captureReferencePreview"));
  assert.ok(browserless.includes("detectReferenceIntent"));
  assert.ok(browserless.includes("requiresChoice:collection"));
  assert.ok(browserless.includes("URL path looks like a collection"));

  assert.ok(browserless.includes("inspectProjectWebsite"));
  assert.ok(browserless.includes("certifyGeneratedPreview"));
  assert.ok(browserless.includes("rawPixelSimilarityPct"));
  assert.ok(browserless.includes("structuralSimilarityPct"));
  assert.ok(js.includes("/api/reference-design/project-fit"));
  assert.ok(js.includes("/api/reference-design/preview"));
  assert.ok(js.includes("/api/reference-design/project-github"));
  assert.ok(js.includes("/api/reference-design/project-website"));
  assert.ok(js.includes("/api/reference-design/certify"));
  assert.ok(js.includes("mergedProjectFiles"));
  assert.ok(js.includes("certifyCurrentBuild"));
  assert.ok(js.includes("projectFitScore"));
  assert.ok(js.includes("Accurate build is locked"));
  assert.ok(js.includes("renderReferenceIntent"));
  assert.ok(js.includes("whole-collection"));
  assert.ok(js.includes("renderTargetMapping"));
  assert.ok(js.includes("standalone-replacement"));
  assert.ok(js.includes("BUILD_DIRECT_REQUEST_MAX_BYTES = 3_800_000"));
  assert.ok(js.includes("CompressionStream"));
  assert.ok(js.includes("decodeGeneratedEvidence"));
  assert.ok(js.includes("DecompressionStream"));
  assert.ok(js.includes("evidenceGzipBase64"));
  assert.ok(browserless.includes("encodeReferenceEvidenceForTransport"));
  assert.ok(browserless.includes("REFERENCE_HARD_RESPONSE_BUDGET_BYTES"));
  assert.ok(js.includes("/api/reference-design/transport/start"));
  assert.ok(js.includes("/api/reference-design/transport/chunk/"));
  assert.ok(js.includes("cloudflare-r2"));
  assert.ok(js.includes("collectBuildProjectContext"));
  assert.ok(js.includes("projectProfile:profile"));
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

test("compact evidence keeps fidelity-critical ancestors and reference font/SVG evidence",()=>{
  const e=syntheticEvidence();
  e.viewports[0].elements=[
    {selector:"body",tag:"body",rect:{x:0,y:0,width:1440,height:1800},style:{display:"block"}},
    {selector:"main > div",parentSelector:"body",ancestorSelectors:["body"],childIndex:0,depth:1,tag:"div",rect:{x:0,y:72,width:1440,height:600},style:{display:"block",backgroundColor:"rgba(0, 0, 0, 0)"}},
    {selector:"main > div > h1",parentSelector:"main > div",ancestorSelectors:["main > div","body"],childIndex:0,depth:2,tag:"h1",text:"Reference heading",directText:"Reference heading",rect:{x:80,y:160,width:600,height:90},style:{display:"block",fontSize:"64px"}}
  ];
  e.fontFaces=['@font-face{font-family:"Reference";src:url("https://example.com/reference.woff2")}'];
  e.assets.svgs=[{selector:"#logo",markup:'<svg viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>'}];
  const compact=buildEvidenceCompanion(e);
  const selectors=compact.viewports[0].representativeElements.map(x=>x.selector);
  assert.ok(selectors.includes("main > div"),"layout ancestor required by an h1 must be retained");
  assert.ok(selectors.includes("main > div > h1"));
  const compactHeading=compact.viewports[0].representativeElements.find(x=>x.tag==="h1");
  assert.equal(compactHeading.directText,"Reference heading");
  assert.equal(Number.isInteger(compactHeading.styleRef),true);
  assert.equal(Object.hasOwn(compactHeading,"style"),false);
  assert.ok(compact.styles.length>0);
  assert.match(compact.fontFaces[0],/reference\.woff2/);
  assert.match(compact.assets.svgs[0].markup,/<path/);
});

