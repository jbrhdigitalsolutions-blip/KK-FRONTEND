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
assert.equal(pkg.version,"0.2.5");
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
console.log("KK-FRONTEND v0.2 selftest PASS");
