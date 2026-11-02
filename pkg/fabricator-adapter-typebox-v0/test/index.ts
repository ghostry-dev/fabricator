/**
 * This package's test surface: `bun:test` wrapped by `@ghostry/harness`, which
 * every test file imports instead of `bun:test` itself.
 *
 * No integrations. Each test builds the fabricator instance it converts with
 * `initialize()`, since what it asserts on is that instance's schemas.
 *
 * @module
 */

import { initialize } from "@ghostry/harness";
import * as framework from "bun:test";

export const { expect, test } = initialize({ framework });
