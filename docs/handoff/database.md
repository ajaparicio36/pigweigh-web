# Database and data storage

PigWeigh requires PostgreSQL. The API receives a private `DATABASE_URL`, and Alembic applies the schema; there is no SQLite fallback or automatic production schema creation. See [local setup](../../README.md#run-from-a-fresh-checkout) and [configuration](configuration.md). The [November 3 release](../deployment.md#14451-api-and-web-release-2026-11-03) found PostgreSQL already online with the existing 5000 MB volume mounted at `/var/lib/postgresql/data`, with `PGDATA=/var/lib/postgresql/data/pgdata`. Its startup log skipped initialization of the existing data directory; Alembic revision `0001_core` and the current-price revision and record were preserved. No PostgreSQL restart or restore was performed during the release. Backup inventory and recoverability were not verified, and the checks do not establish complete database integrity.

## Stored application data

The initial migration is `server/migrations/versions/0001_core.py`. It defines the following tables; Alembic also tracks its schema revision in `alembic_version`.

| Table | Purpose and key fields |
|---|---|
| `admin` | Unique normalized username, Argon2 password hash, disabled flag and creation time. There is no default account or stored plaintext password. |
| `session` | SHA-256 hash of an opaque session token, linked admin, expiry and optional revocation timestamp. The raw token is in an HttpOnly browser cookie, not in this table. Sessions expire after eight hours and logout revokes the token. |
| `price_record` | Positive integer centavos per kg, source reference, publisher and publication timestamp. The application appends records; a PostgreSQL trigger rejects updates and deletes. |
| `price_state` | Singleton current-record pointer and nonnegative revision. Publication locks this row, checks the submitted expected revision and atomically advances it; stale writes return 409. |

The current implementation makes each published record current immediately. It has no future-effective scheduling, commodity/coverage columns, or public history endpoint/screen. The thesis proposes those features; it does not prove they are implemented. Enter an appropriate live-hog price with a traceable source; the system does not validate that a source actually supports the rate. For a valuation, the API reads one current-price snapshot after inference and multiplies its decimal price by the two-decimal weight actually returned, with half-up currency rounding. When no price exists, a valid weight remains available without valuation.

Ordinary photos and computed estimates are not stored in these application tables. Uploads are temporarily spooled and decoded for processing; normal completion, rejection and handled cancellation close their resources. This does not prove the behavior of platform logs, external backups or files after an abrupt process/host failure. A separately consented research archive, its retention policy and real study results are proposals, not existing database features.

## Migrations and administration

For a dedicated local database, the [root setup](../../README.md#run-from-a-fresh-checkout) installs locked dependencies, applies `uv run --env-file .env alembic upgrade head`, and bootstraps an administrator interactively. `create-admin` prompts for a 12–128 character password twice, rejects duplicate usernames, and writes its hash. Do not paste secrets into commands, source files or logs. Use a separate disposable database for tests: the test suite intentionally truncates application tables and must never target an existing user or hosted database.

The Railway API uses `.venv/bin/alembic upgrade head` as its pre-deploy command. The November 3 release confirmed that the existing database was already at `0001_core` head and introduced no new migration. The database must be reachable before the command runs. Migration success is independent of app health; a failed or rolled-back deployment does not reverse a migration that already committed. Review schema compatibility, back up first, and serialize releases. The initial migration's downgrade drops tables and data; do not run it against valuable data as a routine recovery step.

## Backup and recovery

Before any authorized restoration or schema change:

1. Identify the exact project, environment, Postgres service and volume; inspect current service status and available backups. Do not delete, reinitialize, detach or overwrite a volume simply because its deployment was removed.
2. Establish a recovery point with an approved, access-controlled PostgreSQL backup procedure or Railway volume backup. Include roles/permissions as required by the chosen method, and store backup credentials separately. A backup's existence does not establish that it can be restored.
3. Test a logical PostgreSQL backup in an **isolated** instance, verify the Alembic revision, row counts, price revision and current record, and inspect logs without exposing data or credentials. Railway volume backups have different mechanics: provider documentation says they can only be restored in the same project and environment. Restoration stages a replacement volume for the attached service, and applying it redeploys that service. Do not treat that as an automatically isolated test; plan and authorize the switch separately. Document the recovery decision and validate the API against the restored database before switching production.

No backup schedule, restore drill or recovery point was verified during the handoff or November 3 release. The existing data directory and preserved price snapshot were observed, but they do not establish recoverability. Railway's [volume backup documentation](https://docs.railway.com/volumes/backups) describes the provider mechanism; compare its guarantees and costs with the required recovery objectives before relying on it.
