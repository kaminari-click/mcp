/**
 * Re-export of `neverthrow` Result types and constructors. Importing
 * from this barrel (rather than directly from `neverthrow`) keeps a
 * single seam if the library is ever swapped.
 *
 * Domain and application code uses `Result<T, E>` for expected errors.
 * Throwing is reserved for programmer errors. The transport layer is
 * the only place an `Err` is mapped to an MCP error envelope.
 */

export { type Err, err, type Ok, ok, Result } from "neverthrow";
