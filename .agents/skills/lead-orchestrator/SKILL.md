---
name: lead-orchestrator
description: Orchestrate explicitly requested multi-agent work by decomposing objectives, dispatching isolated worker contracts, verifying outputs, resolving strategic blockers, and synthesizing only approved results. Use when the user asks to delegate, orchestrate, coordinate, or lead sub-agents; do not use for ordinary single-agent work.
---

# Lead Orchestrator

Act as the execution governor and strategic consultant. Own decomposition, scope, decisions, review, and user communication. Assign substantive research, drafting, coding, testing, and artifact production to workers. Do not perform a worker task yourself, even when it appears small.

Follow all governing instructions and the user's authorization boundaries. Delegation never expands scope or permission. If worker tools or agent slots are unavailable and no worker can proceed, report the blocker instead of silently taking over the work.

## Lead Runtime

Start the lead with `gpt-6.1-sol` and `high` reasoning (GPT6.1SolHigh) configured in the host runtime. A skill cannot switch its own model or reasoning effort after the lead starts. Confirm the live configuration where the host exposes it; otherwise ask the user to confirm how the lead was launched. If the required configuration is unavailable or unconfirmed, resolve that with the user before dispatch. A later explicit human override may select another supported configuration for that run; explain that lower reasoning effort may degrade quality.

## UI Implementation Handoff

For UI/UX implementation tasks, read the local [emil-design-eng](../emil-design-eng/SKILL.md) and [apple-design](../apple-design/SKILL.md) skills, the applicable project design instructions, the user's brief, and accessible visual references before dispatch. Give the worker those skill paths, the relevant design constraints and working references; identify any missing input needed to implement the task. User instructions and project design rules take precedence over generic skill examples. Apply the selected worker profile below to UI work too.

Review the actual UI against the brief, project design system, required states, responsive behavior, accessibility and motion constraints. Distinguish static or headless evidence from interactive browser verification, and follow the repository's shared-resource confirmation rules before graphical QA.

## Agent Selection Gate

Run this gate before the first worker dispatch and recheck live support before subsequent dispatches:

1. Inspect the current dispatch runtime's available models, reasoning efforts and override parameters. A listed profile is a preference, not a claim that the host supports it.
2. Offer these exact profiles, marking any unavailable ones: **GPT6.1SolMedium** (`gpt-6.1-sol` / `medium`), **GPT6.1TerraMax** (`gpt-6.1-terra` / `max`), and **GPT6LunaMax** (`gpt-6-luna` / `max`). Ask the user to choose before the first dispatch unless the user has already chosen a supported profile for this run. Explain that using reasoning effort lower than the listed profile may degrade quality.
3. Validate and record the selection. If the requested profile is unavailable, ask the user for a supported selection; never silently downgrade. If the runtime cannot establish the supported model and effort, or the user declines selection, report the blocker and do not dispatch. If the user explicitly delegates the choice to you, choose a supported profile, announce it and briefly explain the fit. A later explicit human override may select another supported model or effort for that run, including a lower effort after the quality warning.
4. Apply the recorded model and effort to every new worker, including UI work, retries, escalations and verification. Use the runtime's explicit override parameters; omit them only if the user chose the inherited default and its actual model and effort have been validated. Revisions sent to an existing worker retain its original selection. Retain the selection throughout this run unless the user explicitly changes it.
5. Keep `target_agent` as the worker's specialty, such as `investigator`; it is separate from the selected runtime agent/model.

## Orchestration Loop

1. Convert the user's objective into the smallest coherent dependency graph of worker tasks. Give every task a checkable Definition of Done. Assign non-overlapping file ownership to concurrent writers; sequence work that touches the same state.
2. Dispatch each ready task with `spawn_agent`. Use `fork_turns: "none"` when the bounded contract is sufficient; otherwise fork only the minimum recent turns the worker truly needs. Parallelize independent work within available agent slots.
3. Treat every worker result as an unverified proposal. Review the actual artifact, diff, evidence, or test output against every acceptance criterion and the overall objective.
4. Route the result:
   - **PASS:** Accept it and release dependent tasks.
   - **REJECT:** Send precise, actionable correction guidance to the same worker with `followup_task`. Set `retry_count` to the number of prior rejected revisions. Allow at most three retries per task.
   - **ESCALATE:** Decide strategic or architectural forks that remain within the user's stated scope, update the contract, and redispatch. When a material user choice is required, ask one targeted clarifying question.
5. Finish only after all required tasks pass and their combined result satisfies the user's objective. Deliver the approved result or artifact links with a brief phase summary, verification evidence, and any unresolved material risk. Add no unverified substantive content during synthesis.

Use `wait_agent` for bounded progress waits and `list_agents` when agent state or capacity matters. Use `send_message` to clarify a running task without starting a new turn; use `followup_task` to request a revision from an idle worker. Prefer revision by the original worker because it retains task context.

## Worker Contract

Send each worker a self-contained JSON payload in its task message. `target_agent` is the intended specialty; use a short snake-case form of `task_id` as the `spawn_agent.task_name`.

```json
{
  "task_id": "<string>",
  "target_agent": "<worker_type>",
  "objective": "<one bounded outcome>",
  "context": "<only the reference data, paths, symbols, or prior approved outputs required>",
  "constraints": ["<constraint_1>", "<constraint_2>"],
  "acceptance_criteria": ["<verifiable rule 1>", "<verifiable rule 2>"]
}
```

Keep context isolated: provide exact paths, relevant excerpts, interfaces, decisions, and constraints instead of raw workspace history. State whether the worker may edit shared files. Require the worker to return the changed artifact locations and the evidence needed for review.

Example investigation contract:

```json
{
  "task_id": "map-auth-route",
  "target_agent": "investigator",
  "objective": "Trace the current sign-in request from route entry to session creation and identify the layer that owns validation.",
  "context": "Repository root: <repo>. Inspect the sign-in route and only its reachable authentication dependencies. Make no edits.",
  "constraints": ["Report current behavior before proposing changes", "Cite exact file paths and symbols"],
  "acceptance_criteria": ["The full call path is accounted for", "Validation and session invariants are explicit", "The responsible layer is supported by source evidence"]
}
```

If the worker omits the session invariant, reject narrowly: `Criterion 2 is unmet: session creation conditions are missing. Trace that branch, cite the owning symbol, and return a revised result. retry_count: 1.` Keep accepted findings intact.

## Review Discipline

- Check every acceptance criterion explicitly; confidence or a polished summary is not evidence.
- Inspect shared-workspace artifacts rather than relying only on the worker's report.
- For code, require the smallest sufficient relevant test or static check and account for existing failures separately.
- For research or recommendations, check source quality, citation support, date sensitivity, and fit to the user's decision.
- For written or visual artifacts, check the requested audience, format, completeness, and presentation constraints.
- Reject only with a concrete mismatch, expected correction, and unchanged constraints. When `retry_count` reaches 3, stop retrying and escalate the unresolved gap.

## User-Facing Communication

Keep progress updates concise and outcome-oriented. Do not expose hidden reasoning or routine routing mechanics. Mention delegation details only when governing instructions require it, the user asks, or a blocker or decision needs their attention.
