# Repository-local skills

These snapshots can be read from a fresh checkout in any editor. If the host discovers `.agents/skills`, invoke the skill by its name; otherwise ask the assistant to read the linked `SKILL.md` and apply it to the task. For example:

```text
Read .agents/skills/lead-orchestrator/SKILL.md and use it to coordinate this task.
```

Configure the lead runtime before starting it, as its skill describes. Worker model and effort selection is per run; reading a file cannot install models, change the lead's running model, or create dispatch capabilities. The user can also ask an assistant to read a design or Ponytail skill directly.

| Skill | Source snapshot | Use |
| --- | --- | --- |
| [lead-orchestrator](lead-orchestrator/SKILL.md) | Installed Codex skill, unversioned snapshot on 2026-11-05 | Coordinate explicitly requested multi-agent work. |
| [ponytail](ponytail/SKILL.md) | Ponytail plugin 5.3.3 | Keep a coding change small and complete. |
| [emil-design-eng](emil-design-eng/SKILL.md) | Installed skill, unversioned snapshot on 2026-11-05 | Apply design-engineering guidance to UI polish and motion. |
| [apple-design](apple-design/SKILL.md) | Installed skill, unversioned snapshot on 2026-11-05 | Consult Apple's interface and motion design principles. |

The Ponytail and design `SKILL.md` files are unchanged snapshots. The lead's [host metadata](lead-orchestrator/agents/openai.yaml) is unchanged; its `SKILL.md` is intentionally adapted for this repository's lead/worker model policy and local UI handoff. The local `.gitattributes` preserves the unchanged files' bytes across checkout platforms. The user's instructions and the project's [design system](../../DESIGN.md) take precedence over generic skill examples.

Source inventory and SHA-256 at snapshot time:

| Skill / source file | SHA-256 |
| --- | --- |
| `lead-orchestrator/SKILL.md` | `efe6718c98a4d98d41583b3e9badb110121b447cfdcf8b3690a62df046bbdcdf` |
| `lead-orchestrator/agents/openai.yaml` | `13e00d8a94a35c29eaa10804a79a53b49da4ff4c1c5cad54024b6f916d3772f3` |
| `ponytail/SKILL.md` | `f18008471528f0adde90a560d053f85935eed5cee26c447b7177ad24472bcf32` |
| `emil-design-eng/SKILL.md` | `a2ee9da0840c23b509a27e742edbc8f8fdb4416ca7d6ffde67d79023bfb8a5bf` |
| `apple-design/SKILL.md` | `bcab965ec01d05101b817714f8ccaf68632d1697b822f65718e811119a77c049` |

The orchestration skill needs a host with worker-dispatch tools and supported model/effort controls. The repository's worktree, integration and interactive QA rules also refer to host-provided `using-git-worktrees`, `finishing-a-development-branch`, `computer-use`, and `android-cli` skills; those are not included here. Android interaction additionally needs `adb`, and web UI QA needs Chrome. Install or otherwise provide the required host tools when those workflows apply, and follow the shared-resource confirmation rules in [AGENTS.md](../../AGENTS.md).
