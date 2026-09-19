import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

async function exists(p){try{await fs.access(p);return true}catch{return false}}
async function ensureDir(p){await fs.mkdir(p,{recursive:true})}
async function copyFile(src,dst){if(!(await exists(src)))return false;await ensureDir(path.dirname(dst));await fs.copyFile(src,dst);return true}
async function copyTree(src,dst){if(!(await exists(src)))return false;await fs.cp(src,dst,{recursive:true,force:true});return true}
async function walk(dir){const out=[];if(!(await exists(dir)))return out;for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await walk(p));else if(e.isFile())out.push(p)}return out}
async function sha256(file){const h=crypto.createHash("sha256");h.update(await fs.readFile(file));return h.digest("hex")}

function agentPrompt(referenceUrl){return `# Coding Agent Prompt — Reference Design Transfer

Read \`DESIGN.md\` completely. Then read \`PACK-MANIFEST.json\`, exact route/profile JSON and bundled screenshots before changing code.

## Objective
Rebuild the target project's visible frontend to reproduce the VERIFIED reference design captured from:
\`${referenceUrl}\`

## Preserve
Keep all existing functionality, APIs, routes, authentication, permissions, forms, data/state, music/product features, business logic, integrations and working tests.

## Rules
1. Do not copy proprietary reference JavaScript/source code.
2. Build shared tokens, shell, navigation and reusable primitives first.
3. Implement every VERIFIED geometry/style/state measurement that semantically applies.
4. Inspect the reference screenshot for each route/anchor before implementing that surface.
5. Keep dynamic content routes dynamic; never create one target page per reference song/album/profile.
6. If exact reference assets are not authorized, use authorized target-owned equivalents while preserving measured geometry.
7. Do not invent UNAVAILABLE, RESTRICTED or unobserved states.
8. Capture target screenshots at every anchor in DESIGN.md and compare them with DESIGN-PACK references.
9. Do not declare completion while an observed visual mismatch remains unexplained.

Return changed files, affected routes/components, verification results, runtime/console status, remaining unverified states and visual-comparison evidence.
`}

export async function buildDesignPack({sessionDir,referenceRoot,designMd,referenceAudit,referenceUrl,anchors=[]}){
  const pack=path.join(sessionDir,"DESIGN-PACK");
  await fs.rm(pack,{recursive:true,force:true});await ensureDir(path.join(pack,"machine"));await ensureDir(path.join(pack,"assets"));
  await copyFile(designMd,path.join(pack,"DESIGN.md"));
  await copyFile(referenceAudit,path.join(pack,"machine","reference-audit.json"));
  for(const name of ["shared-css.json","route-inventory.json","route-coverage.json","layout-clusters.json","technology.json","audit.json"]){
    await copyFile(path.join(referenceRoot,name),path.join(pack,"machine",name));
  }
  await copyTree(path.join(referenceRoot,"routes"),path.join(pack,"routes"));
  await copyFile(path.join(referenceRoot,"assets","manifest.json"),path.join(pack,"assets","manifest.json"));
  const refAssets=path.join(referenceRoot,"assets");
  if(await exists(refAssets)){
    for(const e of await fs.readdir(refAssets,{withFileTypes:true})){
      if(e.name==="manifest.json")continue;
      const src=path.join(refAssets,e.name),dst=path.join(pack,"assets",e.name);
      if(e.isDirectory())await copyTree(src,dst);else if(e.isFile())await copyFile(src,dst);
    }
  }
  await fs.writeFile(path.join(pack,"CODING-AGENT-PROMPT.md"),agentPrompt(referenceUrl),"utf8");
  await fs.writeFile(path.join(pack,"PACK-README.md"),`# DESIGN-PACK

Start with:
1. DESIGN.md
2. CODING-AGENT-PROMPT.md
3. PACK-MANIFEST.json

Evidence:
- machine/ — exact master/CSS/route/cluster JSON
- routes/ — exact route/profile JSON and screenshots
- assets/manifest.json — asset URL/use/restriction inventory
- assets/ — downloaded bytes only when the scan actually acquired them

Captured anchors:
${anchors.map(x=>`- ${x}`).join("\n")||"- See DESIGN.md"}

Uncaptured hidden/auth-gated/native-device states are not claimed.
`,"utf8");

  const files=(await walk(pack)).filter(f=>path.basename(f)!=="PACK-MANIFEST.json").sort(),manifestFiles=[];
  for(const f of files){const st=await fs.stat(f);manifestFiles.push({path:path.relative(pack,f).replaceAll("\\","/"),bytes:st.size,sha256:await sha256(f)})}
  const manifest={schema:"kk-frontend-design-pack/v1",createdAt:new Date().toISOString(),reference:referenceUrl,anchors,counts:{files:manifestFiles.length,screenshots:manifestFiles.filter(x=>/\.(?:png|jpe?g|webp)$/i.test(x.path)).length,json:manifestFiles.filter(x=>/\.json$/i.test(x.path)).length},files:manifestFiles};
  await fs.writeFile(path.join(pack,"PACK-MANIFEST.json"),JSON.stringify(manifest,null,2)+"\n","utf8");
  return{packDir:pack,manifest};
}
