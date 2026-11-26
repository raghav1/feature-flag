# Deferred work

- source_spec: `_bmad-output/implementation-artifacts/spec-12-1-engine-attribute-rule.md`
  summary: Align audience wording before Story 12.4 — SPEC CAP-2 and brownfield.md say "users whose country is US or CA", AD-16 and Story 12.4 say "users with country US or CA".
  evidence: Blind Hunter; confirmed in SPEC.md CAP-2 vs ARCHITECTURE-SPINE.md AD-16. Fix through bmad-spec (memlog entry + re-derive), since SPEC.md is never hand-edited.
- source_spec: `_bmad-output/implementation-artifacts/spec-12-1-engine-attribute-rule.md`
  summary: Add missing acceptance criteria before Stories 12.2–12.4 — reordering attribute rules (CAP-2), MCP returning the same field error as REST (CAP-3), pre-existing rule JSON still loading, and an unknown operator such as "equals" returning 400.
  evidence: Blind Hunter; confirmed by comparing SPEC.md CAP-2/CAP-3 and Constraints with epics.md Stories 12.2–12.4. The readiness gate missed these.
- source_spec: `_bmad-output/implementation-artifacts/spec-12-1-engine-attribute-rule.md`
  summary: Story 12.2 should include a 400 case for values with surrounding spaces (e.g. " US").
  evidence: The engine accepts " US" (IdSets rejects only blank), which could never match. Unreachable today because ContextIds.PATTERN forbids spaces at the API boundary; an API test pins that.
- source_spec: `_bmad-output/implementation-artifacts/spec-12-1-engine-attribute-rule.md`
  summary: Story 12.5 should state free-shipping's dev state (e.g. enabled with Otherwise ON, like the other seed flags).
  evidence: Blind Hunter; epics.md Story 12.5 only specifies prod. V2 seed sets dev to enabled + Otherwise ON for every flag.
- source_spec: `_bmad-output/implementation-artifacts/spec-12-1-engine-attribute-rule.md`
  summary: Widen the oneshot repo-invariants reviewer to all untracked files (docs/, qa/, README.md, _bmad-output/), and keep its prompt in step with the review_layers copy.
  evidence: Blind Hunter; _bmad/custom/bmad-build.toml lists only engine/, backend/, admin/, demo/, sdk/, so Story 12.2's required docs/plan.md change would go unchecked if it ran oneshot.
- source_spec: `_bmad-output/implementation-artifacts/spec-12-1-engine-attribute-rule.md`
  summary: Architecture spine binds should list AD-4 (role matrix), which Stories 12.2 and 12.3 rely on.
  evidence: Blind Hunter; ARCHITECTURE-SPINE.md frontmatter binds omits AD-4.
- source_spec: none (pre-existing)
  summary: qa/results/top15/screenshots/07-ADM-ACT-02-failure.png records an ADM-ACT-02 failure in the top-15 video run while REPORT.md shows PASS; investigate, and confirm token masking before committing it.
  evidence: Both reviewers; the file was untracked before this pilot started.

## Resolved 2026-11-25 (before Story 12.2)

- Audience wording: SPEC.md CAP-2 and brownfield.md now use AD-16's wording; decision logged in the spec memlog.
- Missing ACs: epics.md Stories 12.2 (unknown operator, spaced values, pre-existing rule JSON), 12.3 (MCP field-error parity), 12.4 (edit and reorder) and 12.5 (free-shipping dev state and description) updated.
- Spaced values: covered by the new Story 12.2 AC.
- free-shipping dev state: covered by the new Story 12.5 AC.
- Oneshot reviewer scope: `_bmad/custom/bmad-build.toml` now reviews every untracked file, including docs/, qa/, README.md and _bmad-output/; both copies carry a keep-in-step note.
- Spine binds: AD-4 added to binds and Inherited Invariants; lint_spine 0 findings; logged in the spine memlog.
- ADM-ACT-02 failure screenshot: leftover from an earlier attempt at 15:05; the final run's `qa/results/top15/results.json` records PASS. The image shows the correct UI (2 matches, "(all matches)") with the case still RUNNING, so it was a harness timing failure on that attempt, not a product bug. No tokens, paths or emails visible. Left untracked; not part of this change.

