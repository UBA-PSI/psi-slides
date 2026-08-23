/*
 * The same measurement, over the lecture that has thirty-six figures in it.
 *
 * `figure-framing.mjs` names one lecture, and while it was the only one that
 * carried diagrams that was the same thing as "every figure". It is not any
 * more, and the gap showed: each of the six people who authored a chapter of
 * lectures/network-security wrote their own copy of this check because the
 * spec could not be pointed at their work. Six hand-rolled copies of a
 * measurement is how a measurement stops being one.
 *
 * So the body moves next door and this file supplies the lecture. It is worth
 * a second spec rather than a loop inside the first because the runner builds
 * and serves per lecture, and both are named in the export.
 */
export { run } from './figure-framing.mjs';
export const name = 'figure framing · network-security';
export const lecture = 'network-security';
export const view = 'audience';
