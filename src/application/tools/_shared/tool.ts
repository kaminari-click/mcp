/**
 * The `Tool<Shape, Output>` contract. Every file under
 * `application/tools/<domain>/*.tool.ts` exports exactly one `Tool`.
 *
 * Handlers receive `(input, ctx)` and return `Result<Output, ToolError>`.
 * They MUST NOT throw and MUST NOT touch globals — `ctx` is the only
 * seam to the outside world.
 */

import type { z } from "zod";

import type { Result } from "../../../shared/result.js";
import type { ToolContext } from "./tool-context.js";
import type { ToolError } from "./tool-result.js";

/**
 * MCP behaviour hints — clients use them to decide UX (read-only tools
 * run without confirmation, destructive tools always prompt).
 */
export interface ToolAnnotations {
  /** Human-readable label distinct from the snake_case `name`. */
  readonly title: string;
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  /** Always false here — tools only reach the caller's own account. */
  readonly openWorldHint: boolean;
}

export interface Tool<TShape extends z.ZodRawShape, Output> {
  readonly name: string;
  /** Agent-facing description: 1-2 compact, action-oriented sentences. */
  readonly description: string;
  readonly annotations: ToolAnnotations;
  /** Every field must carry `.describe()` text. */
  readonly inputSchema: z.ZodObject<TShape>;
  readonly handler: (
    input: z.infer<z.ZodObject<TShape>>,
    ctx: ToolContext
  ) => Promise<Result<Output, ToolError>>;
}

/** Transport-supplied callback used by the registry to wire tools. */
export type RegisterTool = <TShape extends z.ZodRawShape, Output>(
  tool: Tool<TShape, Output>
) => void;
