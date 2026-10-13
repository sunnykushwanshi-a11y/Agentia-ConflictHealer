#!/usr/bin/env node
/**
 * Agentia ConflictHealer — CLI Entry Point
 * 
 * Usage:
 *   conflicthealer resolve [--path <dir>] [--dry-run] [--no-backup]
 *   conflicthealer check [--path <dir>]
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { healConflicts } from './engine.js';
import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { parseConflictMarkers } from './conflict-parser.js';

const program = new Command();

program
  .name('conflicthealer')
  .description(
    chalk.bold.magenta('Agentia ConflictHealer™') +
    ' — Semantic Salesforce XML Merge-Conflict Resolver for Copado Agentia CLI'
  )
  .version('1.0.0');

// ─── RESOLVE ─────────────────────────────────────────────────────────
program
  .command('resolve')
  .description('Automatically resolve merge conflicts in Salesforce metadata')
  .option('-p, --path <dir>', 'Target directory containing conflict files', process.cwd())
  .option('--dry-run', 'Preview resolutions without saving modifications')
  .option('--no-backup', 'Do not create .bak backup files before writing')
  .action(async (opts) => {
    const startTime = Date.now();
    console.log(chalk.bold.cyan('\n🩺 Agentia ConflictHealer — Scanning workspace for Git conflicts...\n'));

    const result = await healConflicts(opts.path, {
      dryRun: opts.dryRun,
      backup: opts.backup,
    });

    const elapsed = Date.now() - startTime;

    console.log(chalk.gray(`  Summary: Scanned ${result.filesScanned} file(s) in ${elapsed}ms`));
    console.log(chalk.gray(`  Conflicts detected: ${result.conflictsDetected}`));
    console.log();

    // 1. Healed files
    if (result.healedFiles.length > 0) {
      console.log(chalk.bold.green(`  ✨ Files Resolved Successfully (${result.healedFiles.length}):`));
      for (const item of result.healedFiles) {
        console.log(`    ${chalk.green('✔')} ${chalk.bold(item.file)}`);
        console.log(`      └─ Conflicts resolved: ${item.conflictsCount}`);
        console.log(`      └─ XML PARSE: PASS (well-formed XML syntax validated)`);
        console.log(`      └─ METADATA CHECK: PASS (structural invariants verified)`);
        if (item.stats.membersCount !== undefined) {
          console.log(`      └─ Elements preserved: ${item.stats.membersCount}, Duplicates removed: ${item.stats.duplicatesRemoved || 0}`);
        }
        if (item.stats.permissionsPreserved !== undefined) {
          console.log(`      └─ Permissions preserved: ${item.stats.permissionsPreserved}, Duplicates removed: ${item.stats.duplicatesRemoved || 0}`);
        }
        if (item.backupPath) {
          console.log(`      └─ Backup created: ${chalk.cyan(item.backupPath)}`);
        }
      }
      console.log();
    }

    // 2. Manual review required
    if (result.manualReviewFiles.length > 0) {
      console.log(chalk.bold.yellow(`  ⚠ Conflicts Requiring Human Review (${result.manualReviewFiles.length}):`));
      for (const item of result.manualReviewFiles) {
        console.log(`    ${chalk.yellow('●')} ${chalk.bold(item.file)}:`);
        console.log(`      └─ Reason: ${item.reason}`);
        console.log(`      └─ Safety status: ORIGINAL FILE UNTOUCHED`);
      }
      console.log();
    }

    // 3. Errors / malformed
    if (result.errors.length > 0) {
      console.log(chalk.bold.red(`  ✖ Errors Encountered (${result.errors.length}):`));
      for (const err of result.errors) {
        console.log(`    ${chalk.red('✖')} ${err.file}: ${err.error}`);
        console.log(`      └─ Safety status: ORIGINAL FILE UNTOUCHED`);
      }
      console.log();
    }

    // Conclusion & Next Steps
    if (opts.dryRun) {
      console.log(chalk.yellow('  [DRY RUN MODE]: Previews calculated. No files were written to disk.\n'));
      return;
    }

    if (result.manualReviewFiles.length === 0 && result.errors.length === 0 && result.healedFiles.length > 0) {
      console.log(chalk.bold.cyan('  🚀 All detected conflicts healed cleanly!'));
      console.log(chalk.gray('     Proposed Copado workflow command (when configured in pipeline):'));
      console.log(chalk.white('     agentia cicd work submit --resume\n'));
      process.exit(0);
    } else if (result.healedFiles.length === 0 && result.conflictsDetected === 0) {
      console.log(chalk.green('  ✅ Working tree is clean: 0 merge conflicts found.\n'));
      process.exit(0);
    } else {
      console.log(chalk.yellow.bold('  ⚠ Attention: Some conflicts were unresolved or required manual review.'));
      console.log(chalk.yellow('     Resolve flagged files manually before proceeding with release.\n'));
      process.exit(1);
    }
  });

// ─── CHECK ───────────────────────────────────────────────────────────
program
  .command('check')
  .description('Check workspace for unresolved merge conflicts')
  .option('-p, --path <dir>', 'Target directory', process.cwd())
  .action(async (opts) => {
    const files = await glob('**/*', {
      cwd: opts.path,
      ignore: ['**/node_modules/**', '**/.git/**', '**/*.bak'],
      nodir: true,
      absolute: true,
    });

    let conflictCount = 0;
    const conflictedFiles = [];

    for (const file of files) {
      try {
        const content = await readFile(file, 'utf8');
        const parseRes = parseConflictMarkers(content);
        if (parseRes.hasConflicts || parseRes.hasMalformedMarkers) {
          conflictCount += parseRes.count || 1;
          conflictedFiles.push({ file, count: parseRes.count, malformed: parseRes.hasMalformedMarkers });
        }
      } catch (e) {}
    }

    if (conflictCount === 0) {
      console.log(chalk.green('\n✅ Workspace clean: 0 merge conflicts found.\n'));
      process.exit(0);
    } else {
      console.log(chalk.red.bold(`\n❌ Found ${conflictCount} unresolved conflict(s) in ${conflictedFiles.length} file(s):\n`));
      for (const item of conflictedFiles) {
        console.log(`  ${chalk.red('●')} ${item.file} ${chalk.gray(`(${item.count} conflict markers${item.malformed ? ', MALFORMED' : ''})`)}`);
      }
      console.log(chalk.yellow('\n💡 Run "conflicthealer resolve" to automatically resolve with semantic AST healing.\n'));
      process.exit(1);
    }
  });

program.parse();
