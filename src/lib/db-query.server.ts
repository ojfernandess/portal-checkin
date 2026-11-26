import type { QueryResultRow } from "pg";
import { query } from "@/lib/db.server";

type Filter =
  | { type: "eq"; column: string; value: unknown }
  | { type: "neq"; column: string; value: unknown }
  | { type: "in"; column: string; values: unknown[] }
  | { type: "ilike"; column: string; value: string }
  | { type: "gte"; column: string; value: unknown }
  | { type: "lte"; column: string; value: unknown }
  | { type: "is"; column: string; value: null | boolean }
  | { type: "not_is"; column: string; value: null | boolean }
  | { type: "contains"; column: string; value: unknown };

type OrderBy = { column: string; ascending: boolean };

type DbError = { message: string; code?: string };

type DbResult<T> = { data: T; error: null; count?: number | null } | { data: null; error: DbError; count?: number | null };

function toDbError(error: unknown): DbError {
  if (error && typeof error === "object") {
    const row = error as { message?: unknown; code?: unknown };
    const message = String(row.message ?? error);
    if (row.code != null) return { message, code: String(row.code) };
    return { message };
  }
  return { message: String(error) };
}

/** `pg` returns Date for timestamptz; consumers expect ISO strings (Supabase-compatible). */
function serializeDbValue(value: unknown): unknown {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return value;
}

function serializeDbRow<T extends QueryResultRow>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = serializeDbValue(value);
  }
  return out as T;
}

function serializeDbRows<T extends QueryResultRow>(rows: T[]): T[] {
  return rows.map((row) => serializeDbRow(row));
}

