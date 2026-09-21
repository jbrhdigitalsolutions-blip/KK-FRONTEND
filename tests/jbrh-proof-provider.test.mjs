import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAffectedFrontendRoutes, inferRoutePathFromFile, auditAccessibilitySnapshot } from '../src/integration/jbrh-proof-provider.mjs';

test('changed files map through reverse imports to frontend route files', () => {
  const graph={routeFiles:['src/app/a/page.tsx','src/app/b/page.tsx'],reverseImportGraph:{'src/ui/Button.tsx':['src/app/a/page.tsx'],'src/lib/x.ts':['src/ui/Button.tsx','src/app/b/page.tsx']}};
  const got=computeAffectedFrontendRoutes(graph,['src/lib/x.ts']);
  assert.deepEqual(got.routeFiles,['src/app/a/page.tsx','src/app/b/page.tsx']);
  assert.deepEqual(got.routePatterns,['/a','/b']);
});

test('common app/page route files infer browser paths without inventing content ids', () => {
  assert.equal(inferRoutePathFromFile('src/app/accounts/[id]/page.tsx'),'/accounts/[^/]+');
  assert.equal(inferRoutePathFromFile('src/pages/settings/index.tsx'),'/settings');
  assert.equal(inferRoutePathFromFile('src/pages/api/health.ts'),null);
});

test('accessibility baseline rejects runtime-serious failures', () => {
  const good=auditAccessibilitySnapshot({meta:{lang:'en'},viewport:{horizontalOverflow:0},elements:[{tag:'button',selector:'#ok',id:'ok',interactive:true,accessibleName:'OK',rect:{width:44,height:44}}]});
  assert.equal(good.passed,true);
  const bad=auditAccessibilitySnapshot({meta:{lang:''},viewport:{horizontalOverflow:5},elements:[{tag:'button',selector:'#x',id:'dup',interactive:true,accessibleName:'',rect:{width:20,height:20}},{tag:'div',selector:'#y',id:'dup',interactive:false,accessibleName:'',rect:{width:1,height:1}}]});
  assert.equal(bad.passed,false);
  assert.ok(bad.summary.serious>=3);
});
