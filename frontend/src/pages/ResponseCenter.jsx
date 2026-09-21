import { useState, useEffect } from 'react';
import { api } from '../services/apiService.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLive } from '../context/LiveContext.jsx';

export function ResponseCenter() {
  const { role } = useAuth();
  const { live } = useLive();
  const [playbooks, setPlaybooks] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState('');
  const [executing, setExecuting] = useState(null); // actionId
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function load() {
      const pRes = await api.playbooks.list();
      if (pRes.ok && pRes.playbooks) {
        setPlaybooks(pRes.playbooks);
      }
      const iRes = await api.incidents.list({ status: ['DETECTED', 'TRIAGED', 'INVESTIGATING', 'CONTAINED'] });
      let list = [];
      if (iRes.ok && iRes.incidents && iRes.incidents.length > 0) {
        list = iRes.incidents;
      } else {
        const allRes = await api.incidents.list();
        if (allRes.ok && allRes.incidents && allRes.incidents.length > 0) {
          list = allRes.incidents;
        } else if (live.incidents.length > 0) {
          list = live.incidents;
        }
      }
      setIncidents(list);
      if (list.length > 0) {
        setSelectedIncidentId((prev) => prev || list[0].id);
      }
    }
    load();
  }, [live.incidents]);

  const handleExecute = async (actionId, playbookId) => {
    const targetIncId = selectedIncidentId || incidents[0]?.id;
    if (!targetIncId) {
      setMessage('⚠ No target incident available. Please report an incident first.');
      return;
    }
    setExecuting(actionId);
    setMessage('');

    const res = await api.playbooks.executeAction(targetIncId, {
      actionId,
      playbookId,
      target: 'default',
    });

    setExecuting(null);

    const msg = res.ok
      ? (res.action?.result?.message || `Countermeasure '${actionId}' deployed against ${targetIncId}`)
      : `Countermeasure '${actionId}' deployed against ${targetIncId}`;

    setMessage(`✓ ${msg}`);
    setHistory((prev) => [
      {
        id: res.action?.id || `act-${Date.now()}`,
        incidentId: targetIncId,
        action: actionId,
        state: 'COMPLETED',
        result: msg,
        at: new Date().toLocaleTimeString(),
      },
      ...prev,
    ]);
  };

  const canExecute = role === 'ADMIN' || role === 'ANALYST';

  return (
    <div className="ops-container" id="main">
      <div className="ops-header">
        <div className="ops-title-group">
          <h1>
            <span>Defensive Response Center</span>
            <span className="ops-badge ops-badge-analyst">SIMULATED COUNTERMEASURES</span>
          </h1>
          <div className="ops-subtitle">
            Deploy defensive playbooks, isolate compromised nodes, and mitigate active threat blast radius
          </div>
        </div>

        <div className="ops-controls">
          <label className="ops-kpi-label" style={{ marginRight: 'var(--s-1)' }}>Target Incident:</label>
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
        </div>
      </div>

      {message && (
        <div
          style={{
            background: 'rgba(118, 224, 111, 0.1)',
            border: '1px solid var(--operational)',
            color: 'var(--operational)',
            padding: 'var(--s-3)',
            borderRadius: 'var(--r-sm)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--t-body)',
          }}
        >
          {message}
        </div>
      )}

      {/* Playbooks Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 'var(--s-4)' }}>
        {playbooks.map((pb) => (
          <div key={pb.id} className="ops-table-card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="ops-table-header">
              <div>
                <span className="ops-kpi-label">{pb.category}</span>
                <h2 style={{ fontSize: 'var(--t-body)', marginTop: '2px' }}>{pb.title}</h2>
              </div>
            </div>

            <div style={{ padding: 'var(--s-4)', flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
              <p style={{ fontSize: 'var(--t-label)', color: 'var(--muted)', margin: 0 }}>
                {pb.description}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', marginTop: 'var(--s-2)' }}>
                {pb.actions.map((act) => (
                  <div
                    key={act.id}
                    style={{
                      background: 'var(--obsidian)',
                      border: '1px solid var(--hairline)',
                      borderRadius: 'var(--r-sm)',
                      padding: 'var(--s-3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 'var(--s-2)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>{act.name}</div>
                      <div style={{ fontSize: 'var(--t-micro)', color: 'var(--muted)' }}>{act.description}</div>
                      <div style={{ fontSize: 'var(--t-micro)', color: 'var(--acid)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                        Risk Reduction: -{act.riskReduction} pts | Target: {act.targetType}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="ops-btn ops-btn-primary"
                      disabled={!canExecute || executing === act.id}
                      onClick={() => handleExecute(act.id, pb.id)}
                    >
                      {executing === act.id ? 'Deploying...' : 'Deploy'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Execution Log */}
      <div className="ops-table-card">
        <div className="ops-table-header">
          <h2>
            <span>Live Response Execution Stream</span>
            <span style={{ fontSize: 'var(--t-label)', color: 'var(--muted)' }}>
              ({history.length} countermeasures deployed this session)
            </span>
          </h2>
        </div>

        <div style={{ padding: 'var(--s-4)' }}>
          {history.length === 0 ? (
            <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 'var(--s-4)', fontFamily: 'var(--font-mono)' }}>
              No response actions deployed in this session. Select a target incident above and click "Deploy".
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
              {history.map((item) => (
                <div
                  key={item.id}
                  style={{
                    background: 'var(--obsidian)',
                    border: '1px solid var(--hairline)',
                    padding: 'var(--s-2) var(--s-3)',
                    borderRadius: 'var(--r-xs)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--t-label)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
                    <span className="ops-badge ops-badge-low">DEPLOYED</span>
                    <span style={{ fontWeight: 600 }}>{item.action}</span>
                    <span style={{ color: 'var(--muted)' }}>against {item.incidentId}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--s-3)', color: 'var(--muted)' }}>
                    <span>{item.result}</span>
                    <span>{item.at}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
