import { CommandCenter } from './pages/CommandCenter.jsx';
import './styles/commandCenter.css';
import './styles/radar.css';

/**
 * Application shell.
 *
 * The Command Center is the whole application for now. Routing arrives with
 * the second screen, not before: a router with one route is scaffolding
 * pretending to be architecture.
 */
export default function App() {
  return <CommandCenter />;
}
