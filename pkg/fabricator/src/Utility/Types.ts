export type Pretty<$T> = { [$K in keyof $T]: $T[$K] } & {};

export type PlainObject<$T = unknown> = Record<string | symbol, $T>;
