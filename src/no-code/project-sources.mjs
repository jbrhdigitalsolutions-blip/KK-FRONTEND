const SECRET_PATH=/(^|\/)(\.env(?:\.|$)|id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx)|credentials?(?:\.|$)|secrets?(?:\.|$))/i;
const SKIP_PATH=/(^|\/)(node_modules|\.git|\.next|dist|build|coverage|\.cache|vendor|\.turbo)(\/|$)/i;
const TEXT_EXT=/\.(?:json|md|txt|html?|css|scss|sass|less|js|jsx|mjs|cjs|ts|tsx|vue|svelte|ya?ml|toml)$/i;
const ASSET_EXT=/\.(?:png|jpe?g|webp|avif|gif|svg|ico|mp4|webm|woff2?|ttf|otf)$/i;
const IMPORTANT=/(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|tsconfig[^/]*\.json|next\.config\.[^/]+|vite\.config\.[^/]+|tailwind\.config\.[^/]+|design[^/]*\.(?:md|json)|theme[^/]*\.(?:css|scss|json|ts)|tokens?[^/]*\.(?:css|scss|json|ts))$/i;

function clean(v,max=500){const s=String(v??"").trim();return s.length>max?s.slice(0,max):s}
function normalizePath(v){return String(v||"").replaceAll("\\","/").replace(/^\/+|\/+$/g,"")}
function safePath(path){const p=normalizePath(path);return Boolean(p)&&!SECRET_PATH.test(p)&&!SKIP_PATH.test(p)}
function apiHeaders(token=""){
  const h={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"KK-FRONTEND"};
  if(token)h.Authorization=`Bearer ${token}`;
  return h;
}
async function githubJson(url,token){
  const r=await fetch(url,{headers:apiHeaders(token),redirect:"follow"});
  if(!r.ok){
    const body=await r.text().catch(()=>"");
    throw new Error(`GitHub request failed (${r.status}): ${body.slice(0,280)||r.statusText}`);
  }
  return r.json();
}
export function parseGitHubRepoUrl(value){
  let url;
  try{url=new URL(String(value||"").trim())}catch{throw new Error("GitHub repository URL is invalid.");}
  if(!["github.com","www.github.com"].includes(url.hostname.toLowerCase()))throw new Error("Only github.com repository URLs are accepted.");
  const parts=url.pathname.replace(/^\/+|\/+$/g,"").split("/");
  if(parts.length<2)throw new Error("GitHub repository URL must include owner/repository.");
  const owner=parts[0],repo=parts[1].replace(/\.git$/i,"");
  if(!/^[A-Za-z0-9_.-]+$/.test(owner)||!/^[A-Za-z0-9_.-]+$/.test(repo))throw new Error("GitHub owner or repository name is invalid.");
  let ref="",subdir="";
  if(parts[2]==="tree"&&parts.length>=4){ref=decodeURIComponent(parts[3]);subdir=parts.slice(4).join("/");}
  return{owner,repo,ref,subdir,url:`https://github.com/${owner}/${repo}`};
}
function scorePath(path){
  const p=path.toLowerCase();let s=0;
  if(IMPORTANT.test(path))s+=100;
  if(/(^|\/)(app|pages|src|components|ui|views|screens|styles|public|assets)(\/|$)/.test(p))s+=35;
  if(/\.(tsx|jsx|vue|svelte)$/.test(p))s+=35;
  if(/\.(css|scss|sass|less)$/.test(p))s+=30;
  if(/\.(ts|js|mjs|cjs)$/.test(p))s+=20;
  if(/design|theme|token|brand|layout|page|header|nav|sidebar|footer|hero|home|index/.test(p))s+=24;
  if(/api|route\.ts$|server|migration|seed|test|spec/.test(p))s-=12;
  return s;
}
function decodeBlob(row){
  if(row.encoding!=="base64")return"";
  try{return Buffer.from(String(row.content||"").replace(/\n/g,""),"base64").toString("utf8");}catch{return""}
}
export async function scanGitHubProject({url,token="",ref=""}={}){
  const parsed=parseGitHubRepoUrl(url);
  const secret=String(token||"");
  const repo=await githubJson(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,secret);
  const branch=clean(ref||parsed.ref||repo.default_branch,220);
  const tree=await githubJson(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,secret);
  const all=(tree.tree||[]).filter(x=>x.type==="blob"&&safePath(x.path));
  const subdir=normalizePath(parsed.subdir);
  const scoped=subdir?all.filter(x=>x.path===subdir||x.path.startsWith(subdir+"/")):all;
  const candidates=scoped.filter(x=>TEXT_EXT.test(x.path)&&Number(x.size||0)<=300_000)
    .sort((a,b)=>scorePath(b.path)-scorePath(a.path)||Number(a.size||0)-Number(b.size||0));
  const maxTextFiles=secret?120:45;
  const selected=[];let budget=0;
  for(const row of candidates){
    if(selected.length>=maxTextFiles)break;
    if(budget+Number(row.size||0)>3_000_000&&!IMPORTANT.test(row.path))continue;
    selected.push(row);budget+=Number(row.size||0);
  }
  const files=[];
  let readBytes=0;
  for(const row of selected){
    const blob=await githubJson(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/blobs/${row.sha}`,secret);
    const body=decodeBlob(blob);
    readBytes+=Buffer.byteLength(body,"utf8");
    files.push({path:row.path,name:row.path.split("/").pop(),size:Number(row.size||0),type:"text/plain",text:body});
  }
  const assetRows=scoped.filter(x=>ASSET_EXT.test(x.path)).slice(0,600);
  for(const row of assetRows){
    files.push({path:row.path,name:row.path.split("/").pop(),size:Number(row.size||0),type:"application/octet-stream",text:""});
  }
  return{
    schema:"kk-project-github-scan/v1",
    repository:{url:parsed.url,owner:parsed.owner,name:parsed.repo,private:Boolean(repo.private),defaultBranch:repo.default_branch,branch,subdir,headTree:tree.sha||null},
    coverage:{treeFiles:scoped.length,textFilesRead:selected.length,textBytesRead:readBytes,assetFilesIndexed:assetRows.length,truncated:Boolean(tree.truncated),maxTextFiles,maxTextBytes:3_000_000},
    files,
    authentication:{used:Boolean(secret),persisted:false},
  };
}
