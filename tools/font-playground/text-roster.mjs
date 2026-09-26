// The nine text-role faces of `BUNDLED_FONTS`, read out of `build.js` as text.
//
// `build.js` calls `main()` at module scope, so it cannot be imported – the
// same reason `test/gates/frontmatter.mjs` reads it with a regex rather than
// an `import`. A hand-copied table beside the roster would be the alternative,
// and it is the alternative this file exists to avoid: the measuring script
// and the gate that checks its numbers would then both have to be edited on
// the day a face is added, and the day one of them is not is the day a face
// ships with a guessed x-height.
//
// Zero dependencies and nothing but `node:fs` – a gate has to run on a bare
// checkout with no `npm install`, so this file is held to the same rule
// `diagram-core.mjs` and `tails.mjs` are.
import fs from 'node:fs';

export const TEXT_ROLES = ['serif', 'sans', 'mono'];

const str = (body, key) => {
  const m = body.match(new RegExp(`\\b${key}:\\s*(['"])(.*?)\\1`));
  return m ? m[2] : null;
};

/**
 * @param {string} buildJsPath  absolute path of build.js
 * @returns {{family, role, pkg, variable, normal, italic, variations, xHeight}[]}
 *   one entry per text-role face, in roster order. `xHeight` is null when the
 *   entry carries none, which is what the gate reports on.
 */
export function readTextFaces(buildJsPath) {
  const src = fs.readFileSync(buildJsPath, 'utf8');
  const start = src.indexOf('const BUNDLED_FONTS = {');
  if (start < 0) throw new Error('BUNDLED_FONTS not found in ' + buildJsPath);
  // The display half of the roster is a different kind of entry – static
  // cuts, a `files` array, a measured `sizeAdjust` – and none of it is a text
  // face, so the scan stops at its banner rather than filtering afterwards.
  const end = src.indexOf('// ── the display role ──', start);
  const block = src.slice(start, end < 0 ? src.length : end);

  const out = [];
  // An entry opens at indentation 2 with a family name (quoted when it has a
  // space) and closes at the same indentation. Comments sit at indentation 2
  // too but never match `name: {`.
  const re = /^ {2}('([^']+)'|[A-Za-z][\w]*): \{\n([\s\S]*?)^ {2}\},$/gm;
  for (const m of block.matchAll(re)) {
    const family = m[2] || m[1];
    const body = m[3];
    const role = str(body, 'role');
    if (!TEXT_ROLES.includes(role)) continue;
    const xm = body.match(/\bxHeight:\s*([0-9.]+)/);
    const files = body.match(/files:\s*\{([^}]*)\}/);
    out.push({
      family, role,
      pkg: str(body, 'pkg'),
      variable: /\bvariable:\s*true/.test(body),
      normal: files ? str(files[1], 'normal') : null,
      italic: files ? str(files[1], 'italic') : null,
      // A named instance pinned in the @font-face descriptor, e.g. Noto Sans
      // Mono Condensed's `'wdth' 62.5`. Measured with it, because that is
      // what ships.
      variations: str(body, 'variations'),
      xHeight: xm ? Number(xm[1]) : null,
    });
  }
  return out;
}
