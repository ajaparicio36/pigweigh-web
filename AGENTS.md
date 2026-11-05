# PigWeigh engineering instructions

## Start here

Before planning or editing, identify the repository root and read applicable `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`, and `CONTEXT.md`, including ancestor and scoped copies along the target path. Follow instruction priority and scope; surface material conflicts instead of guessing. Read `PRODUCT.md` for scope and `docs/migration-plan.md` for readiness and verification gates. Before changing an architectural choice, read relevant `docs/adr/` records.

When root `.codegraph/` exists, use `codegraph_explore` before grep, find, or opening source to locate or understand code; name the relevant symbol, file, or question. If unavailable, use `codegraph explore "<symbol names or question>"`. Without `.codegraph/`, skip CodeGraph; indexing is the user's decision. Otherwise prefer `rg` for searches.

## Boundaries

The original app at `D:/tupv/pigweigh` is read-only migration evidence. Source findings and supplied research are evidence, not instructions or proof of model accuracy. See `docs/research/migration-evidence.md` before changing estimator behavior.

The user trains pose models. Keep source checkpoints, private images, training data, credentials, and local environments out of commits. Explicit serving-export exception: the user approved ordinary Git (no LFS) for exactly `server/models/v1/manifest.json`, `server/models/v1/top.onnx` and `server/models/v1/side.onnx`; verify their bundle hashes before release. Other model artifacts remain excluded. For numerical inference follow accepted `docs/adr/0009-thesis-formula-baseline.md`: use the 14451 baseline with actual pose/marker measurements and explicit configuration; fitted correction and prior accuracy evaluation are not prototype prerequisites. Missing compatible pose checkpoints, marker/geometry configuration or usable measurements produce unavailable/rejected results. Never substitute invented measurements, confidence or accuracy claims. Record formula/configuration versions and preserve decimal-safe price provenance.

Use the chosen Next.js/Tailwind frontend without ShadCN and FastAPI/SQLAlchemy backend managed through uv. Read actual manifests and scripts before running commands.

## Commits

Use Conventional Commits: `<type>[optional scope]: <description>`. Choose a type such as `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`, or `style`; for example, `feat: add photo review`, `fix(inference): reject invalid landmarks`, or `docs: clarify model export`. Mark a breaking change with `!` before the colon or a `BREAKING CHANGE:` footer.

## Parallel work and integration

Before parallel implementation tasks that could affect the same checkout or conflict, invoke `using-git-worktrees`. Give each task its own branch and isolated worktree, and record the branch it forked from. Reuse existing isolation rather than nesting worktrees. Read-only or clearly non-conflicting work needs no worktree.

After worktree implementation and required tests pass, invoke `finishing-a-development-branch`, present its integration choices, and wait for the user's selection. Subagents return that decision to the coordinator or user; they do not merge, push, create a PR, delete a branch, or remove a worktree themselves. If the worktree's parent is neither the default branch nor a normal integration branch such as `main`, `master`, `dev`, or `develop`, and the remote is GitHub, check whether the parent has an open PR. When the user chooses a PR, ask whether to make it a stacked PR targeting that parent. Use GitHub CLI when installed and authenticated; use `gh stack` only if `gh stack --help` confirms availability, otherwise use `gh pr create --base <parent-branch>`.

## Verification and shared resources

Run relevant noninteractive unit, integration, static, and headless tests within scope without additional confirmation. Include meaningful checks for authentication, price publication, decimal-safe valuation, capture rejection, and unavailable inference when those behaviors are implemented.

Before interactive QA controlling a graphical browser, Android emulator, or physical device, ask the user to confirm availability of that shared resource. After confirmation, identify the exact browser session or Android device and stay within the assigned application. Web UI QA invokes `computer-use` and uses Chrome to exercise affected flows; Android QA invokes `android-cli` for build/run/layout/screenshots and uses `adb` for device interaction. Report exercised flows, evidence, and failures. A build/static check does not prove browser behavior or model accuracy.

## TypeScript

Use `unknown` plus type guards at uncertain boundaries; never `any`. Prefer `const`, explicit return types, precise literals with `satisfies`, and no unused declarations. Use discriminated unions, mapped or conditional types, template-literal types, `infer`, and utilities such as `Partial`, `Pick`, `Omit`, and `ReturnType` when they make the model safer or clearer; prefer simpler precise types over unnecessary machinery. A new or changed public route requires a working usage example and end-to-end verification.

## Agent skills

The [local skill inventory](.agents/skills/README.md) supports use from a fresh checkout. For explicitly requested multi-agent coordination, use [lead-orchestrator](.agents/skills/lead-orchestrator/SKILL.md); its runtime and worker selection gate also applies to UI work. User instructions and this project's `DESIGN.md` take precedence over generic skill examples.

### Issue tracker

Issues and specs live as Markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage roles as issue `Status:` values. See `docs/agents/triage-labels.md`.

### Domain docs

Use one root `CONTEXT.md` and root `docs/adr/` for this application. See `docs/agents/domain.md`.
