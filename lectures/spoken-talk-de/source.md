---
title: Beim zweiten Mal
subtitle: ein kurzer Vortrag, Wort für Wort ausgeschrieben
presenter: psi-slides
cover: display
info: |
  psi-slides
  der Referenzvortrag für die Stichwortkarten im Cockpit
lang: de
theme: light-red
collapse: none
auto-fit: true
section: outline
section-mark: Teil
---

<!-- German translation of lectures/spoken-talk/source.md, same structure and
     chunk ids. It exists for the German screenshot of the prompter on the
     project site: the prompter answers in the lecture's language, so
     docs/site/shoot-prompter.mjs de needs a German deck. Its chunk ids are
     that script's contract, as the English deck's are. -->

## title: {#cover}

Neunzig Millisekunden.

> note: @0:00 **Dies ist ein Vortrag über eine einzige Zahl.** Ich habe heute Morgen eine Seite geöffnet, und sie hat **1,4 Sekunden** gebraucht. Ich habe neu geladen, und sie hat **neunzig Millisekunden** gebraucht. Derselbe Laptop, dieselbe Seite, dasselbe Café-WLAN.
>
> **Fünfzehnmal schneller, und nichts war optimiert worden.** Niemand hatte über Nacht etwas ausgeliefert.
>
> **[Pause. Die Zahl wirken lassen.]**
>
> Der Vortrag handelt davon, **wo dieser Unterschied geblieben ist** – und von dem Teil des Bildes, der fehlte, als ich es zum ersten Mal an die Tafel gezeichnet habe.

# Wo die Zeit geblieben ist

## free: {.center #two-numbers}

1,4 Sekunden. Dann 90 Millisekunden.

> note: @1:20 **Lassen Sie mich bei den zwei Zahlen genau sein**, denn der Rest der Stunde hängt an ihnen.
>
> **Der erste Besuch: 1,4 Sekunden.** Ein Name wird nachgeschlagen, eine Verbindung geöffnet, ein Zertifikat geprüft, eine Anfrage gesendet, eine Seite gebaut, die Bytes zurückgeschickt. **Sechs Dinge, und jedes kostet.**
>
> **Der zweite Besuch: neunzig Millisekunden.** Dieselben sechs Dinge würden noch genauso viel kosten. **Also sind fünf davon nicht passiert.**

## free: Was wir sagen, was passiert {.standard #story}

Der Browser fragt. Der Server antwortet. Die Seite erscheint.

> note: @2:40 **Fragen Sie irgendjemanden, wie das Web funktioniert, und Sie bekommen drei Sätze.** Der Browser fragt, der Server antwortet, die Seite erscheint. **Ich lehre es auch so**, und ich werde es weiter so lehren, weil es das richtige erste Bild ist.
>
> #### Wozu ein erstes Bild da ist
> **Ein erstes Bild ist keine Lüge. Es ist ein Bild, bei dem die Ausnahmen weggelassen wurden**, und es verdient seinen Platz, weil es klein genug ist, um es im Kopf zu behalten. Die Frage ist nur, ob jemals jemand das zweite zeichnet.
>
> **Heute zeichnen wir das zweite**, für eine Seite, die zweimal angefragt wurde.

# Die Anfrage, zweimal

## figure: Wie ich es an die Tafel zeichne | sechs Schritte, von links nach rechts {.wide #board}

::: draw 100x40
default box {.tone-2} w 1.72 pad 0.16

box req "Anfrage" at 0,0
box net "Netz"                     right of req gap 0.8
box srv "Server:\nbaut die Seite"  right of net gap 0.8
edge req -> net
edge net -> srv

brace all over req,net,srv side bottom "1,4 s" pad 1.15 {.muted .large}
:::

