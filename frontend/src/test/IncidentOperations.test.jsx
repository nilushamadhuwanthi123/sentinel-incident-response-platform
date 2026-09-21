import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import { LiveProvider } from '../context/LiveContext.jsx';
import { IncidentOperations } from '../pages/IncidentOperations.jsx';

describe('IncidentOperations view', () => {
  it('renders queue and operational KPIs cleanly', async () => {
    render(
      <LiveProvider socketOptions={{ enabled: false }}>
        <AuthProvider>
          <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <IncidentOperations />
          </HashRouter>
        </AuthProvider>
      </LiveProvider>
    );

    expect(screen.getByText(/Incident Operations Console/i)).toBeInTheDocument();
    expect(screen.getByText(/CANONICAL LIFECYCLE/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Incidents/i)).toBeInTheDocument();
    expect(screen.getByText(/Incident Queue/i)).toBeInTheDocument();
  });
});
