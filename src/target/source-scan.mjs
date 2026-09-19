import fs from "node:fs/promises";
import path from "node:path";
import { listFiles, rel, writeJson } from "../fs-utils.mjs";
import { gitState } from "./repo.mjs";

const TEXT_EXT = new Set([".js",".jsx",".ts",".tsx",".mjs",".cjs",".css",".scss",".sass",".less",".html",".vue",".svelte",".json",".md"]);

function detectPackageManager(files) {
  const names=new Set(files.map(f=>path.basename(f)));
  if(names.has("pnpm-lock.yaml"))return"pnpm";
  if(names.has("yarn.lock"))return"yarn";
  if(names.has("bun.lockb")||names.has("bun.lock"))return"bun";
  if(names.has("package-lock.json"))return"npm";
  return null;
}

function frameworkFrom(pkg={}) {
  const d={...(pkg.dependencies||{}),...(pkg.devDependencies||{})};
  const found=[];
  const add=(name,key=name)=>{if(d[key])found.push({name,version:d[key],evidence:"VERIFIED"})};
  add("Next.js","next"); add("React","react"); add("Vue","vue"); add("Nuxt","nuxt"); add("Svelte","svelte");
  add("Angular","@angular/core"); add("Vite","vite"); add("Tailwind CSS","tailwindcss");
  add("Material UI","@mui/material"); add("Radix UI","@radix-ui/react-dialog");
  add("Framer Motion","framer-motion"); add("GSAP","gsap");
  return found;
}

async function readSafe(file,max=2_000_000){const b=await fs.readFile(file);return b.length>max?"":b.toString("utf8")}

export async function scanSourceProject(root,outFile,{progress=()=>{}}={}) {
  progress({stage:"source:files",progress:8,message:"Indexing target source files"});
  const files=await listFiles(root,{maxFiles:30000});
  const pkgFile=files.find(f=>path.basename(f)==="package.json");
  let pkg={};
  if(pkgFile){try{pkg=JSON.parse(await fs.readFile(pkgFile,"utf8"))}catch{}}
  const pm=detectPackageManager(files);
  const routeFiles=[],componentFiles=[],styleFiles=[],configFiles=[],tokenFiles=[];
  const cssVars=new Map(), imports=new Map(), routeHints=new Set();

  let i=0;
  for(const file of files){
    i++;
    if(i%250===0)progress({stage:"source:analyze",progress:10+Math.round((i/files.length)*55),message:`Analyzing ${i}/${files.length}`});
    const r=rel(root,file), ext=path.extname(file).toLowerCase();
    const base=path.basename(file);
    if(/(?:^|\/)(?:app|pages|routes|router)(?:\/|$)/i.test(r)&&TEXT_EXT.has(ext))routeFiles.push(r);
    if(/\.(?:tsx|jsx|vue|svelte)$/i.test(file)&&/(?:component|components|ui|view|screen|page)/i.test(r))componentFiles.push(r);
    if(/\.(?:css|scss|sass|less)$/i.test(file))styleFiles.push(r);
    if(/(?:vite|next|nuxt|webpack|tailwind|tsconfig|eslint|playwright|vitest|jest).*?\.(?:js|mjs|cjs|ts|json)$/i.test(base))configFiles.push(r);
    if(/token|theme|design-system|variables/i.test(r))tokenFiles.push(r);
    if(!TEXT_EXT.has(ext))continue;
    const txt=await readSafe(file);
    if(!txt)continue;

    for(const m of txt.matchAll(/--([a-z0-9-_]+)\s*:\s*([^;}{]+)/gi)){
      const k=`--${m[1]}`; if(!cssVars.has(k))cssVars.set(k,{value:m[2].trim(),files:[]}); if(cssVars.get(k).files.length<10)cssVars.get(k).files.push(r);
    }
    const im=[...txt.matchAll(/(?:import|require)\s*(?:\(|[^"'`]*from\s*)?["'`]([^"'`]+)["'`]/g)].map(m=>m[1]);
    if(im.length)imports.set(r,im.slice(0,200));

    for(const m of txt.matchAll(/["'`](\/[A-Za-z0-9_~@.+\-/:?=&%[\]]{1,180})["'`]/g)){
      const s=m[1]; if(!/\.(?:png|jpg|css|js|svg|woff|mp4|mp3)$/i.test(s))routeHints.add(s);
    }
  }

  const git=await gitState(root);
  const result={
    schema:"kk-frontend-source-audit/v1",
    root,git,
    packageManager:pm,
    packageJson:pkgFile?{
      name:pkg.name||null,version:pkg.version||null,
      engines:pkg.engines||null,scripts:pkg.scripts||{},
      dependencies:pkg.dependencies||{},devDependencies:pkg.devDependencies||{}
    }:null,
    technology:frameworkFrom(pkg),
    counts:{files:files.length,routeFiles:routeFiles.length,componentFiles:componentFiles.length,styleFiles:styleFiles.length},
    routeFiles:routeFiles.slice(0,3000),
    componentFiles:componentFiles.slice(0,5000),
    styleFiles:styleFiles.slice(0,3000),
    configFiles:configFiles.slice(0,1000),
    tokenFiles:tokenFiles.slice(0,1000),
    cssCustomProperties:[...cssVars.entries()].map(([name,v])=>({name,...v})).slice(0,5000),
    routeHints:[...routeHints].slice(0,5000),
    imports:Object.fromEntries([...imports.entries()].slice(0,5000)),
    evidenceStatus:"VERIFIED"
  };
  await writeJson(outFile,result);
  progress({stage:"source:done",progress:70,message:"Source scan complete"});
  return result;
}
