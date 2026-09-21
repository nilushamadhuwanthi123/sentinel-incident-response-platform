/**
 * Forensics desk.
 *
 * Packages an incident's events into an ordered, checksummed record and
 * lets an analyst verify it and take it away.
 *
 * The panel's job is as much to say what this *is not* as what it is. It
 * leads with the limitation rather than burying it: a checksum detects
 * accidental corruption, truncation and reordering; it does not detect
 * deliberate alteration, because anyone who can edit the record can
 * recompute it. Calling that chain-of-custody would be borrowing forensic
 * vocabulary this project has not earned.
 */

import { useMemo, useState } from 'react';
import {
  packageEvidence,
  serialisePackage,
  verifyPackage,
} from '../../engines/forensics.js';

export function ForensicsDesk({ incident, capturedAt }) {
  const [verification, setVerification] = useState(null);

  const pkg = useMemo(
    () => packageEvidence(incident, capturedAt ? { capturedAt } : {}),
    [incident, capturedAt]
  );

  if (!incident) {
    return (
      <p className="fx-empty">
        Nothing is correlated, so there is nothing to package. Evidence is
        collected per incident, not continuously.
      </p>
    );
  }

  const download = () => {
    const blob = new Blob([serialisePackage(pkg)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sentinel-evidence-${pkg.incidentId ?? 'incident'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fx">
      <p className="fx-caveat">
        <strong>Checksum, not a signature.</strong> {pkg.integrity.note} It
        detects {pkg.integrity.detects.join(', ')}. It does not detect{' '}
        {pkg.integrity.doesNotDetect.join('; ')}.
      </p>

      <dl className="fx-meta">
        <div>
          <dt>Records</dt>
          <dd>{pkg.counts.events}</dd>
        </div>
        <div>
          <dt>Discarded</dt>
          <dd>{pkg.counts.discarded}</dd>
        </div>
        <div>
          <dt>Captured</dt>
          <dd>{pkg.capturedAt}</dd>
        </div>
        <div>
          <dt>Seal</dt>
          <dd className="fx-seal">{pkg.seal}</dd>
        </div>
      </dl>

      <table className="fx-table">
        <caption className="visually-hidden">
          Evidence records with their individual and chained checksums.
        </caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Event</th>
            <th scope="col">Record</th>
            <th scope="col">Chain</th>
          </tr>
        </thead>
        <tbody>
          {pkg.records.slice(0, 12).map((record) => (
            <tr key={record.id}>
              <td className="fx-mono">{record.index}</td>
              <td className="fx-id">{record.id}</td>
              <td className="fx-mono">{record.checksum}</td>
              <td className="fx-mono">{record.chain}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {pkg.records.length > 12 && (
        <p className="fx-more">
          {pkg.records.length - 12} further records are in the export.
        </p>
      )}

      <div className="fx-actions">
        <button
          type="button"
          className="fx-button"
          onClick={() => setVerification(verifyPackage(pkg))}
        >
          Verify the package
        </button>
        <button type="button" className="fx-button" onClick={download}>
          Download evidence package
        </button>
      </div>

      {verification && (
        <p
          className={`fx-result ${verification.valid ? 'is-valid' : 'is-broken'}`}
          role="status"
        >
          {verification.valid
            ? 'Every record matches its checksum and the chain reaches the seal.'
            : `Record ${verification.firstFailure?.index} (${verification.firstFailure?.id}): ` +
              `${verification.firstFailure?.problem}. Everything after it is unverifiable ` +
              `rather than independently wrong.`}
        </p>
      )}
    </div>
  );
}
