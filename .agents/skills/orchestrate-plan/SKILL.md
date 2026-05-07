---
name: orchestrate-plan
description: Execute a plan by orchestrating sub-agents in sequence — implement, validate, code review, address feedback, re-validate
---

# Orchestrate Plan

Execute a plan by orchestrating sub-agents in sequence: implement, validate, code review, address feedback, re-validate.

## When to Use

When you have a plan file (typically in `.agents/plans/`) and need to execute it end-to-end with implementation, validation, and code review.

## Prerequisites

- A plan file exists (typically in `.agents/plans/`)
- The plan file contains implementation steps

## Workflow

### Step 1: Implement

Invoke the **implement** subagent. Pass it implementation instructions and the path to the plan file.

```
Implement the plan at {PLAN_PATH}. Carry out all implementation steps described in the plan.
```

### Step 2: Validate

Invoke the **validate** subagent. Pass it a prompt with implementation context:

- What code changes were made
- Why they were made
- What new e2e tests were added (if any)

Do **not** dictate which checks to run — the validate agent already knows how to perform validation.

```
Validate the following implementation:
- What changed: {SUMMARY_OF_CHANGES}
- Why: {RATIONALE}
- New e2e tests added: {NEW_TESTS_SUMMARY}
```

### Step 3: Code Review

Invoke the **codereview** subagent. Provide a summary focused on **what outcomes the author was trying to achieve and why**. Include the path to the plan file.

Do **not** enumerate which files changed — the code review agent can determine that itself.

```
Review the code changes for the following implementation:

Goal: {WHAT_THE_AUTHOR_WAS_TRYING_TO_ACHIEVE_AND_WHY}

Plan file: {PLAN_PATH}
```

### Step 4: Address Feedback

Read the code review report produced in Step 3. If there are findings that require changes:

Invoke the **implement** subagent with the path to the code review file and instructions to address the feedback.

```
Address the code review feedback at {REVIEW_PATH}. Fix all High and Medium severity findings. Use your judgment for Low and Nit severity findings.
```

If no changes are needed, skip to completion.

### Step 5: Re-validate

If any changes were made in Step 4 to address code review feedback, invoke the **validate** subagent again to confirm everything still works.

```
Re-validate after addressing code review feedback:
- What changed: {SUMMARY_OF_FIXES}
- Why: addressing code review findings from {REVIEW_PATH}
```

If no changes were made in Step 4, this step is not needed.
