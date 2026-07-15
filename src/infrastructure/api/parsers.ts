/**
 * Response parsers: zod schemas that decode the API's `{ code, data }`
 * envelope into the domain types of `ports/api-gateway.ts`. A
 * wrong-shape payload degrades to a typed `upstream` error instead of
 * a crash.
 */

import { z } from "zod";

import type {
  ApiError,
  FilterValue,
  ReportListItem,
  ReportSchema,
  ShareCreated,
  StatCompare,
  StatDataResult,
  StatField,
  StatFieldCatalog,
  StatFilter,
} from "../../domain/ports/api-gateway.js";
import { err, ok, type Result } from "../../shared/result.js";

const EnvelopeSchema = z.object({ data: z.unknown() }).passthrough();

/** Unwrap the `{ code, data }` envelope; returns the inner `data`. */
export function unwrapEnvelope(body: unknown): Result<unknown, ApiError> {
  const parsed = EnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return err({ kind: "upstream", message: "API returned an unexpected response shape." });
  }
  return ok(parsed.data.data);
}

function parseWith<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  data: unknown,
  what: string
): Result<T, ApiError> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return err({ kind: "upstream", message: `API returned an unexpected ${what} payload.` });
  }
  return ok(parsed.data);
}

const StatFieldSchema: z.ZodType<StatField, z.ZodTypeDef, unknown> = z
  .object({ id: z.string(), filterType: z.string().optional() })
  .transform(
    (f): StatField =>
      f.filterType !== undefined ? { id: f.id, filterType: f.filterType } : { id: f.id }
  );

const CatalogSchema: z.ZodType<StatFieldCatalog, z.ZodTypeDef, unknown> = z.object({
  groups: z.record(z.array(StatFieldSchema)),
  metrics: z.record(z.array(StatFieldSchema)),
});

export function parseStatFieldCatalog(data: unknown): Result<StatFieldCatalog, ApiError> {
  return parseWith(CatalogSchema, data, "field catalog");
}

const StatCellSchema = z
  .object({
    rawValue: z.unknown().optional(),
    value: z.unknown().optional(),
    diff: z.unknown().optional(),
    percent: z.unknown().optional(),
    compare_value: z.unknown().optional(),
  })
  .passthrough();

const StatDataSchema = z.object({
  rows: z.array(z.record(StatCellSchema)),
  total: z.record(StatCellSchema).optional(),
  totalRows: z.coerce.number(),
  page: z.coerce.number(),
  perPage: z.coerce.number(),
});

export function parseStatData(data: unknown): Result<StatDataResult, ApiError> {
  return parseWith(StatDataSchema as z.ZodType<StatDataResult>, data, "statistics");
}

/** Accepts string or number, always yields string — never `undefined`. */
const StringishSchema = z.union([z.string(), z.number()]).transform((v) => String(v));

const FilterValueSchema: z.ZodType<FilterValue> = z.lazy(() =>
  z
    .object({
      id: StringishSchema,
      label: StringishSchema,
      children: z.array(FilterValueSchema).optional(),
    })
    .transform((v) => ({
      id: v.id,
      label: v.label,
      ...(v.children !== undefined ? { children: v.children } : {}),
    }))
) as z.ZodType<FilterValue>;

const FilterItemsSchema = z.object({ items: z.array(FilterValueSchema) });

export function parseFilterValues(data: unknown): Result<readonly FilterValue[], ApiError> {
  const parsed = parseWith(FilterItemsSchema, data, "filter values");
  if (parsed.isErr()) return err(parsed.error);
  return ok(parsed.value.items);
}

const ReportListSchema = z.object({
  items: z.array(
    z.object({ id: z.coerce.number(), name: StringishSchema, type: StringishSchema }).passthrough()
  ),
});

export function parseReportList(data: unknown): Result<readonly ReportListItem[], ApiError> {
  const parsed = parseWith(ReportListSchema, data, "report list");
  if (parsed.isErr()) return err(parsed.error);
  return ok(parsed.value.items.map((i) => ({ id: i.id, name: i.name, type: i.type })));
}

const SortSchema = z.record(z.enum(["ASC", "DESC"]));

const ReportSchemaSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    name: z.string().nullish(),
    groups: z.array(z.string()).optional(),
    metrics: z.array(z.string()).optional(),
    filters: z
      .object({
        dateFrom: z.string().nullish(),
        dateTo: z.string().nullish(),
        period: z.string().nullish(),
        timezone: z.coerce.number().nullish(),
        filters: z.array(z.unknown()).nullish(),
      })
      .passthrough()
      .optional(),
    compare: z.unknown().optional(),
    sort: SortSchema.nullish(),
  })
  .passthrough();

export function parseReportSchema(data: unknown): Result<ReportSchema, ApiError> {
  const parsed = parseWith(ReportSchemaSchema, data, "report");
  if (parsed.isErr()) return err(parsed.error);
  const r = parsed.value;
  const f = r.filters ?? {};
  return ok({
    ...(r.id !== undefined ? { id: r.id } : {}),
    ...(r.name !== null && r.name !== undefined ? { name: r.name } : {}),
    groups: r.groups ?? [],
    metrics: r.metrics ?? [],
    filters: {
      ...(typeof f.dateFrom === "string" ? { dateFrom: f.dateFrom } : {}),
      ...(typeof f.dateTo === "string" ? { dateTo: f.dateTo } : {}),
      ...(typeof f.period === "string" ? { period: f.period } : {}),
      ...(typeof f.timezone === "number" ? { timezone: f.timezone } : {}),
      ...(Array.isArray(f.filters) ? { filters: f.filters as readonly StatFilter[] } : {}),
    },
    ...(r.compare !== undefined ? { compare: r.compare as StatCompare | null } : {}),
    ...(r.sort !== null && r.sort !== undefined ? { sort: r.sort } : {}),
  });
}

const SavedReportSchema = z.object({ id: z.coerce.number() }).passthrough();

export function parseSavedReport(data: unknown): Result<{ readonly id: number }, ApiError> {
  const parsed = parseWith(SavedReportSchema, data, "saved report");
  if (parsed.isErr()) return err(parsed.error);
  return ok({ id: parsed.value.id });
}

const DeleteResultSchema = z
  .object({ result: z.union([z.boolean(), z.number()]).transform((v) => Boolean(v)) })
  .passthrough();

export function parseDeleteResult(data: unknown): Result<{ readonly deleted: boolean }, ApiError> {
  const parsed = parseWith(DeleteResultSchema, data, "delete result");
  if (parsed.isErr()) return err(parsed.error);
  return ok({ deleted: parsed.value.result });
}

const ShareCreatedSchema = z
  .object({ id: StringishSchema, limited: z.boolean().optional() })
  .passthrough();

export function parseShareCreated(data: unknown): Result<ShareCreated, ApiError> {
  const parsed = parseWith(ShareCreatedSchema, data, "share result");
  if (parsed.isErr()) return err(parsed.error);
  return ok({ key: parsed.value.id, limited: parsed.value.limited ?? false });
}
