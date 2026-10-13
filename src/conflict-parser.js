/**
 * Git Conflict Parser
 * Parses standard Git conflict markers:
 * <<<<<<< HEAD (or our branch)
 * =======
 * >>>>>>> branch-name (their branch)
 */

export function parseConflictMarkers(content) {
  const conflictRegex = /<<<<<<<[^\n]*\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>>[^\n]*\n?/g;
  const conflicts = [];
  let match;

  while ((match = conflictRegex.exec(content)) !== null) {
    conflicts.push({
      fullMatch: match[0],
      ours: match[1],
      theirs: match[2],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return {
    hasConflicts: conflicts.length > 0,
    count: conflicts.length,
    conflicts,
  };
}
