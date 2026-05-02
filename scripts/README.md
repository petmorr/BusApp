# Scripts

Admin and operations utilities for the Supporters Bus Attendance App.

## `import_members.ts`

Bulk-load the initial member list from CSV. Optionally creates pending
`memberUserLinks` for known member-to-user matches.

CSV format:

```csv
firstName,lastName,displayName,primaryPhoneE164,memberNumber,generalNotes
John,Smith,John Smith,+447700900123,001,
Child,Smith,Child Smith,+447700900123,002,
```

### Usage

```bash
cd scripts
npm install

# Set up auth: download a service-account JSON from
# Firebase console → Project settings → Service accounts → Generate new
# private key, then point GOOGLE_APPLICATION_CREDENTIALS at it.
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

npm run import-members -- \
  --csv ../firestore/seed/members.example.csv \
  --project supporters-bus-dev
```

Pass `--dry-run` to preview what would be written without modifying Firestore.

The script is idempotent on `memberNumber`. Members with an existing record
matching the same `memberNumber` are updated rather than duplicated.
