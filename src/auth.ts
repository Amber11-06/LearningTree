export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
}

export class AuthError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = "auth_error", status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new AuthError(
      "无法连接后端，请确认 FastAPI 与 PostgreSQL 已启动。",
      "connection_error",
    );
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    /* Some endpoints return an empty body. */
  }
  if (!response.ok) {
    const error = payload as { error?: string; code?: string } | null;
    throw new AuthError(
      error?.error ?? `请求失败（${response.status}）`,
      error?.code ?? "auth_error",
      response.status,
    );
  }
  return payload;
}

export async function currentUser(): Promise<AuthUser | null> {
  try {
    const payload = (await request("/api/auth/me")) as { user?: AuthUser };
    return payload?.user ?? null;
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) return null;
    throw error;
  }
}

export async function login(
  username: string,
  password: string,
): Promise<AuthUser> {
  const payload = (await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })) as { user: AuthUser };
  return payload.user;
}

export async function register(
  username: string,
  password: string,
  displayName: string,
): Promise<AuthUser> {
  const payload = (await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      display_name: displayName || null,
    }),
  })) as { user: AuthUser };
  return payload.user;
}

export async function logout(): Promise<void> {
  await request("/api/auth/logout", { method: "POST" });
}
