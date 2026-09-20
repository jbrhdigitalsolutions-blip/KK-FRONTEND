import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileManifest, applySafeCopyToOriginal, rollbackSafeCopyApply } from "../src/execution/workspace.mjs";
import { verifyPlanBaseline, validateChangedFileScope } from "../src/execution/migration-guard.mjs";
import { evaluateSelectedResolution } from "../src/execution/visual-verify.mjs";

async function makePair(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"kk-front-safe-"));
  const original=path.join(root,"original"),worktree=path.join(root,"workspace"),runDir=path.join(root,"run");
  await fs.mkdir(path.join(original,"src"),{recursive:true});
  await fs.writeFile(path.join(original,"src","card.css"),"a{padding:8px}\n");
  await fs.cp(original,worktree,{recursive:true});
  await fs.mkdir(runDir,{recursive:true});
  await fs.writeFile(path.join(runDir,"local-original-manifest.json"),JSON.stringify(await fileManifest(original),null,2));
  return{root,original,worktree,runDir,checkpoint:{mode:"safe-copy",originalRoot:original,worktree}};
}

test("safe-copy apply verifies backup and rollback hashes",async()=>{
  const x=await makePair();
  await fs.writeFile(path.join(x.worktree,"src","card.css"),"a{padding:24px}\n");
  const result=await applySafeCopyToOriginal(x.checkpoint,x.runDir);
  assert.equal(await fs.readFile(path.join(x.original,"src","card.css"),"utf8"),"a{padding:24px}\n");
  assert.equal(result.backupVerified,true);
  const rb=await rollbackSafeCopyApply(result,x.checkpoint);
  assert.equal(rb.passed,true);
  assert.equal(await fs.readFile(path.join(x.original,"src","card.css"),"utf8"),"a{padding:8px}\n");
  await fs.rm(x.root,{recursive:true,force:true});
});

test("safe-copy apply stops if original changed after checkpoint",async()=>{
  const x=await makePair();
  await fs.writeFile(path.join(x.worktree,"src","card.css"),"a{padding:24px}\n");
  await fs.writeFile(path.join(x.original,"src","card.css"),"a{padding:99px}\n");
  await assert.rejects(()=>applySafeCopyToOriginal(x.checkpoint,x.runDir),/changed after execution checkpoint/i);
  await fs.rm(x.root,{recursive:true,force:true});
});

test("migration guard enforces baseline and allowed file scope",async()=>{
  const x=await makePair();
  const manifest=await fileManifest(x.worktree);
  const hash=manifest.find(r=>r.path==="src/card.css").sha256;
  const plan={actions:[{allowedFiles:["src/card.css"],baselineHashes:{"src/card.css":hash}}]};
  await verifyPlanBaseline(x.worktree,plan);
  await fs.writeFile(path.join(x.worktree,"src","card.css"),"a{padding:24px}\n");
  const ok=await validateChangedFileScope(x.checkpoint,plan);
  assert.deepEqual(ok.changedFiles,["src/card.css"]);
  await fs.writeFile(path.join(x.worktree,"src","evil.js"),"console.log(1)\n");
  await assert.rejects(()=>validateChangedFileScope(x.checkpoint,plan),/outside approved migration scope/i);
  await fs.rm(x.root,{recursive:true,force:true});
});

test("visual resolution distinguishes selected comparison removal",()=>{
  const before={entries:[{id:"c1",route:"https://ref.test/a",category:"Design Tokens",subcategory:"colors"}]};
  const after={entries:[]};
  const r=evaluateSelectedResolution(before,after,["c1"]);
  assert.equal(r.passed,true);
  assert.equal(r.resolved,1);
});
