## Run history: what failed and what was fixed

Three full runs, each from fresh seed data. Logs: [run-1.log](run-1.log), [run-2.log](run-2.log), [run-3.log](run-3.log).

| Run | Result | What happened |
|---|---|---|
| 1 | 16 / 25 | 1 product bug, 8 failures from one runner bug (below) |
| 2 | 25 / 25 | After the product fix and the runner fix |
| 3 | 25 / 25 | Final run, recorded here: evidence framing improved, no product change |

**Product bug found and fixed**

- **ADM-RULE-04: Discard stayed disabled after typing a malformed ID.** With only rejected text in an ID box (`bad#id`), no rule had changed, so the editor treated the draft as clean: Save was correctly blocked, but Discard was greyed out too, and the only way out was deleting the text by hand. Fixed in commit `c94556e`: Discard is enabled whenever a box holds rejected text (`hasRejectedText`, with a unit test). Re-run: pass.

**Runner problems (not product bugs), fixed in the runner**

- **8 cases (MCP-AUTH-05 to E2E-04) failed with 401 after the outage tests.** The outage cases restart the backend, and dashboard sessions live in the backend's memory, so the runner's setup session ended (expected behaviour; see the QA plan, E2E-06). The MCP calls themselves had worked. The runner's API helper now signs in again on a 401.
- **The first reset tried to bind the default ports**, which the developer's own stack was using; the runner's `docker compose` calls now always pass the QA ports.
- **Timing notes said "0.0 s"** for live updates because the clock started after the click had already finished. It now starts before the click (live updates measured at 0.2–0.3 s).
- **The proof was below the fold** in the side-by-side screenshots: the runner now scrolls the storefront's debug row into view, and evidence pages are captured at full length.

**How the cases were executed**

- MCP-AGT-01 is driven by the exact MCP tool calls an agent makes (`get_flag`, `set_flag_rules`, `get_audit_log`) from a script; no LLM was in the loop.
- API tokens are blurred in recordings and screenshots, and every key created for the run was revoked at the end.
- E2E-02 measures the rollout with 400 synthetic user IDs through `/api/evaluate`; DEMO-LOAD-01 throttles the network to 2 s latency and 400 kbit/s.
