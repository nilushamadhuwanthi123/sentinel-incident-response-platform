/**
 * Threat radar signal mapping.
 *
 * A radar is only worth building if the position of a blip means something.
 * This module turns real event state into geometry: where a signal sits,
 * how large it is, how bright, and when it fades — each derived from a
 * property of the event rather than from a random number generator.
 *
 * Geometry is derived, never stored. The radar is a *view over* event
 * state, so an event and its blip cannot drift apart.
 *
 * Pure module: no React, no DOM, no canvas, no network. It returns numbers;
 * the component draws them. That is also what makes the accessible text
 * equivalent possible — the same data produces both the picture and the
 * list, so the screen-reader experience cannot fall behind the visual one.
 */

import { clampScore, severityOf } from './severity.js';

/**
 * Categories map to bearing sectors, so the same kind of threat always
 * appears in the same part of the scope. An analyst learns the layout once.
 */
export const SIGNAL_CATEGORIES = Object.freeze({
  IDENTITY: { id: 'IDENTITY', label: 'Identity', from: 0, to: 90 },
  NETWORK: { id: 'NETWORK', label: 'Network', from: 90, to: 180 },
  APPLICATION: { id: 'APPLICATION', label: 'Application', from: 180, to: 270 },
  DATA: { id: 'DATA', label: 'Data', from: 270, to: 360 },
});

/** Which sector each event type belongs to, and its baseline weight. */
export const EVENT_MAPPING = Object.freeze({
  FAILED_LOGIN: { category: 'IDENTITY', weight: 45 },
  PRIVILEGE_ESCALATION: { category: 'IDENTITY', weight: 85 },
  UNKNOWN_IP: { category: 'NETWORK', weight: 55 },
  REQUEST_SPIKE: { category: 'NETWORK', weight: 50 },
  API_LATENCY: { category: 'APPLICATION', weight: 35 },
  SERVICE_DOWN: { category: 'APPLICATION', weight: 80 },
  SENSITIVE_API_ACCESS: { category: 'DATA', weight: 78 },
  DATABASE_ERROR: { category: 'DATA', weight: 60 },
});

/** How long a signal stays visible before it has faded to nothing. */
export const DEFAULT_DECAY_MS = 5 * 60 * 1000;

/**
 * Deterministic hash → 0..1.
 *
 * Signals need to sit at a stable position within their sector: an event
 * that jumps every time the radar re-renders is unreadable. Using a hash of
 * the event's own identity rather than Math.random is what makes the radar
 * stable across renders and identical across reloads — and testable.
 */
