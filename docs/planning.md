# Planning

All complex work (multi-step features, non-trivial changes) must start with creating a plan before writing any code. Plans are written as markdown files to `.agents/plans/` (e.g., `.agents/plans/001-tile-manipulation.md`).

## Plan Size

Plans should be kept as small as possible. Each plan should cover the smallest possible increment of atomic functionality. If a user asks to plan a larger feature, recommend how the functionality could be split into multiple small atomic plans before creating any plan.

Do not start implementation until the plan is complete and the user has confirmed it.

## Creating a Plan

1. **Research** — read relevant source files, existing tests, and the PRD to understand the current state and requirements
2. **Ask clarifying questions** — confirm functional requirements, non-functional requirements, acceptance criteria, and edge cases with the user before finalising the plan
3. **Write the plan** — include:
   - Goal and scope
   - Acceptance criteria
   - Edge cases to handle
   - E2E tests to implement — list every Playwright test (with TC-## reference) that must be written or updated, including the user flows and assertions for each
   - Implementation steps (ordered, each small enough to test)
   - Affected files and packages
   - Identify any manual validation steps the user should perform after implementation
   - Execution steps (see below)

## Execution Steps

The main agent acts as orchestrator and invokes subagents to execute a plan. It will need to execute these steps in order:

1. **Invoke the implement subagent** — pass it the path to the plan file and ask it to carry out the implementation
2. **Invoke the validate subagent** — pass it a prompt with implementation context: what code changes were made, why they were made, and what new e2e tests were added. Do not dictate to the agent which checks to run, it already knows how to perform validation
3. **Invoke the codereview subagent** — provide a summary focused on **what outcomes the author was trying to achieve and why**. Include the path of the plan file if there is one. Do not enumerate which files changed — the code review agent can determine that itself.
4. **Compact the session** — use the `/compact` skill to reduce context, then read the code review report returned by the codereview subagent. Include these steps in the prompt to the /compact command and an instruction that they must be included in the handover
5. **Address any feedback** — invoke the implement subagent with the path to the code review file and ask it to address the feedback
6. **Re-validate if changes were made** — if any changes were required to address code review feedback, invoke the validate subagent again to confirm everything still works

## See Also

- [prd.md](prd.md) — MUST read before planning or understanding product requirements.
- [rules.md](rules.md) — MUST read before planning changes to game behaviour or dynamics.
- [testing.md](testing.md) — MUST read when listing e2e tests in a plan.
- [entities.md](entities.md) — MUST read when planning changes that affect data structures.
