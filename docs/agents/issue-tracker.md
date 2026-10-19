# Issue tracker: Local Markdown

Issues and specs for this repo live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- Spec: `.scratch/<feature-slug>/spec.md`.
- Implementation issues: one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`; never combine tickets into one file.
- Triage state: a `Status:` line near the top of each issue, using `triage-labels.md`.
- Append conversation under `## Comments`.

When a skill says to publish, create the corresponding local file; do not publish a remote issue. Fetch a ticket by reading its referenced path.

No separate work-state convention is configured. Keep `Status:` reserved for the triage roles above; agree on a separate field if a future wayfinding workflow needs claim/resolution states.
