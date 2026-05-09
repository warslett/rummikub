# Planning

All complex work (multi-step features, non-trivial changes) must start with creating a plan before writing any code.

Use the `@plan` subagent to create plans. It will research the codebase, ask clarifying questions, and write the plan to `.agents/plans/`.

Do not start implementation until the plan is complete and the user has confirmed it.

## See Also

- [prd.md](prd.md) — MUST read before planning or understanding product requirements.
- [rules.md](rules.md) — MUST read before planning changes to game behaviour or dynamics.
- [testing.md](testing.md) — MUST read when listing e2e tests in a plan.
- [entities.md](entities.md) — MUST read when planning changes that affect data structures.
- [plan_execution.md](plan_execution.md) — MUST read when executing an existing plan.
