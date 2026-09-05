// The three pure functions of the process manager: how a pipe becomes lines,
// how a line becomes an event or a log entry, and how an event becomes the
// state the window renders. None of it needs Electron, a child process or a
// clock, which is why it is testable at all.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { splitLines, classifyLine, reduceState, initialState } = require('../main/builder.js');

test('splitLines keeps a partial line for the next chunk', () => {
  const a = splitLines('', '{"type":"build-st');
  assert.deepEqual(a.lines, []);
  assert.equal(a.rest, '{"type":"build-st');
  const b = splitLines(a.rest, 'art","reason":"initial"}\nWatching x\n');
  assert.deepEqual(b.lines, ['{"type":"build-start","reason":"initial"}', 'Watching x']);
  assert.equal(b.rest, '');
});

test('splitLines strips a trailing carriage return', () => {
  const { lines } = splitLines('', 'one\r\ntwo\r\n');
  assert.deepEqual(lines, ['one', 'two']);
});

test('classifyLine tells an event from a log line', () => {
  const e = classifyLine('{"type":"build-success","views":["print"]}');
  assert.equal(e.kind, 'event');
  assert.equal(e.event.type, 'build-success');

  assert.equal(classifyLine('[fonts] IBM Plex Sans, 3 faces').kind, 'log');
  // A line that merely starts with a brace is not an event, and neither is a
  // truncated one: both stay readable in the build details rather than
  // becoming a half-applied state change.
  assert.equal(classifyLine('{ a note in braces }').kind, 'log');
  assert.equal(classifyLine('{"type":"build-suc').kind, 'log');
  assert.equal(classifyLine('{"kind":"other"}').kind, 'log');
});

test('starting to building to ready', () => {
  let s = { ...initialState(), phase: 'starting' };
  s = reduceState(s, { type: 'build-start', reason: 'initial' });
  assert.equal(s.phase, 'building');
  s = reduceState(s, {
    type: 'build-success', views: ['print', 'print-notes', 'audience', 'speaker'],
    durationMs: 412, shape: '3 columns, 12 chunks', embeds: 0,
  }, 1000);
  assert.equal(s.phase, 'ready');
  assert.equal(s.lastSuccess.at, 1000);
  assert.equal(s.lastSuccess.durationMs, 412);
  assert.deepEqual(s.lastSuccess.views, ['print', 'print-notes', 'audience', 'speaker']);
  assert.equal(s.lastError, null);
});

test('a failed build keeps the last successful one', () => {
  let s = reduceState({ ...initialState(), phase: 'building' },
    { type: 'build-success', views: ['audience'], durationMs: 10 }, 1000);
  s = reduceState(s, { type: 'build-start', reason: 'change' });
  s = reduceState(s, {
    type: 'build-error', message: 'unknown class .wide2', userFacing: true, stack: null,
  }, 2000);
  assert.equal(s.phase, 'build-error');
  assert.equal(s.lastError.message, 'unknown class .wide2');
  assert.equal(s.lastError.userFacing, true);
  // The promise the interface makes when it says the views still show the
  // last good build.
  assert.equal(s.lastSuccess.at, 1000);
  assert.deepEqual(s.lastSuccess.views, ['audience']);
});

test('a defect carries its stack, an author error does not', () => {
  const s = reduceState(initialState(),
    { type: 'build-error', message: 'x is not a function', userFacing: false, stack: 'at foo' }, 5);
  assert.equal(s.lastError.userFacing, false);
  assert.equal(s.lastError.stack, 'at foo');
});

test('changed sets the flag and a success clears it', () => {
  let s = reduceState(initialState(), { type: 'changed' });
  assert.equal(s.changedSinceBuild, true);
  s = reduceState(s, { type: 'build-success', views: ['audience'], durationMs: 1 }, 3);
  assert.equal(s.changedSinceBuild, false);
});

test('watching names the project and auto follows the command', () => {
  let s = reduceState(initialState(), { type: 'watching', source: '/a/b/source.md', dir: '/a/b', auto: true });
  assert.equal(s.source, '/a/b/source.md');
  assert.equal(s.name, 'b');
  s = reduceState(s, { type: 'auto', enabled: false });
  assert.equal(s.auto, false);
});

test('serving carries the address', () => {
  const s = reduceState(initialState(), { type: 'serving', url: 'http://localhost:51234' });
  assert.equal(s.serve.enabled, true);
  assert.equal(s.serve.url, 'http://localhost:51234');
});

test('a watch error is a process error, not a build error', () => {
  const s = reduceState({ ...initialState(), phase: 'building' },
    { type: 'watch-error', message: 'EADDRINUSE' }, 9);
  assert.equal(s.phase, 'process-error');
  assert.equal(s.lastError.message, 'EADDRINUSE');
});

test('patch, asset and anything unknown leave the state alone', () => {
  const before = initialState();
  assert.equal(reduceState(before, { type: 'patch', chunk: 'intro', delta: 12 }), before);
  assert.equal(reduceState(before, { type: 'asset', file: 'x.png', bytes: 1 }), before);
  assert.equal(reduceState(before, { type: 'something-newer' }), before);
});
