/**
 * Bulk import the initial supporters member list from a CSV file.
 *
 * Usage:
 *   npm run import-members -- --csv ./members.csv --project supporters-bus-dev
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS to point at a service-account key
 * file with Cloud Firestore write permission for the target project.
 *
 * Safety guards:
 *
 * - `--dry-run` prints the planned writes without executing them.
 * - Importing into a project id that is NOT `demo-*` and NOT on the
 *   allow-list requires the explicit `--i-understand-production` flag,
 *   which forces the operator to acknowledge the production risk.
 * - If `FIRESTORE_EMULATOR_HOST` is set, the script always targets the
 *   emulator regardless of project id, so CI and dev loops are safe.
 */

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { parse } from 'csv-parse/sync';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const NON_PROD_ALLOWED_PROJECT_IDS = new Set<string>([
  'supporters-bus-dev',
  'supporters-bus-e2e',
]);

interface MemberCsvRow {
  firstName: string;
  lastName: string;
  displayName: string;
  primaryPhoneE164: string;
  memberNumber?: string;
  generalNotes?: string;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      csv: { type: 'string' },
      project: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'i-understand-production': { type: 'boolean', default: false },
    },
    strict: true,
  });

  if (!values.csv) {
    console.error('Missing --csv <path>');
    process.exit(1);
  }
  if (!values.project) {
    console.error('Missing --project <firebase-project-id>');
    process.exit(1);
  }

  const projectId = values.project;
  const isEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  const isDemoProject = projectId.startsWith('demo-');
  const isAllowedNonProd =
    isDemoProject || NON_PROD_ALLOWED_PROJECT_IDS.has(projectId);
  if (!isEmulator && !isAllowedNonProd && !values['i-understand-production']) {
    console.error(
      `Refusing to run: project id "${projectId}" looks like a production ` +
        `project and --i-understand-production was not passed.\n\n` +
        `If this really is a production import, re-run with ` +
        `--i-understand-production. For dev/test, use --project ` +
        `demo-supporters-bus (or any demo-* id) or set FIRESTORE_EMULATOR_HOST.`,
    );
    process.exit(1);
  }

  const csvText = await readFile(values.csv, 'utf8');
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as MemberCsvRow[];

  validate(rows);

  initializeApp({
    credential: applicationDefault(),
    projectId,
  });
  const db = getFirestore();

  console.log(
    `${values['dry-run'] ? '[dry-run] ' : ''}importing ${rows.length} members into ${values.project}…`,
  );

  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const phone = normalisePhone(row.primaryPhoneE164);
    const baseDoc = {
      firstName: row.firstName,
      lastName: row.lastName,
      displayName: row.displayName || `${row.firstName} ${row.lastName}`.trim(),
      primaryPhoneE164: phone,
      memberNumber: row.memberNumber || null,
      status: 'active' as const,
      generalNotes: row.generalNotes || '',
      updatedAt: FieldValue.serverTimestamp(),
    };

    let existingId: string | null = null;
    if (row.memberNumber) {
      const existing = await db
        .collection('members')
        .where('memberNumber', '==', row.memberNumber)
        .limit(1)
        .get();
      if (!existing.empty) existingId = existing.docs[0].id;
    }

    if (values['dry-run']) {
      console.log(
        existingId
          ? `would update members/${existingId} (${row.displayName})`
          : `would create members/* (${row.displayName})`,
      );
      continue;
    }

    if (existingId) {
      await db.collection('members').doc(existingId).set(baseDoc, { merge: true });
      updated += 1;
    } else {
      await db.collection('members').add({
        ...baseDoc,
        createdAt: FieldValue.serverTimestamp(),
      });
      created += 1;
    }
  }

  console.log(`done. created=${created} updated=${updated}`);
}

function validate(rows: MemberCsvRow[]): void {
  const required: Array<keyof MemberCsvRow> = [
    'firstName',
    'lastName',
    'primaryPhoneE164',
  ];
  rows.forEach((row, i) => {
    for (const k of required) {
      if (!row[k]) {
        throw new Error(`row ${i + 1}: missing required field "${k}"`);
      }
    }
    if (!/^\+[1-9]\d{6,14}$/.test(row.primaryPhoneE164)) {
      throw new Error(
        `row ${i + 1}: primaryPhoneE164 "${row.primaryPhoneE164}" is not E.164`,
      );
    }
  });
}

function normalisePhone(input: string): string {
  return input.replace(/\s+/g, '');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
