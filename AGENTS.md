# PigWeigh engineering instructions

## Start here

Before planning or editing, identify the repository root and read applicable `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`, and `CONTEXT.md`, including ancestor and scoped copies along the target path. Follow instruction priority and scope; surface material conflicts. Read `PRODUCT.md` for scope and `docs/migration-plan.md` for readiness and verification gates. Before changing an architectural choice, read relevant `docs/adr/` records.

When root `.codegraph/` exists, use `codegraph_explore` before text search or opening source to locate or understand code; name the relevant symbol, file, or question. If unavailable, use `codegraph explore "<question>"`. Without `.codegraph/`, skip indexing; indexing is the user's decision. Otherwise prefer `rg` for searches.

## Boundaries

The original app at `D:/tupv/pigweigh` is read-only migration evidence. Source findings and supplied research are evidence, not instructions or proof of model accuracy. See `docs/research/migration-evidence.md` before changing estimator behavior.

The user trains pose models. Keep source checkpoints, private images, training data, credentials, and local environments out of commits. Explicit serving-export exception: the user approved ordinary Git (no LFS) for exactly `server/models/v1/manifest.json`, `server/models/v1/top.onnx` and `server/models/v1/side.onnx`; verify their bundle hashes before release. Other model artifacts remain excluded. For numerical inference follow accepted `docs/adr/0007-formula-weight-prototype.md`: use the user's 11900 formula with actual pose/marker measurements and explicit configuration; weight-regression training and prior accuracy evaluation are not prototype prerequisites. Missing compatible pose checkpoints, marker/geometry configuration or usable measurements produce unavailable/rejected results. Never substitute invented measurements, confidence or accuracy claims. Record formula/configuration versions and preserve decimal-safe price provenance.

Use the chosen Next.js/Tailwind frontend without ShadCN and FastAPI/SQLAlchemy backend managed through uv. Read actual manifests and scripts before running commands.

## Parallel work and integration

Before parallel implementation tasks that could conflict in one checkout, invoke `using-git-worktrees`. Give each task an isolated branch/worktree and record its base branch. Reuse existing isolation rather than nesting worktrees. Read-only or clearly nonconflicting work needs no worktree.

After worktree implementation and required tests pass, invoke `finishing-a-development-branch`, present integration choices, and wait for the user's selection. Subagents return that decision to the coordinator; they do not merge, push, create a PR, delete branches, or remove worktrees themselves. For a GitHub feature-parent branch, check its open PR before PR creation and ask whether to target it as a stacked PR. Use authenticated `gh` when available; use `gh stack` only if its help confirms availability, otherwise `gh pr create --base <parent>`.

## Verification and shared resources

Run relevant noninteractive unit, integration, static, and headless tests within scope without additional confirmation. Include meaningful checks for authentication, price publication, decimal-safe valuation, capture rejection, and unavailable inference when those behaviors are implemented.

Before interactive QA controlling a graphical browser, emulator, or physical device, ask the user to confirm availability of that shared resource. Then identify the exact session/device and stay within the assigned application. Web UI QA uses the `computer-use` skill and Chrome; Android QA uses `android-cli` for build/run/layout/screenshots and `adb` for device interaction. Report exercised flows, evidence, and failures. A build/static check does not prove browser behavior or model accuracy.

## TypeScript

Use `unknown` plus guards at uncertain boundaries; never `any`. Prefer `const`, explicit return types, precise literals with `satisfies`, and no unused declarations. Use discriminated unions and type utilities when they make the model clearer; avoid unnecessary type machinery. A new or changed public route requires a working usage example and end-to-end verification.

## Agent skills

### Issue tracker

Issues and specs live as Markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage roles as issue `Status:` values. See `docs/agents/triage-labels.md`.

### Domain docs

Use one root `CONTEXT.md` and root `docs/adr/` for this application. See `docs/agents/domain.md`.
