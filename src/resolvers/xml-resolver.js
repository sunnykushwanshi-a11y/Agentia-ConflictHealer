/**
 * Salesforce XML Conflict Resolver (Facade & General Dispatcher)
 * Coordinates specialized resolvers for package.xml and permission sets,
 * and handles generic XML document-level reconciliation.
 */

import { XMLParser, XMLBuilder, XMLValidator } from 'fast-xml-parser';
import { PackageXmlResolver } from './package-resolver.js';
import { PermissionSetResolver } from './permissionset-resolver.js';

export class SalesforceXmlResolver {
  constructor() {
    this.packageResolver = new PackageXmlResolver();
    this.permissionSetResolver = new PermissionSetResolver();

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
   * Reconciles two complete branch versions of a metadata document
   */
  resolveDocument(oursText, theirsText, filePath = '') {
    const lowerPath = filePath.toLowerCase();

    // 1. Specialized package.xml handler
    if (lowerPath.endsWith('package.xml') || oursText.includes('<Package') || theirsText.includes('<Package')) {
      return this.packageResolver.mergePackageXml(oursText, theirsText);
    }

    // 2. Specialized PermissionSet / Profile handler
    if (
      lowerPath.endsWith('.permissionset-meta.xml') ||
      lowerPath.endsWith('.permissionset') ||
      lowerPath.endsWith('.profile-meta.xml') ||
      lowerPath.endsWith('.profile') ||
      oursText.includes('<PermissionSet') ||
      theirsText.includes('<PermissionSet') ||
      oursText.includes('<Profile') ||
      theirsText.includes('<Profile')
    ) {
      return this.permissionSetResolver.mergePermissionSet(oursText, theirsText);
    }

    // 3. General XML document resolver
    return this.mergeGeneralXml(oursText, theirsText);
  }

  mergeGeneralXml(oursDocText, theirsDocText) {
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

    const rootOurs = Object.keys(docOurs)[0];
    const rootTheirs = Object.keys(docTheirs)[0];

    if (rootOurs !== rootTheirs) {
      return { success: false, reason: `Root XML tags differ: <${rootOurs}> vs <${rootTheirs}>` };
    }

    try {
      const mergedContent = this.mergeXmlObjects(docOurs[rootOurs], docTheirs[rootTheirs]);
      const built = this.builder.build({ [rootOurs]: mergedContent });
      const formatted = '<?xml version="1.0" encoding="UTF-8"?>\n' + built + '\n';

      const checkVal = XMLValidator.validate(formatted);
      if (checkVal !== true) {
        return { success: false, reason: `Rebuilt XML failed syntax check: ${checkVal.err?.msg}` };
      }

      return {
        success: true,
        mergedXml: formatted,
        stats: { generalMerge: true },
      };
    } catch (err) {
      return { success: false, reason: `General XML merge failed: ${err.message}` };
    }
  }

  mergeXmlObjects(ours, theirs) {
    const result = { ...ours };
    for (const key of Object.keys(theirs)) {
      if (!result[key]) {
        result[key] = theirs[key];
      } else {
        const valO = result[key];
        const valT = theirs[key];

        if (Array.isArray(valO) && Array.isArray(valT)) {
          result[key] = deduplicateArray(valO, valT);
        } else if (typeof valO === 'object' && typeof valT === 'object') {
          result[key] = this.mergeXmlObjects(valO, valT);
        } else if (String(valO).trim() !== String(valT).trim()) {
          // Scalar collision: throw error to avoid silent arbitrary override
          throw new Error(`Incompatible conflict on <${key}>: "${valO}" vs "${valT}"`);
        }
      }
    }
    return result;
  }
}

function deduplicateArray(arr1, arr2) {
  const combined = [...arr1, ...arr2];
  const seen = new Set();
  const out = [];

  for (const item of combined) {
    const key = typeof item === 'object' && item !== null
      ? (item.name || item.fullName || item.field || item['#text'] || JSON.stringify(item))
      : String(item);

    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}
