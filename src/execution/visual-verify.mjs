import fs from "node:fs/promises";
import path from "node:path";
import { buildComparison } from "../intelligence/compare.mjs";
import { writeJson } from "../fs-utils.mjs";

function routeKey(v){try{return new URL(v).pathname.replace(/\/+$/,"")||"/"}catch{return String(v||"")}}
function signature(e){return [routeKey(e.route),String(e.category||""),String(e.subcategory||"")].join("|")}
export function evaluateSelectedResolution(before,after,selectedIds){
  const selected=(before?.entries||[]).filter(e=>selectedIds.includes(e.id));
  const afterBySignature=new Map();
  for(const e of after?.entries||[]){
    const key=signature(e);
    if(!afterBySignature.has(key))afterBySignature.set(key,[]);
    afterBySignature.get(key).push(e);
  }
  const checks=selected.map(e=>{
    const remaining=afterBySignature.get(signature(e))||[];
    return{comparisonId:e.id,route:e.route,category:e.category,subcategory:e.subcategory,resolved:remaining.length===0,remaining:remaining.slice(0,5)};
  });
  return{selected:checks.length,resolved:checks.filter(x=>x.resolved).length,unresolved:checks.filter(x=>!x.resolved).length,checks,passed:checks.length>0&&checks.every(x=>x.resolved)};
}
export async function verifyVisualMigration({referenceRoot,afterRuntimeRoot,beforeComparisonFile,selectedIds,outDir,progress=()=>{}}){
  await fs.mkdir(outDir,{recursive:true});
  const afterFile=path.join(outDir,"comparison-after.json");
  const after=await buildComparison({referenceRoot,targetRoot:afterRuntimeRoot,outFile:afterFile,progress});
  const before=JSON.parse(await fs.readFile(beforeComparisonFile,"utf8"));
  const resolution=evaluateSelectedResolution(before,after,selectedIds);
  const pixelDiffs=(after.visualDiffs||[]).map(v=>({route:v.route,viewport:v.viewport,pct:v.pct,mismatched:v.mismatched,total:v.total,diffScreenshot:v.diffScreenshot}));
  const result={
    schema:"kk-frontend-visual-verification/v1",verifiedAt:new Date().toISOString(),
    passed:resolution.passed,
    selectedResolution:resolution,
    visualDiffs:pixelDiffs,
    note:"PASS means the selected comparison signatures no longer appear in the AFTER scan. Pixel mismatch is supporting evidence and is not treated as semantic business-content equality."
  };
  await writeJson(path.join(outDir,"visual-verification.json"),result);
  return result;
}
