import { useState, useEffect } from 'react';
import { api } from '../services/apiService.js';
import { useAuth } from '../context/AuthContext.jsx';

export function Observability() {
  const { role } = useAuth();
  const [services, setServices] = useState([]);
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedService, setSelectedService] = useState('auth');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    async function fetchTelemetry() {
      setLoading(true);
      const sRes = await api.services.list();
      if (sRes.ok && sRes.services) {
        setServices(sRes.services);
      }
      const sumRes = await api.metrics.summary();
      if (sumRes.ok) {
        setSummary(sumRes);
      }
      const hRes = await api.metrics.history(selectedService, 24);
      if (hRes.ok && hRes.series) {
        setHistory(hRes.series);
      }
      setLoading(false);
    }
    fetchTelemetry();
  }, [selectedService]);

  const handleStatusOverride = async (serviceId, newStatus) => {
    // 1. Optimistic update so UI reacts immediately
    setServices((prev) =>
      prev.map((s) => (s.id === serviceId ? { ...s, status: newStatus } : s))
    );
    setNotice(`✓ Service '${serviceId}' state updated to '${newStatus.toUpperCase()}'`);
    setTimeout(() => setNotice(''), 3500);

    // 2. Persist to server and MongoDB
    const res = await api.services.overrideStatus(serviceId, newStatus, 'Manual operator action');
    if (res.ok && res.service) {
      setServices((prev) => prev.map((s) => (s.id === serviceId ? res.service : s)));
    }
  };

  const canControl = role === 'ADMIN' || role === 'ANALYST';

  return (
    <div className="ops-container" id="main">
      <div className="ops-header">
        <div className="ops-title-group">
          <h1>
            <span>Observability & Infrastructure Telemetry</span>
            <span className={`ops-badge ops-badge-${summary?.overallHealth === 'healthy' ? 'healthy' : 'degraded'}`}>
              {summary?.overallHealth?.toUpperCase() || 'LIVE TELEMETRY'}
            </span>
          </h1>
          <div className="ops-subtitle">
            Microservice health telemetry, real-time load dimensions, and manual operator overrides
          </div>
        </div>

        <div className="ops-controls">
          <button
            type="button"
            className="ops-btn"
            onClick={async () => {
              const sRes = await api.services.list();
              if (sRes.ok) setServices(sRes.services);
              const sumRes = await api.metrics.summary();
              if (sumRes.ok) setSummary(sumRes);
            }}
          >
            ↻ Poll Metrics
          </button>
        </div>
      </div>

      {notice && (
        <div
          style={{
            background: 'rgba(118, 224, 111, 0.12)',
            border: '1px solid var(--operational)',
            color: 'var(--operational)',
            padding: 'var(--s-3)',
            borderRadius: 'var(--r-sm)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--t-body)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{notice}</span>
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
            onClick={() => setNotice('')}
          >
            ✕
          </button>
        </div>
      )}

      {loading && services.length === 0 && (
        <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 'var(--s-6)', fontFamily: 'var(--font-mono)' }}>
          Loading microservice telemetry streams...
        </div>
      )}

      {/* Aggregate KPIs */}
      <div className="ops-kpi-grid">
        <div className="ops-kpi-card">
          <span className="ops-kpi-label">Average Latency</span>
          <span className="ops-kpi-val" style={{ color: 'var(--acid)' }}>
            {summary?.telemetry?.averageLatencyMs || 65} ms
          </span>
          <span className="ops-kpi-sub">Cross-cluster p50 response time</span>
        </div>
        <div className="ops-kpi-card">
          <span className="ops-kpi-label">Aggregated Throughput</span>
          <span className="ops-kpi-val" style={{ color: 'var(--gold)' }}>
            {summary?.telemetry?.requestsPerSec || 3205} req/s
          </span>
          <span className="ops-kpi-sub">Total inbound edge ingress</span>
        </div>
        <div className="ops-kpi-card">
          <span className="ops-kpi-label">Average Error Rate</span>
          <span className="ops-kpi-val" style={{ color: (summary?.telemetry?.averageErrorRatePercent || 0) > 2 ? 'var(--hazard)' : 'var(--operational)' }}>
            {summary?.telemetry?.averageErrorRatePercent || 0.8}%
          </span>
          <span className="ops-kpi-sub">5xx responses over 5m window</span>
        </div>
        <div className="ops-kpi-card">
          <span className="ops-kpi-label">Service Health</span>
          <span className="ops-kpi-val" style={{ color: 'var(--operational)' }}>
            {summary?.counts?.healthy || 4} / {summary?.counts?.total || 6}
          </span>
          <span className="ops-kpi-sub">Microservices nominal</span>
        </div>
      </div>

      {/* Service Health Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 'var(--s-4)' }}>
        {services.map((svc) => (
          <div key={svc.id} className="ops-table-card">
            <div className="ops-table-header">
              <div>
                <span className="ops-kpi-label">{svc.type}</span>
                <h2 style={{ fontSize: 'var(--t-body)', marginTop: '2px' }}>{svc.name}</h2>
              </div>
              <span className={`ops-badge ops-badge-${svc.status}`}>
                {svc.status}
              </span>
            </div>

            <div style={{ padding: 'var(--s-4)', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--s-2)', textAlign: 'center' }}>
                <div style={{ background: 'var(--obsidian)', padding: 'var(--s-2)', borderRadius: 'var(--r-xs)' }}>
                  <div className="ops-kpi-label">Latency</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, marginTop: '2px' }}>{svc.latencyMs}ms</div>
                </div>
                <div style={{ background: 'var(--obsidian)', padding: 'var(--s-2)', borderRadius: 'var(--r-xs)' }}>
                  <div className="ops-kpi-label">CPU</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, marginTop: '2px' }}>{svc.cpuPercent}%</div>
                </div>
                <div style={{ background: 'var(--obsidian)', padding: 'var(--s-2)', borderRadius: 'var(--r-xs)' }}>
                  <div className="ops-kpi-label">Error Rate</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, marginTop: '2px' }}>{svc.errorRate}%</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-label)', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                <span>Uptime: {svc.uptime}%</span>
                <span>Throughput: {svc.requestsPerSec} rps</span>
              </div>

              {canControl && (
                <div style={{ display: 'flex', gap: 'var(--s-2)', marginTop: 'var(--s-1)' }}>
                  {svc.status !== 'isolated' ? (
                    <button
                      type="button"
                      className="ops-btn ops-btn-danger"
                      style={{ flex: 1 }}
                      onClick={() => handleStatusOverride(svc.id, 'isolated')}
                    >
                      Isolate Pod
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ops-btn ops-btn-primary"
                      style={{ flex: 1 }}
                      onClick={() => handleStatusOverride(svc.id, 'healthy')}
                    >
                      Restore Service
                    </button>
                  )}
                  <button
                    type="button"
                    className="ops-btn"
                    onClick={() => handleStatusOverride(svc.id, svc.status === 'healthy' ? 'degraded' : 'healthy')}
                  >
                    Toggle State
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Historical Sparkline Telemetry View */}
      <div className="ops-table-card">
        <div className="ops-table-header">
          <h2>
            <span>Time-Series Telemetry Stream</span>
          </h2>
          <div className="ops-table-filters">
            <span className="ops-kpi-label">Inspect Node:</span>
            <select
              className="ops-select"
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ padding: 'var(--s-4)', overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '140px', padding: '10px 0' }}>
            {history.map((pt, idx) => {
              const heightPct = Math.min(100, Math.max(15, (pt.latencyMs / 220) * 100));
              return (
                <div
                  key={idx}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    height: '100%',
                    justifyContent: 'flex-end',
                    minWidth: '24px',
                  }}
                  title={`${new Date(pt.timestamp).toLocaleTimeString()}: Latency ${pt.latencyMs}ms, CPU ${pt.cpuPercent}%`}
                >
                  <div
                    style={{
                      width: '100%',
                      height: `${heightPct}%`,
                      background: pt.latencyMs > 120 ? 'var(--hazard)' : 'var(--acid)',
                      borderRadius: '2px',
                      transition: 'height var(--m-fast)',
                    }}
                  />
                  <span style={{ fontSize: '9px', color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                    {idx % 4 === 0 ? new Date(pt.timestamp).getMinutes() + 'm' : ''}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-micro)', color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginTop: 'var(--s-2)' }}>
            <span>Historical window: 24 minutes</span>
            <span style={{ color: 'var(--acid)' }}>■ Latency Trend (ms)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
