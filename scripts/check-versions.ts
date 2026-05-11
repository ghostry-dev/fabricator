/**
 * Each package under `pkg/*` carries its version in both `package.json` and
 * `jsr.json`, with nothing else keeping the two in step — a release that
 * bumps one and not the other would publish mismatched versions to npm and
 * JSR. Run as part of the root `check` script so a desync fails fast.
 */
const pkgRoot = `${import.meta.dir}/../pkg`;

const glob = new Bun.Glob("*/package.json");
const names = [...glob.scanSync({ cwd: pkgRoot })]
  .map((path) => path.split("/")[0]!)
  .sort();

let mismatched = false;

for (const name of names) {
  const [packageJson, jsrJson] = await Promise.all([
    Bun.file(`${pkgRoot}/${name}/package.json`).json(),
    Bun.file(`${pkgRoot}/${name}/jsr.json`).json(),
  ]);

  if (packageJson.version !== jsrJson.version) {
    mismatched = true;
    console.error(
      `pkg/${name}: package.json version "${packageJson.version}" does not match jsr.json version "${jsrJson.version}"`,
    );
  }
}

if (mismatched) {
  process.exit(1);
}

console.log(`Versions in sync across ${names.length} package(s).`);
