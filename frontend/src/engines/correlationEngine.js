/**
 * The event correlation engine.
 *
 * Twenty-seven failed logins are noise. An unfamiliar IP address is noise.
 * A privileged account reading a sensitive endpoint is, most days, someone
 * doing their job. Together they are one credential attack — and nothing in
 * a scrolling event feed makes that connection for the analyst.
 *
 * This engine does. It groups events by the entities they share, evaluates
 * a set of rules over each group, and returns an incident candidate with
 * the reasoning that produced it: which rules matched, on what evidence,
 * and how confident that makes the conclusion.
 *
 * The reasoning is structured data, not a prose string, because the
 * correlation visualisation renders it — a reader must be able to see WHY
 * these events were judged related, not be told to trust it.
 *
 * Pure module: no React, no DOM, no network, no reads of live state.
 */

import { clampScore } from './severity.js';

/** Default window for treating events as part of the same activity. */
export const DEFAULT_WINDOW_MS = 10 * 60 * 1000;

/** Event types the engine understands. Anything else still groups, but
 *  contributes no type-specific rule evidence. */
export const EVENT_TYPES = Object.freeze({
  FAILED_LOGIN: 'FAILED_LOGIN',
  UNKNOWN_IP: 'UNKNOWN_IP',
  PRIVILEGE_ESCALATION: 'PRIVILEGE_ESCALATION',
  SENSITIVE_API_ACCESS: 'SENSITIVE_API_ACCESS',
  SERVICE_DOWN: 'SERVICE_DOWN',
  DATABASE_ERROR: 'DATABASE_ERROR',
  API_LATENCY: 'API_LATENCY',
  REQUEST_SPIKE: 'REQUEST_SPIKE',
});

const toMillis = (value) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const countType = (events, type) =>
  events.filter((e) => e.type === type).length;

const distinct = (events, key) =>
  [...new Set(events.map((e) => e[key]).filter(Boolean))];

/**
 * The rule set.
 *
 * Rules are data. Each returns whether it matched and the evidence it
 * matched on, so the engine never has to be trusted — it can be checked.
 * `weight` is the confidence the rule contributes; `signals` are the risk
 * signals it implies, which feed straight into the risk engine rather than
 * being re-derived there.
 */
export const CORRELATION_RULES = Object.freeze([
  {
    id: 'SHARED_SOURCE_IP',
    label: 'Events share a source address',
    weight: 18,
    signals: [],
    evaluate: (events) => {
      const ips = distinct(events, 'sourceIp');
      if (ips.length !== 1 || events.length < 2) return null;
      return { detail: ips[0], eventIds: events.map((e) => e.id) };
    },
  },
  {
    id: 'SHARED_IDENTITY',
    label: 'Events involve the same identity',
    weight: 20,
    signals: [],
    evaluate: (events) => {
      const users = distinct(events, 'userId');
      if (users.length !== 1 || events.length < 2) return null;
      return { detail: users[0], eventIds: events.map((e) => e.id) };
    },
  },
  {
    id: 'SHARED_SESSION',
    label: 'Events belong to one session',
    weight: 14,
    signals: [],
    evaluate: (events) => {
      const sessions = distinct(events, 'sessionId');
      if (sessions.length !== 1 || events.length < 2) return null;
      return { detail: sessions[0], eventIds: events.map((e) => e.id) };
    },
  },
  {
    id: 'AUTH_FAILURE_BURST',
    label: 'Repeated authentication failure',
    weight: 22,
    minFailures: 5,
    signals: ['REPEATED_AUTH_FAILURE'],
    evaluate(events) {
      const failures = events.filter(
        (e) => e.type === EVENT_TYPES.FAILED_LOGIN
      );
      if (failures.length < this.minFailures) return null;
      return {
        detail: `${failures.length} failed authentications`,
        count: failures.length,
        eventIds: failures.map((e) => e.id),
      };
    },
  },
  {
    id: 'EXTERNAL_ORIGIN',
    label: 'Activity originates from an unrecognised address',
    weight: 16,
    signals: ['UNKNOWN_EXTERNAL_IP'],
    evaluate: (events) => {
      const external = events.filter(
        (e) => e.type === EVENT_TYPES.UNKNOWN_IP || e.knownSource === false
      );
      if (external.length === 0) return null;
      return {
        detail: distinct(external, 'sourceIp')[0] ?? 'unrecognised source',
        eventIds: external.map((e) => e.id),
      };
    },
  },
  {
    id: 'PRIVILEGED_IDENTITY',
    label: 'A privileged identity is involved',
    weight: 20,
    signals: ['PRIVILEGED_ACCOUNT'],
    evaluate: (events) => {
      const privileged = events.filter((e) => e.privileged === true);
      if (privileged.length === 0) return null;
      return {
        detail: distinct(privileged, 'userId')[0] ?? 'privileged identity',
        eventIds: privileged.map((e) => e.id),
      };
    },
  },
  {
    id: 'SENSITIVE_RESOURCE',
    label: 'A sensitive resource was reached',
    weight: 22,
    signals: ['SENSITIVE_RESOURCE_ACCESS'],
    evaluate: (events) => {
      const sensitive = events.filter(
        (e) => e.type === EVENT_TYPES.SENSITIVE_API_ACCESS || e.sensitive === true
      );
      if (sensitive.length === 0) return null;
      return {
        detail: distinct(sensitive, 'resource')[0] ?? 'sensitive resource',
        eventIds: sensitive.map((e) => e.id),
      };
    },
  },
  {
    id: 'ESCALATION_SEQUENCE',
    label: 'Failure, then escalation, then access — in that order',
    weight: 24,
    signals: ['PRIVILEGE_ESCALATION'],
    evaluate: (events) => {
      // Order matters here: the same three event types in a different
      // sequence are not this pattern, and saying so would be wrong.
      const firstOf = (type) =>
        events.find((e) => e.type === type)?.atMs ?? null;
      const failure = firstOf(EVENT_TYPES.FAILED_LOGIN);
      const escalation = firstOf(EVENT_TYPES.PRIVILEGE_ESCALATION);
      const access = firstOf(EVENT_TYPES.SENSITIVE_API_ACCESS);
      if (failure === null || escalation === null) return null;
      if (escalation <= failure) return null;
      if (access !== null && access <= escalation) return null;
      return {
        detail: 'authentication failure preceded escalation',
        eventIds: events
          .filter((e) =>
            [
              EVENT_TYPES.FAILED_LOGIN,
              EVENT_TYPES.PRIVILEGE_ESCALATION,
              EVENT_TYPES.SENSITIVE_API_ACCESS,
            ].includes(e.type)
          )
          .map((e) => e.id),
      };
    },
  },
  {
    id: 'MULTI_SERVICE_SPREAD',
    label: 'Activity spans multiple services',
    weight: 14,
    minServices: 3,
    signals: ['MULTI_SERVICE_SPREAD'],
    evaluate(events) {
      const services = distinct(events, 'service');
      if (services.length < this.minServices) return null;
      return {
        detail: services.join(', '),
        eventIds: events.filter((e) => e.service).map((e) => e.id),
      };
    },
  },
  {
    id: 'RAPID_SEQUENCE',
    label: 'Events arrived far faster than baseline',
    weight: 12,
    minEvents: 6,
    withinMs: 60 * 1000,
    signals: ['RAPID_EVENT_BURST'],
    evaluate(events) {
      if (events.length < this.minEvents) return null;
      const times = events.map((e) => e.atMs).sort((a, b) => a - b);
      const span = times[times.length - 1] - times[0];
      if (span > this.withinMs) return null;
      return {
        detail: `${events.length} events within ${Math.round(span / 1000)}s`,
        eventIds: events.map((e) => e.id),
      };
    },
  },
]);

