# 🩺 Agentia ConflictHealer™

> **Semantic Salesforce XML & Metadata Merge-Conflict Auto-Resolution Engine for Copado Agentia™ CLI**

[![Agentia CLI](https://img.shields.io/badge/Agentia-CLI-7c3aed)](https://developer.copado.com/docs)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-≥18-green)](https://nodejs.org)

ConflictHealer integrates with the **Copado Agentia™ CLI** to resolve complex Git merge conflicts across Salesforce metadata (`package.xml`, Profiles, PermissionSets, CustomObjects) using semantic Abstract Syntax Tree (AST) merging, schema deduplication, and schema validation.

---

## 💥 The Real-World Problem

In multi-developer Salesforce teams using Copado and Git, developers constantly collide on shared XML files:
* `package.xml` manifest collisions
* Profiles and PermissionSets with competing `<userPermissions>` or `<fieldPermissions>`
* CustomObject XML metadata additions

Standard Git merge resolution does blind textual line-matching. This results in **corrupted XML tags, broken syntax, and duplicate permissions**, grinding release pipelines to a halt during `agentia cicd work submit` or promotion syncs.

---

## ⚡ The Solution

**Agentia ConflictHealer** transforms merge conflicts into valid Salesforce metadata automatically:

1. **Conflict Parsing:** Detects standard `<<<<<<< HEAD`, `=======`, and `>>>>>>>` markers.
2. **Salesforce XML AST Reconciliation:** Parses conflicting sibling elements, matches elements by unique identifiers (`<name>`, `<fullName>`), and performs deduplicated additive unions.
3. **Syntax Integrity Verification:** Validates the healed XML against XML schema constraints before committing.
4. **Seamless Copado Release Loop:** Automatically unblocks `agentia cicd work submit --resume`.

---

## 🏗️ Architecture

```
Developer Workspace / Copado Release Pipeline
│
├── Agentia CLI                  ← Core DevOps orchestrator
│   └── agentia cicd work submit ← Fails on Git conflict
│
├── ConflictHealer (Plugin)
│   ├── CLI (conflicthealer resolve) ← Automated resolution
│   ├── MCP Server (healer_auto_resolve) ← IDE agent tool
│   └── Agent Skill (conflicthealer.agent.md) ← Agent playbook
│
└── Semantic XML AST Engine
    ├── package.xml types & member deduplicator
    ├── Profile & PermissionSet permission reconciler
    └── XMLValidator schema compliance gate
```

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Test with guided simulation
node src/guided-demo.js

# Resolve conflicts in current workspace
node src/cli.js resolve
```

---

## 🤖 MCP & Agentia Skills Integration

### 1. Model Context Protocol (MCP)
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

### 2. Copado Release Workflow
```bash
# When merge conflict occurs during sync:
conflicthealer resolve
git add .
agentia cicd work submit --resume
```

---

## 🏆 Hackathon Alignment

* **Innovation:** First semantic XML AST conflict resolution engine specifically tailored for Salesforce DevOps metadata.
* **Impact:** Eliminates the #1 cause of broken deployment pipelines and manual developer merge frustration.
* **Extensibility:** Implemented as a native Agentia CLI plugin, Model Context Protocol server, and Agent Skill.

MIT License © 2026 Sunny Kushwanshi
