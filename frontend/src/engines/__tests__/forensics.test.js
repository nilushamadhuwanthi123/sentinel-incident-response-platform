import { describe, expect, it } from 'vitest';
import {
  PACKAGE_VERSION,
  canonicalise,
  checksum,
  packageEvidence,
  serialisePackage,
  verifyPackage,
} from '../forensics.js';

const T0 = Date.parse('2026-09-13T09:00:00.000Z');
const at = (ms) => new Date(T0 + ms).toISOString();

const incident = (overrides = {}) => ({
  id: 'cand-1',
  label: 'Possible escalation chain',
  confidence: 86,
  entities: { sourceIps: ['203.0.113.47'], users: ['svc-admin'], sessions: [], services: ['auth'] },
  reasoning: [{ rule: 'AUTH_FAILURE_BURST', detail: '27 failed authentications', weight: 22 }],
  events: [
    { id: 'e1', type: 'UNKNOWN_IP', at: at(0), service: 'edge-gateway', sourceIp: '203.0.113.47' },
    { id: 'e2', type: 'FAILED_LOGIN', at: at(1000), service: 'auth', userId: 'svc-admin' },
    { id: 'e3', type: 'PRIVILEGE_ESCALATION', at: at(2000), service: 'auth' },
  ],
  ...overrides,
});

describe('checksum', () => {
  it('is deterministic', () => {
    expect(checksum('abc')).toBe(checksum('abc'));
  });

  it('changes when the input changes by one character', () => {
    expect(checksum('abc')).not.toBe(checksum('abd'));
  });

  it('is always eight hex characters', () => {
    ['', 'a', 'a much longer string than that one'].forEach((input) => {
      expect(checksum(input)).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  it('handles nothing without throwing', () => {
    expect(checksum()).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('canonicalise', () => {
  it('produces the same text regardless of key order', () => {
    // JSON.stringify preserves insertion order, so without a fixed field
    // list two identical events would check differently and the export
    // would look altered when it was not.
    const a = canonicalise({ id: '1', type: 'FAILED_LOGIN', at: at(0) });
    const b = canonicalise({ at: at(0), type: 'FAILED_LOGIN', id: '1' });
    expect(a).toBe(b);
  });

  it('renders a missing field as empty rather than "undefined"', () => {
    expect(canonicalise({ id: '1' })).toContain('service=|');
    expect(canonicalise({ id: '1' })).not.toContain('undefined');
  });
});

describe('packageEvidence', () => {
  it('records every event, in time order', () => {
    const pkg = packageEvidence(incident(), { capturedAt: T0 });
    expect(pkg.records).toHaveLength(3);
    expect(pkg.records.map((r) => r.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('orders events even when they arrive out of order', () => {
    const scrambled = incident();
    scrambled.events = [scrambled.events[2], scrambled.events[0], scrambled.events[1]];
    const pkg = packageEvidence(scrambled, { capturedAt: T0 });
    expect(pkg.records.map((r) => r.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('chains each record to everything before it', () => {
    const pkg = packageEvidence(incident(), { capturedAt: T0 });
    const chains = pkg.records.map((r) => r.chain);
    expect(new Set(chains).size).toBe(chains.length);
    expect(pkg.seal).toBe(chains[chains.length - 1]);
  });

  it('drops events with no id and counts them', () => {
    const broken = incident();
    broken.events = [...broken.events, { type: 'NO_ID', at: at(3000) }, null];
    const pkg = packageEvidence(broken, { capturedAt: T0 });
    expect(pkg.counts.events).toBe(3);
    expect(pkg.counts.discarded).toBe(2);
  });

  it('carries the reasoning and entities, not only the raw events', () => {
    const pkg = packageEvidence(incident(), { capturedAt: T0 });
    expect(pkg.reasoning[0].rule).toBe('AUTH_FAILURE_BURST');
    expect(pkg.entities.sourceIps).toEqual(['203.0.113.47']);
  });

  it('states what the checksum can and cannot prove, inside the package', () => {
    // A file that ends up in someone's inbox has to carry its own caveats.
    const pkg = packageEvidence(incident(), { capturedAt: T0 });
    expect(pkg.integrity.cryptographic).toBe(false);
    expect(pkg.integrity.doesNotDetect[0]).toMatch(/deliberate alteration/i);
    expect(pkg.integrity.note).toMatch(/not chain-of-custody evidence/i);
    expect(pkg.simulated).toBe(true);
  });

  it('is deterministic for the same incident and capture time', () => {
    const a = packageEvidence(incident(), { capturedAt: T0 });
    const b = packageEvidence(incident(), { capturedAt: T0 });
    expect(a).toEqual(b);
  });

  it('handles an incident with no events', () => {
    const pkg = packageEvidence({ id: 'x', events: [] }, { capturedAt: T0 });
    expect(pkg.records).toEqual([]);
    expect(pkg.seal).toBe(checksum(`${PACKAGE_VERSION}|x`));
  });

  it('handles no incident at all', () => {
    const pkg = packageEvidence(undefined, { capturedAt: T0 });
    expect(pkg.incidentId).toBeNull();
    expect(pkg.records).toEqual([]);
  });
});

describe('verifyPackage', () => {
  const pkg = () => packageEvidence(incident(), { capturedAt: T0 });

  it('verifies an untouched package', () => {
    const result = verifyPackage(pkg());
    expect(result.valid).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('detects an altered record and names it', () => {
    // "The file is bad" is not an answer anybody can act on.
    const tampered = pkg();
    tampered.records[1].canonical = tampered.records[1].canonical.replace(
      'FAILED_LOGIN',
      'ROUTINE_LOGIN'
    );
    const result = verifyPackage(tampered);
    expect(result.valid).toBe(false);
    expect(result.firstFailure).toMatchObject({ index: 1, id: 'e2', problem: 'record altered' });
  });

  it('detects reordering', () => {
    const reordered = pkg();
    [reordered.records[0], reordered.records[1]] = [
      reordered.records[1],
      reordered.records[0],
    ];
    const result = verifyPackage(reordered);
    expect(result.valid).toBe(false);
    expect(result.firstFailure.problem).toMatch(/moved, or an earlier record changed/);
  });

  it('detects truncation through the seal', () => {
    const truncated = pkg();
    truncated.records.pop();
    const result = verifyPackage(truncated);
    expect(result.valid).toBe(false);
    expect(result.sealMatches).toBe(false);
  });

  it('reports the first failure, because everything after it is unverifiable', () => {
    const tampered = pkg();
    tampered.records[0].canonical += 'x';
    const result = verifyPackage(tampered);
    expect(result.firstFailure.index).toBe(0);
    expect(result.failures.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects something that is not a package', () => {
    expect(verifyPackage(null).valid).toBe(false);
    expect(verifyPackage({}).reason).toMatch(/not an evidence package/);
  });
});

describe('serialisePackage', () => {
  it('produces readable JSON that round-trips', () => {
    const pkg = packageEvidence(incident(), { capturedAt: T0 });
    const text = serialisePackage(pkg);
    expect(text).toContain('\n  ');
    expect(verifyPackage(JSON.parse(text)).valid).toBe(true);
  });
});
