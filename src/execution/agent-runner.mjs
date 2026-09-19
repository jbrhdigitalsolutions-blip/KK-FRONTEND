import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { CONFIG } from "../config.mjs";
import { writeJson } from "../fs-utils.mjs";

function render(v,vars){return String(v).replaceAll("{taskFile}",vars.taskFile).replaceAll("{projectRoot}",vars.projectRoot)}

export async function runConfiguredAgent({worktree,taskFile,runDir,progress=()=>{}}){
  if(!CONFIG.agent.command){
    throw new Error("No coding agent configured. Set KK_FRONTEND_AGENT_COMMAND and KK_FRONTEND_AGENT_ARGS_JSON, restart KK-FRONTEND, then execute.");
  }
  const args=CONFIG.agent.args.map(a=>render(a,{taskFile,projectRoot:worktree}));
  progress({stage:"execute:agent",progress:30,message:`Launching configured coding agent: ${CONFIG.agent.command}`});
  return await new Promise((resolve,reject)=>{
    const p=spawn(CONFIG.agent.command,args,{cwd:worktree,shell:false,windowsHide:false,env:process.env});
    const log=[];
    const push=(stream,d)=>{const s=d.toString();log.push({at:new Date().toISOString(),stream,text:s});progress({stage:"execute:agent",progress:45,message:s.slice(-400)})};
    p.stdout?.on("data",d=>push("stdout",d));
    p.stderr?.on("data",d=>push("stderr",d));
    p.on("error",reject);
    p.on("close",async code=>{
      await writeJson(path.join(runDir,"logs","agent.json"),{command:CONFIG.agent.command,args,code,log});
      if(code!==0)return reject(new Error(`Coding agent exited ${code}`));
      resolve({code,logFile:"logs/agent.json"});
    });
  });
}
