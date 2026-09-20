import path from "node:path";
import { run, gitState } from "../target/repo.mjs";
import { writeJson } from "../fs-utils.mjs";

function pmExecutable(pm) {
  if (process.platform === "win32" && ["npm","pnpm","yarn"].includes(pm)) return pm+".cmd";
  return pm;
}
function cmdFor(pm,script){
  const exe = pmExecutable(pm);
  if(pm==="npm"||pm==="bun") return [exe,["run",script]];
  return [exe,[script]];
}
function verificationScripts(scripts,changedFiles,migrationPlan){
  if(!changedFiles?.length)return["lint","typecheck","test","build"].filter(s=>scripts[s]);
  const runtimeExt=new Set([".js",".jsx",".ts",".tsx",".mjs",".cjs",".vue",".svelte"]);
  const hasRuntime=changedFiles.some(f=>runtimeExt.has(path.extname(f).toLowerCase()));
  const hasFrontend=changedFiles.some(f=>runtimeExt.has(path.extname(f).toLowerCase())||[".css",".scss",".sass",".less",".html"].includes(path.extname(f).toLowerCase()));
  const out=[];
  if(scripts.lint)out.push("lint");
  if(hasRuntime&&scripts.typecheck)out.push("typecheck");
  if(hasRuntime&&scripts.test)out.push("test");
  if(hasFrontend&&scripts.build)out.push("build");
  if(migrationPlan?.risk==="high"&&scripts.test&&!out.includes("test"))out.push("test");
  return out;
}

export async function verifyProject({root,sourceAudit,runDir,progress=()=>{},migrationPlan=null,changedFiles=[]}){
  const scripts=sourceAudit?.packageJson?.scripts||{};
  const pm=sourceAudit?.packageManager||"npm";
  const ordered=verificationScripts(scripts,changedFiles,migrationPlan);
  const results=[];
  let i=0;
  for(const script of ordered){
    i++;
    progress({stage:"verify",progress:20+Math.round((i/Math.max(ordered.length,1))*65),message:pm+" "+script});
    const [cmd,args]=cmdFor(pm,script);
    const r=await run(cmd,args,{cwd:root,timeout:script==="build"?900000:600000});
    results.push({script,command:[cmd,...args].join(" "),exitCode:r.code,stdout:r.stdout.slice(-20000),stderr:r.stderr.slice(-20000)});
    if(r.code!==0)break;
  }
  const gs=await gitState(root);
  if(gs.isGit){
    const git=await run("git",["diff","--check"],{cwd:root,timeout:60000});
    results.push({script:"git-diff-check",command:"git diff --check",exitCode:git.code,stdout:git.stdout,stderr:git.stderr});
  }else{
    results.push({script:"workspace-safety",command:"non-Git safe workspace integrity",exitCode:0,stdout:"Git diff check not applicable; execution occurred in an isolated safe copy.",stderr:""});
  }
  const verification={
    schema:"kk-frontend-verification/v2",
    verifiedAt:new Date().toISOString(),
    passed:results.every(r=>r.exitCode===0),
    scope:{changedFiles,planRisk:migrationPlan?.risk||null,scriptsRun:ordered},
    results
  };
  await writeJson(path.join(runDir,"verification.json"),verification);
  return verification;
}
