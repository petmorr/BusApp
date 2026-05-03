import { HttpsError } from 'firebase-functions/v2/https';
import { validate, Schema } from '../src/utils/validation';

describe('validate', () => {
  const schema: Schema = {
    eventId: { type: 'string', minLength: 1, maxLength: 50 },
    capacity: { type: 'number', min: 1, max: 100 },
    enabled: { type: 'boolean' },
    role: { type: 'string', enum: ['user', 'helper', 'admin'] },
    note: { type: 'string', optional: true, maxLength: 100 },
  };

  function err(fn: () => unknown): HttpsError {
    try {
      fn();
    } catch (e) {
      return e as HttpsError;
    }
    throw new Error('expected validate() to throw');
  }

  it('accepts a payload with all required fields and correct types', () => {
    const out = validate(
      { eventId: 'e1', capacity: 50, enabled: true, role: 'admin' },
      schema,
    );
    expect(out.eventId).toBe('e1');
  });

  it('rejects null / non-object payloads', () => {
    expect(err(() => validate(null, schema)).code).toBe('invalid-argument');
    expect(err(() => validate('hi', schema)).code).toBe('invalid-argument');
    expect(err(() => validate([1, 2], schema)).code).toBe('invalid-argument');
  });

  it('rejects unknown / extra fields', () => {
    const e = err(() =>
      validate(
        { eventId: 'e1', capacity: 50, enabled: true, role: 'admin', sneaky: 1 },
        schema,
      ),
    );
    expect(e.code).toBe('invalid-argument');
    expect(e.message).toContain('Unknown field');
  });

  it('rejects missing required fields', () => {
    const e = err(() => validate({ eventId: 'e1', capacity: 1, enabled: true }, schema));
    expect(e.message).toContain('Missing required field "role"');
  });

  it('rejects type mismatches', () => {
    expect(
      err(() => validate({ eventId: 1, capacity: 1, enabled: true, role: 'user' }, schema))
        .message,
    ).toContain('"eventId" must be a string');
    expect(
      err(() => validate({ eventId: 'a', capacity: 'big', enabled: true, role: 'user' }, schema))
        .message,
    ).toContain('"capacity" must be a finite number');
    expect(
      err(() => validate({ eventId: 'a', capacity: 1, enabled: 'yes', role: 'user' }, schema))
        .message,
    ).toContain('"enabled" must be a boolean');
  });

  it('rejects strings outside min/max length', () => {
    expect(
      err(() => validate({ eventId: '', capacity: 1, enabled: true, role: 'user' }, schema))
        .message,
    ).toContain('at least 1');
    const tooLong = 'x'.repeat(60);
    expect(
      err(() => validate({ eventId: tooLong, capacity: 1, enabled: true, role: 'user' }, schema))
        .message,
    ).toContain('at most 50');
  });

  it('rejects numbers outside min/max', () => {
    expect(
      err(() => validate({ eventId: 'a', capacity: 0, enabled: true, role: 'user' }, schema))
        .message,
    ).toContain('>= 1');
    expect(
      err(() => validate({ eventId: 'a', capacity: 999, enabled: true, role: 'user' }, schema))
        .message,
    ).toContain('<= 100');
  });

  it('rejects strings outside the enum constraint', () => {
    expect(
      err(() =>
        validate({ eventId: 'a', capacity: 1, enabled: true, role: 'superuser' }, schema),
      ).message,
    ).toContain('must be one of');
  });

  it('treats null and undefined as missing for required fields', () => {
    expect(
      err(() =>
        validate({ eventId: 'a', capacity: 1, enabled: true, role: null }, schema),
      ).message,
    ).toContain('Missing required field "role"');
  });

  it('accepts optional fields when omitted', () => {
    const out = validate(
      { eventId: 'a', capacity: 1, enabled: true, role: 'user' },
      schema,
    );
    expect(out.note).toBeUndefined();
  });

  it('rejects NaN for a number field', () => {
    expect(
      err(() =>
        validate({ eventId: 'a', capacity: NaN, enabled: true, role: 'user' }, schema),
      ).message,
    ).toContain('must be a finite number');
  });

  it('rejects Infinity for a number field', () => {
    expect(
      err(() =>
        validate({ eventId: 'a', capacity: Infinity, enabled: true, role: 'user' }, schema),
      ).message,
    ).toContain('must be a finite number');
  });

  it('accepts an optional string when explicitly provided', () => {
    const out = validate(
      { eventId: 'a', capacity: 1, enabled: true, role: 'user', note: 'hello' },
      schema,
    );
    expect(out.note).toBe('hello');
  });

  it('rejects an optional string that exceeds maxLength', () => {
    const tooLong = 'x'.repeat(101);
    expect(
      err(() =>
        validate(
          { eventId: 'a', capacity: 1, enabled: true, role: 'user', note: tooLong },
          schema,
        ),
      ).message,
    ).toContain('at most 100');
  });
});
