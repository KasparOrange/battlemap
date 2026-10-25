/**
 * Fails when `shared/src/generated/schema.json` is stale (a valibot schema changed and
 * `bun run schema` wasn't run). Not part of the black-box suite: runs without a server.
 * The Rust side has its own check for `shared/src/generated/server.ts` (`cargo test`).
 */
import { expect, test } from 'bun:test';
import { buildSchema, SCHEMA_PATH } from './scripts/schema.ts';

test('shared/src/generated/schema.json matches the valibot schemas (run `bun run schema` in server-contract)', async () => {
  expect(await Bun.file(SCHEMA_PATH).text()).toBe(buildSchema());
});
