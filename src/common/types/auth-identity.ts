/**
 * Immutable identity attached after cryptographic JWT verification.
 */
export type AuthRole = 'user' | 'admin' | 'staff' | string;

export interface VerifiedAuthIdentity {
  readonly userId: number;
  readonly role: AuthRole;
  /** Present on staff access tokens. */
  readonly menuId?: number;
  /** Present on staff access tokens (dynamic RBAC role id). */
  readonly staffRoleId?: number;
}

export const AUTH_IDENTITY_KEY = 'authIdentity' as const;

export function isStaffRole(role: string | undefined | null): boolean {
  return (
    String(role ?? '')
      .trim()
      .toLowerCase() === 'staff'
  );
}
