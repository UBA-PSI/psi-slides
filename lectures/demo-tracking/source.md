---
title: Wiedererkennung ohne Cookie
subtitle: Was ein Browser über sich erzählt, ohne gefragt zu werden
presenter: Prof. Dr. Dominik Herrmann
info: |
  Privatsphäre und Sicherheit in Informationssystemen
  Universität Bamberg · Wintersemester
course: psi
lecture: tracking
lang: de
cover: masthead
section: outline
section-mark: Teil
fonts:
  sans: Inter Tight
ligatures: text
theme: light-blue
collapse: topic-bold
auto-fit: shrink
slide-numbers: horizontal
style:
  bold: accent
  print-bold: italic
  hyphenate: all
  wrap: balance
draw-defaults: |
  default box {.round}
---

## title: {#title}

Ein Browser, der eine Seite lädt, beantwortet dabei ein Dutzend Fragen, die
niemand gestellt hat.

## outline: Der Weg durch die Stunde {#agenda}

# Das Problem {#problem}

::: dock {.left .every}
- [Das Problem](#problem)
- [Techniken](#technik)
- [Messung](#messung)
- [Gegenwehr](#gegenwehr)
:::

Cookies sind der bekannteste Weg, einen Wiederbesucher zu erkennen – und
der einzige, den ein Nutzer abschalten kann.

## question: Warum reicht es nicht, Cookies zu löschen? {.standard #warum}

**Ein Cookie ist der einzige Wiedererkennungsweg, der dem Nutzer gehört.**
Er steht in einer Liste, er hat ein Ablaufdatum, und ein Klick entfernt ihn.

Alles andere, was einen Browser unterscheidbar macht, ist ein Nebenprodukt
davon, dass er funktioniert. **Es lässt sich nicht löschen, weil es nichts
ist, was gespeichert wurde.**

> note: Hier eine Sekunde warten.
> Die Frage ist die **Klammer** für die ganze Stunde.

## definition: Anonymitätsmenge {.wide #anon}

**Die Anonymitätsmenge ist die Menge aller Nutzer, die eine Beobachtung
erklären könnten.** Sie schrumpft mit jedem Merkmal, das der Beobachter
hinzunimmt.

$$
H(X) = -\sum_{i=1}^{n} p_i \log_2 p_i
$$

Die Entropie $H(X)$ misst, wie viele Bits ein Merkmal beiträgt. **Ab etwa
33 Bit ist ein Mensch weltweit eindeutig.**

::: footnote
Die Zahl folgt aus $\log_2(8 \cdot 10^9) \approx 33$ – sie sagt nichts darüber,
ob ein Beobachter diese Bits auch tatsächlich messen kann.
:::

# Techniken {#technik}

Vier Wege, dieselbe Frage zu beantworten: *Warst du schon einmal hier?*

## free: Vier Familien {.wide #familien}

::: cards 4 {.outline}
- **Speicher**\
  Cookie, localStorage, IndexedDB
- **Merkmale**\
  Schriften, Canvas, Audio, WebGL
- **Netz**\
  IP-Adresse, TLS-Fingerabdruck
- **Verhalten**\
  Tippen, Scrollen, Zeiten
:::

Die erste Familie speichert etwas, die anderen drei **messen** nur.

## definition: Die Begriffe, die durcheinandergehen {.wide #begriffe}

::: rows {.accent}
- **Fingerprinting** Der Beobachter misst Eigenschaften und rechnet daraus eine Kennung aus.
- **Tracking** Der Beobachter erkennt denselben Nutzer über mehrere Besuche hinweg wieder.
- **Verkettung** Der Beobachter führt zwei Kennungen zusammen, die er getrennt erhoben hat.
:::

## figure: Was beim Laden einer Seite passiert {.full #ablauf}

::: draw 150x74
sequence s
  actor br "Browser"
  actor site "news.example"
  actor trk "tracker.example"

  br -> site "GET /artikel"
  site -> br "HTML + <script src=tracker>"
  br -> trk "GET /t.js" "Referer: news.example" space 0.5
  trk -> br "Set-Cookie: id=7f3a"
  br -> trk "POST /beacon" "Canvas-Hash, Schriftenliste" space 0.5
  note trk "Zwei Merkmale, eine Kennung"

step erst
  emph @s-msg-2
step dann
  dim @s-msg-2
  emph @s-msg-4
step zuletzt
  emph s-note-0
:::

> note: Der Referer ist die stille Zeile.

> note: from 1
> **Dritter Pfeil**: die Seite lädt den Tracker – und sagt ihm dabei, *wo* sie ist.

> note: from 2
> **Fünfter Pfeil**: jetzt erst die Merkmale.

> note: from 3
> @12:00 Und hier zusammenführen.

## example: Ein Canvas-Fingerabdruck {.wide #canvas}

::: slide

```javascript
const c = document.createElement('canvas');
c.getContext('2d').fillText('psi \u{1F510}', 2, 15);
const id = sha256(c.toDataURL());
```

:::

Derselbe Text, gezeichnet auf zwei Rechnern, ergibt zwei verschiedene Bilder:
Grafikkarte, Treiber, Schriftglättung und die installierten Schriften gehen
alle in das Ergebnis ein. Der Hash ist dann die Kennung.

# Messung {#messung}

## figure: Wie verbreitet ist das? {.full #verbreitung}

::: draw 150x60
bars f "12,31,47,58" "2013 2016 2019 2022" at 0,0 aspect 5:2 key "Canvas" {.tone-3}
bars g "3,9,22,41" series of f key "Audio" {.tone-4}
text q "Anteil der Top-1000-Seiten in Prozent" above f gap 0.5 {.small}
brace b over f-2,f-3 "Messreihen mit WebGL" side bottom

step los
  emph f-2,f-3
:::

## figure: Zuständigkeiten {.full #lanes}

::: draw 150x62
lanes l "Nutzer | Browser | Erstanbieter | Drittanbieter" at 0,0 w 6.4 band 1.0 {.muted}

box klick  "Klick auf Link" at l.left+0.9,l-0.cy w 1.5 {.tone-2}
box laden  "Seite laden"    at l.left+2.4,l-1.cy w 1.5 {.tone-1}
box render "HTML liefern"   at l.left+3.9,l-2.cy w 1.5 {.tone-1}
box script "Skript holen"   at l.left+5.4,l-1.cy w 1.5 {.tone-1}
box hash   "Hash bilden"    at l.left+6.9,l-3.cy w 1.5 {.tone-4}

edge klick -> laden
edge laden -> render
edge render -> script
edge script -> hash
:::

## example: Was eine Messung kostet {.wide #kosten}

::: side 3:2 {.middle}
Eine Messung muss aussehen wie ein Besuch, sonst misst sie etwas anderes.

--- from 1

Ein Crawler, der sich zu erkennen gibt, bekommt eine andere Seite geliefert –
und dann misst man die Tarnung statt der Praxis.
::: flip
::: draw 90x54
box c "Crawler" at 0,0 w 2.2
box d "Detektor" below c gap 1.0 w 2.2
box s "Seite A" below d gap 1.0 w 2.2
box s2 "Seite B" right of s gap 0.6 w 2.2 {.tone-4}
edge c -> d
edge d -> s "unauffällig" side left
edge d -> s2 "erkannt" side right

step eins
  emph d
step zwei
  emph s2
  dim s
:::
:::

# Gegenwehr {#gegenwehr}

::: backdrop photo {.cover .invert} reveal full, left 45%

::: overlay {.right .glass .panel .narrow}
### Zwei Richtungen
**Weniger preisgeben** oder **gleich aussehen** wie alle anderen.
:::

## principle: Uniformität schlägt Sparsamkeit {.standard #uniform}

**Ein Browser, der weniger verrät, ist dadurch nicht anonymer.** Er verrät
nur etwas anderes – nämlich, dass er weniger verrät.

Der Tor Browser geht deshalb den anderen Weg: alle Installationen sollen
dieselben Antworten geben. **Die Anonymitätsmenge ist dann die Nutzerzahl,
nicht die Merkmalszahl.**

::: marginalia
Genau deshalb warnt der Tor Browser davor, das Fenster zu vergrößern.
:::

## exercise: Rechnen Sie nach {.wide #uebung}

::: cards 2 {.panel}
- **Aufgabe 1**\
  Ein Merkmal habe vier gleich wahrscheinliche Ausprägungen.
  Wie viele Bits trägt es bei, und wie viele solcher Merkmale
  braucht ein Beobachter für weltweite Eindeutigkeit?
- **Aufgabe 2**\
  Begründen Sie, warum die Bits zweier Merkmale sich nicht
  einfach addieren lassen, sobald die Merkmale korreliert sind.
:::

::: expand loesungsweg
Zu Aufgabe 1: zwei Bit pro Merkmal, also siebzehn Merkmale für 33 Bit –
unter der Annahme, dass die Merkmale unabhängig sind, was sie nie sind.
:::

## closing: Nächste Woche | Verkettung über Geräte hinweg {#ende}

Die Frage bleibt dieselbe, nur der Beobachter wechselt die Seite.
