# Operator handoff

Reviewed 2026-11-03 against application manifests, settings, schema, Dockerfile, recorded deployment evidence and read-only Railway metadata/metrics. Start with the [root README](../../README.md) for local startup.

| Topic | Runbook |
|---|---|
| Monthly budget, observed resource use and assumptions | [Hosting costs](hosting-costs.md) |
| How Railway was configured and uploaded; release checks | [Deployment](deployment.md) |
| Local and hosted environment examples; origins and cookies | [Configuration](configuration.md) |
| ONNX storage, loading, hash checks and replacement | [Models](models.md) |
| Correcting source pose labels and preparing a new model | [Roboflow keypoint corrections](roboflow-keypoint-corrections.md) |
| Persistent data, migrations, sessions, backup and recovery | [Database](database.md) |
| Thesis chapters, formula evidence and proposed research | [Thesis review](thesis-review.md) |

The production project has web, API and PostgreSQL services and one database volume. The [November 3 release](../deployment.md#14451-api-and-web-release-2026-11-03) reached SUCCESS for API and web and passed bounded public checks. PostgreSQL was already online before the release on the existing volume; its schema head and current-price revision were preserved. An [earlier review](deployment.md#earlier-outage-observation-2026-11-03) recorded removed deployments and public 404 responses; the cause and the actor behind the subsequent pre-existing service startups were not established.

The released checkout uses the experimental 14451 formula version; the historical October release used 11900. Updating source or committing a manifest does not update Railway. Formula output and generated-fixture tests do not establish physical weight accuracy. Never add guessed dimensions, confidence, prices or model fallbacks.

Keep credentials, private photographs, training datasets and `.pt` checkpoints outside commits. Exactly three serving files are approved for ordinary Git: `server/models/v1/manifest.json`, `top.onnx`, `side.onnx`. The earlier **PigWeigh** Railway project is distinct and remains outside this runbook's deployment target.
