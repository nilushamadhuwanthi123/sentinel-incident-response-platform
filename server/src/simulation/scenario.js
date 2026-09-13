/**
 * The scenario the simulation replays.
 *
 * SENTINEL has no real telemetry behind it, and pretending otherwise would
 * be dishonest — so the feed is a *scripted* simulation, written down here
 * as data rather than improvised by a random generator. That choice buys
 * three things:
 *
 *   1. A demo that tells a story. The credential attack escalates in the
 *      order a credential attack actually escalates, so the correlation
 *      engine has something real to find.
 *   2. Reproducibility. Same seed, same feed — which is what makes an
 *      end-to-end test of a "live" system possible at all.
 *   3. Honesty. Anyone can read this file and see exactly what is invented.
 *
 * Timings are relative offsets in seconds from the moment the scenario
 * starts, so the whole thing can be replayed faster or slower without
 * rewriting any of it.
 */

/**
 * The services the scenario touches.
 *
 * These ids are the topology's node ids, not a second naming scheme. They
 * have to match exactly: a `service:statusChanged` for a service the graph
 * has never heard of changes nothing on screen and raises no error, which
 * is the worst kind of bug — the demo simply looks broken for no stated
 * reason.
 */
export const SERVICE_IDS = Object.freeze([
  'edge-gateway',
  'api-gateway',
  'auth',
  'core-api',
  'payment',
  'storage',
  'notification',
  'database',
]);

/**
 * Background noise.
 *
 * A feed that only ever emits attack steps is not a feed, it is a slideshow.
 * Real consoles are mostly noise, and an analyst's actual skill is finding
 * the signal inside it — so the simulation emits noise too, and the
 * correlation engine has to earn its conclusion.
 */
export const AMBIENT_EVENTS = Object.freeze([
  { type: 'API_LATENCY', service: 'core-api', weight: 6 },
  { type: 'API_LATENCY', service: 'payment', weight: 4 },
  { type: 'REQUEST_SPIKE', service: 'edge-gateway', weight: 3 },
  { type: 'FAILED_LOGIN', service: 'auth', weight: 5 },
  { type: 'DATABASE_ERROR', service: 'database', weight: 2 },
  { type: 'UNKNOWN_IP', service: 'edge-gateway', weight: 3 },
]);

/**
 * The scripted incident: a credential attack that starts as noise and ends
 * two steps from the database.
 *
 * `at` is seconds from scenario start. Every step carries the entity fields
 * the correlation engine groups on, because an incident the engine cannot
 * reconstruct would prove nothing.
 */
export const CREDENTIAL_ATTACK = Object.freeze({
  id: 'scn-credential-attack',
  title: 'Credential attack against a privileged identity',
  sourceIp: '203.0.113.47',
  userId: 'svc-billing-admin',
  sessionId: 'sess-8841',
  steps: Object.freeze([
    { at: 5, type: 'UNKNOWN_IP', service: 'edge-gateway', note: 'First contact from an unrecognised address' },
    { at: 12, type: 'FAILED_LOGIN', service: 'auth', repeat: 9, spacingSec: 1.5 },
    { at: 30, type: 'REQUEST_SPIKE', service: 'edge-gateway' },
    { at: 38, type: 'FAILED_LOGIN', service: 'auth', repeat: 18, spacingSec: 1 },
    { at: 62, type: 'PRIVILEGE_ESCALATION', service: 'auth', note: 'Session assumed an administrative role' },
    { at: 74, type: 'SENSITIVE_API_ACCESS', service: 'storage' },
    { at: 86, type: 'SENSITIVE_API_ACCESS', service: 'payment' },
    { at: 98, type: 'DATABASE_ERROR', service: 'database', note: 'Unusual query volume against customer records' },
  ]),
});

/** Service health changes the scenario drives, so the topology reacts. */
export const SERVICE_TRANSITIONS = Object.freeze([
  { at: 40, service: 'auth', status: 'degraded', reason: 'Authentication failure rate above threshold' },
  { at: 66, service: 'auth', status: 'compromised', reason: 'Privilege escalation observed on an active session' },
  { at: 92, service: 'database', status: 'degraded', reason: 'Query latency rising under unusual read volume' },
]);

export const SCENARIOS = Object.freeze({
  [CREDENTIAL_ATTACK.id]: CREDENTIAL_ATTACK,
});

/** Total scripted length, used to decide when a replay has finished. */
export function scenarioDurationSec(scenario = CREDENTIAL_ATTACK) {
  const stepEnd = scenario.steps.reduce((max, step) => {
    const span = ((step.repeat ?? 1) - 1) * (step.spacingSec ?? 0);
    return Math.max(max, step.at + span);
  }, 0);
  const transitionEnd = SERVICE_TRANSITIONS.reduce((m, t) => Math.max(m, t.at), 0);
  return Math.max(stepEnd, transitionEnd);
}
