import fs from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "../config.mjs";
import { ensureDir, id, writeJson } from "../fs-utils.mjs";
import { run, gitState } from "../target/repo.mjs";

export async function createSafeWorktree(projectRoot, runDir, {progress=()=>{}}={}) {
  const state=await gitState(projectRoot);
  if(!state.isGit) throw new Error("Target project is not a Git repository. Safe automated execution requires Git.");
  if(!state.clean) throw new Error(`STOP: Target working tree is dirty.\n${state.status}`);
  const name=id("kk-frontend").replace(/[^a-z0-9-]/gi,"-").toLowerCase();
  const branch=`kk-frontend/${name}`;
  const dest=path.join(CONFIG.worktreesDir,name);
  await ensureDir(path.dirname(dest));
  progress({stage:"git:checkpoint",progress:10,message:`Creating isolated worktree from ${state.head}`});
  const r=await run("git",["worktree","add","-b",branch,dest,state.head],{cwd:projectRoot,timeout:120000});
  if(r.code!==0)throw new Error(`git worktree add failed: ${r.stderr||r.stdout}`);
  const checkpoint={createdAt:new Date().toISOString(),projectRoot,originalHead:state.head,originalBranch:state.branch,worktree:dest,branch};
  await writeJson(path.join(runDir,"rollback.json"),checkpoint);
  return checkpoint;
}

export async function removeWorktree(checkpoint,{force=false}={}) {
  const r=await run("git",["worktree","remove",checkpoint.worktree,...(force?["--force"]:[])],{cwd:checkpoint.projectRoot,timeout:120000});
  return {ok:r.code===0,...r};
}
