import fs from "node:fs/promises";
import path from "node:path";
import { writeJson, writeText } from "../fs-utils.mjs";

export async function buildPlan({comparisonFile,selectedIds,outDir,targetSourceAudit=null}){
  const comparison=JSON.parse(await fs.readFile(comparisonFile,"utf8"));
  const selected=(comparison.entries||[]).filter(e=>selectedIds.includes(e.id));
  const categories=[...new Set(selected.map(e=>e.category))];
  const routes=[...new Set(selected.map(e=>e.route))];
  const risk=selected.some(e=>e.risk==="high")?"high":selected.some(e=>e.risk==="medium")?"medium":"low";
  const plan={
    schema:"kk-frontend-implementation-plan/v1",
    createdAt:new Date().toISOString(),
    selectedComparisonIds:selectedIds,
    selectedCount:selected.length,
    affectedRoutes:routes,
    categories,
    risk,
    preserve:["backend/API behavior","routes","business logic","authentication","permissions","form submissions","data/state","navigation","analytics","integrations","accessibility behavior"],
    dependencyPolicy:"Reuse existing equivalent dependencies first. Any new dependency requires explicit plan entry and compatibility/license review.",
    executionMode:"external-agent-or-explicit-patch-actions",
    actions:[],
    note:"No source mutation occurs until the user explicitly approves execution. This plan intentionally does not invent code edits from runtime evidence alone.",
    evidence:selected.map(e=>({id:e.id,route:e.route,category:e.category,difference:e.difference,evidence:e.evidence}))
  };
  await writeJson(path.join(outDir,"selected-upgrades.json"),{selectedIds,selected});
  await writeJson(path.join(outDir,"implementation-plan.json"),plan);

  const agentTask=`# KK-FRONTEND Approved Upgrade Task

You are operating inside a KK-FRONTEND isolated execution workspace. It may be a Git worktree or a protected non-Git safe copy.

## Non-negotiable preservation
- Preserve backend/API behavior, routes, business logic, auth, permissions, forms, data/state, navigation, analytics, integrations and accessibility behavior.
- Do not copy proprietary source code or unauthorized assets from the reference.
- Reuse target tokens/shared components before adding new components or dependencies.
- Do not push, deploy, reset, clean, or modify unrelated files. Commit only if the execution workspace explicitly uses Git and the system/user requests it.
- Every implemented change must trace to the selected evidence below.
- Run the project's relevant tests/typecheck/build after changes.
- Stop on unsafe ambiguity.

## Reference design evidence

If present, read \`DESIGN-PACK/DESIGN.md\`, \`DESIGN-PACK/PACK-MANIFEST.json\`, route/profile JSON and screenshots before implementing visual changes.

## Selected evidence

${selected.map(e=>`### ${e.id} — ${e.route} — ${e.category}/${e.subcategory}
Reference: ${JSON.stringify(e.reference)}
Target: ${JSON.stringify(e.target)}
Difference: ${e.difference}
Evidence: ${JSON.stringify(e.evidence)}
`).join("\n")}

## Required output
Implement only the approved frontend changes. Then write \`KK-FRONTEND-AGENT-RESULT.json\` containing:
- changedFiles
- commandsRun
- tests
- warnings
- unresolved
- rollbackNotes
`;
  await writeText(path.join(outDir,"AGENT-TASK.md"),agentTask);
  return plan;
}
