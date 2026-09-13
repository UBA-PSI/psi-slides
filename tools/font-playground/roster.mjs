// The candidate display faces, and nothing about them that a package can
// answer for itself. Family, licence, attribution and the declared subset
// all come out of each package's own metadata.json at generation time, so
// this table carries only the three things it has to decide: which FILE of
// the package is the one face a display role would embed, which of the
// three flavours the face belongs to, and what it is for.
//
// Why a file has to be named here at all: a variable family ships one file
// per axis set (Fraunces alone has six), and only one of them is the axis a
// title line varies on. Picking `full` everywhere would triple the payload
// for axes no cover uses.
export const FLAVOURS = {
  hand:    'Handwritten – a line that was drawn rather than set',
  machine: 'Machine – pixel grids, terminals, exaggerated monospace',
  graphic: 'Graphic – display weight, loud serifs, poster type',
};

export const CANDIDATES = [
  // ── hand ──────────────────────────────────────────────────────────
  { pkg: '@fontsource-variable/caveat', file: 'caveat-latin-wght-normal.woff2',
    flavour: 'hand', variable: true, weight: '400 700',
    note: 'A ballpoint note. The one hand face with a weight axis, so a heading can be pressed harder than a subtitle.' },
  { pkg: '@fontsource-variable/shantell-sans', file: 'shantell-sans-latin-wght-normal.woff2',
    flavour: 'hand', variable: true, weight: '300 800',
    note: 'Marker-drawn but built as a text face: it holds a two-line title where the looser hands fall apart.' },
  { pkg: '@fontsource/patrick-hand', file: 'patrick-hand-latin-400-normal.woff2',
    flavour: 'hand', weight: '400',
    note: 'The tidiest hand of the set – a neat person writing on a whiteboard, not a scrawl.' },
  { pkg: '@fontsource/architects-daughter', file: 'architects-daughter-latin-400-normal.woff2',
    flavour: 'hand', weight: '400',
    note: 'Drafting-table printing, wide and airy. Wants a short line; a long title runs off.' },
  { pkg: '@fontsource/kalam', file: 'kalam-latin-700-normal.woff2',
    flavour: 'hand', weight: '700',
    note: 'A brush-pen hand with real weight – the bold cut, because 400 is too thin to carry a divider.' },
  { pkg: '@fontsource/permanent-marker', file: 'permanent-marker-latin-400-normal.woff2',
    flavour: 'hand', weight: '400',
    note: 'A Sharpie. Loudest hand here, and it has one volume only.' },
  { pkg: '@fontsource/rock-salt', file: 'rock-salt-latin-400-normal.woff2',
    flavour: 'hand', weight: '400',
    note: 'Ink on paper, wobbly and wide-tracked. A word or two, never a sentence.' },

  // ── machine ───────────────────────────────────────────────────────
  { pkg: '@fontsource/press-start-2p', file: 'press-start-2p-latin-400-normal.woff2',
    flavour: 'machine', weight: '400',
    note: 'An arcade cabinet. Every glyph is on an 8px grid, so it only looks right at sizes that are a multiple of it.' },
  { pkg: '@fontsource/silkscreen', file: 'silkscreen-latin-700-normal.woff2',
    flavour: 'machine', weight: '700',
    note: 'A finer pixel grid than Press Start, and it sets much shorter – a bitmap face you can put a real title in.' },
  { pkg: '@fontsource/vt323', file: 'vt323-latin-400-normal.woff2',
    flavour: 'machine', weight: '400',
    note: 'A DEC VT320 terminal, phosphor and all. Pairs with the terminal-amber and terminal-green themes.' },
  { pkg: '@fontsource/share-tech-mono', file: 'share-tech-mono-latin-400-normal.woff2',
    flavour: 'machine', weight: '400',
    note: 'A clean console face – the quiet end of the machine flavour, readable at any size.' },
  { pkg: '@fontsource/major-mono-display', file: 'major-mono-display-latin-400-normal.woff2',
    flavour: 'machine', weight: '400',
    note: 'Lowercase renders as small capitals. Strange and very specific; try it before believing it.' },
  { pkg: '@fontsource/space-mono', file: 'space-mono-latin-700-normal.woff2',
    flavour: 'machine', weight: '700',
    note: 'A monospace with an attitude – the bold cut is a display face rather than a code face.' },
  { pkg: '@fontsource/chakra-petch', file: 'chakra-petch-latin-700-normal.woff2',
    flavour: 'machine', weight: '700',
    note: 'Cut corners and squared bowls: technical without being a terminal. Sets tighter than any mono here.' },
  { pkg: '@fontsource-variable/orbitron', file: 'orbitron-latin-wght-normal.woff2',
    flavour: 'machine', variable: true, weight: '400 900',
    note: 'Geometric and square – the one that reads as a machine rather than as a computer.' },
  { pkg: '@fontsource/rubik-mono-one', file: 'rubik-mono-one-latin-400-normal.woff2',
    flavour: 'machine', weight: '400',
    note: 'A monospace at poster weight. Sits between the machine and the graphic flavour.' },

  // ── graphic ───────────────────────────────────────────────────────
  { pkg: '@fontsource/anton', file: 'anton-latin-400-normal.woff2',
    flavour: 'graphic', weight: '400',
    note: 'Condensed, black, no alternatives. Three words fill a slide and that is the point.' },
  { pkg: '@fontsource/bebas-neue', file: 'bebas-neue-latin-400-normal.woff2',
    flavour: 'graphic', weight: '400',
    note: 'Capitals only – lowercase draws as capitals. Tracking is doing half the work; give it some.' },
  { pkg: '@fontsource/archivo-black', file: 'archivo-black-latin-400-normal.woff2',
    flavour: 'graphic', weight: '400',
    note: 'A grotesque at maximum weight, not condensed. The least mannered way to be loud.' },
  { pkg: '@fontsource/alfa-slab-one', file: 'alfa-slab-one-latin-400-normal.woff2',
    flavour: 'graphic', weight: '400',
    note: 'A heavy slab serif – a fairground poster. Reads at the back of any room.' },
  { pkg: '@fontsource/abril-fatface', file: 'abril-fatface-latin-400-normal.woff2',
    flavour: 'graphic', weight: '400',
    note: 'A fat didone: hairlines against very thick stems. Handsome on paper; watch the hairlines on a weak projector.' },
  { pkg: '@fontsource-variable/playfair-display', file: 'playfair-display-latin-wght-normal.woff2',
    flavour: 'graphic', variable: true, weight: '400 900',
    note: 'High-contrast transitional. The dressed-up option rather than the loud one.' },
  { pkg: '@fontsource-variable/bodoni-moda', file: 'bodoni-moda-latin-wght-normal.woff2',
    flavour: 'graphic', variable: true, weight: '400 900',
    note: 'A true didone with a weight axis: a hairline eyebrow over a black headline out of one family.' },
  { pkg: '@fontsource-variable/fraunces', file: 'fraunces-latin-wght-normal.woff2',
    flavour: 'graphic', variable: true, weight: '100 900',
    note: 'A soft, slightly wrong serif. The wonk and opsz axes are in other files; this is the weight axis alone.' },
  { pkg: '@fontsource-variable/unbounded', file: 'unbounded-latin-wght-normal.woff2',
    flavour: 'graphic', variable: true, weight: '200 900',
    note: 'Wide geometric display. Deliberately overbearing, and the closest thing here to a brand face.' },
  { pkg: '@fontsource/instrument-serif', file: 'instrument-serif-latin-400-normal.woff2',
    flavour: 'graphic', weight: '400',
    note: 'Tall, narrow, editorial. The quietest of the graphic set – a magazine opener, not a poster.' },
];
