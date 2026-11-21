export type CurrentUser = {
  id: string;
  name: string;
  username: string;
  organizationId: string | null;
  roles: string[];
  permissions: string[];
};
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
type LoginResult = {accessToken: string; refreshToken: string; user: CurrentUser};
let accessToken = '';
let renewal: Promise<string> | null = null;
const refreshKey = 'mandob_v2_refresh';
const base = '/api/v1';

function errorText(payload: any, status: number) {
  const message = payload && (payload.message || payload.error);
  return Array.isArray(message) ? message.join('، ') : (typeof message === 'string' ? message : 'تعذر تنفيذ الطلب (' + status + ')');
}
async function parse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(errorText(data, response.status), response.status);
  return data;
}
function saveSession(session: LoginResult) {
  accessToken = session.accessToken;
  sessionStorage.setItem(refreshKey, session.refreshToken);
}
export async function login(username: string, password: string): Promise<CurrentUser> {
  const response = await fetch(base + '/auth/login', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username, password})
  });
  const session: LoginResult = await parse(response);
  saveSession(session);
  return session.user;
}
async function renew() {
  if (!renewal) renewal = (async () => {
    const token = sessionStorage.getItem(refreshKey);
    if (!token) throw new ApiError('انتهت الجلسة. سجل الدخول مجدداً.', 401);
    try {
      const response = await fetch(base + '/auth/refresh', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({refreshToken: token})
      });
      const session: LoginResult = await parse(response);
      saveSession(session);
      return session.accessToken;
    } catch (error) {
      sessionStorage.removeItem(refreshKey); accessToken = '';
      throw error;
    }
  })().finally(() => { renewal = null; });
  return renewal;
}
export async function restore(): Promise<CurrentUser | null> {
  if (!sessionStorage.getItem(refreshKey)) return null;
  try { await renew(); return await request<CurrentUser>('/auth/me'); }
  catch { clearSession(); return null; }
}
export function clearSession() {
  accessToken = ''; sessionStorage.removeItem(refreshKey);
}
export async function logout() {
  const token = sessionStorage.getItem(refreshKey);
  clearSession();
  if (token) await fetch(base + '/auth/logout', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({refreshToken: token})
  }).catch(() => undefined);
}
export async function request<T = any>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  if (!accessToken) await renew();
  const headers = new Headers(options.headers);
  headers.set('Authorization', 'Bearer ' + accessToken);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  let response: Response;
  try {
    response = await fetch(base + path, {...options, headers, cache: 'no-store'});
  } catch {
    throw new ApiError('تعذر الاتصال بالخادم. تحقق من الشبكة.', 0);
  }
  if (response.status === 401 && !retried) {
    await renew();
    return request<T>(path, options, true);
  }
  return parse(response);
}
export function write<T = any>(path: string, body: unknown, method: 'POST' | 'PATCH' = 'POST') {
  return request<T>(path, {method, body: JSON.stringify(body)});
}
export function has(user: CurrentUser, ...codes: string[]) {
  return codes.every(code => user.permissions.includes(code));
}
export function primaryRole(user: CurrentUser) {
  for (const code of ['SUPER_ADMIN', 'NATIONAL_MANAGER', 'TEAM_MANAGER', 'REP', 'COMPANY_STAFF']) {
    if (user.roles.includes(code)) return code;
  }
  return 'COMPANY_STAFF';
}
