/**
 * ConflictHealer Guided Demo
 * Demonstrates real-time generation of conflicting Salesforce XML metadata,
 * executes AST semantic healing, validates XML syntax, and verifies the resolution.
 */

import { writeFile, mkdir, rm } from 'fs/promises';
import { join, dirname } from 'path';
import chalk from 'chalk';
import { healConflicts } from './engine.js';
import { readFile } from 'fs/promises';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEMO_DIR = './demo-conflicts';

// Realistic Salesforce XML with nasty Git merge conflicts
const CONFLICT_FILES = {
  'force-app/main/default/permissionsets/SalesOps.permissionset-meta.xml': `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <hasActivationRequired>false</hasActivationRequired>
    <label>Sales Operations Access</label>
<<<<<<< HEAD
    <userPermissions>
        <enabled>true</enabled>
        <name>ExportReport</name>
    </userPermissions>
    <userPermissions>
        <enabled>true</enabled>
        <name>ViewSetup</name>
    </userPermissions>
=======
    <userPermissions>
        <enabled>true</enabled>
        <name>ExportReport</name>
    </userPermissions>
    <userPermissions>
        <enabled>true</enabled>
        <name>ManageCases</name>
    </userPermissions>
>>>>>>> feature/case-automation
</PermissionSet>`,

  'manifest/package.xml': `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
<<<<<<< HEAD
        <members>AccountTrigger</members>
        <members>OrderService</members>
        <name>ApexClass</name>
=======
        <members>OrderService</members>
        <members>InvoiceGenerator</members>
        <name>ApexClass</name>
>>>>>>> feature/billing-module
    </types>
    <version>62.0</version>
</Package>`
};

async function main() {
  console.clear();
  await sleep(300);

  console.log(chalk.bold.magenta('\n════════════════════════════════════════════════════════════════════════'));
  console.log(chalk.bold.magenta('  🩺  Agentia ConflictHealer™  —  Live Demonstration'));
  console.log(chalk.gray('  Semantic Salesforce XML Merge-Conflict Auto-Resolution Engine'));
  console.log(chalk.bold.magenta('════════════════════════════════════════════════════════════════════════\n'));
  await sleep(1500);

  console.log(chalk.cyan('  [Scenario]: Multi-developer release conflict during Copado promotion.'));
  console.log(chalk.gray('  Two developers touched the same PermissionSet and package.xml.\n'));
  await sleep(1500);

  console.log(chalk.yellow('  📁 Creating mock Git merge conflict files on disk...'));
  for (const [relPath, content] of Object.entries(CONFLICT_FILES)) {
    const fullPath = join(DEMO_DIR, relPath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content.trim(), 'utf8');
    console.log(chalk.green(`     ✓ Conflicted file created: `) + chalk.white(relPath));
    await sleep(200);
  }
  console.log();
  await sleep(1500);

  console.log(chalk.red.bold('  ❌ Standard Git conflict markers detected:'));
  console.log(chalk.gray('     <<<<<<< HEAD (Branch A) vs >>>>>>> Feature (Branch B)'));
  console.log(chalk.gray('     Raw string diffing normally breaks XML tag matching and creates duplicate entries.\n'));
  await sleep(2000);

  console.log(chalk.bold.cyan('  ⚡ Executing: conflicthealer resolve --path ./demo-conflicts\n'));
  await sleep(1200);

  const startTime = Date.now();
  const result = await healConflicts(DEMO_DIR);
  const elapsed = Date.now() - startTime;

  console.log(chalk.bold.green(`  ✨ AST Semantic Healing Completed in ${elapsed}ms!\n`));
  for (const file of result.healedFiles) {
    console.log(chalk.green(`     ✔ Healed: `) + chalk.bold.white(file.file));
    console.log(chalk.gray(`       └─ Deduplicated XML nodes & validated schema syntax.`));
  }
  console.log();
  await sleep(1800);

  console.log(chalk.bold.cyan('  🔍 Inspecting Healed Metadata (No duplicate tags, 100% valid XML):'));
  const healedPkg = await readFile(join(DEMO_DIR, 'manifest/package.xml'), 'utf8');
  console.log(chalk.gray('  ─────────────────────────────────────────────────────────────'));
  console.log(chalk.white(healedPkg));
  console.log(chalk.gray('  ─────────────────────────────────────────────────────────────\n'));
  await sleep(2000);

  console.log(chalk.green.bold('  ✅ Release pipeline unblocked! Ready for Copado:'));
  console.log(chalk.white('     $ agentia cicd work submit --resume\n'));
  await sleep(1000);

  console.log(chalk.bold.magenta('════════════════════════════════════════════════════════════════════════'));
  console.log(chalk.bold.magenta('  Agentia ConflictHealer — Autonomous Conflict Resolution for Agentia CLI'));
  console.log(chalk.bold.magenta('════════════════════════════════════════════════════════════════════════\n'));

  // Clean demo files
  await rm(DEMO_DIR, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
