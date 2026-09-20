import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareExecutionWorkspace, compareTrees } from "../src/execution/workspace.mjs";

test("non-Git project receives isolated safe-copy workspace",async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),"kkf-flex-")),project=path.join(base,"project"),runDir=path.join(base,"run");
  await fs.mkdir(project,{recursive:true});await fs.writeFile(path.join(project,"app.txt"),"before");
  const cp=await prepareExecutionWorkspace(project,runDir);
  assert.equal(cp.mode,"safe-copy");assert.equal(cp.originalUntouched,true);assert.notEqual(cp.worktree,project);
  await fs.writeFile(path.join(cp.worktree,"app.txt"),"after");
  assert.equal(await fs.readFile(path.join(project,"app.txt"),"utf8"),"before");
  const diff=await compareTrees(project,cp.worktree);assert.deepEqual(diff.changed,["app.txt"]);
});

test("UI exposes handoff, safe implementation and apply-back controls",async()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
  const html=await fs.readFile(path.join(root,"src","web","index.html"),"utf8");
  const js=await fs.readFile(path.join(root,"src","web","app.js"),"utf8");
  assert.match(html,/id="handoffBtn"/);assert.match(html,/id="applyLocalBtn"/);assert.match(html,/Git optional/);
  assert.match(js,/refreshExecutionCapability/);assert.match(js,/\/api\/handoff/);assert.match(js,/\/api\/apply-local/);
});
