/**
 * `@ghostry/fabricator-census/postgres` — builders for the PostgreSQL queries a
 * census is fed from: catalog estimates and statistics, sampling, and
 * whole-table pushdown aggregates. Every builder returns query text, its
 * parameters, and a parser for the rows; none of them opens a connection. The
 * caller runs each query with their own driver.
 *
 * @module
 */

export {};
