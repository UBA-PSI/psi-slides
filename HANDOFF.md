# Handoff – nächste Session: `audience.html` Renderer

Stand nach Commit `c905f52`. Sechs Commits heute, alle grün, Repo ist in definiertem Zustand.

## Auftrag

Erweitere `build.js` um einen zweiten Output-Renderer für die Live-Ansicht (`audience.html`), analog zum bestehenden Print-Renderer. Gleicher Parser, gleiche Source-Dateien, andere Ausgabe. Ziel dieser Session: `phase0/lecture.html` wird durch generierten Output ersetzt, sodass die nächste Lecture vollständig aus `source.md` + Build kommt.

## Wo der Vorgänger stand

- `PRD.md` ist die lebende Spec. Revidiert basierend auf wlab01-Einsatz. Für diese Arbeit besonders relevant: §2 (Chunk-Modell), §4.4 (Compositional moves inkl. Title), §4.5 (Collapse), §4.6 (Progressive reveal), §5 (Camera and navigation), §7.1 (Annotation slot).
- `build.js` kann bereits: frontmatter, columns, chunks mit attribute tails, `::: expand <label>`, `::: margin`, `> note:` stripping, reveal-separator-aware body splitting (aktuell strippt der Parser die Segmente komplett weg, siehe "Parser-Anpassung" unten). Rendert Print (`print.html`) via `renderDocument`.
- `lectures/demo/source.md` und `lectures/wlab01/source.md` sind echte Phase-1-Sources, buildbar. wlab01 hat 7 Columns / 21 Chunks / 2 Asides / 5 Speaker-Notes – gute Stresstest-Basis.
- `phase0/lecture.html` ist die handgeschriebene Referenz-Implementierung (~1700 Zeilen HTML+CSS+JS). LECTURE-Objekt in Zeilen 629-916, Runtime-Logik danach. **Referenzieren, nicht portieren** – der neue Code soll aus der PRD rauslesen, nicht aus dem alten Code.
- `phase0/AUTHORING.md` dokumentiert die Phase-0-Keybindings und -UX. Die Audience-View sollte diesen Stand plus die revidierten Ergänzungen (Space für Reveal, `/` Fulltext im Overview, Click-Select + Second-O, `P` für Print) einhalten.

## Konkrete Sub-Aufgaben in sinnvoller Reihenfolge

1. **Parser-Anpassung: Reveal-Segmente erhalten.** Aktuell filtert `flushChunk` die `---`-Zeilen weg. Stattdessen: Body in `segments: string[]` splitten (fence-aware, wie bereits implementiert für den Filter). Print-Renderer baut Body als `segments.join('\n\n')` (fully revealed). Audience-Renderer wickelt jedes Segment in `<div class="reveal-segment">`.

2. **`renderAudience(lecture)` Funktion** nach dem Vorbild von `renderDocument`. Jeder Chunk wird als `<article class="chunk" data-chunk-id="…" data-col="N" data-idx="M">` auf einer 2D-Stage platziert. CSS-Transform steuert Camera.

3. **Runtime-JS inline in audience.html**: Camera-State, Reveal-State, Tastatur-Bindings. Die relevanten Tasten sind in PRD §5 gelistet. Minimum-viable-Set: `← → ↑ ↓`, `Space`, `Enter`, `1`–`9`, `Esc`, `C` (Collapse-Cycling), `N` (Annotation). Zweite Welle: `O` (Overview), `T` (TOC), `/`, `P`, `B`, `+ - 0`.

4. **CSS für Slide-Frame, Title-Layout (lower-left-third), Per-Tag-Treatments, Collapse-Modes, Reveal-Sichtbarkeit.** Viel davon kann aus `phase0/lecture.html` als Strukturvorlage dienen, aber die Werte sollten aus der PRD stammen – besonders Calibrated Defaults §4.3 und die Camera-Transition 250ms cubic-bezier(0.45, 0, 0.2, 1) aus §5.

5. **Annotations** aus phase0/lecture.html portieren. `localStorage`-Key: `psi-lecdoc:<frontmatter.title>:annotations`. Konform zu AUTHORING.md §4.

6. **Build-CLI-Update**: aktuell emittiert `node build.js <source.md>` genau `print.html`. Neu: emittiert beide, `audience.html` und `print.html`, in denselben Ordner. Evtl. Flags `--print-only` / `--audience-only`.

## Entscheidungen, die vor Codezeile 1 zu klären sind

Dem User vor dem Start stellen:

1. **Default-Output**: `audience.html` + `print.html` parallel? Oder `audience.html` als neuer Default, Print nur mit Flag?
2. **Scope-Schnitt**: Navigation + Reveal + Collapse + Title + Annotations in dieser Session, Overview und TOC-Overlay als Folge-Slice? Das ist meine Default-Empfehlung. Alles auf einmal ist eine große Session (~500 Zeilen), aufgeteilt sind es zwei überschaubare.
3. **Speaker-View (`speaker.html`)**: explizit **out of scope** für diese Session, richtig? Das war die implizite Annahme am Ende der letzten Session. Wenn doch rein, BroadcastChannel-Sync kommt dazu und verdoppelt den Aufwand.

## Nicht-Ziele dieser Session

- `speaker.html` und BroadcastChannel
- `::: sketch` live-editing
- KaTeX
- Image shorthand (`![](fig-id)`)
- Linter
- `--watch`
- `--new` Scaffold

Diese stehen weiter auf der Phase-1-Liste in `PRD.md §11`, aber nacheinander.

## Zum Arbeitsstil

- Wir sind per du.
- Keine em-dashes im Output – en-dashes (`–`) oder `&ndash;`. Das ist eine harte User-Präferenz, siehe auto-memory.
- Keine Zeit- oder Datumsschätzungen in Task-Files (global CLAUDE.md).
- Commits einzeln, fokussiert, mit erklärendem Body. Rename-History via `git mv` erhalten, wo Moves anstehen.
- Explanatory output style: Vor und nach Code-Edits einen `★ Insight ─────` Block mit 2-3 Punkten.
- Der User ist Fast und hat vor Codezeile 1 wenig Geduld für Meta-Diskussion. Kurz die drei offenen Entscheidungen oben klären, dann los.

## Start-Ritual

1. `git log --oneline -10` lesen – die letzten sechs Commits sind der Kontext.
2. `PRD.md §4.4 bis §5` überfliegen.
3. `build.js` in seiner aktuellen Fassung durchlesen (insbesondere `parseLecture`, `renderChunk`, der Reveal-Filter in `flushChunk`).
4. Die drei offenen Entscheidungen klären.
5. Mit der Parser-Anpassung anfangen (Sub-Aufgabe 1), dann Rest.
