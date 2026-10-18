---
name: agent-instructions
description: >-
  Place and maintain Tao agent guidance. Use when adding, editing, removing, or auditing
  AGENTS.md, CLAUDE.md, SKILL.md, subagent profiles, generated harness adapters, or durable
  instructions; read before writing AGENTS.md or SKILL.md text.
---

# Agent Instructions

- This file owns **where** a rule goes. `references/writing-agents-md.md` owns **how it is written** once you know — how much "why" a rule carries, what belongs and what does not. Read it before editing the text of an `AGENTS.md` or a `SKILL.md`.
- Put universal constraints and routing in root `AGENTS.md`.
- Put subtree invariants in the nearest nested `AGENTS.md` only when they apply to nearly every edit there.
- Put conditional workflows or domain knowledge in one focused skill under `agents/skills/<name>/SKILL.md`.
- Put mechanical checks, orchestration, and command details in repository automation. Put API-local usage rules in the owning JSDoc.
- Keep one owner for each rule. Remove stale, conflicting, or duplicated guidance in the same change.
- State outcomes, hard constraints, success criteria, and important exceptions. Do not explain routine engineering steps the model can infer from repository evidence.
- Keep skill directory and frontmatter names identical. The YAML `description` owns discovery:
  state what the skill does and when to use it, with concrete task phrases, within 1024 characters.
  Keep workflow detail in the body; do not duplicate activation conditions in `AGENTS.md`.
- Keep canonical agent sources under `agents/`: project skills in `agents/skills/` and reusable profiles in `agents/subagents/`.
- CLI-shipped Tao app skills are the exception: their source lives in `packages/ai/tao-skills/skills/`, with `agents/skills/tao-skills` linking to its router so the shipped text has one owner.
- The `delegation` skill owns when to use a subagent, model tiers, briefs and return contracts. Keep native model defaults consistent with its routing table. Give profiles matching Claude Code and Cursor model choices, descriptions, read-only settings and explicit Claude tool allowlists. Read-only profiles must not list `Edit` or `Write`; approval settings alone do not remove tools.
- Keep `.claude/CLAUDE.md` as the root-instruction include. Point `.agents/skills`, `.codex/skills`, and `.claude/skills` at `agents/skills`; point `.rulesync/subagents` at `agents/subagents`.
- Generate tool-specific subagent adapters with `./agent agent-config`. Do not edit or commit generated `.codex/agents/`, `.claude/agents/`, or `.cursor/agents/` files. A profile reaches a harness only when its `targets:` list names that harness; rulesync skips an untargeted profile silently rather than failing.
- Rulesync owns subagent adapters and Codex/Claude hooks only; hooks come from `.rulesync/hooks.jsonc`. `./agent agent-config` regenerates those outputs without replacing native settings.
- Maintain permissions, sandbox settings, model defaults and opt-in profiles natively: `.codex/config.toml`, `.codex/rules/tao.rules`, `.claude/settings.json`, `.claude/settings.*.json`, and `.cursor/permissions.json`. Cursor worktree setup stays in `.cursor/worktrees.json` and `.cursor/worktree-setup.sh`. Do not recreate custom translators for unsupported Rulesync settings or install machine-local Git permissions.
- When a native rule changes, update its equivalents across Codex, Claude Code and Cursor in the same change, including named host exceptions from `.config/agent-host-commands.json` and model defaults from `delegation`. Preserve harness-specific syntax and limits; record unsupported equivalents in `.artifacts/notes/` rather than claiming identical enforcement. Cursor's prose auto-run permissions do not grant an OS sandbox escape. `.rulesync/permissions.jsonc` and `.rulesync/profiles.jsonc` remain legacy reference inputs, not owners of the new native settings.
- After edits, search active code and docs for removed names, paths, commands, and duplicated ownership. Keep `Docs/Archive/` frozen after merge unless the Developer explicitly asks; other `Docs/Roadmap/` documents remain live.
- Validate instruction or automation changes under the checkout's `AGENTS.md` policy. In a
  Developer-directed primary `dev/<name>` checkout, use focused checks and defer full verification
  until authorized landing.
