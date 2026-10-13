/**
 * Core ConflictHealer Engine
 * Orchestrates file scanning, conflict extraction, AST healing, and post-resolution verification
 */

import { readFile, writeFile } from 'fs/promises';
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
    ignore: ['**/node_modules/**', '**/.git/**', '**/.sfdx/**', '**/.sf/**'],
    nodir: true,
    absolute: true,
  });

  const healedFiles = [];
  const errors = [];
  let totalConflictsResolved = 0;

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf8');
      const { hasConflicts, conflicts } = parseConflictMarkers(content);

      if (!hasConflicts) continue;

      let healedContent = content;
      const isXml = file.endsWith('.xml') || file.endsWith('-meta.xml') || file.endsWith('.profile') || file.endsWith('.permissionset') || file.endsWith('.object');

      for (const conflict of conflicts) {
        let resolvedChunk = '';

        if (isXml) {
          resolvedChunk = xmlResolver.resolveConflictChunk(conflict.ours, conflict.theirs, file);
        } else {
          // Standard smart union
          resolvedChunk = xmlResolver.additiveUnion(conflict.ours, conflict.theirs);
        }

        healedContent = healedContent.replace(conflict.fullMatch, resolvedChunk);
        totalConflictsResolved++;
      }

      // Verify healed XML validity
      if (isXml) {
        const validation = XMLValidator.validate(healedContent);
        if (validation !== true) {
          errors.push({
            file: path.relative(absPath, file),
            error: `XML syntax validation failed post-heal: ${validation.err?.msg || 'Malformed XML'}`,
          });
          continue;
        }
      }

      if (options.dryRun !== true) {
        await writeFile(file, healedContent, 'utf8');
      }

      healedFiles.push({
        file: path.relative(absPath, file),
        conflictsCount: conflicts.length,
        isXml,
      });
    } catch (err) {
      errors.push({
        file: path.relative(absPath, file),
        error: err.message,
      });
    }
  }

  return {
    healedFiles,
    totalConflictsResolved,
    errors,
  };
}
