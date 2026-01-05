export type BackendKind = 'trailbase';

export interface AuthUser {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  csrfToken?: string;
  user: AuthUser;
}

export type Unsubscribe = () => void;

export interface AuthBackend {
  readonly kind: BackendKind;

  /**
   * Returns the current session if available.
   *
   * Implementations may source this from memory, storage, cookies, or SDKs.
   */
  getSession(): Promise<AuthSession | null>;

  /**
   * Attempts to refresh session if supported.
   *
   * Should throw on failure so callers can clear local state.
   */
  refreshSession(): Promise<void>;

  /**
   * Logs out the current user.
   *
   * Implementations should revoke refresh tokens if applicable and ensure local
   * persisted tokens are cleared by the caller.
   */
  logout(): Promise<void>;

  /**
   * Verifies the access token and returns the user if valid.
   *
   * Server APIs use this for authentication.
   */
  getUserFromAccessToken(token: string): Promise<AuthUser | null>;

  /**
   * Subscribe to auth state changes.
   *
   * Implementations should normalize state into AuthSession|null.
   */
  onAuthStateChange(handler: (session: AuthSession | null) => void): Promise<Unsubscribe>;

  /**
   * Decodes token claims into a plain object.
   *
   * Note: this does NOT imply verification; use getUserFromAccessToken for that.
   */
  decodeClaims(token: string): Record<string, unknown>;
}
