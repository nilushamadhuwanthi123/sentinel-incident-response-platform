import { useState } from 'react';
import { HashRouter, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { LiveProvider, useLive } from './context/LiveContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ConnectionBadge } from './components/shared/ConnectionBadge.jsx';
import { CommandPalette } from './components/shared/CommandPalette.jsx';
import { UserBadge } from './components/auth/UserBadge.jsx';
import { buildCommands } from './engines/commandRegistry.js';
import { DEFAULT_TOPOLOGY } from './engines/topology.js';
import { CommandCenter } from './pages/CommandCenter.jsx';
import { Investigation } from './pages/Investigation.jsx';
import { IncidentOperations } from './pages/IncidentOperations.jsx';
import { ResponseCenter } from './pages/ResponseCenter.jsx';
import { Observability } from './pages/Observability.jsx';
import { Analytics } from './pages/Analytics.jsx';
import { AuditTrail } from './pages/AuditTrail.jsx';
import './styles/commandCenter.css';
import './styles/radar.css';
import './styles/topology.css';
import './styles/response.css';
import './styles/assist.css';
import './styles/chain.css';
import './styles/investigation.css';
import './styles/palette.css';
import './styles/forensics.css';
import './styles/operations.css';

/**
 * Application shell.
 *
 * Hash routing, deliberately. The build is served from GitHub Pages, which
 * has no server-side rewrite: with browser routing, a visitor who refreshes
 * on /investigate gets a 404 from GitHub rather than the application. A
 * routing style that breaks on refresh is not a routing style, it is a
 * trap, and the fix belongs here rather than in a `404.html` that redirects
 * and loses the URL.
 *
 * The connection is opened once, above the routes — see LiveContext for why
 * that matters more than it looks.
 */
function Shell() {
  const { status, degraded, live, reset } = useLive();
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const investigable = live.incidents.length > 0;

  const commands = buildCommands({
    navigate,
    hasIncident: investigable,
    services: DEFAULT_TOPOLOGY.nodes.filter((n) => !n.external),
    onReset: reset,
  });

  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>

      <header className="bar">
        <span className="bar-mark" aria-hidden="true" />
        <span className="bar-name">SENTINEL</span>

        <nav className="bar-nav" aria-label="Views">
          <NavLink to="/" end className="bar-link">
            Command Center
          </NavLink>
          <NavLink to="/investigate" className="bar-link">
            Investigate
            {investigable && <span className="bar-dot" aria-hidden="true" />}
          </NavLink>
          <NavLink to="/incidents" className="bar-link">
            Incidents
          </NavLink>
          <NavLink to="/response" className="bar-link">
            Response Center
          </NavLink>
          <NavLink to="/observability" className="bar-link">
            Observability
          </NavLink>
          <NavLink to="/analytics" className="bar-link">
            Analytics
          </NavLink>
          <NavLink to="/audit" className="bar-link">
            Audit Trail
          </NavLink>
        </nav>

        <button
          type="button"
          className="bar-palette"
          onClick={() => setPaletteOpen(true)}
        >
          <span className="visually-hidden">Open the command palette</span>
          <kbd aria-hidden="true">⌘K</kbd>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ConnectionBadge status={status} degraded={degraded} />
          <UserBadge />
        </div>
      </header>

      <CommandPalette
        commands={commands}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
      />

      <Routes>
        <Route path="/" element={<CommandCenter />} />
        <Route path="/investigate" element={<InvestigationRoute />} />
        <Route path="/incidents" element={<IncidentOperations />} />
        <Route path="/response" element={<ResponseCenter />} />
        <Route path="/observability" element={<Observability />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/audit" element={<AuditTrail />} />
      </Routes>
    </>
  );
}

function InvestigationRoute() {
  const { live } = useLive();
  return <Investigation incident={live.incidents[0] ?? null} risk={live.risk} />;
}

export default function App({ socketOptions }) {
  return (
    <LiveProvider socketOptions={socketOptions}>
      <AuthProvider>
        {/* The v7 flags are opted into now rather than inherited later: they
            change how state updates batch and how relative routes resolve, and
            finding that out during an upgrade is worse than finding it out
            today, while there are two routes. */}
        <HashRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Shell />
        </HashRouter>
      </AuthProvider>
    </LiveProvider>
  );
}
