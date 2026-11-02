/**
 * This package's test surface: `bun:test` wrapped by `@ghostry/harness`, which
 * every test file imports instead of `bun:test` itself.
 *
 * No integrations. A census reads plain values, and the tests that fabricate
 * them (`Fit.test.ts`, `RoundTrip.test.ts`) build their own instance with a
 * pinned salt so the parameters they recover are fixed.
 *
 * @module
 */

import { initialize } from "@ghostry/harness";
import * as framework from "bun:test";

export const { beforeAll, describe, expect, test } = initialize({ framework });
