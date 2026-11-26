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
