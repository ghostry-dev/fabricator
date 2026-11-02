/**
 * This package's test surface: `bun:test` wrapped by `@ghostry/harness`, which
 * every test file imports instead of `bun:test` itself.
 *
 * No integrations. Fabricator is the subject under test here, not a source of
 * fixtures, so each test builds the instance it asserts on with `initialize()`.
 * Composing `integration()` around every test would also mean a regression in
 * it fails the whole suite rather than the tests that cover it
 * (`Harnessing.test.ts`).
 *
 * @module
 */

import { initialize, type Attest } from "@ghostry/harness";
import * as framework from "bun:test";

const harness = initialize({ framework });

export const { afterEach, describe, expect, test } = harness;

/**
 * Annotated, because an assertion narrows only through a binding whose type is
 * written out; a destructure never qualifies (TS2775).
 */
export const attest: Attest = harness.attest;
