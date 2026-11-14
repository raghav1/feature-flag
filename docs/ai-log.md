# AI log

How the coding agent (Claude Code) was directed, and where it needed correcting.

## Planning

- **Prompt:** plan the architecture, data model, API and phases; write `docs/plan.md` and `CLAUDE.md`; the engine is plain Java and rollouts are deterministic per user; flag anything unclear and stop.
- The agent was started in an unrelated existing repo. It stopped and asked instead of writing there, and the work moved to a new repo.
- **Review round 1:** added a login page with three server-enforced roles, audit by logged-in user in plain words, the brief kept out of the repo, `docker compose up` working from phase 0, a commit per phase, the snapshot `/config` endpoint dropped, fallthrough shown as an "Otherwise" row, and explicit design principles in `CLAUDE.md`.
- **Review round 2 (course correction):** the planned `EvaluationContext(userId, customerId)` hard-coded one attribute, which breaks the open/closed principle the plan had just adopted. A rule on a new attribute would have meant editing the context, mapper and API. Changed to `userId` + `Map<String, String> attributes`, with a test proving a rule can read an attribute the engine has never heard of.
