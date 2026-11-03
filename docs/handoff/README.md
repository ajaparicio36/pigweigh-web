# Operator handoff

Reviewed 2026-11-03 against application manifests, settings, schema, Dockerfile, recorded deployment evidence and read-only Railway metadata/metrics. Start with the [root README](../../README.md) for local startup.

| Topic | Runbook |
|---|---|
| Monthly budget, observed resource use and assumptions | [Hosting costs](hosting-costs.md) |
| How Railway was configured and uploaded; release checks | [Deployment](deployment.md) |
| Local and hosted environment examples; origins and cookies | [Configuration](configuration.md) |
| ONNX storage, loading, hash checks and replacement | [Models](models.md) |
| Persistent data, migrations, sessions, backup and recovery | [Database](database.md) |
| Thesis chapters, formula evidence and proposed research | [Thesis review](thesis-review.md) |

The configured production project has three services (web, API, PostgreSQL) and one database volume. **It is not currently serving:** November 3 HTTPS checks returned Railway `404 Application not found`; previously successful deployments are marked REMOVED as of November 2. No deployment, restart, variable change or restoration was performed during this handoff. See [current-state evidence](deployment.md#current-state-2026-11-03) before attempting an authorized recovery.

The current checkout uses the experimental 14451 formula version; the last recorded deployed release used 11900. Updating source or committing a manifest does not update Railway. Formula output and generated-fixture tests do not establish physical weight accuracy. Never add guessed dimensions, confidence, prices or model fallbacks.

Keep credentials, private photographs, training datasets and `.pt` checkpoints outside commits. Exactly three serving files are approved for ordinary Git: `server/models/v1/manifest.json`, `top.onnx`, `side.onnx`. The earlier **PigWeigh** Railway project is distinct and remains outside this runbook's deployment target.
