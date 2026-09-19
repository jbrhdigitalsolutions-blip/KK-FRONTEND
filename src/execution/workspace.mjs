import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { id, ensureDir, writeJson } from "../fs-utils.mjs";
import { gitState } from "../target/repo.mjs";
import { createSafeWorktree } from "./git-safety.mjs";

const EXCLUDED_DIRS = new Set([
  ".git","node_modules",".next",".nuxt",".svelte-kit","dist","build","out","coverage",
  ".cache",".turbo",".parcel-cache",".vite",".vercel",".pnpm-store","tmp","temp"
]);

function excluded(rel){
  return String(rel||"").split(/[\\/]+/).filter(Boolean).some(p=>EXCLUDED_DIRS.has(p));
}
async function sha256(file){const h=crypto.createHash("sha256");h.update(await fs.readFile(file));return h.digest("hex")}
async function walkFiles(root){
  const rows=[];
  async function walk(dir){
    for(const e of await fs.readdir(dir,{withFileTypes:true})){
      const abs=path.join(dir,e.name),rel=path.relative(root,abs);
      if(excluded(rel))continue;
      if(e.isDirectory())await walk(abs);
      else if(e.isFile()){const st=await fs.stat(abs);rows.push({rel:rel.replaceAll("\\","/"),abs,bytes:st.size})}
    }
  }
  await walk(root);return rows;
}
export async function fileManifest(root){
  const out=[];for(const r of await walkFiles(root))out.push({path:r.rel,bytes:r.bytes,sha256:await sha256(r.abs)});return out;
}
async function copyFiltered(src,dst){
  await fs.rm(dst,{recursive:true,force:true});await ensureDir(dst);
  await fs.cp(src,dst,{recursive:true,force:true,preserveTimestamps:true,filter:(source)=>!excluded(path.relative(src,source))});
}
export async function compareTrees(a,b){
  const [am,bm]=await Promise.all([fileManifest(a),fileManifest(b)]),A=new Map(am.map(x=>[x.path,x])),B=new Map(bm.map(x=>[x.path,x]));
  const changed=[],added=[],removed=[];
  for(const [p,x] of B){const y=A.get(p);if(!y)added.push(p);else if(y.sha256!==x.sha256)changed.push(p)}
  for(const p of A.keys())if(!B.has(p))removed.push(p);
  return{changed,added,removed,total:changed.length+added.length+removed.length};
}
export async function prepareExecutionWorkspace(projectRoot,runDir,{progress=()=>{}}={}){
  const state=await gitState(projectRoot);
  if(state.isGit&&state.clean){
    const checkpoint=await createSafeWorktree(projectRoot,runDir,{progress});
    return{mode:"git-worktree",projectRoot,originalRoot:projectRoot,worktree:checkpoint.worktree,originalUntouched:true,git:state,checkpoint};
  }
  const name=id("safe-copy").replace(/[^a-z0-9-]/gi,"-").toLowerCase(),workspace=path.join(runDir,"execution-workspace",name);
  progress({stage:"workspace:snapshot",progress:10,message:state.isGit?"Git tree is dirty; using an isolated safe copy instead of modifying it.":"No Git repository detected; creating an isolated safe copy. Original project remains untouched."});
  const before=await fileManifest(projectRoot);await writeJson(path.join(runDir,"local-original-manifest.json"),before);
  await copyFiltered(projectRoot,workspace);
  const checkpoint={schema:"kk-frontend-workspace/v1",createdAt:new Date().toISOString(),mode:"safe-copy",projectRoot,originalRoot:projectRoot,worktree:workspace,originalUntouched:true,git:state,excluded:[...EXCLUDED_DIRS],originalManifest:"local-original-manifest.json"};
  await writeJson(path.join(runDir,"rollback.json"),checkpoint);return checkpoint;
}
export async function applySafeCopyToOriginal(checkpoint,runDir,{progress=()=>{}}={}){
  if(checkpoint?.mode!=="safe-copy")throw new Error("Apply-back is only available for safe-copy execution.");
  const original=checkpoint.originalRoot,workspace=checkpoint.worktree,diff=await compareTrees(original,workspace),stamp=new Date().toISOString().replace(/[:.]/g,"-"),backupRoot=path.join(runDir,`local-apply-backup-${stamp}`);
  await ensureDir(backupRoot);progress({stage:"apply:backup",progress:15,message:`Backing up ${diff.changed.length+diff.removed.length} original files before apply.`});
  for(const rel of [...diff.changed,...diff.removed]){const src=path.join(original,rel),dst=path.join(backupRoot,"files",rel);try{await ensureDir(path.dirname(dst));await fs.copyFile(src,dst)}catch{}}
  await writeJson(path.join(backupRoot,"backup-manifest.json"),{createdAt:new Date().toISOString(),originalRoot:original,workspace,diff});
  progress({stage:"apply:files",progress:45,message:`Applying ${diff.changed.length+diff.added.length} changed/new files.`});
  for(const rel of [...diff.changed,...diff.added]){const src=path.join(workspace,rel),dst=path.join(original,rel);await ensureDir(path.dirname(dst));await fs.copyFile(src,dst)}
  for(const rel of diff.removed)await fs.rm(path.join(original,rel),{force:true});
  const result={backupRoot,diff};await writeJson(path.join(runDir,"local-apply-result.json"),result);return result;
}
export async function rollbackSafeCopyApply(applyResult,checkpoint,{progress=()=>{}}={}){
  const original=checkpoint.originalRoot,backupRoot=applyResult.backupRoot;progress({stage:"apply:rollback",progress:90,message:"Verification failed; restoring original source files."});
  for(const rel of [...applyResult.diff.changed,...applyResult.diff.removed]){const src=path.join(backupRoot,"files",rel),dst=path.join(original,rel);await ensureDir(path.dirname(dst));await fs.copyFile(src,dst)}
  for(const rel of applyResult.diff.added)await fs.rm(path.join(original,rel),{force:true});
}
