# Vendored skill packs

These are copied into the repo instead of installed as plugins, because cloud sessions (claude.ai/code, the Claude phone app) don't install plugins listed in `.claude/settings.json`. They do load `.claude/skills/`, `.claude/agents/` and `.claude/commands/` from the repo, so local and cloud sessions get the same skills.

| Pack | Source | Commit | License |
|---|---|---|---|
| agent-skills | https://github.com/addyosmani/agent-skills | `aeac41d4d005999432bb7312f7ff06383a91d59d` | MIT, see `licenses/agent-skills-LICENSE` |
| karpathy-guidelines | https://github.com/multica-ai/andrej-karpathy-skills | `2c606141936f1eeef17fa3043a72095b4765b9c2` | MIT, per the repo README and the skill's frontmatter |

## Where things went
| From (agent-skills repo) | To |
|---|---|
| `skills/*` | `.claude/skills/*` |
| `agents/*.md` | `.claude/agents/` |
| `.claude/commands/*.md` | `.claude/commands/agent-skills/`, so they keep the names `/agent-skills:plan`, `/agent-skills:build`, … and don't shadow the built-in `/plan` and `/review` |
| `references/*.md` | `.claude/references/`, so the skills' `../../references/...` links still resolve |

karpathy `skills/karpathy-guidelines` → `.claude/skills/karpathy-guidelines`.

## Local edits
- Skill references written as `agent-skills:<skill>` (the plugin's namespaced form) were rewritten to the plain `<skill>` name that a project skill has.

## Updating
1. Shallow-clone both repos to a temp folder.
2. Repeat the copies in the table above, then re-apply the local edit: `sed -i -E 's/agent-skills:([a-z])/\1/g'` on the copied files.
3. Update the commit SHAs above and review the diff before committing.
