export type StaffOrderActionDetail = {
    action?: string;
    status?: string;
    time?: string;
    waiterName?: string;
};
export declare function normalizeLifecycleStatus(raw: unknown): string | null;
export declare function isStageTransitionDetail(detail: StaffOrderActionDetail): boolean;
export declare function detailLifecycleStatus(detail: StaffOrderActionDetail): string | null;
export declare function mapRawToActionDetail(raw: Record<string, unknown>): StaffOrderActionDetail;
export declare function buildActionDetailsFromActions(actions: unknown): StaffOrderActionDetail[];
export declare function parseActionDetailsList(raw: unknown): StaffOrderActionDetail[];
export declare function actionDetailScore(details: StaffOrderActionDetail[]): number;
export declare function pickRicherActionDetails(primary: StaffOrderActionDetail[], fallback: StaffOrderActionDetail[]): StaffOrderActionDetail[];
export declare function resolveStatusStageActorName(currentStatus: string, actionDetails: StaffOrderActionDetail[]): string | null;
declare const WORKFLOW_STAGES: readonly ["confirmed", "prepared", "delivered", "cancelled"];
export declare function resolveWorkflowStageActors(actionDetails: StaffOrderActionDetail[]): Partial<Record<(typeof WORKFLOW_STAGES)[number], string>>;
export declare function staffParticipatedInActionDetails(actionDetails: StaffOrderActionDetail[], staffName: string): boolean;
export {};
