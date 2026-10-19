---
status: accepted
---

# Migrate the app to a web frontend and Python backend

The user selected Next.js with Tailwind CSS (without ShadCN) and FastAPI with SQLAlchemy, managed through uv, to replace the Flutter/Express application. Keep interface concerns in `web/` and server/inference concerns in `server/`; the user supplies trained models. This changes the runtime and model-serving boundary while preserving admin price publication and anonymous capture-to-result tasks. Database and deployment were undecided when this boundary was recorded; the later explicit PostgreSQL/Railway decision is captured in ADR-0005. Session engineering direction lives in `../implementation-contract.md`.
