import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Tiny, dependency-free schema validator for Cloud Function callable inputs.
 *
 * Goals:
 *
 * - Reject *missing* required fields with a stable, machine-readable error
 *   code (`invalid-argument`) and a human-readable message that says which
 *   field is missing or wrong.
 * - Reject *unknown* / extra fields so an honest client cannot accidentally
 *   pass through fields the contract does not document, and a malicious
 *   client cannot smuggle privileged fields past the callable.
 * - Validate basic shape (string, number, boolean, optional, enum) without
 *   pulling in a runtime dependency. The number of callables here is small
 *   and this keeps the bundle compact.
 *
 * The schema lives next to the callable (in the same file) so the contract
 * stays close to the implementation.
 */

export type PrimitiveType = 'string' | 'number' | 'boolean';

export interface FieldSpec {
  type: PrimitiveType;
  optional?: boolean;
  /** Constrains a string field to a fixed set of allowed values. */
  enum?: readonly string[];
  /** Minimum string length (inclusive). Defaults to 1 for required strings. */
  minLength?: number;
  /** Maximum string length (inclusive). */
  maxLength?: number;
  /** Inclusive numeric range. */
  min?: number;
  max?: number;
}

export type Schema = Record<string, FieldSpec>;

/**
 * Validate `data` against `schema`. Throws an HttpsError with code
 * `invalid-argument` on failure. On success returns the value cast to the
 * caller's expected type — this is purely a typing convenience; the data is
 * the same object the caller passed.
 */
export function validate<T extends Record<string, unknown>>(
  data: unknown,
  schema: Schema,
): T {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'Expected a JSON object payload.');
  }

  const value = data as Record<string, unknown>;

  for (const key of Object.keys(value)) {
    if (!(key in schema)) {
      throw new HttpsError(
        'invalid-argument',
        `Unknown field "${key}". Allowed: ${Object.keys(schema).join(', ')}`,
      );
    }
  }

  for (const [key, spec] of Object.entries(schema)) {
    const v = value[key];
    if (v === undefined || v === null) {
      if (!spec.optional) {
        throw new HttpsError(
          'invalid-argument',
          `Missing required field "${key}".`,
        );
      }
      continue;
    }

    if (spec.type === 'string') {
      if (typeof v !== 'string') {
        throw new HttpsError(
          'invalid-argument',
          `Field "${key}" must be a string.`,
        );
      }
      const minLen = spec.minLength ?? (spec.optional ? 0 : 1);
      if (v.length < minLen) {
        throw new HttpsError(
          'invalid-argument',
          `Field "${key}" must be at least ${minLen} character(s).`,
        );
      }
      if (spec.maxLength !== undefined && v.length > spec.maxLength) {
        throw new HttpsError(
          'invalid-argument',
          `Field "${key}" must be at most ${spec.maxLength} character(s).`,
        );
      }
      if (spec.enum && !spec.enum.includes(v)) {
        throw new HttpsError(
          'invalid-argument',
          `Field "${key}" must be one of: ${spec.enum.join(', ')}.`,
        );
      }
    } else if (spec.type === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new HttpsError(
          'invalid-argument',
          `Field "${key}" must be a finite number.`,
        );
      }
      if (spec.min !== undefined && v < spec.min) {
        throw new HttpsError(
          'invalid-argument',
          `Field "${key}" must be >= ${spec.min}.`,
        );
      }
      if (spec.max !== undefined && v > spec.max) {
        throw new HttpsError(
          'invalid-argument',
          `Field "${key}" must be <= ${spec.max}.`,
        );
      }
    } else if (spec.type === 'boolean') {
      if (typeof v !== 'boolean') {
        throw new HttpsError(
          'invalid-argument',
          `Field "${key}" must be a boolean.`,
        );
      }
    }
  }

  return value as T;
}
