import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../src/config.mjs";
import { safeSlug } from "../src/fs-utils.mjs";
import { canonicalizeRoute, compilePattern, routeMatchesScope } from "../src/browser/route-utils.mjs";

assert.equal(safeSlug("https://example.com/a b?x=1"),"example.com-a-b");
assert.equal(canonicalizeRoute("https://suno.com/ja",{}).canonicalUrl,"https://suno.com/");
assert.equal(canonicalizeRoute("https://suno.com/ko/search",{}).canonicalUrl,"https://suno.com/search");
assert.equal(canonicalizeRoute("https://suno.com/ko/search",{scanLocaleVariants:true}).canonicalUrl,"https://suno.com/ko/search");
const include=compilePattern("^/(discover|search)","Include-route");
assert.equal(routeMatchesScope("https://suno.com/discover",include,null),true);
assert.equal(routeMatchesScope("https://suno.com/studio",include,null),false);
assert.ok(fs.existsSync(path.join(CONFIG.packageRoot,"REQUIREMENTS.md")));
assert.ok(fs.existsSync(path.join(CONFIG.packageRoot,"src","web","index.html")));
assert.ok(fs.existsSync(path.join(CONFIG.packageRoot,"src","browser","scanner.mjs")));
const pkg=JSON.parse(fs.readFileSync(path.join(CONFIG.packageRoot,"package.json"),"utf8"));
assert.equal(pkg.name,"kk-frontend");
assert.equal(pkg.version,"0.6.0");
assert.equal(pkg.packageManager,"pnpm@10.28.0");
assert.ok(pkg.dependencies.playwright);
const scanner=fs.readFileSync(path.join(CONFIG.packageRoot,"src","browser","scanner.mjs"),"utf8");
for(const marker of [
  '"fast-deep"',
  "layout-clusters.json",
  "responsive-boundaries.json",
  "route-coverage.json",
  "audit.partial.json",
  "checkpoint",
]) assert.ok(scanner.includes(marker),`scanner marker missing: ${marker}`);
const routeUtils=fs.readFileSync(path.join(CONFIG.packageRoot,"src","browser","route-utils.mjs"),"utf8");
assert.ok(routeUtils.includes("KNOWN_LOCALES"));
const jobs=fs.readFileSync(path.join(CONFIG.packageRoot,"src","jobs.mjs"),"utf8");
for(const marker of ["pause(id)","resume(id)","stop(id)","KK_STOP"]) assert.ok(jobs.includes(marker),`job control marker missing: ${marker}`);
assert.ok(fs.existsSync(path.join(CONFIG.packageRoot,"src","intelligence","design-entities.mjs")));
assert.ok(fs.existsSync(path.join(CONFIG.packageRoot,"src","intelligence","source-generator.mjs")));
assert.ok(fs.existsSync(path.join(CONFIG.packageRoot,"src","target","source-intelligence.mjs")));
assert.ok(fs.existsSync(path.join(CONFIG.packageRoot,"src","intelligence","design-contract.mjs")));
assert.ok(fs.existsSync(path.join(CONFIG.packageRoot,"src","intelligence","component-map.mjs")));
assert.ok(fs.existsSync(path.join(CONFIG.packageRoot,"src","execution","migration-guard.mjs")));
assert.ok(fs.existsSync(path.join(CONFIG.packageRoot,"src","execution","visual-verify.mjs")));
assert.ok(fs.existsSync(path.join(CONFIG.packageRoot,"src","reference-design","design-md.mjs")));
assert.ok(fs.existsSync(path.join(CONFIG.packageRoot,"src","reference-design","browserless.mjs")));
assert.ok(fs.existsSync(path.join(CONFIG.packageRoot,"src","reference-design","DESIGN-TEMPLATE.md")));
assert.ok(fs.existsSync(path.join(CONFIG.packageRoot,"src","no-code","compiler.mjs")));
const noCodeCompiler=fs.readFileSync(path.join(CONFIG.packageRoot,"src","no-code","compiler.mjs"),"utf8");
for(const marker of ["kk-no-code-design-build/v1","compileNoCodeDesign","zipStore","standaloneHtml","reactFiles","nextFiles"]) assert.ok(noCodeCompiler.includes(marker),`no-code compiler marker missing: ${marker}`);
assert.ok(fs.existsSync(path.join(CONFIG.packageRoot,"src","web","reference-design.html")));
assert.ok(fs.existsSync(path.join(CONFIG.packageRoot,"public","reference-design.html")));
const referenceDesign=fs.readFileSync(path.join(CONFIG.packageRoot,"src","reference-design","design-md.mjs"),"utf8");
for(const marker of ["Verified Evidence Summary","buildEvidenceCompanion","kk-reference-design-md/v2"]) assert.ok(referenceDesign.includes(marker),`reference design marker missing: ${marker}`);
const designExplorer=fs.readFileSync(path.join(CONFIG.packageRoot,"src","web","reference-design.html"),"utf8");
for(const marker of ["familyFilters","selectFiltered","Essential design","Build the page yourself.","buildPageButton","downloadProjectButton"]) assert.ok(designExplorer.includes(marker),`Design Explorer marker missing: ${marker}`);
const browserless=fs.readFileSync(path.join(CONFIG.packageRoot,"src","reference-design","browserless.mjs"),"utf8");
for(const marker of ["setExactViewport","installNetworkGuard","kk-reference-design-evidence/v2","kk-reference-design-inspection/v2","familyCounts"]) assert.ok(browserless.includes(marker),`browserless hardening marker missing: ${marker}`);
const web=fs.readFileSync(path.join(CONFIG.packageRoot,"src","web","index.html"),"utf8");
for(const marker of ["Reference Design Picker","Generate Source Code","pickerOverlay"]) assert.ok(web.includes(marker),`design picker marker missing: ${marker}`);
assert.ok(web.includes("Reference → DESIGN.md"),"web-only DESIGN.md page link missing");
assert.ok(web.includes("verifyAfterBtn"),"post-change visual verification UI missing");
console.log("KK-FRONTEND v0.6.0 selftest PASS");
