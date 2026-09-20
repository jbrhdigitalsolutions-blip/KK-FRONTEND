import { writeJson } from "../fs-utils.mjs";

const STOP=new Set(["the","and","with","from","into","this","that","component","section","text","animation","main","page","item"]);
function tokens(v){return [...new Set(String(v||"").toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>=3&&!STOP.has(x)))]}
function roleFromReference(e){
  const s=(String(e.title||"")+" "+String(e.selector||"")+" "+String(e.type||"")).toLowerCase();
  for(const r of ["sidebar","navigation","header","footer","card","button","form","table","dialog","dashboard","list","detail","hero","search"])if(s.includes(r))return r;
  return e.type==="section"?"layout":e.type==="animation"?"animation":e.type==="text"?"typography":"component";
}
function score(ref,target){
  const rt=new Set(tokens((ref.title||"")+" "+(ref.selector||"")+" "+roleFromReference(ref)));
  const tt=new Set([...(target.semanticTokens||[]),...tokens(target.name+" "+target.path+" "+(target.roles||[]).join(" "))]);
  let value=0;
  for(const t of rt)if(tt.has(t))value+=10;
  const role=roleFromReference(ref);
  if((target.roles||[]).includes(role))value+=35;
  if(role==="layout"&&(target.roles||[]).some(x=>["navigation","header","footer","sidebar","dashboard"].includes(x)))value+=12;
  if(ref.route&&target.usedByRoutes?.length)value+=5;
  if(target.risk==="high")value-=3;
  return Math.max(0,value);
}
function confidence(raw){return raw<=0?0:Math.min(92,35+raw)}
function transferFor(e){
  if(e.type==="text")return{typography:true,color:true,spacing:true,layout:false,animation:false,interactionFeedback:false};
  if(e.type==="animation")return{typography:false,color:false,spacing:false,layout:false,animation:true,interactionFeedback:true};
  return{typography:true,color:true,spacing:true,layout:true,animation:true,interactionFeedback:true,responsive:true,icons:true};
}

export async function buildComponentMap({catalog,sourceIntelligence,outFile}){
  if(!catalog)throw new Error("Reference entity catalog is required.");
  if(!sourceIntelligence)throw new Error("Target source intelligence is required.");
  const targets=sourceIntelligence.components||[];
  const mappings=(catalog.entities||[]).map(ref=>{
    const candidates=targets.map(t=>({target:t,score:score(ref,t)})).sort((a,b)=>b.score-a.score||a.target.path.localeCompare(b.target.path)).slice(0,3);
    const best=candidates[0];
    return{
      reference:{id:ref.id,type:ref.type,route:ref.route,title:ref.title||null,selector:ref.selector||null,role:roleFromReference(ref)},
      target:best&&best.score>0?{id:best.target.id,name:best.target.name,path:best.target.path,roles:best.target.roles,risk:best.target.risk,sha256:best.target.sha256}:null,
      mappingStatus:best&&best.score>0?"INFERRED":"UNMAPPED",
      mappingConfidencePercent:best&&best.score>0?confidence(best.score):0,
      transfer:transferFor(ref),
      preserve:{businessText:true,props:true,handlers:true,apiCalls:true,state:true,routing:true,permissions:true,analytics:true,accessibilityBehavior:true},
      candidates:candidates.filter(x=>x.score>0).map(x=>({path:x.target.path,name:x.target.name,roles:x.target.roles,risk:x.target.risk,score:x.score,confidencePercent:confidence(x.score)}))
    };
  });
  const result={
    schema:"kk-frontend-component-map/v1",createdAt:new Date().toISOString(),
    rules:{mappingIsAdvisory:true,userOrAgentMayRefine:true,businessSemanticsWinOnConflict:true,doNotMutateUnmapped:true},
    counts:{referenceEntities:mappings.length,mapped:mappings.filter(x=>x.target).length,unmapped:mappings.filter(x=>!x.target).length},
    mappings
  };
  await writeJson(outFile,result);
  return result;
}
