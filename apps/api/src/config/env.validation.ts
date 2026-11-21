function requireString(
  config: Record<string, unknown>,
  key: string,
): string {
  const value = config[key];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value.trim();
}

function positiveInteger(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const raw = config[key];

  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer.`);
  }

  return parsed;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...config,
    DATABASE_URL: requireString(config, 'DATABASE_URL'),
    JWT_ACCESS_SECRET: requireString(config, 'JWT_ACCESS_SECRET'),
    PORT: positiveInteger(config, 'PORT', 3001),
    JWT_ACCESS_TTL_SECONDS: positiveInteger(
      config,
      'JWT_ACCESS_TTL_SECONDS',
      900,
    ),
    REFRESH_TOKEN_DAYS: positiveInteger(config, 'REFRESH_TOKEN_DAYS', 30),
  };
}
