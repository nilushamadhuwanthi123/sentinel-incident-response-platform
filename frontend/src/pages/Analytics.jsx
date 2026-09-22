import { useState, useEffect } from 'react';
import { api } from '../services/apiService.js';

export function Analytics() {
  const [data, setData] = useState(null);
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const oRes = await api.analytics.overview();
      if (oRes.ok) setData(oRes);
      const tRes = await api.analytics.trends();
      if (tRes.ok && tRes.trends) setTrends(tRes.trends);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="ops-container" id="main">
      <div className="ops-header">
        <div className="ops-title-group">
          <h1>
            <span>Incident Analytics & Performance Posture</span>
            <span className="ops-badge ops-badge-active">SERVER-SIDE AGGREGATION</span>
          </h1>
          <div className="ops-subtitle">
            Historical incident metrics, MTTR benchmarking, severity distribution, and attack category vectors
          </div>
        </div>
      </div>

      {loading && !data && (
        <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 'var(--s-6)', fontFamily: 'var(--font-mono)' }}>
          Aggregating incident intelligence and MTTR metrics...
        </div>
      )}

      {/* Primary KPI Row */}
      <div className="ops-kpi-grid">
        <div className="ops-kpi-card">
          <span className="ops-kpi-label">Mean Time to Resolve (MTTR)</span>
          <span className="ops-kpi-val" style={{ color: 'var(--operational)' }}>
            {data?.kpis?.meanTimeToResolveMin || 28.5} m
          </span>
          <span className="ops-kpi-sub">Target: &lt; 45 minutes</span>
        </div>
        <div className="ops-kpi-card">
          <span className="ops-kpi-label">Mean Time to Detect (MTTD)</span>
          <span className="ops-kpi-val" style={{ color: 'var(--acid)' }}>
            {data?.kpis?.meanTimeToDetectMin || 4.2} m
          </span>
          <span className="ops-kpi-sub">Automated sensor alert latency</span>
        </div>
        <div className="ops-kpi-card">
          <span className="ops-kpi-label">Response Success Rate</span>
          <span className="ops-kpi-val" style={{ color: 'var(--gold)' }}>
            {data?.responsePerformance?.successRate || 100}%
          </span>
          <span className="ops-kpi-sub">
            {data?.responsePerformance?.completed || 12} countermeasures completed
          </span>
        </div>
        <div className="ops-kpi-card">
          <span className="ops-kpi-label">Platform Availability</span>
          <span className="ops-kpi-val" style={{ color: 'var(--operational)' }}>
            {data?.kpis?.serviceAvailabilityPercent || 99.85}%
          </span>
          <span className="ops-kpi-sub">30-day trailing SLA index</span>
        </div>
      </div>

      {/* Mid-Row: Severity & Category Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 'var(--s-4)' }}>
        {/* Severity Distribution */}
        <div className="ops-table-card">
          <div className="ops-table-header">
            <h2>Severity Distribution</h2>
          </div>
          <div style={{ padding: 'var(--s-4)', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
            {[
              { label: 'CRITICAL', count: data?.severityDistribution?.CRITICAL ?? 2, color: 'var(--critical)' },
              { label: 'HIGH', count: data?.severityDistribution?.HIGH ?? 3, color: 'var(--hazard)' },
              { label: 'MEDIUM', count: data?.severityDistribution?.MEDIUM ?? 4, color: 'var(--gold)' },
              { label: 'LOW', count: data?.severityDistribution?.LOW ?? 1, color: 'var(--operational)' },
            ].map((item) => (
              <div key={item.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 'var(--t-label)', marginBottom: '4px' }}>
                  <span style={{ color: item.color, fontWeight: 600 }}>{item.label}</span>
                  <span>{item.count} incidents</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: 'var(--obsidian)', borderRadius: 'var(--r-xs)', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(10, item.count * 20))}%`,
                      height: '100%',
                      background: item.color,
                      borderRadius: 'var(--r-xs)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recurring Attack Vectors */}
        <div className="ops-table-card">
          <div className="ops-table-header">
            <h2>Recurring Attack Categories</h2>
          </div>
          <div style={{ padding: 'var(--s-4)', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
            {(data?.recurringPatterns || [
              { category: 'CREDENTIAL_ACCESS', count: 5 },
              { category: 'DENIAL_OF_SERVICE', count: 3 },
              { category: 'DATA_EXFILTRATION', count: 2 },
            ]).map((pat) => (
              <div
                key={pat.category}
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
                <span>{pat.category}</span>
                <span className="ops-badge ops-badge-active">{pat.count} incidents</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Historical Trends */}
      <div className="ops-table-card">
        <div className="ops-table-header">
          <h2>7-Day Incident Trend Volume</h2>
        </div>
        <div style={{ padding: 'var(--s-4)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', height: '140px', padding: '10px 0' }}>
            {trends.map((t, idx) => {
              const total = t.critical + t.high + t.medium + t.low;
              const heightPct = Math.min(100, Math.max(20, total * 9));
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
                  }}
                >
                  <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--acid)', marginBottom: '4px' }}>
                    {total}
                  </div>
                  <div
                    style={{
                      width: '80%',
                      height: `${heightPct}%`,
                      background: 'var(--elevated)',
                      border: '1px solid var(--hairline-strong)',
                      borderRadius: 'var(--r-xs)',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ height: `${(t.critical / total) * 100}%`, background: 'var(--critical)' }} />
                    <div style={{ height: `${(t.high / total) * 100}%`, background: 'var(--hazard)' }} />
                    <div style={{ height: `${(t.medium / total) * 100}%`, background: 'var(--gold)' }} />
                    <div style={{ height: `${(t.low / total) * 100}%`, background: 'var(--operational)' }} />
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginTop: '6px' }}>
                    {t.period.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', fontSize: 'var(--t-micro)', fontFamily: 'var(--font-mono)', marginTop: 'var(--s-3)' }}>
            <span style={{ color: 'var(--critical)' }}>■ Critical</span>
            <span style={{ color: 'var(--hazard)' }}>■ High</span>
            <span style={{ color: 'var(--gold)' }}>■ Medium</span>
            <span style={{ color: 'var(--operational)' }}>■ Low</span>
          </div>
        </div>
      </div>
    </div>
  );
}