> note: @4:10 **Das ist die Tafelversion**, und ich habe sie jahrelang so gezeichnet. **Drei Kästen, zwei Pfeile und eine Zahl darunter.** Die Anfrage verlässt den Rechner, geht über das Netz, erreicht einen Server, und der Server baut die Seite.
>
> **Jede Messung, die ich gemacht habe, stimmte damit überein** – solange ich den ersten Besuch gemessen habe. **1,4 Sekunden, und das Bild erklärt alles davon.**
>
> **[Auf die Zahl zeigen.]** Jetzt neu laden. **Neunzig Millisekunden.** Welcher dieser drei Kästen ist fünfzehnmal schneller geworden?

## figure: Wie es beim zweiten Mal läuft | die Anfrage, die früh aufhört {.wide #second-time}

::: draw 100x40
default box {.tone-2} w 1.72 pad 0.16

box req "Anfrage" at 0,0
box net "Netz"                     right of req gap 0.8
box srv "Server:\nbaut die Seite"  right of net gap 0.8
edge req -> net
edge net -> srv

box store "Browser-Cache" below net gap 0.8 flush left
box hit   "Die Antwort,\nschon da" right of store gap 0.8
edge store -> hit
edge srv.bottom -> store.top {.dashed}

box stamp "ein Frischedatum,\ndas niemand liest" below store gap 0.6 flush left
edge hit.bottom -> stamp.right {.dashed .elbow}

text src "„stale-while-revalidate“ · RFC 5861" below stamp gap 0.4 flush left {.left .muted .small}

step quiet
  style srv {.dashed}
  dim srv
step local
  show store, hit
step dated
  show stamp, src

:::

> note: @6:15 **Keiner.**

> note: from 1
> **Erster Druck:** der **Server hat vom zweiten Besuch nie erfahren**.

> note: from 2
> **Zweiter Druck: der Browser hat sich selbst geantwortet.** Er hatte die Seite vom ersten Besuch aufbewahrt und diese Kopie zurückgegeben, **ohne jemanden zu fragen**. Neunzig Millisekunden kostet es, **in eine Schublade zu sehen, die schon offen ist**.

> note: from 3
> **Dritter Druck:** und neben der Kopie liegt **ein Datum**, das sagt, wie lange sie zurückgegeben werden darf, bevor jemand wieder fragen muss. **Die Kopie ist nicht das Interessante. Das Datum ist es.**
>
> Jetzt sieht man, **was die Tafelversion weggelassen hat**: **kein schnellerer Server, kein besseres Netz**. **Eine Schublade, eine Kopie und ein Datum** – und das Datum ist das Einzige im Bild, das falsch sein kann.
>
> #### Wo ich nicht mehr helfen kann
> **Eine langsame Seite kann ich messen.** Eine Seite, die schnell ist, weil sie **einem etwas vom Dienstag ausliefert**, kann ich von hier aus nicht messen: Sie sieht genauso aus wie eine Seite, die schnell ist, weil sie gut ist. **Beides sind dieselben neunzig Millisekunden.**
>
> **[Pause, die zwei Lesarten derselben Zahl stehen lassen.]**
>
> Und Sie denken: **dann verkürzt man eben das Datum.** Ja. Und dann kostet der zweite Besuch wieder 1,4 Sekunden, und jemand schreibt ein Ticket, dass **die Seite langsamer geworden ist**. **Das Datum ist eine Entscheidung, keine Einstellung** – und sie wird einmal getroffen, meistens von dem, der den Server eingerichtet hat, meistens an einem Freitag.

## question: {.standard #ask}

Welche Ihrer Zahlen ist eine Messung, und welche eine Kopie?

> note: @9:30 **Hier ist also die Frage, die Sie mitnehmen sollen**, und sie funktioniert bei allem, was Sie überwachen, nicht nur bei einer Webseite.
>
> **Welche Ihrer Zahlen ist eine Messung, und welche ist die Kopie einer Messung?** Ein Dashboard, das schnell ist, ist nicht dasselbe wie ein System, dem es gut geht. **Irgendwo steht ein Datum auf der Kopie**, und die nützliche Frage ist, wer es gesetzt hat und wann.
>
> **Das ist der ganze Vortrag.** Neunzig Millisekunden, eine Schublade und ein Datum.
