/**
 * PII redaction policy.
 *
 * Per `docs/observability.md`, structured logs and audit-log payloads must
 * not echo personal data verbatim. The schema is small and well-known, so
 * a hard-coded allowlist of "fields that contain PII" is sufficient and
 * safer than a generic regex sweep:
 *
 *   - phoneE164, primaryPhoneE164          → masked to country code + last 2
 *   - guestName                            → length-only marker
 *   - displayName, firstName, lastName,
 *     memberDisplayName                    → length-only marker
 *   - generalNotes                         → length-only marker
 *   - parkedBusLocation.lat / .lng         → rounded to 2 dp (~1km grid)
 *   - location.lat / .lng                  → rounded to 2 dp
 *
 * Anything not on the allowlist is passed through unchanged. The function
 * is deep but bounded — it walks the object, redacts known sensitive
 * keys, and copies the rest. It is also idempotent: redacting an already
 * redacted payload is a no-op.
 *
 * Audit-log entries store the *redacted* before / after for incident
 * triage; the source documents themselves remain unmodified in
 * Firestore (where Firestore rules already restrict who can read them).
 */

const PHONE_KEYS = new Set(['phoneE164', 'primaryPhoneE164']);
const NAME_KEYS = new Set([
  'guestName',
  'displayName',
  'firstName',
  'lastName',
  'memberDisplayName',
]);
const FREE_TEXT_KEYS = new Set(['generalNotes', 'notes', 'address', 'label']);
const COORD_KEYS = new Set(['lat', 'lng']);

export function redactForAudit<T>(input: T): T {
  return walk(input) as T;
}

// A value is already a redaction marker — leave it alone so redaction is
// idempotent.
const MARKER_RE = /^«(?:phone:short|name:len=\d+|text:len=\d+|phone:[+\d]+\*\*\*\d{2})»?$/;

function isAlreadyMarker(value: string): boolean {
  // Check both the bracketed markers and the masked-phone form
  // ("+447***23") which a second pass would otherwise re-mask.
  if (MARKER_RE.test(value)) return true;
  if (value.includes('***')) return true;
  return false;
}

function walk(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(walk);
  if (typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (PHONE_KEYS.has(k) && typeof v === 'string') {
      out[k] = isAlreadyMarker(v) ? v : maskPhone(v);
    } else if (NAME_KEYS.has(k) && typeof v === 'string') {
      out[k] = isAlreadyMarker(v) ? v : `«name:len=${v.length}»`;
    } else if (FREE_TEXT_KEYS.has(k) && typeof v === 'string') {
      out[k] = isAlreadyMarker(v) ? v : `«text:len=${v.length}»`;
    } else if (COORD_KEYS.has(k) && typeof v === 'number') {
      out[k] = roundCoord(v);
    } else {
      out[k] = walk(v);
    }
  }
  return out;
}

function maskPhone(phone: string): string {
  if (phone.length < 4) return '«phone:short»';
  const cc = phone.slice(0, Math.min(4, phone.length - 2));
  const last2 = phone.slice(-2);
  return `${cc}***${last2}`;
}

function roundCoord(coord: number): number {
  return Math.round(coord * 100) / 100;
}
