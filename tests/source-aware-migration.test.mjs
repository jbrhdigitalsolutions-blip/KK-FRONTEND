import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildSourceIntelligence } from "../src/target/source-intelligence.mjs";
import { buildDesignContract } from "../src/intelligence/design-contract.mjs";
import { buildComponentMap } from "../src/intelligence/component-map.mjs";
import { buildPlan } from "../src/intelligence/plan.mjs";

test("source-aware migration foundation maps existing components and creates bounded actions",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"kk-front-v05-"));
  await fs.mkdir(path.join(root,"src","components"),{recursive:true});
  await fs.mkdir(path.join(root,"src","pages"),{recursive:true});
  await fs.writeFile(path.join(root,"src","components","CustomerCard.tsx"),
    'import "./CustomerCard.css";\nexport function CustomerCard({customer,onOpen}) { return <button className="customer-card" onClick={()=>onOpen(customer.id)}>{customer.name}</button>; }\n');
  await fs.writeFile(path.join(root,"src","components","CustomerCard.css"),'.customer-card { padding: 16px; border-radius: 8px; }\n');
  await fs.writeFile(path.join(root,"src","pages","CustomersPage.tsx"),
    'import { CustomerCard } from "../components/CustomerCard";\nexport default function CustomersPage(){ return <main><CustomerCard customer={{id:1,name:"A"}} onOpen={()=>{}} /></main>; }\n');

  const sourceAudit={
    git:{head:"abc123",branch:"main",clean:true},technology:[{name:"React",evidence:"VERIFIED"}],packageManager:"pnpm",
    componentFiles:["src/components/CustomerCard.tsx","src/pages/CustomersPage.tsx"],
    styleFiles:["src/components/CustomerCard.css"],routeFiles:["src/pages/CustomersPage.tsx"],tokenFiles:[]
  };
  const intel=await buildSourceIntelligence(root,sourceAudit,path.join(root,"source-intelligence.json"));
  const customer=intel.components.find(x=>x.path==="src/components/CustomerCard.tsx");
  assert.ok(customer);
  assert.ok(customer.handlers.includes("onClick"));
  assert.ok(customer.styleImports.includes("src/components/CustomerCard.css"));
  assert.equal(customer.sha256.length,64);

  const auditRoot=path.join(root,"reference");
  await fs.mkdir(path.join(auditRoot,"routes","customers"),{recursive:true});
  await fs.writeFile(path.join(auditRoot,"shared-css.json"),JSON.stringify({breakpointsPx:[768],customProperties:{"--radius-card":"16px"},fontFaces:[],keyframes:[],pseudoStateRules:[]}));
  await fs.writeFile(path.join(auditRoot,"routes","customers","route.json"),JSON.stringify({
    url:"https://reference.test/customers",templateKey:"/customers",evidenceStatus:"VERIFIED",
    designTokens:{colors:[{value:"#111",count:3}],radii:[{value:"16px",count:2}],spacing:[{value:"24px",count:2}]}
  }));
  const audit={target:"https://reference.test",capturedAt:"2026-09-20T00:00:00Z",mode:"blueprint-fast",evidenceStatus:"VERIFIED",
    sharedCssFile:"shared-css.json",representativeRoutes:[{url:"https://reference.test/customers",file:"routes/customers/route.json"}],
    coverage:{globalBreakpointsPx:[768],uniqueVisualClusters:1,deepRepresentativesScanned:1}};
  await fs.writeFile(path.join(auditRoot,"audit.json"),JSON.stringify(audit));
  const catalog={entities:[{id:"ref-card",type:"component",route:"https://reference.test/customers",title:"Customer Card",selector:".customer-card",evidence:{status:"VERIFIED"}}]};
  const contract=await buildDesignContract({auditRoot,auditFile:path.join(auditRoot,"audit.json"),entityCatalog:catalog,outFile:path.join(root,"design-contract.json")});
  assert.equal(contract.confidence.implementationVisualSimilarityPercent,null);
  assert.deepEqual(contract.global.breakpointsPx.value,[768]);

  const map=await buildComponentMap({catalog,sourceIntelligence:intel,outFile:path.join(root,"component-map.json")});
  assert.equal(map.counts.mapped,1);
  assert.equal(map.mappings[0].target.path,"src/components/CustomerCard.tsx");
  assert.equal(map.mappings[0].mappingStatus,"INFERRED");

  const comparison={entries:[{id:"cmp-1",route:"https://reference.test/customers",category:"Layout/Elements",subcategory:"card",risk:"low",difference:"Card geometry differs",evidence:{status:"VERIFIED"}}]};
  await fs.writeFile(path.join(root,"comparison.json"),JSON.stringify(comparison));
  const plan=await buildPlan({comparisonFile:path.join(root,"comparison.json"),selectedIds:["cmp-1"],outDir:root,targetSourceAudit:sourceAudit,targetSourceIntelligence:intel,componentMap:map});
  assert.equal(plan.actions.length,1);
  assert.ok(plan.actions[0].allowedFiles.includes("src/components/CustomerCard.tsx"));
  assert.equal(plan.actions[0].requiresMapping,false);
  assert.equal(plan.actions[0].baselineHashes["src/components/CustomerCard.tsx"].length,64);
  await fs.rm(root,{recursive:true,force:true});
});
