/**
 * The exhaustiveness guard for `switch` statements over unions.
 */

/**
 * Marks a branch the type system proves unreachable (an exhaustive `switch`).
 *
 * @param value - the value that should be `never`
 * @throws Error always — reaching it at run time means a message slipped past its schema
 */
export function assertNever(value: never): never {
  throw new Error(`unexpected value: ${JSON.stringify(value)}`);
}
