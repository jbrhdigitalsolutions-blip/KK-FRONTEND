import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"..");

test("comparison UI exposes select-all and same-group controls",async()=>{
  const html=await fs.readFile(path.join(root,"src","web","index.html"),"utf8");
  assert.match(html,/id="selectAll"/);
  assert.match(html,/id="selectSameGroup"/);
  assert.match(html,/id="groupBy"/);
  assert.match(html,/Same category/);
  assert.match(html,/Same subcategory/);
  assert.match(html,/Same route/);
  assert.match(html,/id="selectAllHeader"/);
});

test("selection logic supports all, visible, category, subcategory and route groups",async()=>{
  const js=await fs.readFile(path.join(root,"src","web","app.js"),"utf8");
  assert.match(js,/\$\("#selectAll"\)\.onclick/);
  assert.match(js,/\$\("#selectVisible"\)\.onclick/);
  assert.match(js,/\$\("#selectSameGroup"\)\.onclick/);
  assert.match(js,/const field=\$\("#groupBy"\)\.value/);
  assert.match(js,/cell\.ondblclick/);
  assert.match(js,/master\.indeterminate/);
});
