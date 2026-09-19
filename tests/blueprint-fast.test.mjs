import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeDesignBlueprint } from "../src/intelligence/design-blueprint.mjs";

test("compact DESIGN.md includes verified anchors and exact-evidence references",async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"kkf-blueprint-"));
  await fs.mkdir(path.join(dir,"routes","home","profiles"),{recursive:true});
  await fs.mkdir(path.join(dir,"assets"),{recursive:true});

  const audit={
    target:"https://example.com",capturedAt:"2026-09-19T00:00:00Z",mode:"blueprint-fast",evidenceStatus:"VERIFIED",
    sharedCssFile:"shared-css.json",routeInventoryFile:"route-inventory.json",routeCoverageFile:"route-coverage.json",
    technology:[{name:"React",confidence:"INFERRED",evidence:"test"}],
    coverage:{rawRoutesDiscovered:2,designRouteTemplates:1,contentInstancesCollapsed:1,localeAliasesCollapsed:0,uniqueVisualClusters:1,deepRepresentativesScanned:1,globalBreakpointsPx:[768,1024]},
    representativeRoutes:[{url:"https://example.com",file:"routes/home/route.json"}],
    assets:{manifest:"assets/manifest.json",strategy:"inventory-only"},restrictions:[]
  };
  await fs.writeFile(path.join(dir,"audit.json"),JSON.stringify(audit));
  await fs.writeFile(path.join(dir,"shared-css.json"),JSON.stringify({breakpointsPx:[768,1024],customProperties:{"--bg":"#000"},fontFaces:[],mediaQueries:["(max-width: 768px)"],containerQueries:[],supportsQueries:[],keyframes:[],pseudoStateRules:[]}));
  await fs.writeFile(path.join(dir,"route-inventory.json"),JSON.stringify({routes:[{url:"https://example.com",templateKey:"/",instances:["https://example.com/song/x"],aliases:[]}]}));
  await fs.writeFile(path.join(dir,"route-coverage.json"),"[]");
  await fs.writeFile(path.join(dir,"assets","manifest.json"),JSON.stringify([{url:"https://example.com/logo.svg",type:"image",designAsset:true}]));

  const viewports=[
    ["phone-390x844",390,844,"phone.json","screenshots/phone.png"],
    ["tablet-820x1180",820,1180,"tablet.json","screenshots/tablet.png"],
    ["desktop-1440x900",1440,900,"desktop.json","screenshots/desktop.png"]
  ];
  await fs.writeFile(path.join(dir,"routes","home","route.json"),JSON.stringify({
    url:"https://example.com",templateKey:"/",clusterId:"cluster-1",evidenceStatus:"VERIFIED",
    designTokens:{colors:[{value:"#000",count:2}]},breakpoints:{all:[768,1024]},interactions:[],scrollBehavior:{},
    viewports:viewports.map(([name,width,height,file,screenshot])=>({profile:{name,width,height},file:`profiles/${file}`,screenshot}))
  }));
  for(const [name,width,height,file] of viewports){
    await fs.writeFile(path.join(dir,"routes","home","profiles",file),JSON.stringify({
      profile:{name,width,height},url:"https://example.com",
      viewport:{width,height,dpr:1,scrollWidth:width,scrollHeight:height+200,horizontalOverflow:0},
      counts:{rendered:2},styles:[{display:"block",color:"rgb(255,255,255)"}],
      elements:[{selector:"main",parentSelector:"body",tag:"main",role:"main",accessibleName:"",text:"Hello",interactive:false,rect:{x:0,y:0,width,height},styleId:0,attrs:{},pseudo:{}}],
      runtimeAnimations:[]
    }));
  }

  const out=path.join(dir,"DESIGN.md");
  const r=await writeDesignBlueprint({auditRoot:dir,auditFile:path.join(dir,"audit.json"),outFile:out});
  const txt=await fs.readFile(out,"utf8");
  assert.ok(r.bytes>0);
  assert.deepEqual(r.anchors,["phone-390x844","tablet-820x1180","desktop-1440x900"]);
  assert.match(txt,/Mandatory Coding-Agent Workflow/);
  assert.match(txt,/Route-by-Route Implementation Blueprint/);
  assert.match(txt,/machine\/shared-css\.json/);
  assert.match(txt,/phone-390x844/);
  assert.match(txt,/tablet-820x1180/);
  assert.match(txt,/desktop-1440x900/);
  assert.doesNotMatch(txt,/"anchors": \[\]/);
});
