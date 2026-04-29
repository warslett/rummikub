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
   - Validation steps (automated tests + any manual checks the user must verify)

## See Also

- [prd.md](prd.md) — MUST read before planning or understanding product requirements.
- [rules.md](rules.md) — MUST read before planning changes to game behaviour or dynamics.
- [testing.md](testing.md) — MUST read when listing e2e tests in a plan.
- [entities.md](entities.md) — MUST read when planning changes that affect data structures.
