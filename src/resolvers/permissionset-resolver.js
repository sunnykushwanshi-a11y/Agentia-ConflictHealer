/**
 * Dedicated Salesforce PermissionSet & Profile Resolver
 * Understands:
 * - <userPermissions> (<name>, <enabled>)
 * - <fieldPermissions> (<field>, <editable>, <readable>)
 * - <objectPermissions> (<object>, <allowCreate>, <allowDelete>, <allowEdit>, <allowRead>, <modifyAllRecords>, <viewAllRecords>)
 * - <classAccesses> (<apexClass>, <enabled>)
 * - <pageAccesses> (<apexPage>, <enabled>)
 * - <tabSettings> (<tab>, <visibility>)
 *
 * Safe policy:
 * - Incompatible conflict (e.g. enabled=true vs enabled=false) is routed to manual review.
 * - Conflicting edits to a node where one branch modified and one deleted is routed to manual review.
 * - Deduplicates identical permissions seamlessly.
 */

import { XMLParser, XMLBuilder, XMLValidator } from 'fast-xml-parser';

export class PermissionSetResolver {
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

  // Key field mappings for Salesforce permission sub-elements
  static KEY_FIELDS = {
    userPermissions: 'name',
    fieldPermissions: 'field',
    objectPermissions: 'object',
    classAccesses: 'apexClass',
    pageAccesses: 'apexPage',
    tabSettings: 'tab',
    customMetadataTypeAccesses: 'name',
    customPermissions: 'name',
    applicationVisibilities: 'application',
    recordTypeVisibilities: 'recordType',
  };

