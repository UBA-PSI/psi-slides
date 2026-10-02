/*
 * The Claude skills in `.claude/skills/`, as the site publishes them.
 *
 * `docs/site/skills.mjs` packages each skill as a ZIP for download, and two
 * things can go wrong there without anything else noticing. A SKILL.md can
 * stop meeting the published limits – a description over 1024 characters, a
 * `name` that is not its folder's, or a plain YAML value with ": " in it,
 * which Claude Code reads and a strict parser refuses; four of the six were
 * written that way when the downloads were added. And the packaging can lose
 * what makes a downloaded skill usable away from this repository: the note
 * saying what a path means, the list of addresses, the bundled
 * `figure-design.md`, a ZIP with the skill's folder at its top level.
 *
 * The site build runs the same checks on the files it writes, with a real
 * YAML parser on top. This gate is the half that needs no `npm install`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';
import {
  readFrontmatter, skillProblems, namedPaths, packageSkill, trackedFiles,
  zip, unzip, crc32, skillNames, buildSkillZips, BUNDLE_ZIP, BUNDLED, REPO,
} from '../../docs/site/skills.mjs';

export const name = 'skills: the downloads meet the published limits and stand alone';

export async function run({ report }) {
  const { ok } = report;

  // ── the six in the repository ──────────────────────────────────────
  const names = skillNames(ROOT);
  ok(names.length === 6, 'six skills in .claude/skills', names.join(', '));
  for (const n of names) {
    const problems = skillProblems(n, fs.readFileSync(path.join(ROOT, '.claude/skills', n, 'SKILL.md'), 'utf8'));
    ok(problems.length === 0, `${n}: name and description within the published limits`, problems.join('; '));
  }

  // ── the frontmatter reader ─────────────────────────────────────────
  const fm = (d) => `---\nname: psi-x\ndescription: ${d}\n---\nbody\n`;
  ok(readFrontmatter(fm('Write a source.md – the type: Heading form')).problems.length === 1,
     'a plain value carrying ": " is refused, as a strict YAML parser refuses it');
  ok(readFrontmatter(fm("'the editor''s contract: one form'")).fields.description === "the editor's contract: one form",
     'a single-quoted value is read, with its doubled quote');
  ok(readFrontmatter(fm('"a \\"quoted\\" word"')).fields.description === 'a "quoted" word',
     'a double-quoted value is read');
  ok(skillProblems('psi-x', fm(`'${'x'.repeat(1025)}'`)).some((p) => /1025 characters/.test(p)),
     'a description over 1024 characters is reported');
  ok(skillProblems('psi-x', fm("'::: embed <url> for a video'")).some((p) => /XML tag/.test(p)),
     'a description with something read as an XML tag is reported');
  ok(skillProblems('psi-y', fm("'ok'")).some((p) => /does not match its folder/.test(p)),
     'a name that is not its folder is reported');
  ok(skillProblems('claude-x', '---\nname: claude-x\ndescription: ok\n---\n').some((p) => /reserved/.test(p)),
     'a name with a reserved word is reported');

  // ── which paths a skill names ──────────────────────────────────────
  const tracked = new Set(['build.js', 'lectures/diagrams/source.md', 'docs/a.md']);
  const named = namedPaths('`build.js`, `lectures/diagrams#cbc`, `missing.md`, `lectures/*/x.jsonl`, `docs/a.md` and `source.md`', tracked);
  ok(JSON.stringify(named) === JSON.stringify(['build.js', 'docs/a.md', 'lectures/diagrams/']),
     'a tracked file and a tracked folder are named; an untracked path, a glob and a bare file name are not', JSON.stringify(named));

  // ── one packaged skill ─────────────────────────────────────────────
  const files = packageSkill({
    root: ROOT, name: 'psi-slides-figures', tracked: trackedFiles(ROOT),
    views: { 'lectures/diagrams': 'diagrams' },
  });
  const paths = files.map((f) => f.path);
  ok(paths.every((p) => p.startsWith('psi-slides-figures/')), 'every packaged file sits in the skill\'s folder', paths.join(', '));
  const skill = files.find((f) => f.path === 'psi-slides-figures/SKILL.md').data.toString('utf8');
  ok(skillProblems('psi-slides-figures', skill).length === 0, 'the packaged SKILL.md still meets the limits');
  ok(/^---\n[\s\S]*?\n---\n\n> \*\*This copy was packaged for download/.test(skill),
     'the note on what a path means stands right under the frontmatter');
  ok(skill.includes(`- \`build.js\`: ${REPO}/blob/main/build.js`), 'a named file is listed with its address');
  ok(/- `lectures\/diagrams\/`: \S+\/tree\/main\/lectures\/diagrams; built: \S+\/diagrams\/audience\.html/.test(skill),
     'a named lecture is listed with its folder and its built view');
  const [bundle] = BUNDLED['psi-slides-figures'];
  const copy = files.find((f) => f.path === `psi-slides-figures/${bundle.to}`);
  ok(copy && copy.data.equals(fs.readFileSync(path.join(ROOT, bundle.from))), `${bundle.from} is bundled as ${bundle.to}, unchanged`);
  ok(!skill.includes('`' + bundle.from + '`') && skill.includes('`' + bundle.to + '`'),
     'and the skill points at the bundled copy rather than the repository file');
  const source = fs.readFileSync(path.join(ROOT, '.claude/skills/psi-slides-figures/SKILL.md'), 'utf8');
  ok(source.includes('`' + bundle.from + '`') && !source.includes('Files this skill names'),
     'the skill in the repository is left as it was');

  // ── the ZIP ────────────────────────────────────────────────────────
  ok(crc32(Buffer.from('123456789')) === 0xcbf43926, 'crc32 gives the check value');
  const a = zip(files);
  const b = zip([...files].reverse());
  ok(a.equals(b), 'the same files give the same bytes, in whatever order they come');
  const back = unzip(a);
  ok(back.length === files.length && back.every((f, i) => f.path === files[i].path && f.data.equals(files[i].data)),
     'what is written reads back, every file inflated and CRC checked');
  ok(a.includes(Buffer.from('psi-slides-figures/reference/')), 'folders get entries of their own, as zip -r writes them');

  const zips = buildSkillZips({ root: ROOT });
  ok(Object.keys(zips).length === names.length + 1, 'one ZIP per skill and one with all of them', Object.keys(zips).join(', '));
  const all = unzip(zips[BUNDLE_ZIP]).map((f) => f.path);
  ok(names.every((n) => all.includes(`${n}/SKILL.md`)), `${BUNDLE_ZIP} holds every skill's folder at its top level`);
  ok(buildSkillZips({ root: ROOT })[BUNDLE_ZIP].equals(zips[BUNDLE_ZIP]), 'and a second build gives the same bytes');
}