- source_spec: `_bmad-output/implementation-artifacts/spec-12-2-attribute-rules-in-the-admin-api-and-evaluation.md`
  summary: Don't merge Story 12.2 to main without 12.3 and 12.4 — the backend now accepts attribute rules, but the admin's toDraft/ruleAudience (admin/src/rules.ts:59-79, audience.ts:31-38) return undefined for them, so a flag with one breaks the dashboard, and MCP's schema doesn't list the type.
  evidence: Verification Gap, Edge Case Hunter and Blind Hunter independently. Reachable once any attribute rule is saved via REST or MCP. The readiness gate's "stories independently completable" check missed that 12.2 alone leaves an inconsistent product.
- source_spec: `_bmad-output/implementation-artifacts/spec-12-2-attribute-rules-in-the-admin-api-and-evaluation.md`
  summary: Story 12.3 — switch MCP's unknown-type message (AdminTools.java:339) to the shared rule-type list, add attribute to the set_flag_rules oneOf (L278-282), update McpApiTest:354, add an attribute round-trip and rejection test.
  evidence: Four reviewers. Already Story 12.3 scope; listed so its spec picks up every site.
- source_spec: `_bmad-output/implementation-artifacts/spec-12-2-attribute-rules-in-the-admin-api-and-evaluation.md`
  summary: README Assumption 2 and test counts disagree with docs/plan.md decision 2 until Story 12.5.
  evidence: Repo Invariants FAIL 19 and Blind Hunter. The approved spec excluded README changes from 12.2; AGENTS.md asks to keep README in step, so 12.5 must not slip.
- source_spec: `_bmad-output/implementation-artifacts/spec-12-2-attribute-rules-in-the-admin-api-and-evaluation.md`
  summary: Document in README (12.5) that attribute names are lowercase, so SDK callers must send lowercase keys (e.g. app_version, not appVersion).
  evidence: Edge Case Hunter. /api/evaluate accepts any key, but AttributeNames only allows lowercase names, so a camelCase key can never be targeted; that's the approved AD-14 decision, but it's invisible to SDK users.
- source_spec: `_bmad-output/implementation-artifacts/spec-12-2-attribute-rules-in-the-admin-api-and-evaluation.md`
  summary: The 1000-item cap (@Size(max = 1000)) is untested for users, customers and attribute rules alike.
  evidence: Verification Gap; grep finds no 1000/1001 test. Pre-existing pattern across all rule types; close it for all three together.
- source_spec: `_bmad-output/implementation-artifacts/spec-12-2-attribute-rules-in-the-admin-api-and-evaluation.md`
  summary: An empty value "" in users, customers or attribute lists likely yields two errors for one field (@NotBlank and @Pattern both fail).
  evidence: Blind Hunter. Pattern copied from UsersRule/CustomersRule (pre-existing); unverified count — a request with "" and assertion on errors.length() would settle it.
- source_spec: `_bmad-output/implementation-artifacts/spec-12-2-attribute-rules-in-the-admin-api-and-evaluation.md`
  summary: AttributeNames.isValid is unused in production and not null-safe — use it in Story 12.3 (MCP) or remove it.
  evidence: Blind Hunter and Repo Invariants note.
- source_spec: `_bmad-output/implementation-artifacts/spec-12-3-attribute-rules-for-agents-over-mcp.md`
  summary: Story 12.5 README pass must also cover the Agents (MCP) table's set_flag_rules row ("users, customers, percent or attribute") and the test counts (stale since 12.2).
  evidence: Repo Invariants FAIL 19 on 12.2 and again on 12.3; README is scoped to 12.5.
