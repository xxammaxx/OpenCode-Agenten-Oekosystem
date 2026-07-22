diff --git a/scripts/lib/gates/evaluate-all.mjs b/scripts/lib/gates/evaluate-all.mjs
index cf6b753..e78ec42 100644
--- a/scripts/lib/gates/evaluate-all.mjs
+++ b/scripts/lib/gates/evaluate-all.mjs
@@ -205,11 +205,19 @@ export async function evaluateAllGates({
   const kernelResult = evaluateKernelGates(kernelCtx);
 
   // ── Phase 3: Policy Gates (SECOND) ───────────────────────────────
+  // Issue fetch is only required when a GitHub comment is being posted.
+  // For non-comment operations (tool execution only), the requirement
+  // is not applicable — we pass 'yes' to avoid blocking tool operations
+  // with COMMENT_ISSUE_NOT_FETCHED. The comment policy evaluator
+  // remains unchanged and deterministic.
+  const effectiveCommentType = enforcementContext.commentType || 'none';
   const commentPolicyCtx = {
     agentRole: agentRole || 'unknown',
-    commentType: enforcementContext.commentType || 'none',
+    commentType: effectiveCommentType,
     commentData: enforcementContext.commentData || {},
-    issueFetched: enforcementContext.issueFetched || 'no',
+    issueFetched: effectiveCommentType !== 'none'
+      ? (enforcementContext.issueFetched || 'no')
+      : 'yes',
     commitSha: enforcementContext.commitSha || null,
     hasExternalReview: enforcementContext.hasExternalReview || false
   };
diff --git a/scripts/lib/gates/policy.mjs b/scripts/lib/gates/policy.mjs
index 950fd68..4abaaee 100644
--- a/scripts/lib/gates/policy.mjs
+++ b/scripts/lib/gates/policy.mjs
@@ -175,20 +175,21 @@ export function evaluateCommentPolicy(context = {}) {
   }
 
   // ── Comment Cycle Completeness ──
-  if (commentType === 'none' && issueFetched === 'yes') {
+  // Only relevant when a comment operation is actually about to happen.
+  // For tool execution (commentType === 'none'), the cycle check is N/A.
+  if (commentType !== 'none' && issueFetched === 'yes' && commentType !== 'start') {
     warnings.push({
       code: 'COMMENT_CYCLE_INCOMPLETE',
-      message: 'Issue was fetched but no comment cycle started. Start Gate requires a structured start comment.',
+      message: 'Issue was fetched but no start comment was posted. Start Gate requires a structured start comment before other comments.',
       severity: 'WARNING'
     });
   }
 
   // ── Classification ──
+  // Only violations produce AMBER_REVIEW. Warnings alone do not downgrade.
   const classification = violations.length > 0
     ? 'AMBER_REVIEW'
-    : warnings.length > 0
-      ? 'AMBER_REVIEW'
-      : 'GREEN_SAFE';
+    : 'GREEN_SAFE';
 
   return {
     violations,
diff --git a/scripts/run-governed-opencode.mjs b/scripts/run-governed-opencode.mjs
index 51fb3ce..f1754de 100644
--- a/scripts/run-governed-opencode.mjs
+++ b/scripts/run-governed-opencode.mjs
@@ -237,6 +237,7 @@ async function runLiveTests(targetRoot, binary) {
   const evalResult = spawnSync("node", [
     path.join(testRoot, ".agent-governance", "bin", "evaluate.mjs"),
     "--target", testRoot,
+    "--runtime", "opencode",
     "--action", "read",
     "--risk-tier", "LOW_LOCAL",
     "--json",
@@ -257,6 +258,7 @@ async function runLiveTests(targetRoot, binary) {
   const forceResult = spawnSync("node", [
     path.join(testRoot, ".agent-governance", "bin", "evaluate.mjs"),
     "--target", testRoot,
+    "--runtime", "opencode",
     "--action", "git push --force",
     "--json",
   ], {
@@ -276,6 +278,7 @@ async function runLiveTests(targetRoot, binary) {
   const escapeResult = spawnSync("node", [
     path.join(testRoot, ".agent-governance", "bin", "evaluate.mjs"),
     "--target", testRoot,
+    "--runtime", "opencode",
     "--action", "write",
     "--write-path", "/etc/passwd",
     "--json",
@@ -296,6 +299,7 @@ async function runLiveTests(targetRoot, binary) {
   const writeResult = spawnSync("node", [
     path.join(testRoot, ".agent-governance", "bin", "evaluate.mjs"),
     "--target", testRoot,
+    "--runtime", "opencode",
     "--action", "write",
     "--risk-tier", "LOW_LOCAL",
     "--write-path", path.join(testRoot, "safe-file.txt"),
diff --git a/test/gates/comment-policy.test.mjs b/test/gates/comment-policy.test.mjs
index bf4187f..aa771da 100644
--- a/test/gates/comment-policy.test.mjs
+++ b/test/gates/comment-policy.test.mjs
@@ -237,15 +237,34 @@ describe('Comment Policy Gates', () => {
   // ── Comment Cycle Completeness ─────────────────────────────
 
   it('warns when issue is fetched but no comment cycle started', () => {
+    // COMMENT_CYCLE_INCOMPLETE warns when an end/gate comment is posted
+    // without a preceding start comment — but only for actual comment operations.
     const result = evaluateCommentPolicy({
-      agentRole: 'unknown',
+      agentRole: 'issue-orchestrator',
+      commentType: 'end',
+      commentData: {
+        context: 'test', changes: 'test', files_changed: [],
+        tests_run: 'passed', result: 'success', blockers: []
+      },
+      issueFetched: 'yes'
+    });
+
+    const cycleWarning = result.warnings.find(w => w.code === 'COMMENT_CYCLE_INCOMPLETE');
+    assert.ok(cycleWarning, 'Expected COMMENT_CYCLE_INCOMPLETE warning for end comment without start');
+  });
+
+  it('does NOT warn about cycle for non-comment tool execution', () => {
+    const result = evaluateCommentPolicy({
+      agentRole: 'issue-orchestrator',
       commentType: 'none',
       commentData: {},
       issueFetched: 'yes'
     });
 
     const cycleWarning = result.warnings.find(w => w.code === 'COMMENT_CYCLE_INCOMPLETE');
-    assert.ok(cycleWarning, 'Expected COMMENT_CYCLE_INCOMPLETE warning');
+    assert.strictEqual(cycleWarning, undefined);
+    // Should be GREEN_SAFE since no violations
+    assert.strictEqual(result.classification, 'GREEN_SAFE');
   });
 
   // ── External Bot Exclusion ─────────────────────────────────
