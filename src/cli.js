#!/usr/bin/env node
/**
 * Agentia ConflictHealer — CLI Entry Point
 * 
 * Usage:
 *   conflicthealer resolve [--path <dir>] [--dry-run]
 *   conflicthealer check [--path <dir>]
 *   conflicthealer ai-prompt [--path <dir>]
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
    ' — Intelligent Semantic Salesforce XML Merge-Conflict Resolver for Copado Agentia CLI'
  )
  .version('1.0.0');

// ─── RESOLVE ─────────────────────────────────────────────────────────
program
  .command('resolve')
  .description('Automatically resolve merge conflicts in Salesforce metadata')
  .option('-p, --path <dir>', 'Target directory containing conflict files', process.cwd())
  .option('--dry-run', 'Preview resolutions without saving modifications')
  .action(async (opts) => {
    console.log(chalk.bold.cyan('\n🩺 Agentia ConflictHealer — Scanning for Git conflicts...\n'));

    const result = await healConflicts(opts.path, { dryRun: opts.dryRun });

    if (result.healedFiles.length === 0 && result.errors.length === 0) {
      console.log(chalk.green('  ✅ No merge conflicts detected! Your working tree is clean.\n'));
      return;
    }

    if (result.healedFiles.length > 0) {
      console.log(chalk.bold.green(`  ✨ Successfully healed ${result.totalConflictsResolved} conflict(s) across ${result.healedFiles.length} file(s):\n`));
      for (const item of result.healedFiles) {
        console.log(`    ${chalk.green('✔')} ${chalk.bold(item.file)} ${chalk.gray(`(${item.conflictsCount} conflicts resolved, XML validated)`)}`);
      }
      console.log();
      if (opts.dryRun) {
        console.log(chalk.yellow('  (Dry run mode: No files were modified on disk)\n'));
      } else {
        console.log(chalk.bold.cyan('  🚀 Metadata healed & XML validated! You can now resume your Copado release:'));
        console.log(chalk.white('     agentia cicd work submit --resume\n'));
      }
    }

    if (result.errors.length > 0) {
      console.log(chalk.bold.red(`  ⚠ Encountered ${result.errors.length} issue(s):`));
      for (const err of result.errors) {
        console.log(chalk.red(`    ✖ ${err.file}: ${err.error}`));
      }
      console.log();
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
      ignore: ['**/node_modules/**', '**/.git/**'],
      nodir: true,
      absolute: true,
    });

    let conflictCount = 0;
    const conflictedFiles = [];

    for (const file of files) {
      try {
        const content = await readFile(file, 'utf8');
        const { hasConflicts, count } = parseConflictMarkers(content);
        if (hasConflicts) {
          conflictCount += count;
          conflictedFiles.push({ file, count });
        }
      } catch (e) {}
    }

    if (conflictCount === 0) {
      console.log(chalk.green('\n✅ Workspace clean: 0 merge conflicts found.\n'));
    } else {
      console.log(chalk.red.bold(`\n❌ Found ${conflictCount} unresolved conflict(s) in ${conflictedFiles.length} file(s):\n`));
      for (const item of conflictedFiles) {
        console.log(`  ${chalk.red('●')} ${item.file} ${chalk.gray(`(${item.count} conflict markers)`)}`);
      }
      console.log(chalk.yellow('\n💡 Run "conflicthealer resolve" to automatically resolve with semantic AST healing.\n'));
      process.exit(1);
    }
  });

program.parse();
