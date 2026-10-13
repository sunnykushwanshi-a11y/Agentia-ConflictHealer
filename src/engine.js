/**
 * Core ConflictHealer Engine
 * Orchestrates:
 * 1. Conflict detection & validation of Git conflict markers
 * 2. Reconstructing complete document branches (Ours vs Theirs)
 * 3. Semantic AST reconciliation via specialized Salesforce resolvers
 * 4. Post-resolution XML well-formedness & Git marker absence verification
 * 5. Atomic file replacement with backup preservation (.bak)
 */

import { readFile, writeFile, copyFile, unlink } from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import { parseConflictMarkers } from './conflict-parser.js';
import { SalesforceXmlResolver } from './resolvers/xml-resolver.js';
import { XMLValidator } from 'fast-xml-parser';

export async function healConflicts(targetPath = '.', options = {}) {
  const absPath = path.resolve(targetPath);
  const xmlResolver = new SalesforceXmlResolver();

  const files = await glob('**/*', {
    cwd: absPath,
    ignore: ['**/node_modules/**', '**/.git/**', '**/.sfdx/**', '**/.sf/**', '**/*.bak'],
    nodir: true,
    absolute: true,
  });

  const filesScannedCount = files.length;
  let conflictsDetectedCount = 0;
  const healedFiles = [];
  const manualReviewFiles = [];
  const errors = [];
  const backupsCreated = [];

  for (const file of files) {
    const relFile = path.relative(absPath, file);
    try {
      const content = await readFile(file, 'utf8');
      const parseResult = parseConflictMarkers(content);

      if (parseResult.hasMalformedMarkers) {
        errors.push({
          file: relFile,
          error: `Malformed conflict markers detected: ${parseResult.errors.map(e => e.message).join('; ')}`,
        });
        continue;
      }

      if (!parseResult.hasConflicts) continue;

      conflictsDetectedCount += parseResult.count;
      const isXml = isXmlMetadata(file);

      if (!isXml) {
        // Non-XML files require review unless supported
        manualReviewFiles.push({
          file: relFile,
          reason: 'Non-XML metadata conflict: automated semantic AST healing is only safe for XML metadata.',
          conflictsCount: parseResult.count,
        });
        continue;
      }

      // Reconstruct the two complete document branches
      const docOurs = reconstructBranch(content, parseResult.conflicts, 'ours');
      const docTheirs = reconstructBranch(content, parseResult.conflicts, 'theirs');

      // Attempt structural merge
      const mergeResult = xmlResolver.resolveDocument(docOurs, docTheirs, file);

      if (!mergeResult.success) {
        if (mergeResult.requiresReview) {
          manualReviewFiles.push({
            file: relFile,
            reason: mergeResult.reason,
            conflictsCount: parseResult.count,
          });
        } else {
          errors.push({
            file: relFile,
            error: mergeResult.reason,
          });
        }
        // CRITICAL SAFETY: original file remains 100% untouched
        continue;
      }

      const mergedXml = mergeResult.mergedXml;

      // POST-MERGE INTEGRITY CHECKS:
      // Check 1: Absence of any Git conflict markers
      if (hasAnyConflictMarker(mergedXml)) {
        errors.push({
          file: relFile,
          error: 'Integrity check failed: merged output still contains conflict markers.',
        });
        continue;
      }

      // Check 2: Independent XML parser validation
      const xmlValidation = XMLValidator.validate(mergedXml);
      if (xmlValidation !== true) {
        errors.push({
          file: relFile,
          error: `Post-heal XML well-formedness failed: ${xmlValidation.err?.msg || 'syntax error'}`,
        });
        continue;
      }

      // Writing safely with backup
      const backupPath = `${file}.bak`;
      if (!options.dryRun) {
        if (options.backup !== false) {
          await copyFile(file, backupPath);
          backupsCreated.push(path.relative(absPath, backupPath));
        }
        await writeFile(file, mergedXml, 'utf8');
      }

      healedFiles.push({
        file: relFile,
        conflictsCount: parseResult.count,
        isXml: true,
        stats: mergeResult.stats || {},
        backupPath: options.dryRun ? null : (options.backup !== false ? path.relative(absPath, backupPath) : null),
      });

    } catch (err) {
      errors.push({
        file: relFile,
        error: err.message,
      });
    }
  }

  return {
    filesScanned: filesScannedCount,
    conflictsDetected: conflictsDetectedCount,
    healedFiles,
    manualReviewFiles,
    errors,
    backupsCreated,
    dryRun: Boolean(options.dryRun),
  };
}

function isXmlMetadata(filePath) {
  const f = filePath.toLowerCase();
  return (
    f.endsWith('.xml') ||
    f.endsWith('-meta.xml') ||
    f.endsWith('.profile') ||
    f.endsWith('.permissionset') ||
    f.endsWith('.object') ||
    f.endsWith('.labels')
  );
}

function reconstructBranch(content, conflicts, branchSide) {
  let result = content;
  // Replace backwards by start index so indices don't shift
  const sorted = [...conflicts].sort((a, b) => b.startLine - a.startLine);

  for (const c of sorted) {
    const replacement = branchSide === 'ours' ? c.ours : c.theirs;
    result = result.replace(c.rawBlock, replacement);
  }
  return result;
}

function hasAnyConflictMarker(text) {
  return /<<<<<<<|=======|>>>>>>>/m.test(text);
}
