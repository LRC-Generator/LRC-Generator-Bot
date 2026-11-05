export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name} (see .env.example)`);
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

/** True for `true`, `1` or `yes`; false when unset. */
export function flagEnv(name: string): boolean {
  return /^(true|1|yes)$/i.test(process.env[name]?.trim() ?? "");
}
