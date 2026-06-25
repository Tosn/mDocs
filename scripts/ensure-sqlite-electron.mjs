import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);

// better-sqlite3 is a native module: its install step fetches a binary built
// for the system Node ABI, but Electron ships its own (different) ABI. Without
// a matching binary the app crashes at startup with NODE_MODULE_VERSION
// mismatch. This re-fetches the prebuilt binary for the installed Electron.
function main() {
  let electronVersion;
  try {
    electronVersion = require('electron/package.json').version;
  } catch {
    console.log('[ensure-sqlite-electron] electron not installed, skipping');
    return;
  }

  const bs3Dir = dirname(require.resolve('better-sqlite3/package.json'));
  const prebuildBin = require.resolve('prebuild-install/bin.js', { paths: [bs3Dir] });

  console.log(
    `[ensure-sqlite-electron] fetching better-sqlite3 prebuilt for electron ${electronVersion} (${process.arch})`
  );

  try {
    execFileSync(
      process.execPath,
      [prebuildBin, '-r', 'electron', '-t', electronVersion, '--arch', process.arch],
      { cwd: bs3Dir, stdio: 'inherit' }
    );
    console.log('[ensure-sqlite-electron] done');
  } catch {
    // Do not fail the whole install: `electron-builder install-app-deps` in the
    // dev/preview scripts acts as a fallback rebuild step.
    console.warn(
      '[ensure-sqlite-electron] prebuilt fetch failed; the dev/preview scripts will retry via electron-builder'
    );
  }
}

main();
