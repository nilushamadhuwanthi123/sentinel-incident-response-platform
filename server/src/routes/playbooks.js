import express from 'express';
import { store } from '../data/store.js';
import { executeDefensiveAction, DEFENSIVE_ACTIONS } from '../services/playbookEngine.js';
import { authenticate, optionalAuthenticate, requireRole } from '../middleware/auth.js';

export const playbooksRouter = express.Router();

/**
 * GET /api/playbooks
 * List available defensive playbooks and catalog of executable actions.
 */
playbooksRouter.get('/', optionalAuthenticate, (_req, res) => {
  const playbooks = store.listPlaybooks();
  res.json({
    ok: true,
    playbooks,
    availableActions: Object.entries(DEFENSIVE_ACTIONS).map(([id, item]) => ({
      id,
      name: item.name,
      riskReduction: item.riskReduction,
    })),
  });
});

/**
 * GET /api/playbooks/:id
 * Retrieve single playbook configuration.
 */
playbooksRouter.get('/:id', optionalAuthenticate, (req, res) => {
  const playbook = store.getPlaybookById(req.params.id);
  if (!playbook) {
    return res.status(404).json({ ok: false, error: `Playbook ${req.params.id} not found` });
  }
  res.json({ ok: true, playbook });
});

/**
 * POST /api/incidents/:id/actions
 * Execute a defensive response action against an incident.
 */
export const incidentActionsRouter = express.Router({ mergeParams: true });

incidentActionsRouter.get('/', optionalAuthenticate, (req, res) => {
  const { id } = req.params;
  const actions = store.listResponseActions(id);
  res.json({
    ok: true,
    incidentId: id,
    actions,
  });
});

incidentActionsRouter.post('/', authenticate, requireRole(['ADMIN', 'ANALYST']), (req, res) => {
  const { id } = req.params;
  const { actionId, playbookId, target } = req.body || {};

  if (!actionId) {
    return res.status(400).json({ ok: false, error: 'actionId is required' });
  }

  try {
    const outcome = executeDefensiveAction({
      incidentId: id,
      actionId,
      playbookId,
      target,
      actor: req.user,
    });

    res.status(200).json({
      ok: true,
      ...outcome,
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err.message,
    });
  }
});
