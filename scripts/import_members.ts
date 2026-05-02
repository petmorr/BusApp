import { readFileSync } from "fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

type MemberCsvRow = {
  firstName: string;
  lastName: string;
  displayName: string;
  primaryPhoneE164: string;
  memberNumber: string;
  generalNotes: string;
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseMembersCsv(path: string): MemberCsvRow[] {
  const lines = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const [headerLine, ...dataLines] = lines;
  const headers = parseCsvLine(headerLine);

  return dataLines.map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));

    return {
      firstName: row.firstName,
      lastName: row.lastName,
      displayName: row.displayName || `${row.firstName} ${row.lastName}`.trim(),
      primaryPhoneE164: row.primaryPhoneE164,
      memberNumber: row.memberNumber,
      generalNotes: row.generalNotes,
    };
  });
}

async function main(): Promise<void> {
  const csvPath = process.argv[2];
  if (!csvPath) {
    throw new Error("Usage: npm run import:members -- path/to/members.csv");
  }

  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();
  const members = parseMembersCsv(csvPath);
  const batch = db.batch();

  members.forEach((member) => {
    if (!member.firstName || !member.lastName) {
      throw new Error(`Member row is missing firstName or lastName: ${JSON.stringify(member)}`);
    }

    const ref = db.collection("members").doc();
    batch.set(ref, {
      ...member,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
  console.log(`Imported ${members.length} members.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
