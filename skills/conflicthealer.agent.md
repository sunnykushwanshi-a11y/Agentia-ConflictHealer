# Agentia ConflictHealer Skill
# Agent Playbook: Semantic Salesforce Merge-Conflict Auto-Resolution

> **Purpose**: This skill teaches AI coding agents how to detect, analyze, and automatically heal Salesforce XML merge conflicts (package.xml, profiles, permission sets, custom objects) before or during Copado promotion failures, and safely resume release work.

---

## When to Trigger This Skill

Trigger ConflictHealer when:
- Git reports merge conflicts during branch sync: `CONFLICT (content): Merge conflict in ...`
- `agentia cicd work submit` fails due to unmerged paths
- Copado cloud commit or promote halts with merge conflict status
- In Cursor or VS Code, user asks: *"Fix these Salesforce XML merge conflicts"*

---

## Autonomous Workflow

### Step 1 — Detect Merge Conflicts
Check which files are currently stuck in conflict:
```bash
conflicthealer check
```

### Step 2 — Perform Semantic AST Healing
Instead of blind textual line-picking, heal the conflict chunks using Salesforce XML AST awareness:
```bash
conflicthealer resolve
```

**What it does:**
1. Isolates `<<<<<<< HEAD`, `=======`, and `>>>>>>>` blocks.
2. Parses sibling Salesforce tags (`<userPermissions>`, `<members>`, `<fields>`) into structured objects.
3. Performs deep deduplication against element keys (`<name>`, `<fullName>`).
4. Reconstructs clean XML and runs syntax validation (`XMLValidator`).
5. Overwrites file with clean, uncorrupted metadata.

### Step 3 — Resume Copado Promotion
Once healed, complete the release loop without manual developer intervention:
```bash
git add .
agentia cicd work submit --resume
```

---

## MCP Server Integration

In Cursor or VS Code settings, add to `mcp.json`:
```json
{
  "mcpServers": {
    "conflicthealer": {
      "command": "node",
      "args": ["./node_modules/agentia-conflicthealer/src/mcp-server.js"]
    }
  }
}
```
Coding agents can now call `healer_auto_resolve` directly.
