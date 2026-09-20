import test from "node:test";
import assert from "node:assert/strict";
import { parseGitHubRepoUrl } from "../src/no-code/project-sources.mjs";

test("GitHub project URLs normalize repository and optional tree context",()=>{
  assert.deepEqual(parseGitHubRepoUrl("https://github.com/acme/web.git"),{
    owner:"acme",repo:"web",ref:"",subdir:"",url:"https://github.com/acme/web"
  });
  const tree=parseGitHubRepoUrl("https://github.com/acme/mono/tree/main/apps/web");
  assert.equal(tree.owner,"acme");
  assert.equal(tree.repo,"mono");
  assert.equal(tree.ref,"main");
  assert.equal(tree.subdir,"apps/web");
});

test("GitHub project URL parser rejects non-GitHub and malformed sources",()=>{
  assert.throws(()=>parseGitHubRepoUrl("https://gitlab.com/acme/web"),/github\.com/);
  assert.throws(()=>parseGitHubRepoUrl("https://github.com/acme"),/owner\/repository/);
  assert.throws(()=>parseGitHubRepoUrl("file:///tmp/repo"),/github\.com|invalid/i);
});
