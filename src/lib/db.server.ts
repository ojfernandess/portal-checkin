import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool: Pool | null = null;

export function getDatabaseUrl(): string {
  const url = process.env["DATABASE_URL"]?.trim();
  if (!url) {
    throw new Error("Missing DATABASE_URL. Configure Postgres in your environment.");
  }
  return url;
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: Number(process.env["DATABASE_POOL_MAX"] ?? 10),
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  const result = await getPool().query<T>(text, params);
  return { rows: result.rows, rowCount: result.rowCount ?? 0 };
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
