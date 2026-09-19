import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { CONFIG } from "../config.mjs";
import { ensureDir, exists, id, writeJson } from "../fs-utils.mjs";

function run(command,args,{cwd=process.cwd(),timeout=120000,env=process.env}={}) {
  return new Promise((resolve,reject)=>{
    const p=spawn(command,args,{cwd,env,shell:false,windowsHide:true});
    let stdout="",stderr="";
    const timer=setTimeout(()=>{p.kill("SIGTERM");reject(new Error(`Timeout: ${command} ${args.join(" ")}`));},timeout);
    p.stdout.on("data",d=>stdout+=d);
    p.stderr.on("data",d=>stderr+=d);
    p.on("error",e=>{clearTimeout(timer);reject(e)});
    p.on("close",code=>{clearTimeout(timer);resolve({code,stdout:stdout.trim(),stderr:stderr.trim()})});
  });
}

export async function githubStatus() {
  try {
    const r=await run("gh",["auth","status","-h","github.com"],{timeout:20000});
    return {available:true,authenticated:r.code===0,stdout:r.stdout,stderr:r.stderr};
  } catch(e) {
    return {available:false,authenticated:false,error:String(e.message||e)};
  }
}

export async function acquireTarget(source,{progress=()=>{}}={}) {
  if (!source?.type) throw new Error("Target source type is required.");
  if (source.type === "local") {
    const root=path.resolve(source.value);
    if (!exists(root)) throw new Error(`Local project does not exist: ${root}`);
    return {type:"local",root,ownedClone:false};
  }
  if (source.type === "github") {
    const auth=await githubStatus();
    if (!auth.available || !auth.authenticated) {
      throw new Error("GitHub CLI is not authenticated. Run `gh auth login -h github.com --web` explicitly, then retry.");
    }
    const dest=path.join(CONFIG.reposDir,id("repo"));
    await ensureDir(dest);
    await fs.rmdir(dest).catch(()=>{});
    progress({stage:"target:clone",progress:5,message:`Cloning ${source.value}`});
    const r=await run("gh",["repo","clone",source.value,dest],{timeout:300000});
    if(r.code!==0) throw new Error(`Clone failed: ${r.stderr||r.stdout}`);
    return {type:"github",root:dest,ownedClone:true,repo:source.value};
  }
  if (source.type === "url") {
    return {type:"url",url:source.value,ownedClone:false};
  }
  throw new Error(`Unsupported target source: ${source.type}`);
}

export async function gitState(root) {
  const inside=await run("git",["rev-parse","--is-inside-work-tree"],{cwd:root,timeout:20000}).catch(()=>({code:1}));
  if(inside.code!==0) return {isGit:false};
  const [branch,head,status,remote]=await Promise.all([
    run("git",["branch","--show-current"],{cwd:root,timeout:20000}),
    run("git",["rev-parse","HEAD"],{cwd:root,timeout:20000}),
    run("git",["status","--porcelain=v1","--untracked-files=normal"],{cwd:root,timeout:30000}),
    run("git",["remote","-v"],{cwd:root,timeout:20000}),
  ]);
  return {
    isGit:true,branch:branch.stdout,head:head.stdout,
    clean:!status.stdout.trim(),status:status.stdout,remote:remote.stdout
  };
}

export { run };
