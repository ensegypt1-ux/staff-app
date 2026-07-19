export type AuthRole = 'user' | 'admin' | 'staff' | string;
export interface VerifiedAuthIdentity {
    readonly userId: number;
    readonly role: AuthRole;
    readonly menuId?: number;
    readonly staffRoleId?: number;
}
export declare const AUTH_IDENTITY_KEY: "authIdentity";
export declare function isStaffRole(role: string | undefined | null): boolean;
