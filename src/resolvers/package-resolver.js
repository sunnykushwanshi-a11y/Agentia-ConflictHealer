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
  mergePackageXml(oursDocText, theirsDocText) {
    const valOurs = XMLValidator.validate(oursDocText);
    const valTheirs = XMLValidator.validate(theirsDocText);

    if (valOurs !== true) {
      return { success: false, reason: `Ours branch has invalid XML: ${valOurs.err?.msg || 'syntax error'}` };
    }
    if (valTheirs !== true) {
      return { success: false, reason: `Theirs branch has invalid XML: ${valTheirs.err?.msg || 'syntax error'}` };
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

    // 2. Extract and index types from both
    const typesMap = new Map(); // metadataName -> Set of members
    let duplicatesRemovedCount = 0;
    let membersPreservedCount = 0;

    const ingestTypes = (typesNode) => {
      if (!typesNode) return;
      const list = Array.isArray(typesNode) ? typesNode : [typesNode];

      for (const t of list) {
        const typeName = t.name ? String(t.name).trim() : null;
        if (!typeName) continue;

        if (!typesMap.has(typeName)) {
          typesMap.set(typeName, new Set());
        }
        const memberSet = typesMap.get(typeName);

        const rawMembers = t.members;
        if (rawMembers !== undefined && rawMembers !== null) {
          const mList = Array.isArray(rawMembers) ? rawMembers : [rawMembers];
          for (const m of mList) {
            const memberStr = String(m).trim();
            if (memberStr) {
              if (memberSet.has(memberStr)) {
                duplicatesRemovedCount++;
              } else {
                memberSet.add(memberStr);
                membersPreservedCount++;
              }
            }
          }
        }
      }
    };

    ingestTypes(pkgOurs.types);
    ingestTypes(pkgTheirs.types);

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
