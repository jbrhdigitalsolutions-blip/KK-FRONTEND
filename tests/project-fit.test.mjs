import test from "node:test";
import assert from "node:assert/strict";
import { analyzeProjectContext, integrationSupportFiles, newProjectSupportFiles } from "../src/no-code/project-fit.mjs";

function reactFiles(){
  return [
    {
      path:"package.json",
      name:"package.json",
      size:240,
      type:"application/json",
      text:JSON.stringify({
        name:"acme-app",
        packageManager:"pnpm@10.28.0",
        scripts:{dev:"vite"},
        dependencies:{react:"19.0.0","react-dom":"19.0.0",vite:"7.0.0"}
      })
    },
    {path:"pnpm-lock.yaml",name:"pnpm-lock.yaml",size:20,type:"text/plain",text:"lockfileVersion: '9.0'"},
    {path:"src/App.jsx",name:"App.jsx",size:20,type:"text/javascript",text:"export default function App(){}"},
    {path:"src/styles.css",name:"styles.css",size:20,type:"text/css",text:":root{--brand:#fff}"},
    {path:"DESIGN.md",name:"DESIGN.md",size:20,type:"text/markdown",text:"# Existing design"},
    {path:"public/logo.svg",name:"logo.svg",size:100,type:"image/svg+xml",text:""},
    {path:"public/hero.webp",name:"hero.webp",size:100,type:"image/webp",text:""},
    {path:".env",name:".env",size:20,type:"text/plain",text:"SECRET=do-not-read"},
    {path:"node_modules/x.js",name:"x.js",size:20,type:"text/javascript",text:"bad"}
  ];
}

test("project fit detects React, pnpm, design docs and public assets",()=>{
  const profile=analyzeProjectContext({
    mode:"existing",
    stack:"auto",
    files:reactFiles(),
    brand:"Acme",
    heroTitle:"Make work simpler",
    heroBody:"One workspace for the team.",
    primaryCta:"Start free",
    navItems:"Product, Pricing, Docs"
  });
  assert.equal(profile.schema,"kk-project-fit/v1");
  assert.equal(profile.stack,"react");
  assert.equal(profile.supportedOutput,"react");
  assert.equal(profile.packageManager,"pnpm");
  assert.equal(profile.projectName,"acme-app");
  assert.equal(profile.assetMap.logoAsset,"/logo.svg");
  assert.equal(profile.assetMap.heroAsset,"/hero.webp");
  assert.ok(profile.files.designDocs.includes("DESIGN.md"));
  assert.equal(profile.files.textFiles.includes(".env"),false);
  assert.equal(profile.files.sourceFiles.some(x=>x.includes("node_modules")),false);
  assert.equal(profile.readiness.accurateReady,true);
  assert.ok(profile.readiness.score>=75);
});

test("project fit asks only for missing accuracy information",()=>{
  const profile=analyzeProjectContext({mode:"new",stack:"react",projectName:"New app"});
  const ids=profile.readiness.questions.map(x=>x.id);
  assert.ok(ids.includes("brand"));
  assert.ok(ids.includes("heroTitle"));
  assert.ok(ids.includes("heroBody"));
  assert.ok(ids.includes("primaryCta"));
  assert.ok(ids.includes("navItems"));
  assert.equal(profile.packageManager,"pnpm");
  assert.equal(profile.readiness.accurateReady,false);
});

test("existing project patch support creates Windows and macOS backup installers",()=>{
  const profile=analyzeProjectContext({
    mode:"existing",stack:"react",files:reactFiles(),
    brand:"Acme",heroTitle:"Hero",heroBody:"Body",primaryCta:"Go",navItems:"One,Two"
  });
  const support=integrationSupportFiles(profile,[
    {path:"src/components/ReferenceDesign.jsx",content:"x"},
    {path:"src/components/ReferenceDesign.css",content:"y"}
  ]);
  const paths=support.map(x=>x.path);
  assert.ok(paths.includes("APPLY-WINDOWS.ps1"));
  assert.ok(paths.includes("APPLY-MAC.command"));
  assert.ok(paths.includes("PATCH-MANIFEST.json"));
  assert.match(support.find(x=>x.path==="APPLY-WINDOWS.ps1").content,/\.kk-frontend-backup/);
  assert.match(support.find(x=>x.path==="APPLY-MAC.command").content,/\.kk-frontend-backup/);
});

test("new project support emits cross-platform setup instructions",()=>{
  const profile=analyzeProjectContext({
    mode:"new",stack:"next",projectName:"Fresh",
    brand:"Fresh",heroTitle:"Hero",heroBody:"Body",primaryCta:"Go",navItems:"One,Two"
  });
  const files=newProjectSupportFiles(profile);
  const paths=files.map(x=>x.path);
  assert.ok(paths.includes("SETUP-WINDOWS.ps1"));
  assert.ok(paths.includes("SETUP-MAC.command"));
  assert.ok(paths.includes("RUN.md"));
  assert.match(files.find(x=>x.path==="SETUP-WINDOWS.ps1").content,/Node\.js 22\+/);
  assert.match(files.find(x=>x.path==="RUN.md").content,/Windows 10\/11/);
  assert.match(files.find(x=>x.path==="RUN.md").content,/macOS 12\+/);
});

test("unsupported target stack blocks accurate-ready claim",()=>{
  const profile=analyzeProjectContext({
    mode:"existing",
    stack:"vue",
    files:[{path:"package.json",name:"package.json",text:'{"dependencies":{"vue":"3.5.0"}}'}],
    brand:"X",heroTitle:"H",heroBody:"B",primaryCta:"Go",navItems:"One"
  });
  assert.equal(profile.readiness.accurateReady,false);
  assert.ok(profile.readiness.blockers.some(x=>/vue/i.test(x)));
});
