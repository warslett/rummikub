export interface StorageConfig {
  databaseUrl: string;
  enabled: boolean;
}

export function parseStorageConfig(env: Record<string, string | undefined>): StorageConfig {
  const databaseUrl = (env.DATABASE_URL ?? "").trim();
  return {
    databaseUrl,
    enabled: databaseUrl.length > 0,
  };
}

export const storageConfig: StorageConfig = {
  get databaseUrl(): string {
    return (process.env.DATABASE_URL ?? "").trim();
  },
  get enabled(): boolean {
    return this.databaseUrl.length > 0;
  },
};
