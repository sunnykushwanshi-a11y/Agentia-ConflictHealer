# 🩺 Agentia ConflictHealer™

> **Semantic Salesforce XML Merge-Conflict Auto-Resolution Engine for Copado Agentia™ CLI**

[![Agentia CLI](https://img.shields.io/badge/Agentia-CLI-7c3aed)](https://developer.copado.com/docs)
[![Tests](https://img.shields.io/badge/Tests-16%20Passed-brightgreen)](#-automated-test-suite)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-green)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Agentia ConflictHealer™** integrates with the **Copado Agentia™ CLI** to automatically resolve complex Git merge conflicts in Salesforce metadata files (`package.xml`, PermissionSets, Profiles) using semantic Abstract Syntax Tree (AST) merging, schema-aware deduplication, 3-way base-document comparison, and atomic safe file writing.

---

## 💥 The Real-World Problem

In multi-developer Salesforce teams using Copado and Git, developers constantly collide on shared XML metadata files:

- `package.xml` manifest — two developers adding different Apex classes or components
- PermissionSet / Profile XML — competing `<userPermissions>`, `<fieldPermissions>`, `<objectPermissions>`
- CustomObject XML — simultaneous additions to the same metadata type

Standard Git merge resolution does **blind textual line-matching**. This results in:
- ❌ Corrupted XML tags and broken syntax
- ❌ Duplicate permission entries that fail Salesforce deployment
- ❌ Silently discarded developer changes
- ❌ Blocked `agentia cicd work submit` and Copado release pipelines

---

## ⚡ The Solution

**Agentia ConflictHealer™** transforms merge conflicts into valid Salesforce metadata automatically:

1. **Conflict Parsing** — Detects `<<<<<<< HEAD`, `=======`, `>>>>>>>` markers. Handles multiple conflict regions per file and safely rejects malformed markers.
2. **Branch Reconstruction** — Separately reconstructs the `ours` and `theirs` branches from conflict markers.
3. **3-Way Base Comparison** — Optional base document support enables proper delete detection and modify-vs-delete collision routing.
4. **Salesforce-Aware XML AST Merging** — Parses XML structurally via `fast-xml-parser`, matches elements by semantic keys (`<name>`, `<fullName>`, `<field>`), and performs type-safe additive union.
5. **Conflict Detection** — Incompatible edits (e.g. two different API versions, two different permission values for the same field) are routed to manual review — never silently overwritten.
6. **XML Validation** — Every output file is independently parsed to verify well-formedness before being written to disk.
7. **Atomic Safe Writes** — Files are written to a `.tmp` path first, validated, then atomically replaced. Original files are never touched if resolution fails.
8. **Backup Creation** — A `.bak` copy of every original conflicted file is retained.

---

## 🏗️ Architecture

```
Developer Workspace / Copado Release Pipeline
│
├── Agentia CLI                    ← Core DevOps orchestrator
│   └── agentia cicd work submit   ← Blocked by Git conflict markers
│
├── ConflictHealer (Agentia Plugin)
│   ├── CLI  (conflicthealer resolve / check)   ← Direct resolution
│   ├── MCP Server (healer_auto_resolve tool)   ← IDE agent integration
│   └── Agent Skill (conflicthealer.agent.md)   ← Agent playbook
│
└── Semantic XML AST Engine
    ├── conflict-parser.js         ← Git marker detection & branch reconstruction
    ├── engine.js                  ← Orchestrator: glob, atomic write, backup
    ├── resolvers/xml-resolver.js          ← Routing facade
    ├── resolvers/package-resolver.js      ← package.xml 3-way merge
    └── resolvers/permissionset-resolver.js ← PermissionSet / Profile 3-way merge
```

---

## 📁 Project Structure

```
agentia-conflicthealer/
├── src/
│   ├── cli.js                          # CLI: resolve & check commands
│   ├── engine.js                       # Core orchestrator (glob, atomic write)
│   ├── conflict-parser.js              # Git conflict marker parser
│   ├── guided-demo.js                  # Full screen-recording demo script
│   ├── mcp-server.js                   # MCP server (healer_auto_resolve tool)
│   └── resolvers/
│       ├── xml-resolver.js             # Routing facade
│       ├── package-resolver.js         # package.xml semantic merge
│       └── permissionset-resolver.js   # PermissionSet / Profile merge
├── tests/
│   └── test-suite.js                   # 16-scenario automated test suite
├── skills/
│   └── conflicthealer.agent.md         # Agentia Agent Skill playbook
├── .github/
│   └── plugin.json                     # Agentia plugin manifest & hooks
├── package.json
├── .gitignore
└── README.md
```

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run the live CLI demonstration
node src/guided-demo.js

# 3. Run the full automated test suite
node tests/test-suite.js

# 4. Resolve conflicts in your own Salesforce workspace
node src/cli.js resolve --path ./your-repo

# 5. Check for unresolved conflicts (exits non-zero if found)
node src/cli.js check --path ./your-repo
```

---

## 🎬 Demo Output

```
════════════════════════════════════════════════════════════════════════
  🩺  Agentia ConflictHealer™  —  CLI Demonstration
  Semantic Salesforce XML Merge-Conflict Auto-Resolution Engine
════════════════════════════════════════════════════════════════════════

  [Scenario]: Multi-branch metadata collisions in Copado release pipeline.
  Branch A (HEAD) and Branch B (feature) concurrently touched shared files.

  📁 Creating fresh Git merge conflict fixtures on disk...
     ✓ Created: manifest/package.xml
     ✓ Created: force-app/main/default/permissionsets/SalesOps.permissionset-meta.xml

  ⚡ Executing: conflicthealer resolve --path ./demo-conflicts

  Execution Summary:
  └─ Files scanned:              2
  └─ Conflicts detected:         2
  └─ Files resolved:             2
  └─ Conflicts requiring review: 0
  └─ Errors encountered:         0
  └─ Actual elapsed time:        301ms

    ✔ manifest\package.xml
      └─ XML PARSE: PASS (well-formed XML verified)
      └─ METADATA CHECK: PASS (structural invariants verified)
      └─ Elements preserved: 3, Duplicates removed: 1
      └─ Backup created: manifest\package.xml.bak

    ✔ force-app\main\default\permissionsets\SalesOps.permissionset-meta.xml
      └─ XML PARSE: PASS (well-formed XML verified)
      └─ METADATA CHECK: PASS (structural invariants verified)
      └─ Permissions preserved: 3, Duplicates removed: 1
      └─ Backup created: ...SalesOps.permissionset-meta.xml.bak

  🔍 Independent Verification of Output (manifest/package.xml):
  ─────────────────────────────────────────────────────────────
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>AccountTrigger</members>
        <members>InvoiceGenerator</members>
        <members>OrderService</members>
        <name>ApexClass</name>
    </types>
    <version>62.0</version>
</Package>

  XML Well-Formedness: PASS
  Git Conflict Markers Absent: PASS

  🚀 Merge Resolved — Ready for Downstream Validation
════════════════════════════════════════════════════════════════════════
```

---

## 🧪 Automated Test Suite

**16 tests — 0 failures**

```
🧪 Starting Agentia ConflictHealer Automated Test Suite...

  ✔ PASS:  1. Two developers adding different members to package.xml
  ✔ PASS:  2. Duplicate package members properly deduplicated
  ✔ PASS:  3. Multiple metadata types in one manifest
  ✔ PASS:  4. Conflicting API version values routed to review
  ✔ PASS:  5. Compatible Permission Set additions merged cleanly
  ✔ PASS:  6. Incompatible changes to same Permission Set routed to review
  ✔ PASS:  7. Entry modified in one branch and deleted in other handled safely
  ✔ PASS:  8. Malformed XML rejected without corruption
  ✔ PASS:  9. Incomplete Git conflict markers caught safely
  ✔ PASS: 10. Multiple conflict regions in one file resolved cleanly
  ✔ PASS: 11. Unresolved conflict preserves original with diagnostics
  ✔ PASS: 12. Idempotency: Running twice produces identical output
  ✔ PASS: 13. 3-Way Base: Clean deletion by one branch honored when base provided
  ✔ PASS: 14. 3-Way Base: Modify vs Delete collision routed to review
  ✔ PASS: 15. 3-Way Base: Both modifying same item differently routed to review
  ✔ PASS: 16. Atomic write safety: Unresolved files never modified, no temp artifacts left

════════════════════════════════════════════════════════════════════════
  Test Results: 16 Passed, 0 Failed (Total: 16)
════════════════════════════════════════════════════════════════════════
```

---

## 🔒 Safety Guarantees

| Guarantee | Implementation |
|---|---|
| Original file never corrupted on failure | Atomic write: `.tmp` → validate → replace |
| Backup always retained | `.bak` copy created before any write |
| Unresolvable conflicts never silently overwritten | Routed to manual review with diagnostics |
| Deleted entries not silently reintroduced | 3-way base comparison detects deletions |
| No validation theatre | XML well-formedness only — no fake Salesforce deployment claimed |
| Idempotent | Running twice on same file produces identical output |

---

## 🤖 MCP & Agentia Integration

### Model Context Protocol Server

Add to your project's `mcp.json`:

```json
{
  "mcpServers": {
    "conflicthealer": {
      "command": "node",
      "args": ["./src/mcp-server.js"]
    }
  }
}
```

The MCP server exposes the `healer_auto_resolve` tool, which AI coding agents can invoke to automatically heal merge conflicts in real time.

### Agentia Plugin

The `.github/plugin.json` manifest registers ConflictHealer as a native Agentia CLI plugin with pre-push hooks, enabling automatic conflict detection before every `agentia cicd work submit`.

### Copado Release Workflow (Proposed)

```bash
# When a merge conflict blocks the pipeline:
conflicthealer resolve
git add .
git commit -m "chore: auto-resolve metadata conflicts via ConflictHealer"

# Resume the Copado pipeline (when configured):
agentia cicd work submit --resume
```

---

## 🛠️ Technologies Used

| Technology | Purpose |
|---|---|
| Copado Agentia CLI (`@copado/agentia-cli@beta`) | Core DevOps orchestration platform |
| Model Context Protocol SDK (`@modelcontextprotocol/sdk`) | AI agent tool integration |
| `fast-xml-parser` | Salesforce XML AST parsing and building |
| `commander` | CLI command framework |
| `chalk` | Terminal output formatting |
| `glob` | Recursive conflict file discovery |
| Node.js ESM (≥18) | Runtime (native ES modules throughout) |

---

## 🏆 Hackathon Alignment — Copado Agentia™ CLI Hackathon 2026

- **Innovation** — First semantic XML AST conflict resolution engine specifically tailored for Salesforce DevOps metadata, with 3-way base-document merging and per-element conflict detection.
- **Impact** — Eliminates the #1 cause of broken Copado release pipelines: corrupted XML from blind Git text merges.
- **Safety** — Every auto-resolution decision is deterministic and auditable. Ambiguous conflicts are never silently resolved.
- **Extensibility** — Native Agentia CLI plugin, MCP server, and Agent Skill — works in the IDE, on the command line, and inside AI agent loops.

---

## 📄 License

MIT License © 2026 Sunny Kushwanshi
