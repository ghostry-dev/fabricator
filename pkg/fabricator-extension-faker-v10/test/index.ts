/**
 * This package's test surface: `bun:test` wrapped by `@ghostry/harness`, which
 * every test file imports instead of `bun:test` itself.
 *
 * No integrations. Each test builds the fabricator instance it asserts on with
 * `initialize()`, extended with the registry the test is about.
 *
 * @module
 */

import { initialize, type Attest } from "@ghostry/harness";
import * as framework from "bun:test";

const harness = initialize({ framework });

export const { describe, expect, test } = harness;

/**
 * Annotated, because an assertion narrows only through a binding whose type is
 * written out; a destructure never qualifies (TS2775).
 */
export const attest: Attest = harness.attest;
