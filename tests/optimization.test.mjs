import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeRoute, compilePattern, designTemplateForRoute, routeMatchesScope } from "../src/browser/route-utils.mjs";
import { classifyDesignAsset } from "../src/browser/asset-utils.mjs";
import { jobs } from "../src/jobs.mjs";

test("locale aliases collapse to canonical English-neutral route family", () => {
  assert.equal(canonicalizeRoute("https://suno.com/ja").canonicalUrl, "https://suno.com/");
  assert.equal(canonicalizeRoute("https://suno.com/ko/search?q=x").canonicalUrl, "https://suno.com/search?q=x");
  assert.equal(canonicalizeRoute("https://suno.com/pt-pt/studio").canonicalUrl, "https://suno.com/studio");
});

test("locale variants can be explicitly retained", () => {
  assert.equal(canonicalizeRoute("https://suno.com/ja/search", { scanLocaleVariants: true }).canonicalUrl, "https://suno.com/ja/search");
});

test("song instances collapse to one design template", () => {
  const a = designTemplateForRoute("https://suno.com/song/abc123456789012345678");
  const b = designTemplateForRoute("https://suno.com/song/xyz987654321012345678");
  assert.equal(a.templateKey, "/song/:songId");
  assert.equal(a.templateKey, b.templateKey);
  assert.equal(a.dynamic, true);
});

test("playlist/profile/album families use one representative template", () => {
  assert.equal(designTemplateForRoute("https://suno.com/playlist/12345678901234567890").templateKey, "/playlist/:playlistId");
  assert.equal(designTemplateForRoute("https://suno.com/album/12345678901234567890").templateKey, "/album/:albumId");
  assert.equal(designTemplateForRoute("https://suno.com/profile/some-creator").templateKey, "/profile/:slug");
});

test("search content queries do not create duplicate design routes", () => {
  assert.equal(designTemplateForRoute("https://suno.com/search?q=rock").templateKey, "/search");
  assert.equal(designTemplateForRoute("https://suno.com/search?q=jazz").templateKey, "/search");
});

test("structural query variants can remain distinct", () => {
  assert.equal(designTemplateForRoute("https://example.com/library?view=grid").templateKey, "/library?view=grid");
  assert.equal(designTemplateForRoute("https://example.com/library?view=list").templateKey, "/library?view=list");
});

test("route include/exclude scope is deterministic", () => {
  const include = compilePattern("^/(discover|search|create)", "include");
  const exclude = compilePattern("/labs", "exclude");
  assert.equal(routeMatchesScope("https://suno.com/discover", include, exclude), true);
  assert.equal(routeMatchesScope("https://suno.com/studio", include, exclude), false);
});

test("design-only asset classifier excludes song audio and telemetry/API noise", () => {
  assert.equal(classifyDesignAsset({url:"https://cdn.example.com/song.mp3",type:"audio"}).include, false);
  assert.equal(classifyDesignAsset({url:"https://www.google-analytics.com/collect?v=2",type:"resource:fetch"}).include, false);
  assert.equal(classifyDesignAsset({url:"https://suno.com/api/v1/song/1",type:"resource:fetch"}).include, false);
});

test("design-only asset classifier keeps frontend CSS/JS/fonts/images", () => {
  assert.equal(classifyDesignAsset({url:"https://cdn.example.com/app.css",type:"stylesheet"}).include, true);
  assert.equal(classifyDesignAsset({url:"https://cdn.example.com/app.js",type:"script"}).include, true);
  assert.equal(classifyDesignAsset({url:"https://cdn.example.com/font.woff2",type:"font"}).include, true);
  assert.equal(classifyDesignAsset({url:"https://cdn.example.com/hero.webp",type:"image"}).include, true);
});

test("non-decorative content video is skipped but decorative UI video is retained", () => {
  assert.equal(classifyDesignAsset({url:"https://cdn.example.com/song-video.mp4",type:"video",controls:true,muted:false}).include, false);
  assert.equal(classifyDesignAsset({url:"https://cdn.example.com/hero.mp4",type:"video",autoplay:true,muted:true,loop:true}).include, true);
});

test("job safe stop raises KK_STOP only at checkpoint", async () => {
  const job = jobs.create("test");
  jobs.patch(job.id, { status: "running" });
  assert.equal(jobs.stop(job.id), true);
  const ctl = jobs.control(job.id);
  await assert.rejects(() => ctl.checkpoint(), (e) => e.code === "KK_STOP");
});
