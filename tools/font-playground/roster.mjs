// The display faces, and nothing about them a package can answer for itself.
// Family, licence, attribution and subsets are read from each package's own
// metadata.json at generation time; what is decided here is the four things
// that are judgements rather than facts.
//
//   file     which FILE of the package is the one face a display role embeds.
//            A variable family ships one per axis set - Fraunces alone had
//            six - and only one of them is the axis a title line varies on.
//   flavour  the three the brief named: a hand, a machine, a poster.
//   kind     what the face IS, which is a different question from what it
//            looks like. It drives ONE rule and is the reason the field
//            exists: a display serif over a serif body reads as one typeface
//            set badly rather than as two. So `kind` pairs, `flavour` sorts.
//            Chakra Petch is the case that proves they are two fields - it
//            is a machine to look at and a sans to pair with.
//   scale    a measured multiplier on the headline size. See below.
//
// LICENCE: OFL-1.1 only. Three candidates were cut for being Apache-2.0
// (Permanent Marker, Rock Salt, Just Another Hand) - not because the licence
// forbids embedding, it does not, but because bundledFaces() emits OFL text
// with the faces and a second licence regime in that path buys one typeface
// at the price of a special case. Caveat Brush is the loud marker instead.
//
// SCALE: these faces disagree about width by a factor of three, and the
// cover's type size is tuned for the body serif. Anton set at it looks timid;
// Press Start 2P set at it runs off the slide, which is what it did in the
// playground before this field existed. So each face carries a multiplier
// measured in a browser - the advance width of a reference string against
// Literata's, clamped to [0.55, 1.45] - rather than guessed at. Re-measure
// with `node measure-scale.mjs` when a face is added. Same discipline as
// dgCharW in diagram-core.mjs, and for the same reason: a number nobody
// measured is a number that silently overflows a slide.
export const FLAVOURS = {
  hand:    'Handwritten – a line that was drawn rather than set',
  machine: 'Machine – pixel grids, terminals, exaggerated monospace',
  graphic: 'Graphic – display weight, loud serifs, poster type',
};
// Which body role a display face must NOT be paired with. hand and mono
// pair with anything, which is why they are absent rather than listed.
export const CLASHES = { serif: 'serif', sans: 'sans' };

