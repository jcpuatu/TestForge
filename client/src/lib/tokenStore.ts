// In-memory only — the access token is never persisted to localStorage/sessionStorage
// so it can't be lifted by an XSS payload. Session survival across page loads relies on
// the httpOnly refresh-token cookie via a silent /auth/refresh call on app boot.
let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

export function notifySessionExpired() {
  onSessionExpired?.();
}