function hashUnit(input) {
  const text = String(input ?? '');
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

const toMillis = (value) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Recency, 1 (just now) → 0 (fully decayed).
 */
export function recencyOf(ageMs, decayMs = DEFAULT_DECAY_MS) {
  if (!Number.isFinite(ageMs) || ageMs < 0) return 1;
  if (decayMs <= 0) return 0;
  return Math.max(0, 1 - ageMs / decayMs);
}

/**
 * Map one event onto the scope.
 *
 * - **bearing** — its category sector, with a stable offset inside it
 * - **distance** — inverse severity: the worse it is, the closer to centre
 * - **radius** — confidence, so an uncertain signal is visibly smaller
 * - **intensity** — recency, so the scope naturally shows what is current
 *
 * A critical signal does not decay. It holds position until an analyst
 * acknowledges it, because a critical alert that quietly disappears on a
 * timer is an alert nobody saw.
 */
export function mapSignal(event, options = {}) {
  if (!event || typeof event !== 'object') return null;

  const now = options.now ?? Date.now();
  const decayMs = options.decayMs ?? DEFAULT_DECAY_MS;

  const atMs = toMillis(event.at ?? event.timestamp) ?? now;
  const ageMs = Math.max(0, now - atMs);

  const mapping = EVENT_MAPPING[event.type] ?? null;
  const category = SIGNAL_CATEGORIES[mapping?.category ?? 'APPLICATION'];

  const severityScore = clampScore(
    event.severityScore ?? mapping?.weight ?? 40
  );
  const severity = severityOf(severityScore);
  const confidence = clampScore(event.confidence ?? 70);

  const acknowledged = event.acknowledged === true;
  const critical = severity === 'critical';
  const intensity = critical && !acknowledged ? 1 : recencyOf(ageMs, decayMs);

  const sectorSpan = category.to - category.from;
  const bearing = category.from + hashUnit(event.id ?? event.type) * sectorSpan;

  return {
    id: event.id ?? `sig-${Math.round(atMs)}`,
    eventId: event.id ?? null,
    type: event.type ?? 'UNKNOWN',
    category: category.id,
    categoryLabel: category.label,
    service: event.service ?? null,
    incidentId: event.incidentId ?? null,

    bearing: Number(bearing.toFixed(2)),
    /** 0 at the centre, 1 at the rim. Worse means closer in. */
    distance: Number((1 - severityScore / 100).toFixed(3)),
    radius: Number((0.35 + (confidence / 100) * 0.65).toFixed(3)),
    intensity: Number(intensity.toFixed(3)),

    severity,
    severityScore,
    confidence,
    ageMs,
    persistent: critical && !acknowledged,
    acknowledged,
    faded: intensity <= 0,

    /** What the inspector shows when the blip is selected. */
    detail: {
      type: event.type ?? 'UNKNOWN',
      source: event.sourceIp ?? null,
      user: event.userId ?? null,
      service: event.service ?? null,
      at: atMs,
      severity,
      confidence,
      incidentId: event.incidentId ?? null,
    },
  };
}

/**
 * Build the full radar frame from current event state.
 *
 * Faded signals are dropped unless they are persistent, and the result is
 * ordered so the most urgent blip is painted last — on top.
 */
export function buildRadarFrame(events, options = {}) {
  const now = options.now ?? Date.now();
  const list = Array.isArray(events) ? events : [];

  const signals = list
    .map((e) => mapSignal(e, { ...options, now }))
    .filter(Boolean)
    .filter((s) => !s.faded || s.persistent)
    .sort(
      (a, b) => a.severityScore - b.severityScore || a.intensity - b.intensity
    );

  const byCategory = Object.values(SIGNAL_CATEGORIES).map((c) => ({
    id: c.id,
    label: c.label,
    count: signals.filter((s) => s.category === c.id).length,
  }));

  const critical = signals.filter((s) => s.severity === 'critical');

  return {
    now,
    signals,
    byCategory,
    counts: {
      total: signals.length,
      critical: critical.length,
      unacknowledged: critical.filter((s) => !s.acknowledged).length,
      dropped: list.length - signals.length,
    },
    /**
     * The accessible equivalent. Generated from the same data as the
     * picture, so the screen-reader experience cannot fall behind it —
     * which is the failure mode of every radar that bolts a text summary
     * on afterwards.
     */
    summary: describeFrame(signals, byCategory),
  };
}

function describeFrame(signals, byCategory) {
  if (signals.length === 0) return 'No active signals.';

  const critical = signals.filter((s) => s.severity === 'critical').length;
  const busiest = [...byCategory].sort((a, b) => b.count - a.count)[0];

  const parts = [
    `${signals.length} active signal${signals.length === 1 ? '' : 's'}`,
  ];
  if (critical > 0) parts.push(`${critical} critical`);
  if (busiest?.count > 0) {
    parts.push(`most activity in ${busiest.label.toLowerCase()}`);
  }
  return `${parts.join(', ')}.`;
}

/**
 * Group signals by the service they touch, so the radar can draw a line
 * from a blip to its node on the topology — the moment where an incoming
 * threat visibly maps itself onto the infrastructure.
 */
export function linkSignalsToServices(signals) {
  const byService = new Map();
  (signals ?? []).forEach((signal) => {
    if (!signal?.service) return;
    if (!byService.has(signal.service)) byService.set(signal.service, []);
    byService.get(signal.service).push(signal);
  });

  return [...byService.entries()]
    .map(([service, list]) => ({
      service,
      signals: list,
      count: list.length,
      worstSeverity: list.reduce(
        (worst, s) => (s.severityScore > worst.severityScore ? s : worst),
        list[0]
      ).severity,
    }))
    .sort((a, b) => b.count - a.count);
}
