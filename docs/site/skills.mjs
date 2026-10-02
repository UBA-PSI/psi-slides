/*
 * The Claude skills in `.claude/skills/`, packaged for download from the site.
 *
 * Three jobs, all of them small and all of them deliberately here rather than
 * in build-site.js, because the `skills` gate has to reach them without
 * `npm install`: this file imports nothing but Node.
 *
 *   1. A skill written for this repository names files in it – `build.js`,
 *      `lectures/diagrams/source.md`, `figure-design.md` – and somebody who
 *      downloads only the skill has none of them. `packageSkill` leaves the
 *      text alone and adds two things: a note under the frontmatter saying
 *      what such a path means, and a closing section with the address of every
 *      path the skill names that the repository really tracks. One file the
 *      figures skill sends a reader to first, `figure-design.md`, is bundled
 *      as a reference file instead, because a figure cannot be written without
 *      it. The in-repo skills are not edited, so they keep working for a
 *      contributor whose checkout has every one of those files.
 *   2. `zip` writes a ZIP the way claude.ai asks for one – the skill's folder
 *      at the top level – with a fixed timestamp and sorted entries, so the
 *      same skills give the same bytes. `unzip` reads one back, CRC checked,
 *      which is how the site build checks what it wrote.
 *   3. `skillProblems` holds a SKILL.md to the published limits: `name` up to
 *      64 characters of lowercase letters, digits and hyphens, matching its
 *      folder, without "anthropic" or "claude"; `description` non-empty, up to
 *      1024 characters, no XML tags; and both written so that a strict YAML
 *      parser reads them. A plain scalar carrying ": " is the case that
 *      matters – Claude Code reads it, a strict parser refuses it, and four of
 *      the six descriptions were written that way.
 *
 * Sources: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
 * (field limits), https://claude.com/docs/skills/how-to (the ZIP layout),
 * https://agentskills.io/specification (the name must match its folder).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

export const REPO = 'https://github.com/UBA-PSI/psi-slides';
export const SITE = 'https://uba-psi.github.io/psi-slides/';
export const SKILLS_DIR = '.claude/skills';
export const BUNDLE_ZIP = 'psi-slides-skills.zip';

// Repository files copied into a skill, and the backticked path in the skill's
// text that is rewritten to point at the copy.
export const BUNDLED = {
  'psi-slides-figures': [{ from: 'figure-design.md', to: 'reference/figure-design.md' }],
};

// ── the frontmatter ──────────────────────────────────────────────────────

// The subset of YAML a SKILL.md frontmatter needs: one `key: value` a line,
// the value plain, single-quoted or double-quoted. Anything else is reported
// rather than guessed at, because the point is that every parser agrees.
export function readFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return { fields: {}, problems: ['no frontmatter: the file has to open with ---'] };
  const fields = {};
  const problems = [];
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const kv = /^([a-z][a-z0-9_-]*):(?: (.*))?$/.exec(line);
    if (!kv) { problems.push(`not a single-line key: value pair: ${line.slice(0, 60)}`); continue; }
    const [, key, raw = ''] = kv;
    let value;
    if (raw.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(raw)) { problems.push(`${key}: unterminated single-quoted value`); continue; }
      value = raw.slice(1, -1).replace(/''/g, "'");
    } else if (raw.startsWith('"')) {
      if (!/^"(?:[^"\\]|\\.)*"$/.test(raw)) { problems.push(`${key}: unterminated double-quoted value`); continue; }
      value = JSON.parse(raw);
    } else {
      // A plain scalar: no ": " and no " #" inside, no indicator in front.
      if (/: | #/.test(raw) || /^[-?:,[\]{}#&*!|>%@`]/.test(raw)) {
        problems.push(`${key}: a plain value with ": ", " #" or a leading indicator is not YAML – quote it`);
        continue;
      }
      value = raw;
    }
    fields[key] = value;
  }
  return { fields, problems };
}

export function skillProblems(folder, text) {
  const { fields, problems } = readFrontmatter(text);
  const out = problems.map((p) => `${folder}: ${p}`);
  const { name, description } = fields;
  if (name === undefined) out.push(`${folder}: no name`);
  else {
    if (name.length > 64) out.push(`${folder}: name is ${name.length} characters, the limit is 64`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) out.push(`${folder}: name "${name}" is not lowercase letters, digits and single hyphens`);
    if (/anthropic|claude/.test(name)) out.push(`${folder}: name "${name}" contains a reserved word`);
    if (name !== folder) out.push(`${folder}: name "${name}" does not match its folder`);
  }
  if (description === undefined || !description.trim()) out.push(`${folder}: no description`);
  else {
    const n = [...description].length;
    if (n > 1024) out.push(`${folder}: description is ${n} characters, the limit is 1024`);
    if (/<\/?[A-Za-z][^>]*>/.test(description)) out.push(`${folder}: description contains something read as an XML tag`);
  }
  return out;
}

// ── making a downloaded skill self-contained ─────────────────────────────

// The files the repository tracks, so a path is linked only if the address
// exists for a reader. Git when there is a checkout, the disk otherwise.
export function trackedFiles(root) {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return new Set(out.split('\0').filter(Boolean));
  } catch {
    const set = new Set();
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.git')) continue;
        const rel = dir ? `${dir}/${e.name}` : e.name;
        if (e.isDirectory()) walk(rel); else set.add(rel);
      }
    };
    walk('');
    return set;
  }
}

// A backticked path the repository tracks, as a file or as a folder. A chunk
// anchor (`lectures/diagrams#cbc`) is the folder's.
export function namedPaths(markdown, tracked) {
  const found = new Set();
  const dirs = new Set();
  for (const f of tracked) {
    const parts = f.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  for (const m of markdown.matchAll(/`([^`\s]+)`/g)) {
    const p = m[1].split('#')[0].replace(/\/$/, '');
    if (!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(p)) continue;
    if (tracked.has(p)) found.add(p);
    else if (p.includes('/') && dirs.has(p)) found.add(p + '/');
  }
  return [...found].sort();
}

const NOTE = `> **This copy was packaged for download from the psi-slides site.** A path
> in backticks – \`build.js\`, \`lint.js\`, \`lectures/diagrams/source.md\` –
> names a file in the psi-slides repository, ${REPO}. In a checkout of
> that repository the paths resolve as written; anywhere else, *Files this
> skill names* at the end of this file gives the address of each one.`;

// `views` maps a lecture folder in the repository to the folder the site
// publishes its built views in, so a lecture a skill names can be opened.
export function appendix(paths, views = {}) {
  const lines = paths.map((p) => {
    const dir = p.endsWith('/');
    const url = `${REPO}/${dir ? 'tree' : 'blob'}/main/${dir ? p.slice(0, -1) : p}`;
    const lecture = Object.keys(views).find((from) => p === `${from}/` || p === `${from}/source.md`);
    const built = lecture ? `; built: ${SITE}${views[lecture]}/audience.html` : '';
    return `- \`${p}\`: ${url}${built}`;
  });
  return `\n\n## Files this skill names\n\nPaths are relative to the root of ${REPO}, and each address is the file as it is on \`main\` today, which may be newer than this copy.\n\n${lines.join('\n')}\n`;
}

// The packaged files of one skill: [{ path: '<name>/…', data: Buffer }], sorted.
export function packageSkill({ root, name, tracked, views = {} }) {
  const src = path.join(root, SKILLS_DIR, name);
  const files = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(src, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) walk(rel); else files.set(rel, fs.readFileSync(path.join(src, rel)));
    }
  };
  walk('');
  const bundled = BUNDLED[name] || [];
  for (const { from, to } of bundled) files.set(to, fs.readFileSync(path.join(root, from)));

  const md = [...files.keys()].filter((f) => f.endsWith('.md'));
  for (const f of md) {
    let text = files.get(f).toString('utf8');
    for (const { from, to } of bundled) text = text.split('`' + from + '`').join('`' + to + '`');
    files.set(f, text);
  }
  const named = namedPaths(md.map((f) => files.get(f)).join('\n'), tracked);
  let skill = files.get('SKILL.md');
  const fm = /^---\n[\s\S]*?\n---\n/.exec(skill);
  if (!fm) throw new Error(`${name}/SKILL.md has no frontmatter`);
  skill = fm[0] + '\n' + NOTE + '\n' + skill.slice(fm[0].length).replace(/\n+$/, '') + appendix(named, views);
  files.set('SKILL.md', skill);
  return [...files.keys()].sort().map((f) => ({
    path: `${name}/${f}`,
    data: Buffer.isBuffer(files.get(f)) ? files.get(f) : Buffer.from(files.get(f), 'utf8'),
  }));
}

// ── ZIP, written and read ────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// 1980-01-01 00:00, the earliest time a ZIP can say: no build date in the bytes.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

// `entries` are files; their folders get entries of their own, as `zip -r`
// writes them. Sorted by path, deflated, names flagged as UTF-8.
export function zip(entries) {
  const all = new Map();
  for (const { path: p, data } of entries) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) all.set(parts.slice(0, i).join('/') + '/', null);
    all.set(p, data);
  }
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of [...all.keys()].sort()) {
    const data = all.get(name);
    const dir = data === null;
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = dir ? Buffer.alloc(0) : data;
    const body = dir ? raw : zlib.deflateRawSync(raw, { level: 9 });
    const crc = dir ? 0 : crc32(raw);
    const method = dir ? 0 : 8;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);              // made by: Unix
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE((((dir ? 0o40755 : 0o100644) << 16) | (dir ? 0x10 : 0)) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(all.size, 8);
  end.writeUInt16LE(all.size, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// Reads what `zip` writes: [{ path, data }] for files, folders left out,
// every file inflated and held to its CRC.
export function unzip(buf) {
  const endAt = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0) throw new Error('not a ZIP: no end of central directory');
  const count = buf.readUInt16LE(endAt + 10);
  let p = buf.readUInt32LE(endAt + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('broken central directory');
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const at = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
    const body = buf.subarray(start, start + csize);
    const data = method === 8 ? zlib.inflateRawSync(body) : Buffer.from(body);
    if (crc32(data) !== crc) throw new Error(`${name}: CRC mismatch`);
    out.push({ path: name, data });
  }
  return out;
}

// ── the downloads ────────────────────────────────────────────────────────

export function skillNames(root) {
  return fs.readdirSync(path.join(root, SKILLS_DIR), { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(root, SKILLS_DIR, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
}

// { '<name>.zip': Buffer, …, 'psi-slides-skills.zip': Buffer }
export function buildSkillZips({ root, views = {} }) {
  const tracked = trackedFiles(root);
  const zips = {};
  const every = [];
  for (const name of skillNames(root)) {
    const entries = packageSkill({ root, name, tracked, views });
    zips[`${name}.zip`] = zip(entries);
    every.push(...entries);
  }
  zips[BUNDLE_ZIP] = zip(every);
  return zips;
}
