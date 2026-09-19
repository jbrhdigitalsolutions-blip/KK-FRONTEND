import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildReferenceEntityCatalog } from "../src/intelligence/design-entities.mjs";
import { generateSelectionSource } from "../src/intelligence/source-generator.mjs";

test("design picker extracts section/text/animation and generates source",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"kk-front-picker-"));
  const routeDir=path.join(root,"routes","home");
  await fs.mkdir(path.join(routeDir,"profiles"),{recursive:true});
  await fs.mkdir(path.join(routeDir,"screenshots"),{recursive:true});
  await fs.writeFile(path.join(root,"audit.json"),JSON.stringify({
    target:"https://example.test",
    representativeRoutes:[{url:"https://example.test/",file:"routes/home/route.json"}]
  }));
  await fs.writeFile(path.join(routeDir,"route.json"),JSON.stringify({
    url:"https://example.test/",
    viewports:[{profile:{name:"desktop-1440x900",width:1440,height:900},file:"profiles/desktop.json",screenshot:"screenshots/desktop.png"}]
  }));
  await fs.writeFile(path.join(routeDir,"profiles","desktop.json"),JSON.stringify({
    profile:{name:"desktop-1440x900",width:1440,height:900},
    viewport:{width:1440,height:900,scrollWidth:1440,scrollHeight:1800},
    styles:[
      {display:"block","font-size":"56px",color:"rgb(255, 255, 255)"},
      {display:"flex","padding-top":"80px","padding-bottom":"80px","background-color":"rgb(10, 10, 10)"}
    ],
    elements:[
      {index:0,parentSelector:"body",selector:"main > section",tag:"section",role:null,accessibleName:"Hero",text:"Hero title",classes:["hero"],interactive:false,rect:{x:0,y:0,width:1440,height:700},styleId:1,attrs:{},pseudo:{}},
      {index:1,parentSelector:"main > section",selector:"main > section > h1",tag:"h1",role:null,accessibleName:"Hero title",text:"Hero title",classes:[],interactive:false,rect:{x:80,y:120,width:600,height:80},styleId:0,attrs:{},pseudo:{}}
    ],
    runtimeAnimations:[{id:"float",target:"main > section",playState:"running",playbackRate:1,currentTime:200,timing:{duration:8000,easing:"ease-in-out",iterations:Infinity},keyframes:[{offset:0,transform:"translateY(0px)"},{offset:1,transform:"translateY(-10px)"}]}]
  }));

  const catalog=await buildReferenceEntityCatalog({referenceRoot:root,outFile:path.join(root,"entities.json")});
  assert.ok(catalog.counts.section>=1);
  assert.ok(catalog.counts.text>=1);
  assert.ok(catalog.counts.animation>=1);

  const ids=catalog.entities.filter(e=>["section","text","animation"].includes(e.type)).slice(0,3).map(e=>e.id);
  const out=path.join(root,"generated");
  const gen=await generateSelectionSource({
    catalog,entityIds:ids,outDir:out,
    targetSourceAudit:{technology:[{name:"React"}],componentFiles:["src/Hero.jsx"],styleFiles:["src/app.css"]}
  });
  assert.equal(gen.framework,"react");
  assert.match(gen.preview.css,/padding-top: 80px/);
  assert.match(gen.preview.component,/ReferenceDesignSelection/);
  await fs.access(path.join(out,"generation.json"));
  await fs.rm(root,{recursive:true,force:true});
});