function quoteIdent(identifier: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function buildWhere(filters: Filter[], params: unknown[]): string {
  if (filters.length === 0) return "";
  const parts = filters.map((filter) => {
    switch (filter.type) {
      case "eq": {
        params.push(filter.value);
        return `${quoteIdent(filter.column)} = $${params.length}`;
      }
      case "neq": {
        params.push(filter.value);
        return `${quoteIdent(filter.column)} <> $${params.length}`;
      }
      case "in": {
        if (filter.values.length === 0) return "FALSE";
        const placeholders = filter.values.map((value) => {
          params.push(value);
          return `$${params.length}`;
        });
        return `${quoteIdent(filter.column)} IN (${placeholders.join(", ")})`;
      }
      case "ilike": {
        params.push(filter.value);
        return `${quoteIdent(filter.column)} ILIKE $${params.length}`;
      }
      case "gte": {
        params.push(filter.value);
        return `${quoteIdent(filter.column)} >= $${params.length}`;
      }
      case "lte": {
        params.push(filter.value);
        return `${quoteIdent(filter.column)} <= $${params.length}`;
      }
      case "is": {
        if (filter.value === null) return `${quoteIdent(filter.column)} IS NULL`;
        return `${quoteIdent(filter.column)} IS ${filter.value ? "TRUE" : "FALSE"}`;
      }
      case "not_is": {
        if (filter.value === null) return `${quoteIdent(filter.column)} IS NOT NULL`;
        return `${quoteIdent(filter.column)} IS NOT ${filter.value ? "TRUE" : "FALSE"}`;
      }
      case "contains": {
        params.push(JSON.stringify(filter.value));
        return `${quoteIdent(filter.column)} @> $${params.length}::jsonb`;
      }
      default:
        return "TRUE";
    }
  });
  return ` WHERE ${parts.join(" AND ")}`;
}

class QueryBuilder<T extends QueryResultRow = QueryResultRow> implements PromiseLike<DbResult<T[] | T | null>> {
  private table: string;
  private filters: Filter[] = [];
  private orderBy: OrderBy[] = [];
  private limitCount: number | null = null;
  private selectColumns = "*";
  private wantCount = false;
  private headOnly = false;
  private singleMode: "none" | "maybe" | "single" = "none";
  private mutation:
    | { kind: "insert"; values: Record<string, unknown> | Record<string, unknown>[] }
    | { kind: "update"; values: Record<string, unknown> }
    | {
        kind: "upsert";
        values: Record<string, unknown> | Record<string, unknown>[];
        onConflict?: string;
      }
    | { kind: "delete" }
    | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = "*", options?: { count?: "exact"; head?: boolean }) {
    this.selectColumns = columns;
    if (options?.count === "exact") this.wantCount = true;
    if (options?.head) this.headOnly = true;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ type: "eq", column, value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ type: "neq", column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ type: "in", column, values });
    return this;
  }

  ilike(column: string, value: string) {
    this.filters.push({ type: "ilike", column, value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ type: "gte", column, value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ type: "lte", column, value });
    return this;
  }

  is(column: string, value: null | boolean) {
    this.filters.push({ type: "is", column, value });
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    if (operator === "is") {
      this.filters.push({ type: "not_is", column, value: value as null | boolean });
      return this;
    }
    throw new Error(`Unsupported .not operator: ${operator}`);
  }

  contains(column: string, value: unknown) {
    this.filters.push({ type: "contains", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybe";
    this.limitCount = 1;
    return this;
  }

  single() {
    this.singleMode = "single";
    this.limitCount = 1;
    return this;
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.mutation = { kind: "insert", values };
    return this;
  }

  update(values: Record<string, unknown>) {
    this.mutation = { kind: "update", values };
    return this;
  }

  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string },
  ) {
    this.mutation = {
      kind: "upsert",
      values,
      ...(options?.onConflict ? { onConflict: options.onConflict } : {}),
    };
    return this;
  }

  delete() {
    this.mutation = { kind: "delete" };
    return this;
  }

  then<TResult1 = DbResult<T[] | T | null>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<T[] | T | null>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<DbResult<T[] | T | null>> {
    try {
      if (this.mutation?.kind === "insert") {
        return await this.runInsert(this.mutation.values);
      }
      if (this.mutation?.kind === "update") {
        return await this.runUpdate(this.mutation.values);
      }
      if (this.mutation?.kind === "upsert") {
        return await this.runUpsert(this.mutation.values, this.mutation.onConflict);
      }
      if (this.mutation?.kind === "delete") {
        return await this.runDelete();
      }
      return await this.runSelect();
    } catch (error) {
      return {
        data: null,
        error: toDbError(error),
        count: null,
      };
    }
  }

  private parseSelectColumns(): string {
    if (this.selectColumns.trim() === "*" || !this.selectColumns.trim()) return "*";
    return this.selectColumns
      .split(",")
      .map((part) => quoteIdent(part.trim()))
      .join(", ");
  }

  private returningSql(): string {
    return ` RETURNING ${this.parseSelectColumns()}`;
  }

  private shapeMutationResult(rows: T[]): DbResult<T[] | T | null> {
    const normalized = serializeDbRows(rows);
    if (this.singleMode === "maybe") {
      return { data: (normalized[0] ?? null) as T | null, error: null };
    }
    if (this.singleMode === "single") {
      if (!normalized[0]) return { data: null, error: { message: "No rows found" } };
      return { data: normalized[0] as T, error: null };
    }
    return { data: normalized as T[], error: null };
  }

  private async runSelect(): Promise<DbResult<T[] | T | null>> {
    const params: unknown[] = [];
    const where = buildWhere(this.filters, params);
    const orderSql =
      this.orderBy.length > 0
        ? ` ORDER BY ${this.orderBy
            .map((item) => `${quoteIdent(item.column)} ${item.ascending ? "ASC" : "DESC"}`)
            .join(", ")}`
        : "";
    const limitSql = this.limitCount != null ? ` LIMIT ${Number(this.limitCount)}` : "";

    let count: number | null = null;
    if (this.wantCount) {
      const countResult = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ${quoteIdent(this.table)}${where}`,
        params,
      );
      count = Number(countResult.rows[0]?.count ?? 0);
      if (this.headOnly) {
        return { data: null, error: null, count };
      }
    }

    const selectSql = `SELECT ${this.parseSelectColumns()} FROM ${quoteIdent(this.table)}${where}${orderSql}${limitSql}`;
    const result = await query<T>(selectSql, params);
    const rows = serializeDbRows(result.rows);
    if (this.singleMode === "maybe") {
      return { data: (rows[0] ?? null) as T | null, error: null, count };
    }
    if (this.singleMode === "single") {
      if (!rows[0]) {
        return { data: null, error: { message: "No rows found" }, count };
      }
      return { data: rows[0] as T, error: null, count };
    }
    return { data: rows as T[], error: null, count };
  }

  private async runInsert(
    values: Record<string, unknown> | Record<string, unknown>[],
  ): Promise<DbResult<T[] | T | null>> {
    const rows = Array.isArray(values) ? values : [values];
    if (rows.length === 0) return { data: [], error: null };

    const columns = Object.keys(rows[0]!);
    const params: unknown[] = [];
    const valueGroups = rows.map((row) => {
      const placeholders = columns.map((column) => {
        params.push(row[column]);
        return `$${params.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });

    const sql = `INSERT INTO ${quoteIdent(this.table)} (${columns
      .map(quoteIdent)
      .join(", ")}) VALUES ${valueGroups.join(", ")}${this.returningSql()}`;
    const result = await query<T>(sql, params);
    if (!Array.isArray(values) || this.singleMode !== "none") {
      return this.shapeMutationResult(result.rows);
    }
    return { data: result.rows as T[], error: null };
  }

  private async runUpdate(values: Record<string, unknown>): Promise<DbResult<T[] | T | null>> {
    const columns = Object.keys(values);
    if (columns.length === 0) return { data: null, error: { message: "No columns to update" } };
    const params: unknown[] = [];
    const sets = columns.map((column) => {
      params.push(values[column]);
      return `${quoteIdent(column)} = $${params.length}`;
    });
    const where = buildWhere(this.filters, params);
    const sql = `UPDATE ${quoteIdent(this.table)} SET ${sets.join(", ")}${where}${this.returningSql()}`;
    const result = await query<T>(sql, params);
    return this.shapeMutationResult(result.rows);
  }

  private async runUpsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    onConflict?: string,
  ): Promise<DbResult<T[] | T | null>> {
    const rows = Array.isArray(values) ? values : [values];
    if (rows.length === 0) return { data: [], error: null };
    const columns = Object.keys(rows[0]!);
    const conflictCols = (onConflict ?? columns[0] ?? "id")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const params: unknown[] = [];
    const valueGroups = rows.map((row) => {
      const placeholders = columns.map((column) => {
        params.push(row[column]);
        return `$${params.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    const updates = columns
      .filter((column) => !conflictCols.includes(column))
      .map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`);
    const sql = `INSERT INTO ${quoteIdent(this.table)} (${columns
      .map(quoteIdent)
      .join(", ")}) VALUES ${valueGroups.join(", ")}
      ON CONFLICT (${conflictCols.map(quoteIdent).join(", ")})
      DO UPDATE SET ${updates.length > 0 ? updates.join(", ") : `${quoteIdent(conflictCols[0]!)} = EXCLUDED.${quoteIdent(conflictCols[0]!)}`}
      ${this.returningSql()}`;
    const result = await query<T>(sql, params);
    if (!Array.isArray(values) || this.singleMode !== "none") {
      return this.shapeMutationResult(result.rows);
    }
    return { data: result.rows as T[], error: null };
  }

  private async runDelete(): Promise<DbResult<T[] | T | null>> {
    const params: unknown[] = [];
    const where = buildWhere(this.filters, params);
    if (!where) {
      return { data: null, error: { message: "Refusing delete without filters" } };
    }
    const sql = `DELETE FROM ${quoteIdent(this.table)}${where}${this.returningSql()}`;
    const result = await query<T>(sql, params);
    return this.shapeMutationResult(result.rows);
  }
}

async function rpc(fnName: string, args: Record<string, unknown> = {}): Promise<DbResult<unknown>> {
  try {
    const keys = Object.keys(args);
    const params = keys.map((key) => args[key]);
    const placeholders = keys.map((_, index) => `$${index + 1}`);
    const sql =
      keys.length > 0
        ? `SELECT public.${quoteIdent(fnName)}(${placeholders.join(", ")}) AS result`
        : `SELECT public.${quoteIdent(fnName)}() AS result`;
    const result = await query<{ result: unknown }>(sql, params);
    return { data: result.rows[0]?.result ?? null, error: null };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

export type AppDbClient = {
  from: (table: string) => QueryBuilder;
  rpc: typeof rpc;
  auth: {
    admin: {
      createUser: (input: {
        email: string;
        password: string;
        email_confirm?: boolean;
        user_metadata?: { full_name?: string };
      }) => Promise<DbResult<{ user: { id: string; email: string } }>>;
      deleteUser: (userId: string) => Promise<DbResult<null>>;
    };
  };
};

export function createAppDbClient(): AppDbClient {
  return {
    from: (table: string) => new QueryBuilder(table),
    rpc,
    auth: {
      admin: {
        createUser: async (input) => {
          const { createAuthUser } = await import("@/lib/auth.server");
          try {
            const user = await createAuthUser({
              email: input.email,
              password: input.password,
              fullName: input.user_metadata?.full_name ?? null,
            });
            return { data: { user: { id: user.id, email: user.email } }, error: null };
          } catch (error) {
            return {
              data: null,
              error: { message: error instanceof Error ? error.message : String(error) },
            };
          }
        },
        deleteUser: async (userId) => {
          const { deleteAuthUser } = await import("@/lib/auth.server");
          try {
            await deleteAuthUser(userId);
            return { data: null, error: null };
          } catch (error) {
            return {
              data: null,
              error: { message: error instanceof Error ? error.message : String(error) },
            };
          }
        },
      },
    },
  };
}
