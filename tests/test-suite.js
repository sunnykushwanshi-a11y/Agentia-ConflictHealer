/**
 * Comprehensive Automated Test Suite for Agentia ConflictHealer
 * Verifies all 12 specified edge-case scenarios:
 * 1. Two developers adding different members to package.xml
 * 2. Duplicate package members
 * 3. Multiple metadata types in one manifest
 * 4. Different or incompatible API version values
 * 5. Compatible Permission Set additions
 * 6. Conflicting changes to the same Permission Set entry
 * 7. Entry modified in one branch and missing in the other
 * 8. Malformed XML handling
 * 9. Missing/incomplete Git conflict markers
 * 10. Multiple conflict regions in one file
 * 11. Unresolved conflict must not overwrite original file
 * 12. Running resolver twice on already resolved output (idempotency)
 */

import { writeFile, readFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import chalk from 'chalk';
import { healConflicts } from '../src/engine.js';
import { parseConflictMarkers } from '../src/conflict-parser.js';
import { XMLValidator, XMLParser } from 'fast-xml-parser';

const TEST_DIR = './test-sandbox';
const xmlParser = new XMLParser();

let passedTests = 0;
let failedTests = 0;

async function runTest(name, fn) {
  try {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });
    await fn();
    console.log(`  ${chalk.green('✔ PASS')}: ${name}`);
    passedTests++;
  } catch (err) {
    console.log(`  ${chalk.red('✖ FAIL')}: ${name}`);
    console.log(`    ${chalk.red('└─ ' + err.message)}`);
    failedTests++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function runAllTests() {
  console.log(chalk.bold.cyan('\n🧪 Starting Agentia ConflictHealer Automated Test Suite...\n'));

  // ── TEST 1: Two developers adding different members to package.xml ────
  await runTest('1. Two developers adding different members to package.xml', async () => {
    const filePath = join(TEST_DIR, 'manifest/package.xml');
    await mkdir(join(TEST_DIR, 'manifest'), { recursive: true });
    const conflicted = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
<<<<<<< HEAD
        <members>AccountController</members>
        <name>ApexClass</name>
=======
        <members>ContactService</members>
        <name>ApexClass</name>
>>>>>>> branch-b
    </types>
    <version>62.0</version>
</Package>`;
    await writeFile(filePath, conflicted, 'utf8');

    const res = await healConflicts(TEST_DIR, { backup: false });
    assert(res.healedFiles.length === 1, 'File should be healed');

    const output = await readFile(filePath, 'utf8');
    assert(XMLValidator.validate(output) === true, 'Merged package.xml must be valid XML');
    assert(output.includes('<members>AccountController</members>'), 'Must preserve AccountController');
    assert(output.includes('<members>ContactService</members>'), 'Must preserve ContactService');
    assert(!output.includes('<<<<<<<'), 'Must not contain Git markers');
  });

  // ── TEST 2: Duplicate package members deduplicated ───────────────────
  await runTest('2. Duplicate package members properly deduplicated', async () => {
    const filePath = join(TEST_DIR, 'manifest/package.xml');
    await mkdir(join(TEST_DIR, 'manifest'), { recursive: true });
    const conflicted = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
<<<<<<< HEAD
        <members>SharedUtil</members>
        <members>OrderService</members>
        <name>ApexClass</name>
=======
        <members>SharedUtil</members>
        <members>InvoiceGenerator</members>
        <name>ApexClass</name>
>>>>>>> branch-b
    </types>
    <version>62.0</version>
</Package>`;
    await writeFile(filePath, conflicted, 'utf8');

    const res = await healConflicts(TEST_DIR, { backup: false });
    assert(res.healedFiles.length === 1, 'File should be healed');

    const output = await readFile(filePath, 'utf8');
    const matches = output.match(/<members>SharedUtil<\/members>/g);
    assert(matches && matches.length === 1, `SharedUtil must appear exactly once, found ${matches ? matches.length : 0}`);
  });

  // ── TEST 3: Multiple metadata types in one manifest ──────────────────
  await runTest('3. Multiple metadata types in one manifest', async () => {
    const filePath = join(TEST_DIR, 'manifest/package.xml');
    await mkdir(join(TEST_DIR, 'manifest'), { recursive: true });
    const conflicted = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
<<<<<<< HEAD
        <members>AccountTrigger</members>
        <name>ApexTrigger</name>
    </types>
=======
        <members>OpportunityTrigger</members>
        <name>ApexTrigger</name>
    </types>
    <types>
        <members>CustomNotification</members>
        <name>CustomLabels</name>
    </types>
>>>>>>> branch-b
    <version>62.0</version>
</Package>`;
    await writeFile(filePath, conflicted, 'utf8');

    const res = await healConflicts(TEST_DIR, { backup: false });
    assert(res.healedFiles.length === 1, 'File should be healed');

    const output = await readFile(filePath, 'utf8');
    assert(output.includes('<name>ApexTrigger</name>'), 'Must contain ApexTrigger');
    assert(output.includes('<members>AccountTrigger</members>'), 'Must preserve AccountTrigger');
    assert(output.includes('<members>OpportunityTrigger</members>'), 'Must preserve OpportunityTrigger');
    assert(output.includes('<name>CustomLabels</name>'), 'Must contain CustomLabels');
  });

  // ── TEST 4: Different or incompatible API version values ─────────────
  await runTest('4. Conflicting API version values routed to review', async () => {
    const filePath = join(TEST_DIR, 'manifest/package.xml');
    await mkdir(join(TEST_DIR, 'manifest'), { recursive: true });
    const conflicted = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>MyClass</members>
        <name>ApexClass</name>
    </types>
<<<<<<< HEAD
    <version>58.0</version>
=======
    <version>62.0</version>
>>>>>>> branch-b
</Package>`;
    await writeFile(filePath, conflicted, 'utf8');

    const res = await healConflicts(TEST_DIR, { backup: false });
    assert(res.healedFiles.length === 0, 'Must NOT auto-resolve conflicting API versions');
    assert(res.manualReviewFiles.length === 1, 'Must route to manual review');

    const unchanged = await readFile(filePath, 'utf8');
    assert(unchanged === conflicted, 'Original file must remain untouched');
  });

  // ── TEST 5: Compatible Permission Set additions ──────────────────────
  await runTest('5. Compatible Permission Set additions merged cleanly', async () => {
    const filePath = join(TEST_DIR, 'permissionsets/Test.permissionset-meta.xml');
    await mkdir(join(TEST_DIR, 'permissionsets'), { recursive: true });
    const conflicted = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <hasActivationRequired>false</hasActivationRequired>
    <label>Test PermSet</label>
<<<<<<< HEAD
    <userPermissions>
        <enabled>true</enabled>
        <name>ExportReport</name>
    </userPermissions>
=======
    <userPermissions>
        <enabled>true</enabled>
        <name>ViewSetup</name>
    </userPermissions>
>>>>>>> branch-b
</PermissionSet>`;
    await writeFile(filePath, conflicted, 'utf8');

    const res = await healConflicts(TEST_DIR, { backup: false });
    assert(res.healedFiles.length === 1, 'Should heal compatible additions');

    const output = await readFile(filePath, 'utf8');
    assert(XMLValidator.validate(output) === true, 'Merged output must be valid XML');
    assert(output.includes('<name>ExportReport</name>'), 'Must preserve ExportReport');
    assert(output.includes('<name>ViewSetup</name>'), 'Must preserve ViewSetup');
  });

  // ── TEST 6: Conflicting changes to the same Permission Set entry ─────
  await runTest('6. Incompatible changes to same Permission Set routed to review', async () => {
    const filePath = join(TEST_DIR, 'permissionsets/Test.permissionset-meta.xml');
    await mkdir(join(TEST_DIR, 'permissionsets'), { recursive: true });
    const conflicted = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <hasActivationRequired>false</hasActivationRequired>
    <label>Test PermSet</label>
<<<<<<< HEAD
    <userPermissions>
        <enabled>true</enabled>
        <name>ManageUsers</name>
    </userPermissions>
=======
    <userPermissions>
        <enabled>false</enabled>
        <name>ManageUsers</name>
    </userPermissions>
>>>>>>> branch-b
</PermissionSet>`;
    await writeFile(filePath, conflicted, 'utf8');

    const res = await healConflicts(TEST_DIR, { backup: false });
    assert(res.healedFiles.length === 0, 'Must NOT arbitrarily choose between true and false');
    assert(res.manualReviewFiles.length === 1, 'Must require manual review');

    const unchanged = await readFile(filePath, 'utf8');
    assert(unchanged === conflicted, 'File must remain untouched');
  });

  // ── TEST 7: Entry modified in one branch and deleted in another ──────
  await runTest('7. Entry modified in one branch and deleted in other handled safely', async () => {
    const filePath = join(TEST_DIR, 'permissionsets/Test.permissionset-meta.xml');
    await mkdir(join(TEST_DIR, 'permissionsets'), { recursive: true });
    // Branch A modified an existing userPermission, Branch B deleted it entirely
    const conflicted = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <hasActivationRequired>false</hasActivationRequired>
<<<<<<< HEAD
    <userPermissions>
        <enabled>true</enabled>
        <name>ApiEnabled</name>
    </userPermissions>
=======
>>>>>>> branch-b
</PermissionSet>`;
    await writeFile(filePath, conflicted, 'utf8');

    const res = await healConflicts(TEST_DIR, { backup: false });
    // Safe additive policy keeps the definition rather than silent loss
    assert(res.healedFiles.length === 1, 'Should preserve the permission definition additively');
    const output = await readFile(filePath, 'utf8');
    assert(output.includes('<name>ApiEnabled</name>'), 'Must preserve ApiEnabled without data loss');
  });

  // ── TEST 8: Malformed XML branch detection ───────────────────────────
  await runTest('8. Malformed XML rejected without corruption', async () => {
    const filePath = join(TEST_DIR, 'manifest/package.xml');
    await mkdir(join(TEST_DIR, 'manifest'), { recursive: true });
    const conflicted = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
<<<<<<< HEAD
    <types>
        <members>Unclosed
=======
    <types>
        <members>Closed</members>
    </types>
>>>>>>> branch-b
</Package>`;
    await writeFile(filePath, conflicted, 'utf8');

    const res = await healConflicts(TEST_DIR, { backup: false });
    assert(res.healedFiles.length === 0, 'Must NOT resolve if one branch is invalid XML');
    assert(res.errors.length === 1, 'Must record error for malformed branch XML');

    const unchanged = await readFile(filePath, 'utf8');
    assert(unchanged === conflicted, 'File must remain untouched');
  });

  // ── TEST 9: Incomplete/malformed Git conflict markers ────────────────
  await runTest('9. Incomplete Git conflict markers caught safely', async () => {
    const filePath = join(TEST_DIR, 'manifest/package.xml');
    await mkdir(join(TEST_DIR, 'manifest'), { recursive: true });
    const conflicted = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
<<<<<<< HEAD
    <version>62.0</version>
</Package>`;
    await writeFile(filePath, conflicted, 'utf8');

    const res = await healConflicts(TEST_DIR, { backup: false });
    assert(res.healedFiles.length === 0, 'Must NOT attempt heal on malformed marker');
    assert(res.errors.length === 1, 'Must register malformed marker error');

    const unchanged = await readFile(filePath, 'utf8');
    assert(unchanged === conflicted, 'Original file must remain untouched');
  });

  // ── TEST 10: Multiple conflict regions in one file ───────────────────
  await runTest('10. Multiple conflict regions in one file resolved cleanly', async () => {
    const filePath = join(TEST_DIR, 'permissionsets/Test.permissionset-meta.xml');
    await mkdir(join(TEST_DIR, 'permissionsets'), { recursive: true });
    const conflicted = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <hasActivationRequired>false</hasActivationRequired>
<<<<<<< HEAD
    <userPermissions>
        <enabled>true</enabled>
        <name>PermA</name>
    </userPermissions>
=======
    <userPermissions>
        <enabled>true</enabled>
        <name>PermB</name>
    </userPermissions>
>>>>>>> branch-b
<<<<<<< HEAD
    <classAccesses>
        <apexClass>ClassA</apexClass>
        <enabled>true</enabled>
    </classAccesses>
=======
    <classAccesses>
        <apexClass>ClassB</apexClass>
        <enabled>true</enabled>
    </classAccesses>
>>>>>>> branch-b
</PermissionSet>`;
    await writeFile(filePath, conflicted, 'utf8');

    const res = await healConflicts(TEST_DIR, { backup: false });
    assert(res.healedFiles.length === 1, 'Should resolve multiple regions');
    assert(res.conflictsDetected === 2, `Should detect 2 conflict regions, found ${res.conflictsDetected}`);

    const output = await readFile(filePath, 'utf8');
    assert(output.includes('<name>PermA</name>') && output.includes('<name>PermB</name>'), 'Must preserve both permissions');
    assert(output.includes('<apexClass>ClassA</apexClass>') && output.includes('<apexClass>ClassB</apexClass>'), 'Must preserve both class accesses');
  });

  // ── TEST 11: Unresolved conflict must not overwrite original file ────
  await runTest('11. Unresolved conflict preserves original with diagnostics', async () => {
    const filePath = join(TEST_DIR, 'manifest/package.xml');
    await mkdir(join(TEST_DIR, 'manifest'), { recursive: true });
    const conflicted = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
<<<<<<< HEAD
    <version>57.0</version>
=======
    <version>61.0</version>
>>>>>>> branch-b
</Package>`;
    await writeFile(filePath, conflicted, 'utf8');

    const res = await healConflicts(TEST_DIR, { backup: true });
    assert(res.healedFiles.length === 0, 'Must not heal');
    assert(res.manualReviewFiles.length === 1, 'Must register manual review');

    const contentAfter = await readFile(filePath, 'utf8');
    assert(contentAfter === conflicted, 'File on disk must match original conflicted content exactly');
  });

  // ── TEST 12: Idempotency (Running twice on already resolved output) ───
  await runTest('12. Idempotency: Running twice produces identical output', async () => {
    const filePath = join(TEST_DIR, 'manifest/package.xml');
    await mkdir(join(TEST_DIR, 'manifest'), { recursive: true });
    const conflicted = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
<<<<<<< HEAD
        <members>AccountService</members>
        <name>ApexClass</name>
=======
        <members>BillingService</members>
        <name>ApexClass</name>
>>>>>>> branch-b
    </types>
    <version>62.0</version>
</Package>`;
    await writeFile(filePath, conflicted, 'utf8');

    // Run 1
    const res1 = await healConflicts(TEST_DIR, { backup: false });
    assert(res1.healedFiles.length === 1, 'Run 1 should heal conflict');
    const firstOutput = await readFile(filePath, 'utf8');

    // Run 2 on the already resolved output
    const res2 = await healConflicts(TEST_DIR, { backup: false });
    assert(res2.healedFiles.length === 0, 'Run 2 should find no conflicts');
    assert(res2.conflictsDetected === 0, 'Run 2 conflicts detected must be 0');
    const secondOutput = await readFile(filePath, 'utf8');

    assert(firstOutput === secondOutput, 'File content must be identical after run 2');
  });

  // ── TEST 13: 3-Way Base: Item deleted by one branch (clean deletion) ─
  await runTest('13. 3-Way Base: Clean deletion by one branch honored when base provided', async () => {
    const { PermissionSetResolver } = await import('../src/resolvers/permissionset-resolver.js');
    const resolver = new PermissionSetResolver();

    const base = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <userPermissions><enabled>true</enabled><name>ExportReport</name></userPermissions>
    <userPermissions><enabled>true</enabled><name>ViewSetup</name></userPermissions>
</PermissionSet>`;

    // Branch A intentionally deleted ViewSetup
    const ours = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <userPermissions><enabled>true</enabled><name>ExportReport</name></userPermissions>
</PermissionSet>`;

    // Branch B left ViewSetup untouched
    const theirs = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <userPermissions><enabled>true</enabled><name>ExportReport</name></userPermissions>
    <userPermissions><enabled>true</enabled><name>ViewSetup</name></userPermissions>
</PermissionSet>`;

    const result = resolver.mergePermissionSet(ours, theirs, base);
    assert(result.success === true, 'Should successfully resolve with base awareness');
    assert(!result.mergedXml.includes('ViewSetup'), 'Clean deletion in branch A must be honored');
    assert(result.mergedXml.includes('ExportReport'), 'ExportReport must be retained');
  });

  // ── TEST 14: 3-Way Base: Modify vs Delete collision routed to review ─
  await runTest('14. 3-Way Base: Modify vs Delete collision routed to review', async () => {
    const { PermissionSetResolver } = await import('../src/resolvers/permissionset-resolver.js');
    const resolver = new PermissionSetResolver();

    const base = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <userPermissions><enabled>true</enabled><name>ManageUsers</name></userPermissions>
</PermissionSet>`;

    // Branch A deleted ManageUsers
    const ours = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <hasActivationRequired>false</hasActivationRequired>
</PermissionSet>`;

    // Branch B modified ManageUsers (changed enabled to false)
    const theirs = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <hasActivationRequired>false</hasActivationRequired>
    <userPermissions><enabled>false</enabled><name>ManageUsers</name></userPermissions>
</PermissionSet>`;

    const result = resolver.mergePermissionSet(ours, theirs, base);
    assert(result.success === false, 'Must NOT auto-resolve Delete vs Modify collision');
    assert(result.requiresReview === true, 'Must route Delete vs Modify to manual review');
    assert(result.reason.includes('Delete vs Modify'), 'Reason must diagnose Delete vs Modify collision');
  });

  // ── TEST 15: 3-Way Base: Both modifying same item differently ────────
  await runTest('15. 3-Way Base: Both modifying same item differently routed to review', async () => {
    const { PermissionSetResolver } = await import('../src/resolvers/permissionset-resolver.js');
    const resolver = new PermissionSetResolver();

    const base = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <fieldPermissions><editable>false</editable><field>Account.Rating</field><readable>true</readable></fieldPermissions>
</PermissionSet>`;

    // Branch A made it editable=true
    const ours = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <fieldPermissions><editable>true</editable><field>Account.Rating</field><readable>true</readable></fieldPermissions>
</PermissionSet>`;

    // Branch B made readable=false
    const theirs = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <fieldPermissions><editable>false</editable><field>Account.Rating</field><readable>false</readable></fieldPermissions>
</PermissionSet>`;

    const result = resolver.mergePermissionSet(ours, theirs, base);
    assert(result.success === false, 'Must NOT resolve divergent field permission modifications');
    assert(result.requiresReview === true, 'Must route divergent field permission modifications to review');
  });

  // ── TEST 16: Atomic File Write Safety on Aborted Operations ──────────
  await runTest('16. Atomic write safety: Unresolved files never modified, no temp artifacts left', async () => {
    const filePath = join(TEST_DIR, 'permissionsets/Broken.permissionset-meta.xml');
    await mkdir(join(TEST_DIR, 'permissionsets'), { recursive: true });
    const originalConflicted = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
<<<<<<< HEAD
    <userPermissions><enabled>true</enabled><name>PermA</name></userPermissions>
=======
    <userPermissions><enabled>false</enabled><name>PermA</name></userPermissions>
>>>>>>> branch-b
</PermissionSet>`;
    await writeFile(filePath, originalConflicted, 'utf8');

    const res = await healConflicts(TEST_DIR, { backup: true });
    assert(res.healedFiles.length === 0, 'Must not report healed');
    assert(res.manualReviewFiles.length === 1, 'Must flag manual review');

    const currentOnDisk = await readFile(filePath, 'utf8');
    assert(currentOnDisk === originalConflicted, 'Original conflicted file must be bit-for-bit identical');

    // Confirm no leftover .tmp files
    const allFiles = await (await import('glob')).glob('**/*', { cwd: TEST_DIR, nodir: true });
    assert(!allFiles.some(f => f.includes('.tmp')), 'No temporary files must remain on disk');
  });

  // ── FINAL SUMMARY ──────────────────────────────────────────────────
  await rm(TEST_DIR, { recursive: true, force: true });
  console.log(chalk.bold.cyan('\n════════════════════════════════════════════════════════════════════════'));
  console.log(chalk.bold(`  Test Results: ${chalk.green(passedTests + ' Passed')}, ${failedTests === 0 ? chalk.green('0 Failed') : chalk.red(failedTests + ' Failed')} (Total: ${passedTests + failedTests})`));
  console.log(chalk.bold.cyan('════════════════════════════════════════════════════════════════════════\n'));

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
