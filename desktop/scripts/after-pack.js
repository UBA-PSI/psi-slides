// electron-builder refuses to copy a folder called `node_modules` through
// `extraResources`: the pattern is filtered out before the copy, whatever
// `filter` says, and the engine then lands in the package as eight files
// with nothing behind them. build.js reads the fonts, the KaTeX stylesheet,
// Shiki's WASM and ws out of that tree at run time, so the package is
// useless without it and says so only when somebody opens a lecture.
//
// So the tree is copied here instead. afterPack runs before the macOS
// signing step, which is what makes this the right hook rather than
// afterSign: everything put in place here is inside the signature.
//
// CommonJS on purpose – desktop/package.json declares no type, and
// electron-builder loads this with require().

const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context;
  const source = path.join(__dirname, '..', 'engine', 'node_modules');
  if (!fs.existsSync(source)) {
    throw new Error('engine/node_modules is missing – run `npm run stage-engine` first.');
  }

  const resources = electronPlatformName === 'darwin'
    ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(appOutDir, 'resources');
  const dest = path.join(resources, 'engine', 'node_modules');

  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(source, dest, { recursive: true, dereference: true });

  let bytes = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile()) bytes += fs.statSync(p).size;
    }
  };
  walk(dest);
  console.log(`  • engine dependencies copied  size=${(bytes / (1024 * 1024)).toFixed(1)} MB`);
};
