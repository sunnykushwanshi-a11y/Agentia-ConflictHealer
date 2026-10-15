/**
 * Dedicated Salesforce package.xml Structural Resolver
 * Understands <Package xmlns="...">, <types><members>...</members><name>...</name></types>, and <version>
 */

import { XMLParser, XMLBuilder, XMLValidator } from 'fast-xml-parser';

export class PackageXmlResolver {
  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      allowBooleanAttributes: true,
      parseTagValue: false,
      trimValues: true,
    });
  }

  /**
   * Performs structural merge of two complete parsed Package manifests
   */
  mergePackageXml(oursDocText, theirsDocText, baseDocText = null) {
    const valOurs = XMLValidator.validate(oursDocText);
    const valTheirs = XMLValidator.validate(theirsDocText);

    if (valOurs !== true) {
      return { success: false, reason: `Ours branch has invalid XML: ${valOurs.err?.msg || 'syntax error'}` };
    }
    if (valTheirs !== true) {
      return { success: false, reason: `Theirs branch has invalid XML: ${valTheirs.err?.msg || 'syntax error'}` };
    }

    let docBase = null;
    if (baseDocText) {
      const valBase = XMLValidator.validate(baseDocText);
      if (valBase === true) {
        docBase = this.parser.parse(baseDocText);
      }
    }

    const docOurs = this.parser.parse(oursDocText);
    const docTheirs = this.parser.parse(theirsDocText);

    const pkgOurs = docOurs.Package || docOurs.package;
    const pkgTheirs = docTheirs.Package || docTheirs.package;

    if (!pkgOurs || !pkgTheirs) {
      return { success: false, reason: 'Root element is not a <Package> tag' };
    }

    // 1. Check version element
    const verOurs = pkgOurs.version !== undefined ? String(pkgOurs.version).trim() : null;
    const verTheirs = pkgTheirs.version !== undefined ? String(pkgTheirs.version).trim() : null;

    let targetVersion = verOurs;
    if (verOurs && verTheirs && verOurs !== verTheirs) {
      // Incompatible version collision: requires manual policy review
      return {
        success: false,
        reason: `Conflicting API versions detected: <version>${verOurs}</version> vs <version>${verTheirs}</version>. Incompatible change requires human review.`,
        requiresReview: true,
      };
    } else if (!targetVersion) {
      targetVersion = verTheirs || '62.0';
    }

    // 2. Extract types from ours, theirs, and base
    const extractMap = (typesNode) => {
      const map = new Map();
      if (!typesNode) return map;
      const list = Array.isArray(typesNode) ? typesNode : [typesNode];
      for (const t of list) {
        const typeName = t.name ? String(t.name).trim() : null;
        if (!typeName) continue;
        if (!map.has(typeName)) map.set(typeName, new Set());
        const set = map.get(typeName);
        const rawMembers = t.members;
        if (rawMembers !== undefined && rawMembers !== null) {
          const mList = Array.isArray(rawMembers) ? rawMembers : [rawMembers];
          for (const m of mList) {
            const memberStr = String(m).trim();
            if (memberStr) set.add(memberStr);
          }
        }
      }
      return map;
    };

    const mapOurs = extractMap(pkgOurs.types);
    const mapTheirs = extractMap(pkgTheirs.types);
    const mapBase = docBase && (docBase.Package || docBase.package) ? extractMap((docBase.Package || docBase.package).types) : null;

    const typesMap = new Map();
    let duplicatesRemovedCount = 0;
    let membersPreservedCount = 0;

    const allTypeNames = Array.from(new Set([
      ...mapOurs.keys(),
      ...mapTheirs.keys(),
      ...(mapBase ? mapBase.keys() : [])
    ]));

    for (const typeName of allTypeNames) {
      const setOurs = mapOurs.get(typeName) || new Set();
      const setTheirs = mapTheirs.get(typeName) || new Set();
      const setBase = mapBase ? (mapBase.get(typeName) || new Set()) : null;

      const mergedMembers = new Set();
      const allMembers = Array.from(new Set([
        ...setOurs,
        ...setTheirs,
        ...(setBase ? setBase : [])
      ]));

      for (const member of allMembers) {
        if (setBase) {
          const inBase = setBase.has(member);
          const inOurs = setOurs.has(member);
          const inTheirs = setTheirs.has(member);

          if (inBase && !inOurs && !inTheirs) {
            // Deleted in both
            continue;
          } else if (inBase && !inOurs && inTheirs) {
            // Deleted in ours, untouched in theirs -> honor delete
            continue;
          } else if (inBase && inOurs && !inTheirs) {
            // Deleted in theirs, untouched in ours -> honor delete
            continue;
          } else if (inOurs || inTheirs) {
            if (inOurs && inTheirs && !inBase) {
              duplicatesRemovedCount++;
            }
            mergedMembers.add(member);
            membersPreservedCount++;
          }
        } else {
          // 2-way safe union
          if (setOurs.has(member) && setTheirs.has(member)) {
            duplicatesRemovedCount++;
          }
          mergedMembers.add(member);
          membersPreservedCount++;
        }
      }

      if (mergedMembers.size > 0) {
        typesMap.set(typeName, mergedMembers);
      }
    }

    // 3. Rebuild formatted XML structurally
    // Sort metadata types alphabetically, and members alphabetically within types
    const sortedTypeNames = Array.from(typesMap.keys()).sort();
    const xmlns = pkgOurs['@_xmlns'] || pkgTheirs['@_xmlns'] || 'http://soap.sforce.com/2006/04/metadata';

    const xmlLines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<Package xmlns="${xmlns}">`,
    ];

    for (const typeName of sortedTypeNames) {
      xmlLines.push('    <types>');
      const sortedMembers = Array.from(typesMap.get(typeName)).sort();
      for (const member of sortedMembers) {
        xmlLines.push(`        <members>${escapeXml(member)}</members>`);
      }
      xmlLines.push(`        <name>${escapeXml(typeName)}</name>`);
      xmlLines.push('    </types>');
    }

    xmlLines.push(`    <version>${targetVersion}</version>`);
    xmlLines.push('</Package>\n');

    const resultXml = xmlLines.join('\n');

    // Structural self-test
    const finalVal = XMLValidator.validate(resultXml);
    if (finalVal !== true) {
      return { success: false, reason: `Rebuilt package.xml failed validation: ${finalVal.err?.msg}` };
    }

    return {
      success: true,
      mergedXml: resultXml,
      stats: {
        typesCount: sortedTypeNames.length,
        membersCount: membersPreservedCount,
        duplicatesRemoved: duplicatesRemovedCount,
      },
    };
  }
}

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