/**
 * Incident patterns.
 *
 * A pattern claims an identity for the cluster only when the rules it
 * requires have all matched. Ordered by specificity: the first pattern
 * whose requirements are met wins, so "possible credential attack" is
 * preferred over the vaguer "correlated activity" when it is earned.
 */
export const INCIDENT_PATTERNS = Object.freeze([
  {
    id: 'CREDENTIAL_ATTACK',
    label: 'Possible credential attack',
    requires: ['AUTH_FAILURE_BURST', 'EXTERNAL_ORIGIN', 'PRIVILEGED_IDENTITY'],
  },
  {
    id: 'PRIVILEGE_ABUSE',
    label: 'Possible privilege abuse',
    requires: ['PRIVILEGED_IDENTITY', 'SENSITIVE_RESOURCE'],
  },
  {
    id: 'ESCALATION_CHAIN',
    label: 'Possible escalation chain',
    requires: ['ESCALATION_SEQUENCE'],
  },
  {
    id: 'BRUTE_FORCE',
    label: 'Possible brute-force attempt',
    requires: ['AUTH_FAILURE_BURST'],
  },
  {
    id: 'LATERAL_ACTIVITY',
    label: 'Activity across multiple services',
    requires: ['MULTI_SERVICE_SPREAD', 'SHARED_IDENTITY'],
  },
]);

/** Normalise an event, dropping anything without a usable timestamp or id. */
function normaliseEvent(event, index) {
  if (!event || typeof event !== 'object') return null;
  const atMs = toMillis(event.at ?? event.timestamp);
  if (atMs === null) return null;
  return { ...event, id: event.id ?? `evt-${index}`, atMs };
}

/**
 * Group events that share an entity and fall within the time window.
 *
 * Grouping is transitive through shared entities: if A and B share an IP
 * and B and C share a session, all three belong to one cluster. That is
 * what lets a single incident be assembled from events that have no one
 * field in common.
 */
