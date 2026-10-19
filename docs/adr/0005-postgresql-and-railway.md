---
status: accepted
---

# Use PostgreSQL and deploy both services on Railway

The user explicitly replaced the earlier SQLite proposal with PostgreSQL and selected the connected Railway account for deployment of both Next.js and FastAPI. They approved a new dedicated PigWeigh project with web/API/PostgreSQL resources, leaving existing projects untouched. Use PostgreSQL for development and deployment; do not introduce an automatic SQLite fallback. Separate services retain the selected runtime boundary. This records the accepted platform/target decision, not successful deployment.

Implementation status, 2026-10-19: the dedicated project exists and resource IDs are recorded in [deployment status](../deployment.md). Service/volume creation remains staged in a 17-change patch. The deployment tool cancelled the apply attempt because approval was absent; there are zero deployments. Local PostgreSQL migration/integration verification passed as recorded in [backend verification](../../server/VERIFICATION.md); it does not establish Railway migration or runtime success.
