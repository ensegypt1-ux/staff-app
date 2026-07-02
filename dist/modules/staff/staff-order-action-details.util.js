"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeLifecycleStatus = normalizeLifecycleStatus;
exports.isStageTransitionDetail = isStageTransitionDetail;
exports.detailLifecycleStatus = detailLifecycleStatus;
exports.mapRawToActionDetail = mapRawToActionDetail;
exports.buildActionDetailsFromActions = buildActionDetailsFromActions;
exports.parseActionDetailsList = parseActionDetailsList;
exports.actionDetailScore = actionDetailScore;
exports.pickRicherActionDetails = pickRicherActionDetails;
exports.resolveStatusStageActorName = resolveStatusStageActorName;
exports.resolveWorkflowStageActors = resolveWorkflowStageActors;
exports.staffParticipatedInActionDetails = staffParticipatedInActionDetails;
const LIFECYCLE_STATUSES = new Set([
    'pending',
    'confirmed',
    'prepared',
    'delivered',
    'cancelled',
]);
const NON_STAGE_ACTIONS = new Set([
    'TABLE_CALL_ITEMS_UPDATED',
    'TABLE_CALL_UPDATED',
    'TABLE_CALL_CREATED',
]);
const ACTION_TO_STATUS = {
    TABLE_CALL_CONFIRMED: 'confirmed',
    TABLE_CALL_CANCELLED: 'cancelled',
    TABLE_CALL_PREPARED: 'prepared',
    TABLE_CALL_DELIVERED: 'delivered',
    TABLE_CALL_CREATED: 'pending',
};
function normalizeLifecycleStatus(raw) {
    const value = String(raw ?? '')
        .trim()
        .toLowerCase();
    if (!value || value === 'updated')
        return null;
    if (value === 'table_call_created')
        return 'pending';
    if (LIFECYCLE_STATUSES.has(value))
        return value;
    return null;
}
function isStageTransitionDetail(detail) {
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
function detailLifecycleStatus(detail) {
    const action = String(detail.action ?? '')
        .trim()
        .toUpperCase();
    if (action && ACTION_TO_STATUS[action]) {
        return ACTION_TO_STATUS[action];
    }
    return normalizeLifecycleStatus(detail.status);
}
function mapRawToActionDetail(raw) {
    return {
        action: raw.action != null ? String(raw.action) : undefined,
        status: raw.status != null ? String(raw.status) : undefined,
        time: raw.time != null ? String(raw.time) : undefined,
        waiterName: raw.waiterName != null ? String(raw.waiterName) : undefined,
    };
}
function buildActionDetailsFromActions(actions) {
    if (!Array.isArray(actions))
        return [];
    return actions
        .filter((row) => row && typeof row === 'object')
        .map((row) => mapRawToActionDetail(row));
}
function parseActionDetailsList(raw) {
    if (!Array.isArray(raw))
        return [];
    return raw
        .filter((row) => row && typeof row === 'object')
        .map((row) => mapRawToActionDetail(row));
}
function actionDetailScore(details) {
    if (details.length === 0)
        return 0;
    let score = details.length;
    for (const detail of details) {
        if (String(detail.waiterName ?? '').trim())
            score += 2;
        if (String(detail.action ?? '').trim())
            score += 1;
    }
    return score;
}
function pickRicherActionDetails(primary, fallback) {
    const primaryScore = actionDetailScore(primary);
    const fallbackScore = actionDetailScore(fallback);
    if (fallbackScore > primaryScore)
        return fallback;
    if (primaryScore > fallbackScore)
        return primary;
    return primary.length >= fallback.length ? primary : fallback;
}
function resolveStatusStageActorName(currentStatus, actionDetails) {
    const target = normalizeLifecycleStatus(currentStatus);
    if (!target || target === 'pending')
        return null;
    let previousLifecycle = null;
    let actorAtTransition = null;
    for (const detail of actionDetails) {
        if (!isStageTransitionDetail(detail))
            continue;
        const stage = detailLifecycleStatus(detail);
        if (!stage || stage === 'pending')
            continue;
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
];
function resolveWorkflowStageActors(actionDetails) {
    const actors = {};
    for (const stage of WORKFLOW_STAGES) {
        const name = resolveStatusStageActorName(stage, actionDetails);
        if (name)
            actors[stage] = name;
    }
    return actors;
}
function staffParticipatedInActionDetails(actionDetails, staffName) {
    const normalized = staffName.trim().toLowerCase();
    if (!normalized)
        return false;
    return actionDetails.some((detail) => {
        if (!isStageTransitionDetail(detail))
            return false;
        return (String(detail.waiterName ?? '')
            .trim()
            .toLowerCase() === normalized);
    });
}
//# sourceMappingURL=staff-order-action-details.util.js.map