  mergePermissionSet(oursDocText, theirsDocText, baseDocText = null) {
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

    const getRootKey = (doc) => Object.keys(doc).find(k => !k.startsWith('?') && !k.startsWith('#'));
    const rootKeyOurs = getRootKey(docOurs);
    const rootKeyTheirs = getRootKey(docTheirs);

    if (!rootKeyOurs || !rootKeyTheirs || rootKeyOurs !== rootKeyTheirs || (!['PermissionSet', 'Profile'].includes(rootKeyOurs))) {
      return { success: false, reason: `Root tag mismatch or not a PermissionSet/Profile: <${rootKeyOurs}> vs <${rootKeyTheirs}>` };
    }

    const nodeOurs = docOurs[rootKeyOurs];
    const nodeTheirs = docTheirs[rootKeyTheirs];

    const mergedRoot = {
      '@_xmlns': nodeOurs['@_xmlns'] || nodeTheirs['@_xmlns'] || 'http://soap.sforce.com/2006/04/metadata',
    };

    let duplicatesRemoved = 0;
    let permissionsPreserved = 0;
    const conflicts = [];

    // All known top-level keys
    const allKeys = Array.from(new Set([...Object.keys(nodeOurs), ...Object.keys(nodeTheirs)]));

    for (const key of allKeys) {
      if (key.startsWith('@_')) continue;

      const valOurs = nodeOurs[key];
      const valTheirs = nodeTheirs[key];

      // Primitive scalar values (hasActivationRequired, label, license, etc.)
      if (!PermissionSetResolver.KEY_FIELDS[key]) {
        if (valOurs === undefined) {
          mergedRoot[key] = valTheirs;
        } else if (valTheirs === undefined) {
          mergedRoot[key] = valOurs;
        } else if (String(valOurs).trim() === String(valTheirs).trim()) {
          mergedRoot[key] = valOurs;
        } else {
          // Conflict on top-level setting
          conflicts.push(`Conflicting scalar tag <${key}>: "${valOurs}" vs "${valTheirs}"`);
        }
        continue;
      }

      // Array / keyed collection
      const idField = PermissionSetResolver.KEY_FIELDS[key];
      const listOurs = toList(valOurs);
      const listTheirs = toList(valTheirs);

      const itemsByIdOurs = new Map();
      const itemsByIdTheirs = new Map();

      for (const item of listOurs) {
        const id = item[idField];
        if (id) itemsByIdOurs.set(String(id).trim(), item);
      }
      for (const item of listTheirs) {
        const id = item[idField];
        if (id) itemsByIdTheirs.set(String(id).trim(), item);
      }

      const itemsByIdBase = new Map();
      if (docBase && docBase[rootKeyOurs] && docBase[rootKeyOurs][key]) {
        for (const item of toList(docBase[rootKeyOurs][key])) {
          const id = item[idField];
          if (id) itemsByIdBase.set(String(id).trim(), item);
        }
      }

      const allIds = Array.from(new Set([...itemsByIdOurs.keys(), ...itemsByIdTheirs.keys(), ...itemsByIdBase.keys()]));
      const mergedList = [];

      for (const id of allIds) {
        const itemOurs = itemsByIdOurs.get(id);
        const itemTheirs = itemsByIdTheirs.get(id);
        const itemBase = itemsByIdBase.get(id);

        if (docBase) {
          // Genuine 3-way reconciliation
          if (itemBase && !itemOurs && !itemTheirs) {
            // Deleted in both branches: cleanly removed
            continue;
          } else if (itemBase && !itemOurs && itemTheirs) {
            // Deleted in ours, present in theirs
            const diffWithBase = findPropertyDifferences(itemTheirs, itemBase);
            if (diffWithBase.length === 0) {
              // Theirs did not touch it; Ours intentionally deleted it -> delete
              continue;
            } else {
              // Delete vs Modify collision: MUST ROUTE TO MANUAL REVIEW
              conflicts.push(`Delete vs Modify conflict in <${key}> for "${id}": deleted in HEAD, modified in incoming branch`);
              continue;
            }
          } else if (itemBase && itemOurs && !itemTheirs) {
            // Present in ours, deleted in theirs
            const diffWithBase = findPropertyDifferences(itemOurs, itemBase);
            if (diffWithBase.length === 0) {
              // Ours did not touch it; Theirs intentionally deleted it -> delete
              continue;
            } else {
              // Modify vs Delete collision: MUST ROUTE TO MANUAL REVIEW
              conflicts.push(`Modify vs Delete conflict in <${key}> for "${id}": modified in HEAD, deleted in incoming branch`);
              continue;
            }
          } else if (!itemBase && itemOurs && !itemTheirs) {
            // Added by ours
            mergedList.push(itemOurs);
            permissionsPreserved++;
          } else if (!itemBase && !itemOurs && itemTheirs) {
            // Added by theirs
            mergedList.push(itemTheirs);
            permissionsPreserved++;
          } else if (itemOurs && itemTheirs) {
            // Present in both branches
            const diffProps = findPropertyDifferences(itemOurs, itemTheirs);
            if (diffProps.length === 0) {
              mergedList.push(itemOurs);
              duplicatesRemoved++;
              permissionsPreserved++;
            } else {
              // Both modified differently
              conflicts.push(`Incompatible conflict in <${key}> for "${id}": differences in [${diffProps.join(', ')}]`);
            }
          }
        } else {
          // 2-way safe heuristic when no base is available
          if (itemOurs && !itemTheirs) {
            // Safe additive retention (prevents silent data loss when no base is available)
            mergedList.push(itemOurs);
            permissionsPreserved++;
          } else if (!itemOurs && itemTheirs) {
            // Safe additive retention
            mergedList.push(itemTheirs);
            permissionsPreserved++;
          } else {
            // Present in both branches: check for semantic equality
            const diffProps = findPropertyDifferences(itemOurs, itemTheirs);

            if (diffProps.length === 0) {
              // Exactly identical
              mergedList.push(itemOurs);
              duplicatesRemoved++;
              permissionsPreserved++;
            } else {
              // Disagreement on boolean or field permission value (e.g. enabled=true vs enabled=false)
              conflicts.push(`Incompatible conflict in <${key}> for "${id}": differences in [${diffProps.join(', ')}]`);
            }
          }
        }
      }

      // Sort items by unique key for deterministic canonical output
      mergedList.sort((a, b) => String(a[idField]).localeCompare(String(b[idField])));
      if (mergedList.length > 0) {
        mergedRoot[key] = mergedList;
      }
    }

    if (conflicts.length > 0) {
      return {
        success: false,
        requiresReview: true,
        reason: `Cannot safely auto-resolve permission set: ${conflicts.join('; ')}`,
        conflicts,
      };
    }

    const built = this.builder.build({ [rootKeyOurs]: mergedRoot });
    const formatted = '<?xml version="1.0" encoding="UTF-8"?>\n' + built + '\n';

    const finalVal = XMLValidator.validate(formatted);
    if (finalVal !== true) {
      return { success: false, reason: `Rebuilt ${rootKeyOurs} failed XML validation: ${finalVal.err?.msg}` };
    }

    return {
      success: true,
      mergedXml: formatted,
      stats: {
        permissionsPreserved,
        duplicatesRemoved,
      },
    };
  }
}

function toList(val) {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

function findPropertyDifferences(objA, objB) {
  const diffs = [];
  const keys = new Set([...Object.keys(objA), ...Object.keys(objB)]);
  for (const k of keys) {
    const valA = objA[k] !== undefined ? String(objA[k]).trim() : undefined;
    const valB = objB[k] !== undefined ? String(objB[k]).trim() : undefined;
    if (valA !== valB) {
      diffs.push(`${k}: (${valA} vs ${valB})`);
    }
  }
  return diffs;
}
