---
title: Frame lab
subtitle: Docks, panels and nested beats pushed to their edges
author: Dominik Herrmann
cover: quote
section: outline
section-mark: Teil
theme: light-blue
collapse: none
auto-fit: true
---

<!-- linter: ignore reveal-overuse -->

## title: {#cover}

Ein Rahmen trägt mehr als eine Textspalte – und irgendwo hört er auf zu tragen.

# Docks {#docks}

::: dock {.left .every}
- [Zwei Absätze](#dock-two-paras)
- [Zwei Spalten](#dock-cols)
- [Drei Karten](#dock-cards)
- [Zwölf Punkte](#dock-long-list)
- [Foto dahinter](#dock-photo)
:::

## free: Standardbreite, zwei Absätze, geerbtes Dock {.standard #dock-two-paras}

**Das Inhaltsverzeichnis links ist ein `::: dock {.left .every}` unter der
Teilüberschrift.** Jede Folie dieses Teils erbt es, und der Eintrag, auf dem
der Raum gerade steht, leuchtet.

**Die Textspalte weicht dem Dock aus, sie legt sich nicht darüber.** Ob das bei
Standardbreite noch wie eine Spalte aussieht, ist die erste Frage dieses Teils.

## free: Breite Folie mit zwei Textspalten neben dem Dock {.wide #dock-cols}

**Eine `.wide`-Folie mit `::: cols 2` teilt das Maß, das nach dem Dock übrig
bleibt.** Die Frage ist, ob beide Spalten noch eine lesbare Zeilenlänge haben.

::: cols 2
**Linke Spalte.** Ein Dock nimmt seine Breite als `--dock-em`, und die Folie
reserviert die Spur als Innenabstand, damit Text, Foliennummer und Overlay
dieselben Pixel lesen.

**Rechte Spalte.** Zwei Spalten in einer schmalen Restbreite sind der Fall, den
`layout-too-narrow` warnen soll – hier bleibt das Maß knapp darüber.
:::

## free: Drei Karten im Restmaß {.wide #dock-cards}

**`::: cards 3` neben einem linken Dock hat drei Container in einer verengten
Breite.** Karten brechen nicht wie Spalten – ein Eintrag ist ganz da oder gar
nicht.

::: cards 3
- **Messen** was eine Seite tut, wenn ein Crawler sie anfragt
- **Prüfen** bis der Detektor sich selbst benennt
- **Berichten** was das eine Messstudie kostet
:::

## free: Zwei Fenster und eine kleine Figur {.wide #dock-side}

**`::: side` neben dem Dock: links Prosa, rechts eine Figur von 60 auf 30.**
Die Figur skaliert auf die Breite des rechten Fensters, das selbst schon ein
Rest ist.

::: side
**Das linke Fenster** hält den Satz, den die Figur illustriert – und nicht mehr,
denn das Fenster ist schmal.
::: flip
::: draw 60x30
box a "A" at 30,15
:::
:::

## free: Zwölf Punkte und die Frage, wann auto-fit schrumpft {.standard #dock-long-list}

**Eine Liste mit zwölf Einträgen neben einem Dock ist der Fall für `auto-fit`.**
Wird gezoomt, muss der Zoom unter 1,0 fallen – und das Dock darf dabei nicht
mitschrumpfen.

- Erster Punkt, kurz
- Zweiter Punkt, ebenso kurz
- Dritter Punkt mit einem etwas längeren Nachsatz
- Vierter Punkt
- Fünfter Punkt, der sich über zwei Zeilen zieht, wenn die Spalte schmal ist
- Sechster Punkt
- Siebter Punkt
- Achter Punkt mit Nachsatz
- Neunter Punkt
- Zehnter Punkt, der wieder länger ausfällt als die Nachbarn
- Elfter Punkt
- Zwölfter Punkt, der letzte

## free: Ein eigenes Dock ersetzt das geerbte {.wide #dock-replace}

**Diese Folie schreibt `::: dock {.right .glass .wide}` und verdrängt damit das
Inhaltsverzeichnis.** Die Spalte liegt jetzt rechts, breit und glasig – und die
nächste Folie erbt wieder.

::: dock {.right .glass .wide}
**Ein Dock pro Folie.** Das eigene gewinnt, das geerbte kommt auf der nächsten
Folie zurück.
:::

## figure: Geerbtes Dock über einem Foto {.full #dock-photo}

**Ein `::: backdrop` mit `{.cover .clear}` und dazu das geerbte linke Dock.**
Die Frage: Steht die Liste auf einem eigenen Grund, oder auf dem Foto?

::: backdrop assets/photo.jpg {.cover .clear}

## free: Ein Band unten mit einem Beat darin {.wide #dock-band-beat}

**`::: dock {.bottom .ink .half}` ist ein Band, halb so hoch wie die Folie, mit
einem `---` im Inhalt.** Der zweite Block soll erst auf dem Beat erscheinen –
und das Band davor nicht springen.

::: dock {.bottom .ink .half}
**Zuerst dieser Satz,** zentriert in einem halben Bildschirm Tinte.

---

**Dann dieser,** ohne dass das Band seine Höhe ändert.
:::

## free: Ein Band oben und eine Zeile Text {.wide #dock-top}

**Ein `::: dock {.top .accent}` über genau einem Satz.**

::: dock {.top .accent}
**Merke:** Ein Band oben ist eine Überschrift, die nicht zur Folie gehört.
:::

## free: Ein schmales Dock, das erst auf dem dritten Beat kommt {.wide #dock-from3}

**`::: dock {.right .paper .narrow} from 3` mit drei `---` im Text.** Die
Spur rechts ist von Anfang an frei, das Dock kommt zum dritten Beat.

---

Erster Beat: dieser Satz.

---

Zweiter Beat: noch einer.

---

Dritter Beat: jetzt das Dock, rechts.

::: dock {.right .paper .narrow} from 3
**Angekommen.** Die Spalte war schon frei.
:::

## free: Ein Dock, dessen Text zu lang für seine Breite ist {.wide #dock-overflow}

**Ein `.narrow`-Dock mit neunzig Wörtern.** Irgendwo zwischen der Höhe der Folie
und dem Ende des Absatzes muss etwas nachgeben – die Frage ist, was.

::: dock {.right .accent .narrow}
Ein Dock hat die Höhe der Folie und keine Zeile mehr. Was nicht hineinpasst,
wird entweder abgeschnitten, quillt unten über den Rand oder zwingt die ganze
Folie in einen Zoom, den niemand wollte. Dieser Absatz ist absichtlich so lang,
dass er in einer schmalen Spalte bei Standardgröße nicht auf eine Bildschirmhöhe
passt. Er sagt nichts, was die Vorlesung braucht, und wiederholt sich deshalb
bedenkenlos: Ein Dock hat die Höhe der Folie und keine Zeile mehr, und was nicht
hineinpasst, wird abgeschnitten oder quillt über den Rand, und beides ist ein
Befund für den Bau.
:::

# Panels {#panels}

## figure: Linkes Glaspanel, schmal, mit Überschrift und zwei Absätzen {.full .bare #panel-left}

::: backdrop assets/photo.jpg {.cover .clear}

::: overlay {.left .glass .panel .narrow}
### Das schwächste Glied
**Ein Panel ist die Karte, die bis zum Rahmen gewachsen ist.** Die Spalte hat
die Höhe der Folie, das Bild bleibt neben ihr scharf.

**Zwei Absätze in einer schmalen Spalte** prüfen, ob die Wörter in der Höhe
zentriert stehen und ob der Rand hält.
:::

## figure: Tintenband unten, breit, ein Drittel hoch {.full .bare #panel-bottom-third}

::: backdrop assets/photo.jpg {.cover .clear}

::: overlay {.bottom .ink .panel .wide .third}
**Ein Band über die ganze Breite, ein Drittel der Folienhöhe.** Das Maß des
Textes ist `.wide`, das Band selbst kennt keine Breite.
:::

## figure: Glaspanel in der Mitte, nur eine Überschrift {.full .bare #panel-center}

::: backdrop assets/photo.jpg {.cover .clear}

::: overlay {.center .glass .panel .wide}
## Der ganze Rahmen verschleiert, ein Satz in der Mitte
:::

## figure: Rechtes Papierpanel, das auf Beat 1 kommt und auf Beat 2 weiterspricht {.full .bare #panel-right-beats}

::: backdrop assets/photo.jpg {.cover .clear}

::: overlay {.right .paper .panel .standard} from 1
**Beat 1: das Panel schiebt sich von rechts herein.**

---

**Beat 2: der zweite Block erscheint im selben Panel.** Das Panel darf dabei
nicht springen.
:::

## figure: Ein Panel und eine Eckkarte auf derselben Folie {.full .bare #panel-plus-card}

::: backdrop assets/photo.jpg {.cover .clear}

::: overlay {.left .glass .panel .narrow}
**Das Panel links.** Die Karte oben links muss sichtbar bleiben – vor dem
Panel, nicht dahinter.
:::

::: overlay {.top-left .ink}
**Eckkarte.** Wer liegt oben?
:::

## figure: Akzentband unten, halb hoch, eine Zeile {.full .bare #panel-bottom-short}

::: backdrop assets/photo.jpg {.cover .clear}

::: overlay {.bottom .accent .panel .half}
**Eine Zeile in einem halben Bildschirm.**
:::

# Verschachtelte Beats {#nested}

## free: Fenster, Karten und ein Zähler in Quellreihenfolge {.wide #nested-side}

**Sechs Beats, gemischt aus Fenstern, Folienebene und Karten.** Links eins,
links zwei, rechts eins, rechts zwei, Karten eins und zwei, Karte drei.

::: side
**Links, erster Absatz.** Der Zähler beginnt hier.

---

**Links, zweiter Absatz.** Der zweite Beat.
::: flip

---

**Rechts, erster Absatz.** Das ganze Fenster war bis eben zurückgehalten.

---

**Rechts, zweiter Absatz.** Der vierte Beat.
:::

---

::: cards 3
- **Eins** kommt mit dem fünften Beat
- **Zwei** kommt mit demselben

---

- **Drei** kommt allein, als sechster
:::

## free: Zeilen mit einem Beat dazwischen {.wide #nested-rows}

**Ein `::: rows` mit einem `---` zwischen zwei Zeilen.** Die erste steht sofort,
die zweite wartet.

::: rows {.accent}
- **Separatismus** Ingenieure machen die Technik, Manager entscheiden.

---

- **Technokratie** Ingenieure sollen entscheiden, weil sie es verstehen.
:::

## free: Eine Eckkarte mit eigenem Beat auf einer Folie mit zwei Beats {.wide #nested-overlay}

**Zwei `---` auf Folienebene und ein Overlay `{.top-right} from 1` mit einem
`---` darin.** Die Karte kommt auf Beat 1, ihr zweiter Block auf Beat 2 – neben
den Beats des Textes.

---

Erster Beat des Textes.

---

Zweiter Beat des Textes.

::: overlay {.top-right} from 1
**Karte auf Beat 1.**

---

**Zweiter Block auf Beat 2.**
:::

# Ein Teiler mit Foto und Panel {#divider-panel}

::: backdrop assets/photo.jpg {.cover .clear}

::: overlay {.bottom .glass .panel} from 1
**Der Teiler trägt ein Foto und ein Glasband, das auf Beat 1 kommt.**

---

**Und auf Beat 2 einen zweiten Satz im selben Band.**
:::

## free: Die Folie nach dem Teiler {.standard #after-divider-panel}

**Nach einem Teiler mit Beats muss die nächste Folie wieder bei null anfangen.**
Sonst zählt der Raum falsch.

# Ein Teiler mit drei Karten {#divider-cards}

::: cards 3
- **Erste Karte** ein Satz
- **Zweite Karte** noch ein Satz
::: draw 60x30
box a "A" at 30,15
:::
:::

## free: Die Folie nach dem Kartenteiler {.standard #after-divider-cards}

**Ein Teiler mit einer Figur als Karte ist der letzte Fall.** Die Figur skaliert
auf ein Drittel des Maßes.

## closing: Ende des Labors {#end}
