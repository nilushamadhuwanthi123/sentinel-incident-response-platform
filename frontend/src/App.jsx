import { SEVERITY_BANDS } from './engines/severity.js';
import './App.css';

/**
 * Repository bootstrap shell.
 *
 * This is deliberately thin: the Command Center, radar, topology and
 * investigation workspace each arrive on their own feature branch behind
 * their own issue, so that the history shows them being built rather than
 * appearing all at once. What this file does prove, from the first commit,
 * is that the design system and the severity scale are real and shared.
 */
export default function App() {
  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>
      <header className="shell-bar">
        <span className="shell-mark" aria-hidden="true" />
        <span className="shell-name">SENTINEL</span>
        <span className="shell-tagline">
          Detect. Understand. Respond. Resolve. Learn.
        </span>
        <span className="shell-status" role="status">
          <span className="dot dot--pending" aria-hidden="true" />
          BOOTSTRAP
        </span>
      </header>

      <main id="main" className="shell-main">
        <h1 className="shell-title">Platform bootstrap</h1>
        <p className="shell-lead">
          The design system and severity scale are in place. Operational
          systems land branch by branch — see the repository issues.
        </p>

        <section aria-labelledby="scale-heading" className="scale">
          <h2 id="scale-heading" className="scale-heading">
            Severity scale
          </h2>
          <ul className="scale-list">
            {SEVERITY_BANDS.map((band) => (
              <li key={band.id} className={`chip chip--${band.id}`}>
                <span className="chip-mark" aria-hidden="true" />
                <span className="chip-label">{band.label}</span>
                <span className="chip-range">
                  {band.min}–{band.max}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
