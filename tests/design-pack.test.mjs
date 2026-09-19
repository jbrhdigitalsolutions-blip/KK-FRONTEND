import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildDesignPack } from "../src/intelligence/design-pack.mjs";

test("DESIGN-PACK is self-contained and hash-manifested",async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"kkf-pack-"));
  const session=path.join(dir,"session"),ref=path.join(session,"reference");
  await fs.mkdir(path.join(ref,"routes","home","screenshots"),{recursive:true});
  await fs.mkdir(path.join(ref,"routes","home","profiles"),{recursive:true});
  await fs.mkdir(path.join(ref,"assets"),{recursive:true});
  await fs.writeFile(path.join(session,"DESIGN.md"),"# Design\n");
  await fs.writeFile(path.join(session,"reference-audit.json"),'{"ok":true}');
  for(const f of ["shared-css.json","route-inventory.json","route-coverage.json","layout-clusters.json","audit.json"])await fs.writeFile(path.join(ref,f),'{"ok":true}');
  await fs.writeFile(path.join(ref,"routes","home","route.json"),'{"route":"/"}');
  await fs.writeFile(path.join(ref,"routes","home","profiles","desktop.json"),'{"w":1440}');
  await fs.writeFile(path.join(ref,"routes","home","screenshots","desktop.png"),Buffer.from([137,80,78,71,13,10,26,10]));
  await fs.writeFile(path.join(ref,"assets","manifest.json"),"[]");

  const r=await buildDesignPack({
    sessionDir:session,referenceRoot:ref,designMd:path.join(session,"DESIGN.md"),
    referenceAudit:path.join(session,"reference-audit.json"),referenceUrl:"https://example.com",
    anchors:["phone-390x844","tablet-820x1180","desktop-1440x900"]
  });
  assert.equal(r.manifest.reference,"https://example.com");
  assert.equal(r.manifest.counts.screenshots,1);
  assert.ok(r.manifest.counts.files>=8);
  assert.ok(r.manifest.files.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
  await fs.access(path.join(session,"DESIGN-PACK","DESIGN.md"));
  await fs.access(path.join(session,"DESIGN-PACK","CODING-AGENT-PROMPT.md"));
  await fs.access(path.join(session,"DESIGN-PACK","PACK-MANIFEST.json"));
  await fs.access(path.join(session,"DESIGN-PACK","routes","home","screenshots","desktop.png"));
});
