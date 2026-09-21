/**
 * Forensic evidence packaging.
 *
 * Turns the events behind an incident into something that could be handed
 * to somebody else: a canonical, ordered record with a checksum chain over
 * it, so a later reader can tell whether what they are holding is what was
 * captured.
 *
 * ## The honesty problem, stated plainly
 *
 * Real evidence integrity needs a **cryptographic** hash and a signature
 * from a key the analyst does not control. This module has neither. It
 * computes a fast non-cryptographic checksum (FNV-1a) in the browser, over
 * data the browser itself produced, from a simulation.
 *
 * That is genuinely useful for what it is — it detects accidental
 * corruption, truncation and reordering, which is most of what goes wrong
 * with an exported file — and it is genuinely **not** tamper-evidence,
 * because anyone who can alter the record can recompute the checksum.
 *
 * So nothing here is called a hash, a signature, or chain-of-custody. It is
 * called a checksum, and every export says what it can and cannot prove.
 * Borrowing forensic vocabulary for something that would not survive
 * contact with a forensic examiner is the fastest way for a project like
 * this to lose the benefit of everything else it does honestly.
 */

/** Bumped when the canonical form changes, so old exports stay readable. */
export const PACKAGE_VERSION = '1.0';

/**
 * FNV-1a, 32-bit, as an 8-character hex string.
 *
 * Chosen because it is eight lines long: a reader can verify there is
 * nothing hiding in it. Not cryptographic, and the module says so.
 */
export function checksum(input) {
  const text = String(input ?? '');
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Canonical text for one event.
 *
 * Field order is fixed here rather than taken from the object, because
 * `JSON.stringify` preserves insertion order — two events with identical
 * content but different key order would otherwise produce different
 * checksums, and the export would appear to have been altered when it had
 * not.
 */
export function canonicalise(event) {
  const fields = [
    'id',
    'type',
    'at',
    'service',
    'sourceIp',
    'userId',
    'sessionId',
    'severityScore',
  ];
  return fields
    .map((key) => {
      const value = event?.[key];
      return `${key}=${value === undefined || value === null ? '' : String(value)}`;
    })
    .join('|');
}

/**
 * Build the evidence package.
 *
 * Each record carries its own checksum *and* a running checksum over
 * everything before it. The running value is what makes reordering and
 * removal detectable: an individually-valid record in the wrong position
 * breaks the chain from that point on.
 */
export function packageEvidence(incident, options = {}) {
  const capturedAt = options.capturedAt ?? Date.now();
  const events = (incident?.events ?? [])
    .filter((e) => e && typeof e === 'object' && e.id)
    .slice()
    .sort((a, b) => (a.atMs ?? Date.parse(a.at)) - (b.atMs ?? Date.parse(b.at)));

  let running = checksum(`${PACKAGE_VERSION}|${incident?.id ?? 'unknown'}`);

  const records = events.map((event, index) => {
    const canonical = canonicalise(event);
    const own = checksum(canonical);
    running = checksum(`${running}|${own}`);
    return {
      index,
      id: event.id,
      canonical,
      checksum: own,
      chain: running,
    };
  });

  return {
    version: PACKAGE_VERSION,
    incidentId: incident?.id ?? null,
    label: incident?.label ?? null,
    confidence: incident?.confidence ?? null,
    capturedAt: new Date(capturedAt).toISOString(),
    counts: {
      events: records.length,
      discarded: (incident?.events ?? []).length - records.length,
    },
    entities: incident?.entities ?? null,
    reasoning: incident?.reasoning ?? [],
    records,
    seal: running,
    /**
     * Travels inside the export, not only on the screen that made it. A
     * file that ends up in someone's inbox must carry its own caveats.
     */
    integrity: {
      algorithm: 'FNV-1a 32-bit checksum',
      cryptographic: false,
      detects: [
        'accidental corruption',
        'truncation',
        'reordering of records',
      ],
      doesNotDetect: [
        'deliberate alteration — anyone who can edit the record can recompute the checksum',
      ],
      note:
        'This is a checksum, not a cryptographic hash or a signature, and ' +
        'this package is not chain-of-custody evidence. The events it ' +
        'contains come from a simulation.',
    },
    simulated: true,
  };
}

/**
 * Verify a package against itself.
 *
 * Returns which records fail and why, rather than one boolean: "the file is
 * bad" is not an answer anybody can act on, and "record 14 was altered,
 * everything after it is unverifiable" is.
 */
export function verifyPackage(pkg) {
  if (!pkg || !Array.isArray(pkg.records)) {
    return { valid: false, reason: 'not an evidence package', failures: [] };
  }

  let running = checksum(`${pkg.version}|${pkg.incidentId ?? 'unknown'}`);
  const failures = [];

  pkg.records.forEach((record) => {
    const own = checksum(record.canonical);
    running = checksum(`${running}|${own}`);

    if (own !== record.checksum) {
      failures.push({ index: record.index, id: record.id, problem: 'record altered' });
    } else if (running !== record.chain) {
      failures.push({
        index: record.index,
        id: record.id,
        problem: 'record moved, or an earlier record changed',
      });
    }
  });

  return {
    valid: failures.length === 0 && running === pkg.seal,
    sealMatches: running === pkg.seal,
    failures,
    // The first failure is the only one worth acting on: everything after
    // it is unverifiable rather than independently wrong.
    firstFailure: failures[0] ?? null,
  };
}

/** The exported file's contents, pretty-printed so a human can read it. */
export const serialisePackage = (pkg) => JSON.stringify(pkg, null, 2);
