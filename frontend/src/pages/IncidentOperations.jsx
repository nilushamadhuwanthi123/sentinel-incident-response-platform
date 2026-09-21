import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/apiService.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLive } from '../context/LiveContext.jsx';

export function IncidentOperations() {
  const { role } = useAuth();
  const { live } = useLive();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [newModalOpen, setNewModalOpen] = useState(false);

  // Form for new incident
  const [newTitle, setNewTitle] = useState('');
  const [newSeverity, setNewSeverity] = useState('HIGH');
  const [newCategory, setNewCategory] = useState('CREDENTIAL_ACCESS');
  const [newSummary, setNewSummary] = useState('');

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    const res = await api.incidents.list();
    if (res.ok && res.incidents) {
      setIncidents(res.incidents);
    } else {
      // If server unreachable, use live store incidents
      setIncidents(live.incidents.length > 0 ? live.incidents : []);
    }
    setLoading(false);
  }, [live.incidents]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  const handleTransition = async (id, nextStatus) => {
    const res = await api.incidents.update(id, { status: nextStatus });
    if (res.ok) {
      setIncidents((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: nextStatus } : i))
      );
      if (selectedIncident?.id === id) {
        setSelectedIncident((prev) => ({ ...prev, status: nextStatus }));
      }
    } else {
      // Local state transition for fallback
      setIncidents((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: nextStatus } : i))
      );
    }
  };

  const [createError, setCreateError] = useState('');

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    const res = await api.incidents.create({
      title: newTitle,
      severity: newSeverity,
      category: newCategory,
      summary: newSummary,
    });
    if (res.ok && res.incident) {
      setIncidents((prev) => [res.incident, ...prev]);
      setNewModalOpen(false);
      setNewTitle('');
      setNewSummary('');
    } else {
      setCreateError(res.error || 'Failed to create incident record');
    }
  };

  const filtered = incidents.filter((i) => {
    if (statusFilter !== 'ALL' && i.status !== statusFilter) return false;
    if (severityFilter !== 'ALL' && i.severity !== severityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchTitle = i.title?.toLowerCase().includes(q);
      const matchId = i.id?.toLowerCase().includes(q);
      if (!matchTitle && !matchId) return false;
    }
    return true;
  });

  const canMutate = role === 'ADMIN' || role === 'ANALYST';

  return (
    <div className="ops-container" id="main">
      <div className="ops-header">
        <div className="ops-title-group">
          <h1>
            <span>Incident Operations Console</span>
            <span className="ops-badge ops-badge-active">CANONICAL LIFECYCLE</span>
          </h1>
          <div className="ops-subtitle">
            Lifecycle transitions: DETECTED → TRIAGED → INVESTIGATING → CONTAINED → RESOLVED → CLOSED
          </div>
        </div>

        <div className="ops-controls">
          {canMutate && (
            <button
              type="button"
              className="ops-btn ops-btn-primary"
              onClick={() => setNewModalOpen(true)}
            >
              + Create Incident
            </button>
          )}
          <button type="button" className="ops-btn" onClick={fetchIncidents}>
            ↻ Refresh Feed
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="ops-kpi-grid">
        <div className="ops-kpi-card">
          <span className="ops-kpi-label">Active Incidents</span>
          <span className="ops-kpi-val" style={{ color: 'var(--critical)' }}>
            {incidents.filter((i) => !['RESOLVED', 'CLOSED'].includes(i.status)).length}
          </span>
          <span className="ops-kpi-sub">Requiring operator attention</span>
        </div>
        <div className="ops-kpi-card">
          <span className="ops-kpi-label">Critical Severity</span>
          <span className="ops-kpi-val" style={{ color: 'var(--hazard)' }}>
            {incidents.filter((i) => i.severity === 'CRITICAL').length}
          </span>
          <span className="ops-kpi-sub">Highest priority tier</span>
        </div>
        <div className="ops-kpi-card">
          <span className="ops-kpi-label">Contained</span>
          <span className="ops-kpi-val" style={{ color: 'var(--gold)' }}>
            {incidents.filter((i) => i.status === 'CONTAINED').length}
          </span>
          <span className="ops-kpi-sub">Threat neutralized, pending fix</span>
        </div>
        <div className="ops-kpi-card">
          <span className="ops-kpi-label">Resolved</span>
          <span className="ops-kpi-val" style={{ color: 'var(--operational)' }}>
            {incidents.filter((i) => i.status === 'RESOLVED' || i.status === 'CLOSED').length}
          </span>
          <span className="ops-kpi-sub">Remediated & verified</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="ops-table-card">
        <div className="ops-table-header">
          <h2>
            <span>Incident Queue</span>
            <span style={{ color: 'var(--muted)', fontSize: 'var(--t-label)' }}>({filtered.length} matching)</span>
          </h2>

          <div className="ops-table-filters">
            <input
              type="text"
              className="ops-input"
              placeholder="Filter by title or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="ops-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="DETECTED">DETECTED</option>
              <option value="TRIAGED">TRIAGED</option>
              <option value="INVESTIGATING">INVESTIGATING</option>
              <option value="CONTAINED">CONTAINED</option>
              <option value="RESOLVED">RESOLVED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
            <select
              className="ops-select"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="ops-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Incident Details</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Affected Services</th>
                <th>Lifecycle Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && incidents.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 'var(--s-6)', color: 'var(--muted)' }}>
                    Loading incident operations telemetry...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 'var(--s-6)', color: 'var(--muted)' }}>
                    No incidents match current filter criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((inc) => (
                  <tr key={inc.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', color: 'var(--acid)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
                        onClick={() => setSelectedIncident(inc)}
                      >
                        {inc.id}
                      </button>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{inc.title}</div>
                      <div style={{ fontSize: 'var(--t-label)', color: 'var(--muted)', marginTop: '2px' }}>
                        {inc.summary || inc.category}
                      </div>
                    </td>
                    <td>
                      <span className={`ops-badge ops-badge-${inc.severity?.toLowerCase()}`}>
                        {inc.severity}
                      </span>
                    </td>
                    <td>
                      <span className={`ops-badge ops-badge-${inc.status === 'RESOLVED' ? 'resolved' : inc.status === 'CONTAINED' ? 'low' : 'medium'}`}>
                        {inc.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {(inc.affectedServices || ['auth']).map((svc) => (
                          <span key={svc} className="ops-badge" style={{ background: 'var(--obsidian)', border: '1px solid var(--hairline)' }}>
                            {svc}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {canMutate ? (
                          <>
                            {inc.status === 'DETECTED' && (
                              <button
                                type="button"
                                className="ops-btn"
                                onClick={() => handleTransition(inc.id, 'TRIAGED')}
                              >
                                Triage
                              </button>
                            )}
                            {inc.status === 'TRIAGED' && (
                              <button
                                type="button"
                                className="ops-btn"
                                onClick={() => handleTransition(inc.id, 'INVESTIGATING')}
                              >
                                Investigate
                              </button>
                            )}
                            {inc.status === 'INVESTIGATING' && (
                              <button
                                type="button"
                                className="ops-btn"
                                onClick={() => handleTransition(inc.id, 'CONTAINED')}
                              >
                                Contain
                              </button>
                            )}
                            {inc.status === 'CONTAINED' && (
                              <button
                                type="button"
                                className="ops-btn ops-btn-primary"
                                onClick={() => handleTransition(inc.id, 'RESOLVED')}
                              >
                                Resolve
                              </button>
                            )}
                            {inc.status === 'RESOLVED' && (
                              <button
                                type="button"
                                className="ops-btn"
                                onClick={() => handleTransition(inc.id, 'CLOSED')}
                              >
                                Close
                              </button>
                            )}
                            {inc.status === 'CLOSED' && (
                              <button
                                type="button"
                                className="ops-btn"
                                onClick={() => handleTransition(inc.id, 'INVESTIGATING')}
                              >
                                Reopen
                              </button>
                            )}
                          </>
                        ) : (
                          <span style={{ fontSize: 'var(--t-micro)', color: 'var(--muted)' }}>Read-only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Incident Detail Drawer Modal */}
      {selectedIncident && (
        <div className="ops-modal-backdrop" onClick={() => setSelectedIncident(null)}>
          <div className="ops-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ops-modal-header">
              <div>
                <span className="ops-kpi-label">{selectedIncident.id}</span>
                <h2 style={{ margin: 0, fontSize: 'var(--t-body)' }}>{selectedIncident.title}</h2>
              </div>
              <button type="button" className="ops-btn" onClick={() => setSelectedIncident(null)}>
                ✕
              </button>
            </div>
            <div className="ops-modal-body">
              <div>
                <span className="ops-kpi-label">Executive Summary</span>
                <p style={{ fontSize: 'var(--t-body)', marginTop: 'var(--s-1)' }}>
                  {selectedIncident.summary}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--s-3)' }}>
                <div>
                  <span className="ops-kpi-label">Category</span>
                  <div style={{ fontFamily: 'var(--font-mono)', marginTop: '4px' }}>{selectedIncident.category}</div>
                </div>
                <div>
                  <span className="ops-kpi-label">Risk Score</span>
                  <div style={{ fontFamily: 'var(--font-mono)', marginTop: '4px', fontWeight: 700 }}>
                    {selectedIncident.riskScore || 75} / 100
                  </div>
                </div>
                <div>
                  <span className="ops-kpi-label">Assignee</span>
                  <div style={{ fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                    {selectedIncident.assignee?.name || 'Unassigned'}
                  </div>
                </div>
              </div>

              {selectedIncident.timeline && (
                <div>
                  <span className="ops-kpi-label" style={{ display: 'block', marginBottom: 'var(--s-2)' }}>
                    Incident Timeline
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
                    {selectedIncident.timeline.map((t, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: 'var(--obsidian)',
                          padding: 'var(--s-2) var(--s-3)',
                          borderRadius: 'var(--r-xs)',
                          borderLeft: '2px solid var(--acid)',
                          fontSize: 'var(--t-label)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                          <span>{t.action} by {t.actor}</span>
                          <span style={{ fontFamily: 'var(--font-mono)' }}>{new Date(t.at).toLocaleTimeString()}</span>
                        </div>
                        <div style={{ marginTop: '2px', color: 'var(--text)' }}>{t.notes}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="ops-modal-footer">
              <button type="button" className="ops-btn" onClick={() => setSelectedIncident(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Incident Modal */}
      {newModalOpen && (
        <div className="ops-modal-backdrop" onClick={() => setNewModalOpen(false)}>
          <div className="ops-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ops-modal-header">
              <h2 style={{ margin: 0, fontSize: 'var(--t-body)' }}>CREATE NEW INCIDENT RECORD</h2>
              <button type="button" className="ops-btn" onClick={() => setNewModalOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="ops-modal-body">
                <div>
                  <label className="ops-kpi-label" style={{ display: 'block', marginBottom: '4px' }}>Title</label>
                  <input
                    type="text"
                    className="ops-input"
                    style={{ width: '100%' }}
                    placeholder="e.g. Distributed Ingress Spike on Payment Gateway"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
                  <div>
                    <label className="ops-kpi-label" style={{ display: 'block', marginBottom: '4px' }}>Severity</label>
                    <select className="ops-select" style={{ width: '100%' }} value={newSeverity} onChange={(e) => setNewSeverity(e.target.value)}>
                      <option value="CRITICAL">CRITICAL</option>
                      <option value="HIGH">HIGH</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="LOW">LOW</option>
                    </select>
                  </div>
                  <div>
                    <label className="ops-kpi-label" style={{ display: 'block', marginBottom: '4px' }}>Category</label>
                    <select className="ops-select" style={{ width: '100%' }} value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
                      <option value="CREDENTIAL_ACCESS">CREDENTIAL_ACCESS</option>
                      <option value="DENIAL_OF_SERVICE">DENIAL_OF_SERVICE</option>
                      <option value="DATA_EXFILTRATION">DATA_EXFILTRATION</option>
                      <option value="NETWORK_ATTACK">NETWORK_ATTACK</option>
                      <option value="UNAUTHORIZED_ACCESS">UNAUTHORIZED_ACCESS</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="ops-kpi-label" style={{ display: 'block', marginBottom: '4px' }}>Summary / Initial Assessment</label>
                  <textarea
                    className="ops-input"
                    style={{ width: '100%', minHeight: '80px', fontFamily: 'var(--font-ui)' }}
                    placeholder="Describe symptoms, impacted services, and immediate threat observations..."
                    value={newSummary}
                    onChange={(e) => setNewSummary(e.target.value)}
                    required
                  />
                </div>
                {createError && (
                  <div style={{ color: 'var(--critical)', fontSize: 'var(--t-label)', fontFamily: 'var(--font-mono)' }}>
                    ⚠ {createError}
                  </div>
                )}
              </div>
              <div className="ops-modal-footer">
                <button type="button" className="ops-btn" onClick={() => setNewModalOpen(false)}>Cancel</button>
                <button type="submit" className="ops-btn ops-btn-primary">Create Record</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
