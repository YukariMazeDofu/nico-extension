export function jwtExpiresAt(token: string): number {
  const payload = token.split('.')[1] ?? '';
  const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  return json.exp * 1000;
}
