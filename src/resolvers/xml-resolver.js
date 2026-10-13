/**
 * Salesforce XML Conflict Resolver
 * Understands Salesforce XML metadata structures:
 * - Profiles / PermissionSets (<userPermissions>, <fieldPermissions>, <objectPermissions>)
 * - Package XML (<types><members>...</members><name>...</name></types>)
 * - Custom Objects (<fields>, <validationRules>, <indexes>)
 * - Labels (<labels>)
 */

import { XMLParser, XMLBuilder, XMLValidator } from 'fast-xml-parser';

export class SalesforceXmlResolver {
  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      allowBooleanAttributes: true,
      parseTagValue: false,
      trimValues: true,
    });

    this.builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      format: true,
      indentBy: '    ',
      suppressEmptyNode: false,
    });
  }

  /**
   * Semantically resolves conflict chunks in Salesforce XML
   */
  resolveConflictChunk(oursChunk, theirsChunk, filePath) {
    // If one side is empty, take the other side
    if (!oursChunk.trim()) return theirsChunk;
    if (!theirsChunk.trim()) return oursChunk;

    // Check if both sides contain sibling XML tags (e.g. <members> or <userPermissions>)
    const wrapOurs = `<root>${oursChunk}</root>`;
    const wrapTheirs = `<root>${theirsChunk}</root>`;

    const validOurs = XMLValidator.validate(wrapOurs);
    const validTheirs = XMLValidator.validate(wrapTheirs);

    if (validOurs === true && validTheirs === true) {
      try {
        const parsedOurs = this.parser.parse(wrapOurs).root || {};
        const parsedTheirs = this.parser.parse(wrapTheirs).root || {};

        // Merge arrays / objects without duplicates
        const merged = this.mergeXmlNodes(parsedOurs, parsedTheirs);
        const builtXml = this.builder.build({ root: merged });

        // Strip the wrapper root tags to cleanly replace the chunk
        const innerContent = builtXml
          .replace(/<root>\s*/, '')
          .replace(/\s*<\/root>\s*$/, '');

        return innerContent;
      } catch (err) {
        // Fallback to additive union heuristic
        return this.additiveUnion(oursChunk, theirsChunk);
      }
    }

    return this.additiveUnion(oursChunk, theirsChunk);
  }

  /**
   * Merges two parsed XML structures deeply, deduplicating elements by unique identifiers
   */
  mergeXmlNodes(ours, theirs) {
    const result = { ...ours };

    for (const key of Object.keys(theirs)) {
      if (!result[key]) {
        result[key] = theirs[key];
      } else {
        const valOurs = result[key];
        const valTheirs = theirs[key];

        if (Array.isArray(valOurs) && Array.isArray(valTheirs)) {
          result[key] = this.deduplicateXmlArray(valOurs, valTheirs);
        } else if (Array.isArray(valOurs)) {
          result[key] = this.deduplicateXmlArray(valOurs, [valTheirs]);
        } else if (Array.isArray(valTheirs)) {
          result[key] = this.deduplicateXmlArray([valOurs], valTheirs);
        } else if (typeof valOurs === 'object' && typeof valTheirs === 'object') {
          // If elements have unique identifiers (e.g. <name> or <fullName>)
          const idOurs = valOurs.name || valOurs.fullName || valOurs.field || JSON.stringify(valOurs);
          const idTheirs = valTheirs.name || valTheirs.fullName || valTheirs.field || JSON.stringify(valTheirs);

          if (idOurs === idTheirs) {
            // Favor theirs or deeper merge
            result[key] = { ...valOurs, ...valTheirs };
          } else {
            result[key] = [valOurs, valTheirs];
          }
        } else {
          // Primitive duplicate or conflicting value - favor theirs with preservation
          result[key] = valTheirs;
        }
      }
    }

    return result;
  }

  deduplicateXmlArray(arr1, arr2) {
    const combined = [...arr1, ...arr2];
    const seen = new Set();
    const result = [];

    for (const item of combined) {
      let key;
      if (typeof item === 'object' && item !== null) {
        key = item.name || item.fullName || item.field || item['#text'] || JSON.stringify(item);
      } else {
        key = String(item);
      }

      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }

    return result;
  }

  additiveUnion(oursChunk, theirsChunk) {
    const linesOurs = oursChunk.split('\n');
    const linesTheirs = theirsChunk.split('\n');
    const set = new Set();
    const result = [];

    for (const line of [...linesOurs, ...linesTheirs]) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (!set.has(trimmed)) {
        set.add(trimmed);
        result.push(line);
      }
    }

    return result.join('\n');
  }
}