export const CANDIDATES = [
  // ── hand ── pairs with anything ───────────────────────────────────
  { pkg: '@fontsource-variable/caveat', file: 'caveat-latin-wght-normal.woff2',
    flavour: 'hand', kind: 'hand', variable: true, weight: '400 700',
    note: 'A ballpoint note. The one hand face with a weight axis, so a heading can be pressed harder than a subtitle.' },
  { pkg: '@fontsource-variable/shantell-sans', file: 'shantell-sans-latin-wght-normal.woff2',
    flavour: 'hand', kind: 'hand', variable: true, weight: '300 800',
    note: 'Marker-drawn but built as a text face: it holds a two-line title where the looser hands fall apart.' },
  { pkg: '@fontsource/caveat-brush', file: 'caveat-brush-latin-400-normal.woff2',
    flavour: 'hand', kind: 'hand', weight: '400',
    note: 'The loud hand of the set – a brush pen at speed. One volume only, and the volume is high.' },
  { pkg: '@fontsource/patrick-hand', file: 'patrick-hand-latin-400-normal.woff2',
    flavour: 'hand', kind: 'hand', weight: '400',
    note: 'The tidiest hand here – a neat person writing on a whiteboard, not a scrawl.' },
  { pkg: '@fontsource/kalam', file: 'kalam-latin-700-normal.woff2',
    flavour: 'hand', kind: 'hand', weight: '700',
    note: 'A brush-pen hand with real weight – the bold cut, because 400 is too thin to carry a divider.' },
  { pkg: '@fontsource/amatic-sc', file: 'amatic-sc-latin-700-normal.woff2',
    flavour: 'hand', kind: 'hand', weight: '700',
    note: 'Very tall, very narrow capitals. Fits a long title where no other hand does, and is nearly weightless.' },

  // ── machine ── pairs with anything ────────────────────────────────
  { pkg: '@fontsource/press-start-2p', file: 'press-start-2p-latin-400-normal.woff2',
    flavour: 'machine', kind: 'mono', weight: '400',
    note: 'An arcade cabinet. Twice the width of anything else here – three words is a full line.' },
  { pkg: '@fontsource/silkscreen', file: 'silkscreen-latin-700-normal.woff2',
    flavour: 'machine', kind: 'mono', weight: '700',
    note: 'A finer pixel grid than Press Start, and it sets far shorter – the bitmap face a real title fits in.' },
  { pkg: '@fontsource-variable/pixelify-sans', file: 'pixelify-sans-latin-wght-normal.woff2',
    flavour: 'machine', kind: 'sans', variable: true, weight: '400 700',
    note: 'Pixels with a weight axis, and proportional rather than gridded. The readable end of the pixel idea.' },
  { pkg: '@fontsource/vt323', file: 'vt323-latin-400-normal.woff2',
    flavour: 'machine', kind: 'mono', weight: '400',
    note: 'A DEC VT320 terminal, phosphor and all. Pairs with the terminal-amber and terminal-green themes.' },
  { pkg: '@fontsource/space-mono', file: 'space-mono-latin-700-normal.woff2',
    flavour: 'machine', kind: 'mono', weight: '700',
    note: 'A monospace with an attitude – the bold cut is a display face rather than a code face.' },
  { pkg: '@fontsource/rubik-mono-one', file: 'rubik-mono-one-latin-400-normal.woff2',
    flavour: 'machine', kind: 'mono', weight: '400',
    // Verified by eye against a Times fallback, not just by the probe: the
    // eszett is drawn by the fallback, and it also draws lowercase as caps.
    noEszett: true,
    note: 'A monospace at poster weight, and the one face here with NO \u00df \u2013 a German title gets a fallback glyph mid-word. Lowercase draws as capitals.' },
  { pkg: '@fontsource/chakra-petch', file: 'chakra-petch-latin-700-normal.woff2',
    flavour: 'machine', kind: 'sans', weight: '700',
    note: 'Cut corners and squared bowls: technical without being a terminal. Sets tighter than any mono here.' },
  { pkg: '@fontsource-variable/orbitron', file: 'orbitron-latin-wght-normal.woff2',
    flavour: 'machine', kind: 'sans', variable: true, weight: '400 900',
    note: 'Geometric and square – the one that reads as a machine rather than as a computer.' },

  // ── graphic, serif ── pair with a SANS body ───────────────────────
  { pkg: '@fontsource-variable/bodoni-moda', file: 'bodoni-moda-latin-wght-normal.woff2',
    flavour: 'graphic', kind: 'serif', variable: true, weight: '400 900',
    note: 'A true didone with a weight axis: a hairline eyebrow over a black headline out of one family.' },
  { pkg: '@fontsource/prata', file: 'prata-latin-400-normal.woff2',
    flavour: 'graphic', kind: 'serif', weight: '400',
    note: 'A quiet didone – the restrained answer where Bodoni is the theatrical one.' },
  { pkg: '@fontsource/dm-serif-display', file: 'dm-serif-display-latin-400-normal.woff2',
    flavour: 'graphic', kind: 'serif', weight: '400',
    note: 'The dependable display serif: high contrast, tight fit, no mannerisms. Start here if unsure.' },
  { pkg: '@fontsource/abril-fatface', file: 'abril-fatface-latin-400-normal.woff2',
    flavour: 'graphic', kind: 'serif', weight: '400',
    note: 'A fat didone: hairlines against very thick stems. Handsome on paper; watch the hairlines on a weak lamp.' },
  { pkg: '@fontsource/alfa-slab-one', file: 'alfa-slab-one-latin-400-normal.woff2',
    flavour: 'graphic', kind: 'serif', weight: '400',
    note: 'A heavy slab serif – a fairground poster. Reads at the back of any room.' },
  { pkg: '@fontsource/young-serif', file: 'young-serif-latin-400-normal.woff2',
    flavour: 'graphic', kind: 'serif', weight: '400',
    note: 'Chunky, low-contrast, slightly odd. The warm one, and the one that survives a bad projector best.' },
  { pkg: '@fontsource/instrument-serif', file: 'instrument-serif-latin-400-normal.woff2',
    flavour: 'graphic', kind: 'serif', weight: '400',
    note: 'Tall, narrow, editorial. The quietest of the graphic set – a magazine opener, not a poster.' },
  { pkg: '@fontsource/yeseva-one', file: 'yeseva-one-latin-400-normal.woff2',
    flavour: 'graphic', kind: 'serif', weight: '400',
    note: 'Art-nouveau flare in the terminals. Decorative in a way none of the others are; use it or do not.' },

  // ── graphic, sans ── pair with a SERIF body ───────────────────────
  { pkg: '@fontsource/anton', file: 'anton-latin-400-normal.woff2',
    flavour: 'graphic', kind: 'sans', weight: '400',
    note: 'Condensed, black, no alternatives. Three words fill a slide and that is the point.' },
  { pkg: '@fontsource-variable/oswald', file: 'oswald-latin-wght-normal.woff2',
    flavour: 'graphic', kind: 'sans', variable: true, weight: '200 700',
    note: 'Anton with a weight axis and better manners. The condensed face to reach for when the title is long.' },
  { pkg: '@fontsource/archivo-black', file: 'archivo-black-latin-400-normal.woff2',
    flavour: 'graphic', kind: 'sans', weight: '400',
    note: 'A grotesque at maximum weight, not condensed. The least mannered way to be loud.' },
  { pkg: '@fontsource/bebas-neue', file: 'bebas-neue-latin-400-normal.woff2',
    flavour: 'graphic', kind: 'sans', weight: '400',
    note: 'Capitals only – lowercase draws as capitals. Tracking is doing half the work; give it some.' },
  { pkg: '@fontsource-variable/big-shoulders-display', file: 'big-shoulders-display-latin-wght-normal.woff2',
    flavour: 'graphic', kind: 'sans', variable: true, weight: '100 900',
    note: 'Very tall and very narrow, with a full weight axis. The most title you can fit on one line.' },
  { pkg: '@fontsource-variable/syne', file: 'syne-latin-wght-normal.woff2',
    flavour: 'graphic', kind: 'sans', variable: true, weight: '400 800',
    note: 'Art-school display: the heavy weights widen rather than thicken. Distinctive to the point of being a signature.' },
  { pkg: '@fontsource-variable/bricolage-grotesque', file: 'bricolage-grotesque-latin-wght-normal.woff2',
    flavour: 'graphic', kind: 'sans', variable: true, weight: '200 800',
    note: 'A grotesque with deliberate irregularities. Reads contemporary-editorial rather than loud.' },
  { pkg: '@fontsource-variable/space-grotesk', file: 'space-grotesk-latin-wght-normal.woff2',
    flavour: 'graphic', kind: 'sans', variable: true, weight: '300 700',
    note: 'The technical sans that is not a monospace – the quiet option for a computing lecture.' },
  { pkg: '@fontsource-variable/unbounded', file: 'unbounded-latin-wght-normal.woff2',
    flavour: 'graphic', kind: 'sans', variable: true, weight: '200 900',
    note: 'Wide geometric display. Deliberately overbearing, and the closest thing here to a brand face.' },
  { pkg: '@fontsource/staatliches', file: 'staatliches-latin-400-normal.woff2',
    flavour: 'graphic', kind: 'sans', weight: '400',
    note: 'Condensed capitals with a poster-stencil feel. Bebas with more character and less polish.' },
];
