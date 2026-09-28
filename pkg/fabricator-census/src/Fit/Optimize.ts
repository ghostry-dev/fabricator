/**
 * The two derivative-free minimizers the fits need. Both scores being minimized
 * — a KS distance and a negative log-likelihood under truncation — are cheap to
 * evaluate and awkward to differentiate, so neither uses a gradient.
 *
 * @module
 */

/** Golden-section search for a minimum of `f` on `[low, high]`. */
export function golden(
  f: (x: number) => number,
  low: number,
  high: number,
  iterations = 60,
): number {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let a = low;
  let b = high;
  let c = b - ratio * (b - a);
  let d = a + ratio * (b - a);
  let fc = f(c);
  let fd = f(d);
  for (let i = 0; i < iterations; i++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - ratio * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + ratio * (b - a);
      fd = f(d);
    }
  }
  return fc < fd ? c : d;
}

/**
 * Nelder–Mead simplex minimization from `start`, with an initial simplex of
 * `step` along each axis. Standard coefficients: reflection 1, expansion 2,
 * contraction ½, shrink ½.
 */
export function nelderMead(
  f: (x: ReadonlyArray<number>) => number,
  start: ReadonlyArray<number>,
  step: ReadonlyArray<number>,
  iterations = 200,
): number[] {
  const n = start.length;
  let simplex = [
    [...start],
    ...start.map((_, i) => start.map((v, j) => (i === j ? v + step[j]! : v))),
  ].map((point) => ({ point, value: f(point) }));

  const combine = (a: number[], b: number[], weight: number) =>
    a.map((v, i) => v + weight * (v - b[i]!));

  for (let iteration = 0; iteration < iterations; iteration++) {
    simplex.sort((a, b) => a.value - b.value);
    const best = simplex[0]!;
    const worst = simplex[n]!;
    const centroid = Array.from(
      { length: n },
      (_, i) =>
        simplex.slice(0, n).reduce((sum, v) => sum + v.point[i]!, 0) / n,
    );

    const reflected = combine(centroid, worst.point, 1);
    const reflectedValue = f(reflected);
    if (reflectedValue < best.value) {
      const expanded = combine(centroid, worst.point, 2);
      const expandedValue = f(expanded);
      simplex[n] =
        expandedValue < reflectedValue
          ? { point: expanded, value: expandedValue }
          : { point: reflected, value: reflectedValue };
      continue;
    }
    if (reflectedValue < simplex[n - 1]!.value) {
      simplex[n] = { point: reflected, value: reflectedValue };
      continue;
    }
    const contracted = combine(centroid, worst.point, -0.5);
    const contractedValue = f(contracted);
    if (contractedValue < worst.value) {
      simplex[n] = { point: contracted, value: contractedValue };
      continue;
    }
    simplex = simplex.map(({ point }, i) => {
      if (i === 0) return simplex[0]!;
      const shrunk = point.map(
        (v, j) => best.point[j]! + 0.5 * (v - best.point[j]!),
      );
      return { point: shrunk, value: f(shrunk) };
    });
  }
  simplex.sort((a, b) => a.value - b.value);
  return simplex[0]!.point;
}