function clusterEvents(events, windowMs) {
  const clusters = [];

  events.forEach((event) => {
    const keys = [
      event.sourceIp && `ip:${event.sourceIp}`,
      event.userId && `user:${event.userId}`,
      event.sessionId && `session:${event.sessionId}`,
    ].filter(Boolean);

    if (keys.length === 0) {
      clusters.push({ keys: new Set(), events: [event] });
      return;
    }

    const matching = clusters.filter(
      (c) =>
        keys.some((k) => c.keys.has(k)) &&
        c.events.some((e) => Math.abs(e.atMs - event.atMs) <= windowMs)
    );

    if (matching.length === 0) {
      clusters.push({ keys: new Set(keys), events: [event] });
      return;
    }

    // Merge every cluster this event bridges, then add the event.
    const [target, ...rest] = matching;
    rest.forEach((other) => {
      other.keys.forEach((k) => target.keys.add(k));
      target.events.push(...other.events);
      clusters.splice(clusters.indexOf(other), 1);
    });
    keys.forEach((k) => target.keys.add(k));
    target.events.push(event);
  });

  return clusters.map((c) => ({
    ...c,
    events: c.events.sort((a, b) => a.atMs - b.atMs),
  }));
}

/** Evaluate every rule against one cluster. */
function evaluateRules(events) {
  return CORRELATION_RULES.map((rule) => {
    let match = null;
    try {
      match = rule.evaluate(events);
    } catch {
      // A rule that throws is a bug in that rule, not a reason to lose the
      // whole correlation. It is reported as unmatched.
      match = null;
    }
    if (!match) return null;
    return {
      id: rule.id,
      label: rule.label,
      weight: rule.weight,
      signals: rule.signals,
      ...match,
    };
  }).filter(Boolean);
}

/** Which pattern, if any, this set of matched rules earns. */
function classify(matchedIds) {
  return (
    INCIDENT_PATTERNS.find((p) => p.requires.every((r) => matchedIds.has(r))) ??
    null
  );
}

/**
 * Correlate a set of events into incident candidates.
 *
 * @param {Array} events
 * @param {object} [options]
 * @param {number} [options.windowMs]        time window for grouping
 * @param {number} [options.minConfidence]   candidates below this are dropped
 * @param {number} [options.minEvents]       clusters smaller than this are dropped
 */
export function correlateEvents(events, options = {}) {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const minConfidence = options.minConfidence ?? 40;
  const minEvents = options.minEvents ?? 2;

  const input = Array.isArray(events) ? events : [];
  const normalised = input.map(normaliseEvent).filter(Boolean);
  const discarded = input.length - normalised.length;

  const candidates = clusterEvents(normalised, windowMs)
    .filter((cluster) => cluster.events.length >= minEvents)
    .map((cluster) => {
      const matchedRules = evaluateRules(cluster.events);
      const matchedIds = new Set(matchedRules.map((r) => r.id));
      const pattern = classify(matchedIds);

      // Confidence is the matched weight as a share of everything that
      // could have matched — so it falls as the rule set grows, which is
      // correct: more ways to be wrong means less certainty from the same
      // evidence.
      const matchedWeight = matchedRules.reduce((t, r) => t + r.weight, 0);
      const totalWeight = CORRELATION_RULES.reduce((t, r) => t + r.weight, 0);
      const confidence = clampScore((matchedWeight / totalWeight) * 100);

      const riskSignals = [...new Set(matchedRules.flatMap((r) => r.signals))].map(
        (id) => {
          const burst = matchedRules.find((r) => r.id === 'AUTH_FAILURE_BURST');
          return id === 'REPEATED_AUTH_FAILURE' && burst?.count
            ? { id, count: burst.count }
            : id;
        }
      );

      const times = cluster.events.map((e) => e.atMs);

      return {
        id: `cand-${cluster.events[0].id}`,
        pattern: pattern?.id ?? 'CORRELATED_ACTIVITY',
        label: pattern?.label ?? 'Correlated activity',
        classified: Boolean(pattern),
        confidence,
        events: cluster.events,
        eventIds: cluster.events.map((e) => e.id),
        entities: {
          sourceIps: distinct(cluster.events, 'sourceIp'),
          users: distinct(cluster.events, 'userId'),
          sessions: distinct(cluster.events, 'sessionId'),
          services: distinct(cluster.events, 'service'),
        },
        window: {
          from: new Date(Math.min(...times)).toISOString(),
          to: new Date(Math.max(...times)).toISOString(),
          spanMs: Math.max(...times) - Math.min(...times),
        },
        matchedRules,
        /** Ordered, human-readable, and derived — the correlation view renders this. */
        reasoning: matchedRules
          .slice()
          .sort((a, b) => b.weight - a.weight)
          .map((r) => ({
            rule: r.id,
            label: r.label,
            detail: r.detail,
            weight: r.weight,
            eventIds: r.eventIds,
          })),
        /** Feeds computeRisk directly, so risk is not re-derived elsewhere. */
        riskSignals,
        counts: {
          total: cluster.events.length,
          failedLogins: countType(cluster.events, EVENT_TYPES.FAILED_LOGIN),
          sensitiveAccess: countType(
            cluster.events,
            EVENT_TYPES.SENSITIVE_API_ACCESS
          ),
        },
      };
    })
    .filter((c) => c.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence);

  return {
    candidates,
    stats: {
      received: input.length,
      usable: normalised.length,
      discarded,
      candidates: candidates.length,
    },
  };
}
