import { useState, useEffect } from 'react';
import { api } from '../services/apiService.js';

export function AuditTrail() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [incidents, setIncidents] = useState([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState('');
  const [report, setReport] = useState(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const aRes = await api.audit.list();
      if (aRes.ok && aRes.auditLogs) setLogs(aRes.auditLogs);
      const iRes = await api.incidents.list();
      if (iRes.ok && iRes.incidents) {
        setIncidents(iRes.incidents);
        if (iRes.incidents.length > 0) setSelectedIncidentId(iRes.incidents[0].id);
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleGenerateReport = async () => {
    if (!selectedIncidentId) return;
    const res = await api.incidents.getReport(selectedIncidentId);
    if (res.ok && res.report) {
      setReport(res.report);
      setReportModalOpen(true);
    }
  };

  const handleCopyMarkdown = () => {
    if (report?.markdown) {
      navigator.clipboard.writeText(report.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const filteredLogs = logs.filter((l) => {
    if (actionFilter && !l.action.toLowerCase().includes(actionFilter.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="ops-container" id="main">
      <div className="ops-header">
        <div className="ops-title-group">
          <h1>
            <span>Audit Trail & Post-Incident Reporting</span>
            <span className="ops-badge ops-badge-active">IMMUTABLE LOGS</span>
          </h1>
          <div className="ops-subtitle">
            Cryptographically sealed operational audit records and automated post-mortem report generation
          </div>
        </div>

        <div className="ops-controls">
          <label className="ops-kpi-label">Export Post-Mortem:</label>
          <select
            className="ops-select"
            value={selectedIncidentId}
            onChange={(e) => setSelectedIncidentId(e.target.value)}
          >
            {incidents.map((i) => (
              <option key={i.id} value={i.id}>
                {i.id} - {i.title}
              </option>
            ))}
          </select>
          <button type="button" className="ops-btn ops-btn-primary" onClick={handleGenerateReport}>
            Generate Post-Incident Review
          </button>
        </div>
      </div>

      {/* Audit Log Table Card */}
      <div className="ops-table-card">
        <div className="ops-table-header">
          <h2>
            <span>Security & Operational Audit Log</span>
            <span style={{ fontSize: 'var(--t-label)', color: 'var(--muted)' }}>
              ({filteredLogs.length} events recorded)
            </span>
          </h2>

          <div className="ops-table-filters">
            <input
              type="text"
              className="ops-input"
              placeholder="Search by action (e.g. LOGIN, UPDATE)..."
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="ops-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target Resource</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: 'var(--s-6)', color: 'var(--muted)' }}>
                    Loading audit trail...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: 'var(--s-6)', color: 'var(--muted)' }}>
                    No audit records matching query.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {new Date(l.timestamp).toLocaleString()}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 'var(--t-label)' }}>{l.actor?.name || 'System'}</div>
                      <div style={{ fontSize: 'var(--t-micro)', color: 'var(--muted)' }}>{l.actor?.role || 'SYSTEM'}</div>
                    </td>
                    <td>
                      <span className="ops-badge ops-badge-analyst">
                        {l.action}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-label)' }}>
                      <span style={{ color: 'var(--muted)' }}>{l.resource}:</span> {l.resourceId}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)', color: 'var(--muted)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {JSON.stringify(l.metadata || {})}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Post-Incident Review Modal */}
      {reportModalOpen && report && (
        <div className="ops-modal-backdrop" onClick={() => setReportModalOpen(false)}>
          <div className="ops-modal" style={{ maxWidth: '850px' }} onClick={(e) => e.stopPropagation()}>
            <div className="ops-modal-header">
              <div>
                <span className="ops-kpi-label">POST-INCIDENT REVIEW</span>
                <h2 style={{ margin: 0, fontSize: 'var(--t-body)' }}>{report.incidentId}: {report.title}</h2>
              </div>
              <button type="button" className="ops-btn" onClick={() => setReportModalOpen(false)}>✕</button>
            </div>

            <div className="ops-modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s-3)' }}>
                <div>
                  <span className="ops-kpi-label">Severity</span>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>{report.severity}</div>
                </div>
                <div>
                  <span className="ops-kpi-label">Status</span>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>{report.status}</div>
                </div>
                <div>
                  <span className="ops-kpi-label">Duration</span>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>{report.durationMinutes} minutes</div>
                </div>
                <div>
                  <span className="ops-kpi-label">Risk Level</span>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>{report.riskScore} / 100</div>
                </div>
              </div>

              <div>
                <span className="ops-kpi-label">Root Cause Analysis</span>
                <div style={{ background: 'var(--obsidian)', padding: 'var(--s-3)', borderRadius: 'var(--r-sm)', marginTop: '4px', fontSize: 'var(--t-body)' }}>
                  {report.rootCause}
                </div>
              </div>

              <div>
                <span className="ops-kpi-label">Formatted Post-Mortem Export</span>
                <textarea
                  readOnly
                  className="ops-input"
                  style={{ width: '100%', height: '240px', fontFamily: 'var(--font-mono)', fontSize: 'var(--t-micro)', marginTop: '4px' }}
                  value={report.markdown}
                />
              </div>
            </div>

            <div className="ops-modal-footer">
              <button type="button" className="ops-btn ops-btn-primary" onClick={handleCopyMarkdown}>
                {copied ? '✓ Copied to Clipboard!' : 'Copy Markdown Report'}
              </button>
              <button type="button" className="ops-btn" onClick={() => setReportModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
