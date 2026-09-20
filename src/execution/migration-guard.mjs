import path from "node:path";
import { exists, sha256File } from "../fs-utils.mjs";
import { run } from "../target/repo.mjs";
import { compareTrees } from "./workspace.mjs";

function safePath(root,rel){
  const clean=String(rel||"").replaceAll("\\","/");
  if(!clean||path.isAbsolute(clean)||clean.split("/").includes(".."))throw new Error("Unsafe migration path: "+rel);
  const abs=path.resolve(root,...clean.split("/"));
  const base=path.resolve(root)+path.sep;
  if(abs!==path.resolve(root)&&!abs.startsWith(base))throw new Error("Migration path escapes workspace: "+rel);
  return abs;
}
function allBaseline(plan){
  const out=new Map();
  for(const action of plan?.actions||[])for(const [file,sha] of Object.entries(action.baselineHashes||{})){
    if(out.has(file)&&out.get(file)!==sha)throw new Error("Conflicting baseline hashes for "+file);
    out.set(file,sha);
  }
  return out;
}
export function allowedFilesFromPlan(plan){
  return new Set((plan?.actions||[]).flatMap(a=>a.allowedFiles||[]).map(x=>String(x).replaceAll("\\","/")));
}
export async function verifyPlanBaseline(root,plan,{progress=()=>{}}={}){
  const checks=[];
  for(const [file,expected] of allBaseline(plan)){
    const abs=safePath(root,file);
    if(!exists(abs))throw new Error("STOP: planned file is missing from execution workspace: "+file);
    const actual=await sha256File(abs);
    checks.push({file,expected,actual,passed:actual===expected});
    if(actual!==expected)throw new Error("STOP: baseline SHA256 changed before migration: "+file);
  }
  progress({stage:"migration:baseline",progress:18,message:"Verified "+checks.length+" planned source baselines"});
  return{passed:true,checks};
}
async function gitChanged(root){
  const [tracked,untracked]=await Promise.all([
    run("git",["diff","--name-only","-z","HEAD"],{cwd:root,timeout:60000}),
    run("git",["ls-files","--others","--exclude-standard","-z"],{cwd:root,timeout:60000})
  ]);
  if(tracked.code!==0)throw new Error("git diff failed: "+(tracked.stderr||tracked.stdout));
  if(untracked.code!==0)throw new Error("git ls-files failed: "+(untracked.stderr||untracked.stdout));
  const parse=s=>String(s||"").split("\0").filter(Boolean).map(x=>x.replaceAll("\\","/"));
  return[...new Set([...parse(tracked.stdout),...parse(untracked.stdout)])];
}
export async function changedFilesForWorkspace(checkpoint){
  if(checkpoint?.mode==="git-worktree")return gitChanged(checkpoint.worktree);
  if(checkpoint?.mode==="safe-copy"){
    const diff=await compareTrees(checkpoint.originalRoot,checkpoint.worktree);
    return[...new Set([...diff.changed,...diff.added,...diff.removed])];
  }
  throw new Error("Unknown execution workspace mode.");
}
export async function validateChangedFileScope(checkpoint,plan,{progress=()=>{}}={}){
  const allowed=allowedFilesFromPlan(plan);
  const changed=await changedFilesForWorkspace(checkpoint);
  const projectChanges=changed.filter(x=>!x.startsWith(".kk-frontend/"));
  const violations=projectChanges.filter(x=>!allowed.has(x));
  const result={passed:violations.length===0,changedFiles:projectChanges,allowedFiles:[...allowed],violations};
  progress({stage:"migration:scope",progress:62,message:"Changed-file scope: "+projectChanges.length+" project files, "+violations.length+" violations"});
  if(violations.length)throw new Error("STOP: coding agent changed files outside approved migration scope: "+violations.join(", "));
  return result;
}
