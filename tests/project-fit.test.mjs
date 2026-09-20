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
    {path:"src/App.jsx",name:"App.jsx",size:80,type:"text/javascript",text:'import Header from "./Header"; import Hero from "./Hero"; export default function App(){return <><Header/><Hero/></>}'},
    {path:"src/Header.jsx",name:"Header.jsx",size:80,type:"text/javascript",text:'export default function Header(){return <header><nav>Product Pricing Docs</nav></header>}'},
    {path:"src/Hero.jsx",name:"Hero.jsx",size:80,type:"text/javascript",text:'export default function Hero(){return <main><h1>Make work simpler</h1><button>Start free</button></main>}'},
    {path:"src/Card.jsx",name:"Card.jsx",size:50,type:"text/javascript",text:'export default function Card(){return <article>Feature card</article>}'},
    {path:"src/Footer.jsx",name:"Footer.jsx",size:50,type:"text/javascript",text:'export default function Footer(){return <footer>Acme</footer>}'},
    {path:"src/Nav.jsx",name:"Nav.jsx",size:50,type:"text/javascript",text:'export default function Nav(){return <nav>Navigation</nav>}'},
    {path:"src/Layout.jsx",name:"Layout.jsx",size:50,type:"text/javascript",text:'export default function Layout(){return <div>Workspace</div>}'},
    {path:"src/CTA.jsx",name:"CTA.jsx",size:50,type:"text/javascript",text:'export default function CTA(){return <button>Start free</button>}'},
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
  assert.ok(profile.readiness.score>=85);
});

test("project fit asks only for missing accuracy information",()=>{
  const profile=analyzeProjectContext({mode:"new",stack:"react",projectName:"New app"});
  const ids=profile.readiness.questions.map(x=>x.id);
  assert.equal(ids.includes("brand"),false,"project name is a valid brand fallback for a new project");
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


test("new standalone HTML support does not require Node or package installation",()=>{
  const profile=analyzeProjectContext({
    mode:"new",stack:"html",projectName:"Static",
    brand:"Static",heroTitle:"Hero",heroBody:"Body",primaryCta:"Open",navItems:"One,Two",
    heroAsset:"/hero.webp"
  });
  const files=newProjectSupportFiles(profile);
  const paths=files.map(x=>x.path);
  assert.ok(paths.includes("START-WINDOWS.ps1"));
  assert.ok(paths.includes("START-MAC.command"));
  assert.ok(paths.includes("RUN.md"));
  assert.equal(paths.includes("SETUP-WINDOWS.ps1"),false);
  assert.match(files.find(x=>x.path==="RUN.md").content,/modern browser/i);
});


test("monorepo Next.js project keeps its frontend package root and detects nested routes",()=>{
  const files=[
    {path:"package.json",name:"package.json",text:JSON.stringify({name:"root",workspaces:["web"]})},
    {path:"web/package.json",name:"package.json",text:JSON.stringify({name:"@acme/web",dependencies:{next:"16.0.0",react:"19.0.0"},devDependencies:{typescript:"5.9.0"}})},
    {path:"web/app/page.tsx",name:"page.tsx",text:"export default function Page(){return <main>Home</main>}"},
    {path:"web/app/pricing/page.tsx",name:"page.tsx",text:"export default function Page(){return <main>Pricing</main>}"},
    {path:"web/components/Header.tsx",name:"Header.tsx",text:"export function Header(){return <header>Header</header>}"},
    {path:"web/components/Hero.tsx",name:"Hero.tsx",text:"export function Hero(){return <section>Hero</section>}"},
    {path:"web/components/Nav.tsx",name:"Nav.tsx",text:"export function Nav(){return <nav>Nav</nav>}"},
    {path:"web/components/Card.tsx",name:"Card.tsx",text:"export function Card(){return <article>Card</article>}"},
    {path:"web/components/Footer.tsx",name:"Footer.tsx",text:"export function Footer(){return <footer>Footer</footer>}"},
    {path:"web/components/Form.tsx",name:"Form.tsx",text:"export function Form(){return <form><input/></form>}"},
    {path:"web/styles/globals.css",name:"globals.css",text:"body{margin:0}"},
    {path:"web/DESIGN.md",name:"DESIGN.md",text:"# Design"},
    {path:"web/public/logo.svg",name:"logo.svg",size:100,type:"image/svg+xml",text:""},
  ];
  const profile=analyzeProjectContext({
    mode:"existing",stack:"auto",files,targetRoute:"/pricing",
    brand:"Acme",heroTitle:"Build better",heroBody:"Project content",primaryCta:"Start",navItems:"Product, Pricing"
  });
  assert.equal(profile.stack,"next");
  assert.equal(profile.packageRoot,"web");
  assert.equal(profile.packageJsonPath,"web/package.json");
  assert.ok(profile.routes.includes("/"));
  assert.ok(profile.routes.includes("/pricing"));
  assert.equal(profile.targetPath,"web/app/pricing/page.tsx");
  assert.equal(profile.readiness.sourceDepth,true);
  assert.equal(profile.readiness.accurateReady,true);
});

test("live website and GitHub evidence contribute separately to project readiness",()=>{
  const profile=analyzeProjectContext({
    mode:"existing",stack:"react",files:reactFiles(),
    githubEvidence:{schema:"kk-project-github-scan/v1",repository:{url:"https://github.com/acme/app"}},
    websiteEvidence:{
      schema:"kk-project-website-scan/v1",url:"https://acme.example/",
      title:"Acme",description:"Operate faster",headings:["Build with Acme"],buttons:["Start free"],
      navItems:["Product","Pricing"],paragraphs:["Run your workflow."],images:[{src:"/hero.webp"}]
    }
  });
  assert.equal(profile.readiness.github,true);
  assert.equal(profile.readiness.website,true);
  assert.equal(profile.content.heroTitle,"Build with Acme");
  assert.equal(profile.content.primaryCta,"Start free");
  assert.ok(profile.readiness.score>=90);
});
