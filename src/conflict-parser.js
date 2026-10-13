/**
 * Git Conflict Parser
 * Detects and extracts Git conflict markers:
 * <<<<<<< (ours / HEAD)
 * =======
 * >>>>>>> (theirs / incoming branch)
 */

export class ConflictParseError extends Error {
  constructor(message, line) {
    super(message);
    this.name = 'ConflictParseError';
    this.line = line;
  }
}

export function parseConflictMarkers(content) {
  const lines = content.split(/\r?\n/);
  const conflicts = [];
  const errors = [];

  let inConflict = false;
  let currentOurs = [];
  let currentTheirs = [];
  let inTheirs = false;
  let startLine = -1;
  let separatorLine = -1;
  let branchOurs = '';
  let branchTheirs = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('<<<<<<<')) {
      if (inConflict) {
        errors.push({
          line: i + 1,
          message: `Nested or unclosed conflict marker encountered on line ${i + 1}`,
        });
        continue;
      }
      inConflict = true;
      inTheirs = false;
      startLine = i + 1;
      branchOurs = line.replace(/^<<<<<<<\s*/, '').trim() || 'HEAD';
      currentOurs = [];
      currentTheirs = [];
    } else if (line.startsWith('=======') && inConflict && !inTheirs) {
      inTheirs = true;
      separatorLine = i + 1;
    } else if (line.startsWith('>>>>>>>') && inConflict) {
      if (!inTheirs) {
        errors.push({
          line: i + 1,
          message: `Malformed conflict block: missing ======= separator before >>>>>>> on line ${i + 1}`,
        });
      } else {
        branchTheirs = line.replace(/^>>>>>>>\s*/, '').trim() || 'incoming';
        conflicts.push({
          startLine,
          separatorLine,
          endLine: i + 1,
          branchOurs,
          branchTheirs,
          ours: currentOurs.join('\n'),
          theirs: currentTheirs.join('\n'),
          rawBlock: lines.slice(startLine - 1, i + 1).join('\n'),
        });
      }
      inConflict = false;
      inTheirs = false;
      startLine = -1;
      separatorLine = -1;
    } else if (inConflict) {
      if (inTheirs) {
        currentTheirs.push(line);
      } else {
        currentOurs.push(line);
      }
    }
  }

  if (inConflict) {
    errors.push({
      line: startLine,
      message: `Unclosed conflict marker starting on line ${startLine}: missing matching >>>>>>> marker`,
    });
  }

  // Check for stray markers
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('=======') && !conflicts.some(c => c.separatorLine === i + 1)) {
      errors.push({
        line: i + 1,
        message: `Stray ======= marker on line ${i + 1} outside recognized conflict block`,
      });
    }
  }

  return {
    hasConflicts: conflicts.length > 0,
    count: conflicts.length,
    conflicts,
    hasMalformedMarkers: errors.length > 0,
    errors,
  };
}
