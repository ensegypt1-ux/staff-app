export type StaffOrderActionDetail = {
  action?: string;
  status?: string;
  time?: string;
  waiterName?: string;
};

const LIFECYCLE_STATUSES = new Set([
  'pending',
  'confirmed',
  'prepared',
  'delivered',
  'cancelled',
]);

/** Actions that update an order but do not own a lifecycle stage. */
const NON_STAGE_ACTIONS = new Set([
  'TABLE_CALL_ITEMS_UPDATED',
  'TABLE_CALL_UPDATED',
  'TABLE_CALL_CREATED',
]);

const ACTION_TO_STATUS: Record<string, string> = {
  TABLE_CALL_CONFIRMED: 'confirmed',
  TABLE_CALL_CANCELLED: 'cancelled',
  TABLE_CALL_PREPARED: 'prepared',
  TABLE_CALL_DELIVERED: 'delivered',
  TABLE_CALL_CREATED: 'pending',
};

export function normalizeLifecycleStatus(raw: unknown): string | null {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!value || value === 'updated') return null;
  if (value === 'table_call_created') return 'pending';
  if (LIFECYCLE_STATUSES.has(value)) return value;
  return null;
}

export function isStageTransitionDetail(detail: StaffOrderActionDetail): boolean {
  const action = String(detail.action ?? '')
    .trim()
    .toUpperCase();
  if (action && NON_STAGE_ACTIONS.has(action)) {
    return false;
  }
  if (action && ACTION_TO_STATUS[action]) {
    return action !== 'TABLE_CALL_CREATED';
  }
  const status = normalizeLifecycleStatus(detail.status);
  return status != null && status !== 'pending';
}

export function detailLifecycleStatus(
  detail: StaffOrderActionDetail,
): string | null {
  const action = String(detail.action ?? '')
    .trim()
    .toUpperCase();
  if (action && ACTION_TO_STATUS[action]) {
    return ACTION_TO_STATUS[action];
  }
  return normalizeLifecycleStatus(detail.status);
}

export function mapRawToActionDetail(
  raw: Record<string, unknown>,
): StaffOrderActionDetail {
  return {
    action: raw.action != null ? String(raw.action) : undefined,
    status: raw.status != null ? String(raw.status) : undefined,
    time: raw.time != null ? String(raw.time) : undefined,
    waiterName: raw.waiterName != null ? String(raw.waiterName) : undefined,
  };
}

export function buildActionDetailsFromActions(
  actions: unknown,
): StaffOrderActionDetail[] {
  if (!Array.isArray(actions)) return [];
  return actions
    .filter((row) => row && typeof row === 'object')
    .map((row) => mapRawToActionDetail(row as Record<string, unknown>));
}

export function parseActionDetailsList(raw: unknown): StaffOrderActionDetail[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row) => row && typeof row === 'object')
    .map((row) => mapRawToActionDetail(row as Record<string, unknown>));
}

export function actionDetailScore(details: StaffOrderActionDetail[]): number {
  if (details.length === 0) return 0;
  let score = details.length;
  for (const detail of details) {
    if (String(detail.waiterName ?? '').trim()) score += 2;
    if (String(detail.action ?? '').trim()) score += 1;
  }
  return score;
}

export function pickRicherActionDetails(
  primary: StaffOrderActionDetail[],
  fallback: StaffOrderActionDetail[],
): StaffOrderActionDetail[] {
  const primaryScore = actionDetailScore(primary);
  const fallbackScore = actionDetailScore(fallback);
  if (fallbackScore > primaryScore) return fallback;
  if (primaryScore > fallbackScore) return primary;
  return primary.length >= fallback.length ? primary : fallback;
}

export function resolveStatusStageActorName(
  currentStatus: string,
  actionDetails: StaffOrderActionDetail[],
): string | null {
  const target = normalizeLifecycleStatus(currentStatus);
  if (!target || target === 'pending') return null;

  let previousLifecycle: string | null = null;
  let actorAtTransition: string | null = null;

  for (const detail of actionDetails) {
    if (!isStageTransitionDetail(detail)) continue;

    const stage = detailLifecycleStatus(detail);
    if (!stage || stage === 'pending') continue;

    const name = String(detail.waiterName ?? '').trim();
    if (!name) {
      previousLifecycle = stage;
      continue;
    }

    if (stage === target && previousLifecycle !== target) {
      actorAtTransition = name;
    }
    previousLifecycle = stage;
  }

  return actorAtTransition;
}

const WORKFLOW_STAGES = [
  'confirmed',
  'prepared',
  'delivered',
  'cancelled',
] as const;

export function resolveWorkflowStageActors(
  actionDetails: StaffOrderActionDetail[],
): Partial<Record<(typeof WORKFLOW_STAGES)[number], string>> {
  const actors: Partial<Record<(typeof WORKFLOW_STAGES)[number], string>> = {};
  for (const stage of WORKFLOW_STAGES) {
    const name = resolveStatusStageActorName(stage, actionDetails);
    if (name) actors[stage] = name;
  }
  return actors;
}

export function staffParticipatedInActionDetails(
  actionDetails: StaffOrderActionDetail[],
  staffName: string,
): boolean {
  const normalized = staffName.trim().toLowerCase();
  if (!normalized) return false;

  return actionDetails.some((detail) => {
    if (!isStageTransitionDetail(detail)) return false;
    return (
      String(detail.waiterName ?? '')
        .trim()
        .toLowerCase() === normalized
    );
  });
}
