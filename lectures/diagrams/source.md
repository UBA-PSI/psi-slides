---
title: Animated Infographics
subtitle: "Six real lecture slides, rebuilt in ::: draw"
author: Dominik Herrmann
theme: dark
collapse: none
draw-defaults: |
  default text {.small}
  default container pad 0.34
---

## title: Animated Infographics | Six real slides, rebuilt from text {#cover}

This is a psi-slides lecture: one Markdown source becomes the projected slides,
a speaker cockpit, a reading document, and a handout with the spoken notes. The
[psi-slides tutorial lecture](../tutorial/audience.html) introduces the system
itself.

Every figure in this lecture is written in the lecture source, laid out at
build time, and stepped with the same key that advances a reveal.

# Memory safety

## figure: Types of memory unsafety {.full #unsafety}

::: draw {unit=150x52}
default box {.tone-2} w 1.05

text tlab "Temporal" at 0,0 {.left .large}
box  tobj "object" right of tlab gap 2 w 0.62 {.tone-3}
edge tobj.left-0.36,tobj.top-0.7 -> tobj.tl {.thick .muted}

box  uaf  "Use After Free" below tlab gap 0.75 flush left {@temporal}
box  df   "Double free"    right of uaf gap 0.65 same as uaf {@temporal}
text tcode "free(ptr);\n*ptr;" below uaf gap 0.28 flush left {.mono .left @temporal}

text slab "Spatial" below tcode gap 0.9 flush left {.left .large}
box  sobj "object" right of slab gap 2 w 0.62 {.tone-4}
edge sobj.left-0.36,sobj.top-0.7 -> sobj.tl {.thick .accent}

box  bo   "Buffer Overflow" below slab gap 0.75 flush left {.accent @spatial}
box  bor  "Buffer Overread" right of bo gap 0.65 same as bo {.accent @spatial}
text scode "char buf[16];\nbuf[42];" below bo gap 0.28 flush left {.mono .left @spatial}

# Die beiden Spalten hält das flush left in den Platzierungen schon bündig.
# Die Kästchen rechts nicht: sie sitzen je 0.7 neben einem Wort, und
# "Temporal" ist ein Zeichen länger als "Spatial".
align x middle tobj, sobj

step temporal
  show @temporal
step spatial
  show @spatial
:::

**Zwei Familien, dieselbe Form.** Das `flush left` am Ende einer Platzierung hält jede `below`-Kette an ihrer linken Kante bündig, obwohl der obere Code zweizeilig und der untere anders breit ist; `same as` gibt jedem Paar gleich große Kästen. Die *Anweisung* `align x middle tobj, sobj` ist etwas anderes: sie übernimmt eine Koordinate vom zuerst genannten Element, und hier ist sie nötig, weil die beiden Kästchen neben verschieden langen Wörtern hängen. Die beiden Schritte sprechen `@temporal` und `@spatial` an, statt acht Namen einzeln aufzuzählen.

## figure: Your first buffer overflow | ein konstruiertes Beispiel {.full #overflow}

::: side
```c
int main(void) {
  int  myvalue = 0x42;
  char mystring[16];

  scanf("%s", mystring);

  if (myvalue == 0xdeadbeef)
    printf("Success!\n");
  else
    printf("%x\n", myvalue);
}
```
::: flip
::: draw {unit=150x52}
default box {.tone-2 .sharp} w 1.5 pad 0.16

box buf "Local variable: mystring\n(char[], 16 bytes)" at 0,0 h 1.5
box val "Local variable: myvalue\n(integer, 4 bytes)" below buf gap 0 same as buf h 0.75
box bp  "Stored base pointer" below val gap 0 same as val
box ret "Return address"      below bp gap 0 same as val

box sp  "SP" left of buf gap 1.6 w 0.3 {.tone-4}
box bpl "BP" left of val gap 1.6 same as sp {.tone-4}
edge sp -> buf.left
edge bpl -> val.left
align x middle sp, bpl

brace dir over buf,ret side right "writing direction:\ntowards higher\naddresses" pad 0.28 {.muted}

step overrun
  emph buf
  style val,bp,ret {.dashed}
step reached
  emph ret
  label ret "Return address (attacker's)"
:::
:::

**Links ein ganz normaler Markdown-Codeblock, rechts ein Diagramm.** `::: side` stellt beide nebeneinander; das Diagramm muss dafür nichts können. Innen halten `same as` und `gap 0` die vier Rahmen als einen Stapel zusammen, und die `brace` spannt sich über alle vier und schreibt die Schreibrichtung daneben.

# Block ciphers

## figure: Cipher Block Chaining, decryption {.full #cbc}

::: draw {unit=112x74}
default box {.tone-3} w 0.82
default box @dec {.round .tone-2} w 0.48
default text {.mono}

box iv "Rand. IV" at 0,0 {.tone-1}
# Die Spalten stehen weiter auseinander, als die Kästen es bräuchten. Der
# Zwischenraum ist kein Weißraum, sondern der Kanal, in dem die Verkettung
# nach unten läuft – bei gap 0.3 blieb dafür nichts übrig, was die Linie
# entweder durch den Dec-Kasten oder über die Schlüssel-Beschriftung zwang.
box c0 "c_0" right of iv gap 1.15
box c1 "c_1" right of c0 gap 1.15
box c2 "c_2" right of c1 gap 1.15

box d0 "Dec" below c0 gap 0.95 {@dec}
box d1 "Dec" below c1 gap 0.95 {@dec}
box d2 "Dec" below c2 gap 0.95 {@dec}
text k0 "k" left of d0 gap 0.45 {@dec}
text k1 "k" left of d1 gap 0.45 {@dec}
text k2 "k" left of d2 gap 0.45 {@dec}

dot x0 "+" below d0 gap 0.55 {@xor}
dot x1 "+" below d1 gap 0.55 {@xor}
dot x2 "+" below d2 gap 0.55 {@xor}
box m0 "m_0" below x0 gap 0.55 same as iv {.tone-4 @out}
box m1 "m_1" below x1 gap 0.55 same as iv {.tone-4 @out}
box m2 "m_2" below x2 gap 0.55 same as iv {.tone-4 @out}

edge k0 -> d0
edge k1 -> d1
edge k2 -> d2
edge c0 -> d0
edge c1 -> d1
edge c2 -> d2
edge d0 -> x0
edge d1 -> x1
edge d2 -> x2
edge x0 -> m0
edge x1 -> m1
edge x2 -> m2
# Die Verkettung verlässt den Chiffrat-Kasten seitlich und läuft in der Lücke
# zwischen den Spalten nach unten. Geradewegs nach unten wäre kürzer und
# falsch: der Dec-Kasten steht genau darunter, die Linie liefe mitten
# hindurch und legte sich über den Pfeil, der wirklich hineinführt.
edge feed0 iv -> x0 via iv.right+0.2,iv.cy iv.right+0.2,d0.bottom+0.28
edge feed1 c0 -> x1 via c0.right+0.2,c0.cy c0.right+0.2,d0.bottom+0.28
edge feed2 c1 -> x2 via c1.right+0.2,c1.cy c1.right+0.2,d0.bottom+0.28

align y middle iv, c0, c1, c2
align y middle d0, d1, d2
align y middle x0, x1, x2
align y middle m0, m1, m2

step decrypt
  show @dec
step chain
  show @xor
  emph feed0, feed1, feed2
step recover
  show @out
  dim feed0, feed1, feed2
:::

Jeder `step` ist ein Druck auf die Vorwärtstaste. Die Verkettungspfeile haben je einen Wegpunkt (`via`) – mehr Wegführung brauchen diese Bilder nie.

## figure: Counter mode, encryption {.full #ctr}

::: draw {unit=104x66}
default text {.mono}
default box @enc {.round .tone-3}
default box @stream {.tone-2}
default box @msg {.tone-3}
default box @cipher {.tone-4}

box iv0 "IV" at 0,0    w 0.5 {.tone-1}
box n0  "0"  right of iv0 gap 0 w 0.42 {.tone-2}
box iv1 "IV" right of n0 gap 1.6 same as iv0 {.tone-1}
box n1  "1"  right of iv1 gap 0 same as n0 {.tone-2}
box iv2 "IV" right of n1 gap 1.6 same as iv0 {.tone-1}
box n2  "2"  right of iv2 gap 0 same as n0 {.tone-2}

box e0 "Enc" between iv0,n0 offset 0,1.35 {@enc}
box e1 "Enc" between iv1,n1 offset 0,1.35 same as e0 {@enc}
box e2 "Enc" between iv2,n2 offset 0,1.35 same as e0 {@enc}
text ke0 "k" left of e0 gap 0.65 {@enc}
text ke1 "k" left of e1 gap 0.65 {@enc}
text ke2 "k" left of e2 gap 0.65 {@enc}

box s0 "s_0" below e0 gap 0.6 w 0.8 {@stream}
box s1 "s_1" below e1 gap 0.6 same as s0 {@stream}
box s2 "s_2" below e2 gap 0.6 same as s0 {@stream}
dot x0 "+" below s0 gap 0.5 r 0.2 {@stream}
dot x1 "+" below s1 gap 0.5 same as x0 {@stream}
dot x2 "+" below s2 gap 0.5 same as x0 {@stream}
box mm0 "m_0" left of x0 gap 0.7 w 0.55 {@msg}
box mm1 "m_1" left of x1 gap 0.7 same as mm0 {@msg}
box mm2 "m_2" left of x2 gap 0.7 same as mm0 {@msg}
box cc0 "c_0" below x0 gap 0.5 same as s0 {@cipher}
box cc1 "c_1" below x1 gap 0.5 same as s0 {@cipher}
box cc2 "c_2" below x2 gap 0.5 same as s0 {@cipher}

edge n0 -> e0 {@enc}
edge n1 -> e1 {@enc}
edge n2 -> e2 {@enc}
edge ke0 -> e0 {@enc}
edge ke1 -> e1 {@enc}
edge ke2 -> e2 {@enc}

# Diese zwölf brauchen kein eigenes @tag und kein show: eine Kante ist nur so
# sichtbar wie ihre beiden Enden, also erscheint s->+ mit dem Schlüsselstrom,
# m->+ mit der Nachricht und +->c mit dem Chiffrat.
edge e0 -> s0
edge e1 -> s1
edge e2 -> s2
edge s0 -> x0
edge s1 -> x1
edge s2 -> x2
edge mm0 -> x0
edge mm1 -> x1
edge mm2 -> x2
edge x0 -> cc0
edge x1 -> cc1
edge x2 -> cc2

align y middle iv0, iv1, iv2
align y middle e0, e1, e2
align y middle s0, s1, s2
align y middle cc0, cc1, cc2

step keystream
  show @enc, @stream
step message
  show @msg
step cipher
  show @cipher
  emph cc0, cc1, cc2
:::

**Die geteilten Kästen sind zwei Kästen mit `gap 0`.** IV und Zähler tragen verschiedene Tönungen und stehen bündig aneinander; `between iv0,n0 offset 0,1.35` setzt die `Enc`-Box unter die Mitte des Paares, statt sie gegen einen der beiden zu schätzen. Die zwölf Pfeile im unteren Teil tragen weder `@tag` noch `show`: **eine Kante ist nur so sichtbar wie ihre beiden Enden**, also kommt jede von selbst in dem Schritt, in dem ihr zweiter Endpunkt erscheint.

# Identity and authentication

## figure: Identity lifecycle {.full #lifecycle}

::: draw {unit=176x56}
default box {.tone-3} w 1.15
default text {.small .muted}

# Die Phasenzeile trägt schon einen eigenen Ton, also braucht sie kein Fett
# dazu: Fett hebt *ein* Element hervor, es kennzeichnet keine Gattung. Und der
# Grundton ist der mittlere, nicht der satteste – neun kräftig gefüllte Kästen
# nebeneinander lassen dem `emph` im letzten Takt nichts, wovon es sich abheben
# könnte.
box  create "Creation" {.tone-1}
text sep1   "▶"             between create,usage {.large}
box  usage  "Usage"         right of create gap 1.95 same as create {.tone-1}
text sep2   "▶"             between usage,term {.large}
box  term   "Termination"   right of usage gap 1.95 same as create {.tone-1}

box  reg    "Registration"  below create gap 0.5 {@creation}
text regc   "identity"      below reg gap 0.2 {@creation}
box  prov   "Provisioning"  below regc gap 0.62 {@creation}
text provc  "issue credentials and\nprovide them to user"  below prov gap 0.2 {@creation}
box  authz  "Authorization" below provc gap 0.62 {@creation}
text authzc "granting of rights\nby the authority"  below authz gap 0.2 {@creation}

box  ident  "Identification" below usage gap 0.5 {@usage}
text identc "claim identity with\nunique name"  below ident gap 0.2 {@usage}
box  authn  "Authentication" below identc gap 0.62 {@usage}
text authnc "prove identity claim\nwith credentials"  below authn gap 0.2 {@usage}
box  acl    "Access Control" below authnc gap 0.62 {@usage}
text aclc   "granting of access\nby the system"  below acl gap 0.2 {@usage}

align y middle reg, ident
align y middle prov, authn
align y middle authz, acl

# Der Pfeil sitzt zwischen Bildunterschrift und nächstem Kasten, gehört aber
# nicht zur below-Kette: sonst schöbe ihn eine zweizeilige Unterschrift in
# den Kasten hinein, den align y middle gerade festgehalten hat.
text down1  "▼"  between regc,prov {@creation}
text down2  "▼"  between provc,authz {@creation}
text down3  "▼"  between identc,authn {@usage}
text down4  "▼"  between authnc,acl {@usage}

brace signup over reg,prov    side right "Signup" {.muted}
brace login  over ident,authn side right "Login" {.muted}

text sep3   "▶"              below authzc gap 0.5 {.large}
box  selfsv "Self-services"  right of sep3 gap 0.65 {.tone-4}

step creation
  show @creation, signup
step usage
  show @usage, login
step self
  show sep3, selfsv
  emph selfsv
:::

**Ohne `align y middle` driften die beiden Spalten auseinander.** Sie sind getrennte `below`-Ketten, und die Bildunterschriften sind mal ein-, mal zweizeilig – drei `align`-Zeilen halten die Reihen bündig.

## figure: Message authentication | it is not about confidentiality {.full #mac}

::: draw {unit=150x60}
image alice avatar-alice "Alice" w 0.42
image eve   avatar-bob   "Eve"   right of alice gap 3.5 same as alice {.ghost @attack}
image bob   avatar-bob   "Bob"   right of eve gap 3.5 same as alice
align y middle alice, eve, bob

text nA "Alice" below alice gap 0.06 {.small}
text nE "Eve"   below eve gap 0.06 {.small .muted @attack}
text nB "Bob"   below bob gap 0.06 {.small}
text kA "k" left of alice gap 0.5 {.mono .small}
text kB "k" right of bob gap 0.5 {.mono .small}

edge wire alice -> bob "M, T" via 1.28,1.5 2.42,1.5
edge replay eve.right:0.28 -> bob.left:0.28 "M, T   replay" {.accent .small @attack}
edge forge eve.right:0.72 -> bob.left:0.72 "forgery   M_F, T_F" {.accent .small @attack}
text def "defense?" above eve gap 0.3 {.hand .small @attack}

text macA "T = MAC_k(M)"            below nA gap 0.3 {.mono .small @proto}
text tagA "\"authentication tag\""  below macA gap 0.14 {.hand .small @proto}
text ver1 "Verify_k(M, T)"                below nB gap 0.3 {.mono .small @proto}
text ver2 "T' = MAC_k(M)\nT' equals T ?"  below ver1 gap 0.55 {.mono .small @proto}
edge howto ver1 -- ver2 {.muted .dotted @proto}
text eg   "e.g." between ver1,ver2 pad 0.12 {.paper .muted @proto}
align y middle macA, ver1

text goals "Security goals: *integrity*\nand *authenticity* but\n~not non-repudiation~" at 3.55,-1.05 {.left .serif}

step protocol
  show @proto
step attack
  show @attack
  emph replay, forge
:::

**Die Avatare sind Vektorgrafiken und folgen dem Theme.** `image alice avatar-alice` sucht die Datei in `assets/`, genau wie `![](fig-id)`; eine SVG-Datei wird als verschachteltes `<svg>` eingesetzt und erbt `--ink` und `--paper`. Die beiden Angriffspfeile setzen bei `eve.right:0.28` und `:0.72` an: Der Bruchteil hinter dem Doppelpunkt schiebt den Ansatzpunkt an der Kante entlang, und so laufen die beiden parallel, statt übereinanderzuliegen.

# The vocabulary

## figure: The pieces {.wide #primitives}

::: draw {unit=130x76}
box  a "Sender"
box  b "Mix"        right of a gap 1.05
box  c "Empfänger"  right of b gap 1.05
dot  x "+"          below b gap 0.8
text n "a free label, placed\nwherever it reads best"  right of x gap 1.45 -- x {.muted .small .left}
edge a -> b "encrypted"
edge b -> c "recoded"
edge b -> x {.dashed}
:::

`box`, `dot`, `text`, `image`, `edge`, `brace`, `container`, `bars`, `grid`, `plot`, `table`, `lanes`, `sequence`, `align`, `spread`, `default`, `step` – siebzehn Anweisungen, mehr nicht. Ein `text` bekommt mit `-- x` eine kurze Linie zu dem, worüber er spricht – einen Hinweisstrich, keinen Pfeil: ein Pfeil behauptet eine Verbindung, ein Strich sagt nur, worum es geht.

**Alles darin ist in Rastereinheiten gemessen, auch das, was keine Beschriftung hat.** Der `dot` in der Mitte hat kein `r` und hat deshalb einen *Radius* von 0.18 Einheiten – also 0.36 quer –, keine feste Pixelzahl. Der Unterschied fällt erst auf, wenn ein Block sein `unit=` ändert: Eine Pixelangabe bliebe liegen, während alle Kästen um sie herum größer werden.

## figure: Alignment {.wide #alignment}

::: draw {unit=140x70}
default box {.tone-2}

box a "one"                     at 0,0
box b "a much longer label"     right of a gap 1.2
box c "two"                     right of b gap 1.2
box d "middling"                right of c gap 1.2

box p "first"   below a gap 1.1
box s "fourth"  right of p gap 7.2
box q "a considerably wider one"  below p gap 0 h 0.8
box r "third"   below p gap 0 h 0.5
align y middle p, q, r, s
spread x p, q, r, s

edge a.left-0.8,a.cy -> a "from outside" {.muted}
:::

**Die beiden Reihen zeigen zwei verschiedene Arten von gleichmäßig.** Oben sind die *Kantenabstände* gleich – das gibt schon eine Kette aus `right of … gap n` her. Unten sind die *Mittelpunktabstände* gleich: `spread x` verteilt die inneren Elemente zwischen dem ersten und dem letzten, und weil der zweite Kasten viel breiter ist als seine Nachbarn, sind die Lücken links und rechts von ihm sichtbar kleiner. Der Pfeil links oben hat einen Endpunkt ohne Objekt – eine Koordinate statt eines unsichtbaren Ankers.

## figure: Containers and braces {.wide #grouping}

::: draw {unit=130x76}
default box {.tone-1} w 1.0

box r1 "Registration"  at 0,0
box r2 "Provisioning"  below r1 gap 0.55 same as r1
box r3 "Authorization" below r2 gap 0.55 same as r1
edge r1 -> r2
edge r2 -> r3
brace sign over r1,r2 side right "Signup" pad 0.62
container life "Creation" over r1,r2,r3 pad 0.42 {.dashed}
# Dieselbe Klasse wie auf einer Kastenbeschriftung. Eine Klammer, die drei
# Zeilen überspannt, hat für ihr Wort längs mehr Platz als quer.
brace whole over r1,r2,r3 side left "the whole thing" pad 0.5 {.turn .muted}
:::

Ein `container` legt sich um seine Mitglieder und passt sich neu an, wenn sie sich bewegen. Eine `brace` überspannt eine Teilmenge und hängt ihr Label nach außen. Beide messen ihren Abstand zum Inhalt mit demselben Wort, `pad` – die Klammer bekommt hier `0.62`, damit sie außerhalb der `0.42` des Containers zu liegen kommt.

**Genau deshalb sind Schwimmbahnen kein `container`.** Ein Container misst sich an dem, was er hält; drei Bahnen, in denen verschieden viele Dinge liegen, kommen so an beiden Enden verschieden lang heraus. Ein Schwimmbahn-Diagramm behauptet aber das Gegenteil: Die Bänder sind gleich lang, und ungleich ist nur, was darin passiert. Dafür ist `lanes` da – gleich breite Bänder, die von ihrem Inhalt nichts wissen wollen. Die Figur dazu steht weiter unten unter *Three roles, one incident*.

**`.turn` gilt für jede Beschriftung, nicht nur für die eines Kastens.** Die linke Klammer liest von unten nach oben, und dieselbe Klasse tut dasselbe an einer Container-Überschrift und an einem Kantenlabel – an allen vier Stellen also, an denen überhaupt eine Beschriftung gesetzt wird.

## figure: The look of a thing {.full #look}

::: draw {unit=118x74}
default box {.sharp} w 0.62 h 0.42

# Every fill the vocabulary has, drawn over a line so that .clear and .paper
# can be told apart: one lets the rule through, the other knocks it out.
edge -0.45,0 -- 6.1,0 {.muted}
box f1 "paper"  at 0,0 {.paper}
box f2 "tone-1" right of f1 gap 0.45 same as f1 {.tone-1}
box f3 "tone-2" right of f2 gap 0.45 same as f1 {.tone-2}
box f4 "tone-3" right of f3 gap 0.45 same as f1 {.tone-3}
box f5 "tone-4" right of f4 gap 0.45 same as f1 {.tone-4}
box f6 "clear"  right of f5 gap 0.45 same as f1 {.clear}
text fl "fill" left of f1 gap 0.8 {.muted}

text t1 "sans"  at 0.31,1.25
text t2 "mono"  right of t1 gap 1 {.mono}
text t3 "serif" right of t2 gap 1 {.serif}
text t4 "hand"  right of t3 gap 1 {.hand}
text tl "family" left of t1 gap 1.15 {.muted}

# Die drei Prominenzwörter, an freiem Text statt an Kästen: sie belegen einen
# Slot und verdrängen einander, und `.emph` färbt hier die Wörter selbst –
# ein Bild hat gar keine Tinte dafür und wird trotzdem von derselben Liste
# bedient, weil `emph` dort schlicht ein `dim` wieder abnimmt.
text pr0 "normal" at 0.31,1.85
text pr1 "emph"  right of pr0 gap 1 {.emph}
text pr2 "dim"   right of pr1 gap 1 {.dim}
text pr3 "ghost" right of pr2 gap 1 {.ghost}
text prl "prominence" left of pr0 gap 1.15 {.muted}

# One width, three answers: leave the type as it is and let it run over the
# border, shrink it until it fits, or let it fill the box in both directions.
box g1 "a label that is too long" at 0,2.3 w 1.2 h 0.46
box g2 "a label that is too long" right of g1 gap 0.55 same as g1 {.shrink}
box g3 "short"                    right of g2 gap 0.55 same as g1 {.fit}
text n1 "no"     below g1 gap 0.16 {.muted}
text n2 "shrink" below g2 gap 0.16 {.muted}
text n3 "fit"    below g3 gap 0.16 {.muted}
text gl "type meets\nits box" left of g1 gap 0.8 {.muted .right}

# Die fünf Umrisse, die kein Rechteck sind, und die eine Leserichtung, die
# nicht waagerecht ist. Beide gehören hierher, weil das der Katalog ist, den
# die Seitenleiste des Editors spiegelt.
box  s1 "hex"      at 0,3.5 w 0.66 h 0.42 {.hex .tone-2}
box  s2 "chevron"  right of s1 gap 0.5 same as s1 {.chevron .tone-2}
box  s3 "left"     right of s2 gap 0.5 same as s1 point left {.chevron .tone-2}
box  s4 ""         right of s3 gap 0.4 w 0.4 h 0.42 {.diamond .tone-2}
box  s5 ""         right of s4 gap 0.35 w 0.42 h 0.42 {.wedge .tone-4}
box  s6 ""         right of s5 gap 0.35 same as s5 point up {.wedge .tone-4}
# Ein Kreuz ohne eigenes w kommt quadratisch heraus – hier gibt ihm aber die
# Blockvoreinstellung eines, also stehen beide Zahlen da. Dass sie so ungleich
# aussehen und dasselbe meinen, ist der Punkt: 0.264 mal 118 ist 0.42 mal 74.
box  s7 ""         right of s6 gap 0.35 {.cross .accent}
box  s8 "turn"     right of s7 gap 0.65 h 0.62 {.tone-2 .turn}
text sl "outline, and\nreading direction" left of s1 gap 0.8 {.muted .right}

# Prominenz: ein Kanal, vier Zustände. Die drei Klassen heißen genau wie die
# drei Verben, die ein `step` dafür hat – deshalb steht die Reihe hier und
# nicht nur in der Seitenleiste des Editors. Der vierte Zustand hat keinen
# Namen und braucht auch keinen: `{!dim}` nimmt die Klasse wieder ab, hier
# gegen die Blockvoreinstellung eine Zeile darüber.
default box @prom {.dim}
box  p1 "emph"   at 0,5.1 w 0.62 h 0.42 {.emph}
box  p2 "normal" right of p1 gap 0.7 same as p1
box  p3 "dim"    right of p2 gap 0.7 same as p1 {.dim}
box  p4 "ghost"  right of p3 gap 0.7 same as p1 {.ghost}
box  p5 "!dim"   right of p4 gap 0.7 same as p1 {@prom !dim}
text pl "prominence" left of p1 gap 0.8 {.muted .right}
:::

**Der experimentelle, für Desktop-Bildschirme gedachte Editor zeigt genau diese Reihen in seiner Seitenleiste.** Er ist umfangreich automatisiert getestet, aber noch nicht breit von Menschen erprobt. Die Klassen sind eine geschlossene Aufzählung, keine freien Farben – jede Füllung mischt sich aus `--emph` und `--ink` über `--paper` und überlebt damit alle sieben Themes.

**`.paper` in der oberen Reihe sieht wirkungslos aus und ist es nicht.** Es ist zwar die Voreinstellung einer Box, aber unter einem `default box {.tone-3}` findet eine Box ohne diese Klasse nicht mehr dorthin zurück, und ein freier `text` bekommt ohne sie überhaupt keinen Hintergrund – der ist es, der die Linie hinter einer Beschriftung ausstanzt.

**Die untere Reihe sind die fünf Umrisse, die kein Rechteck sind, und `.turn`.** Sie teilen sich einen Slot mit `.round` und `.sharp` – eine Gruppe von Klassen, von denen immer nur eine gelten kann –, weil ein Sechseck keinen Eckenradius hat, über den sich streiten ließe; gezeichnet werden dieselben vier Zahlen wie bei einem Rechteck, nur zu einem anderen Pfad verbunden. `.turn` liest die Beschriftung von unten nach oben; ein hoher schmaler Kasten hat für ein Wort nur längs Platz, und die Alternative ist ein Buchstabe pro Zeile.

**Ein `.cross` ohne eigenes `w` kommt quadratisch heraus, auch unter einer Blockvoreinstellung.** Ein Pluszeichen mit zwei verschieden langen Armen ist keines: Ohne diese Ausnahme bekäme das Kreuz die Mindestbreite, die eine Zeile Schrift verlangt, und käme damit auf 66 mal 37 Pixel – eine gedehnte Form statt eines Zeichens. Das `default box … w 0.62` dieser Reihe gilt für die Rechtecke darin, und ein Kreuz ist keines, also geht es daran vorbei – dieselbe Ausnahme, die `bars` beim Umriss macht. Ein auf der eigenen Zeile ausgeschriebenes `w` gewinnt weiterhin, denn das ist eine Aussage über dieses eine Element.

**`.diamond` ist der eine Umriss, der beide Achsen frisst.** Der breiteste Platz, den eine Raute anbietet, ist ein Streifen von halber Breite und halber Höhe durch ihre Mitte – der Build bemisst sie deshalb auf das Doppelte dessen, was ein Rechteck für dieselbe Zeichenkette bräuchte, und zwar in beiden Richtungen. Ein Satz in einer Raute kommt damit auf die vierfache Fläche der Kästen daneben und nimmt das Bild ein; zwei, drei Wörter sind das Maß, und die Erläuterung gehört in eine Notiz nebenan. Die Raute in dieser Reihe trägt aus demselben Grund gar keine Beschriftung – die beschriftete steht im Flussdiagramm weiter unten. `.hex` sagt „hier wird gefragt“ ebenfalls; die Raute sagt darüber hinaus, dass es auf zwei Arten weitergeht, und darauf ist ein Raum seit der Schule trainiert.

**Wohin ein Umriss zeigt, sagt die Option `point`, nicht der Klassenname.** `{.chevron} point left` statt einer eigenen Klasse `.chevron-left`: ein Chevron nach oben ist dieselbe Form, anders ausgerichtet, und für jede Form mal jede Richtung ein Wort würde die geschlossene Liste vervierfachen. `point` gilt für `.chevron` und `.wedge`; auf einer Form ohne Spitze lehnt der Build es ab, statt es zu überlesen.

**Die letzte Reihe ist der eine Kanal, den die Sprache an drei Stellen buchstabiert – und an allen dreien gleich.** `.emph`, `.dim` und `.ghost` sind Klassen auf der Zeile eines Elements; sie sind die Verben, die ein `step` dafür hat (`dim a, b`); und auf einer `bars`-Zeile nennen dieselben drei Wörter Spaltennummern. Wer eine der drei Formen kennt, kennt alle drei. Der vierte Zustand – ganz gewöhnliche Prominenz – hat absichtlich keinen Namen: `{!dim}` nimmt die Klasse ab, statt eine vierte hinzuzufügen, und das gilt für jede Klasse und in jedem Tail.

**`p5` trägt `@prom` und damit die Voreinstellung `default box @prom {.dim}` – und `{!dim}` daneben.** Ohne diese Marke gäbe es keinen Weg zurück: ein `style`-Schritt konnte eine Klasse immer nur *hinzufügen*, und viele Slots buchstabieren ihren Grundzustand als die Abwesenheit aller Mitglieder. Ein Takt konnte einen solchen Zustand also verlassen und nie wieder erreichen.

**Was auf der Zeile steht, steht auch im Handout; was in einem `step` steht, nicht.** Das ist die ganze Regel, und sie ist der Quelle anzusehen: Prominenz auf der eigenen Zeile beschreibt die Zeichnung, Prominenz in einem Takt ist eine Handlung im Vortrag. Der Druck nimmt sie deshalb aus dem Eröffnungstakt und nicht aus dem letzten.

**Wenn Schrift und Kasten nicht zusammenpassen, gibt es drei Antworten.** Ohne `w` wächst der Kasten zur Schrift. Bei festem `w` verkleinert `.shrink` die Schrift, bis sie hineinpasst, und `.fit` füllt den Kasten in beide Richtungen aus, begrenzt auf 0.6–1.5× der Grundgröße. Weil die Textbreite beim Bauen nur *geschätzt* wird – einen Browser gibt es dabei nicht –, fällt die gewählte Größe eine Spur zu klein aus. Das ist die sichere Richtung.

**Der erste Kasten läuft absichtlich über, und der Build sagt das auch:** `box g1 is 1.2 units wide but its label needs about 1.64`. Das ist die Antwort, die man nicht will: ein festes `w`, das für die Beschriftung zu klein ist, und weder `.shrink` noch `.fit`. Es ist die eine Warnung, mit der diese Vorlesung baut.

## figure: Steps that move {.wide #motion}

::: draw {unit=140x72}
default box w 0.92

box  cl "Client"  at 0,0
box  sv "Server"  right of cl gap 5.65 same as cl
box  px "Proxy"   below cl gap 1.05

container zone "auf dem Weg" over cl,sv,px {.bare .tone-2}

edge direct cl <-> sv "HTTP"
edge up cl -> px {.dashed}
edge down px -> sv {.dashed}

text note "der Kasten wandert,\ndie Pfeile folgen" below px gap 0.5 -- px {.hand .small}

step erscheint
  show px
  # Der direkte Pfeil ist noch da und soll zurücktreten, nicht verschwinden.
  dim direct
step dazwischen
  hide direct
  move px to between cl,sv
  emph px
step wieder-alle
  show direct
  # Und hier zurück auf gewöhnliche Prominenz. Dafür gibt es kein viertes
  # Wort - der Zustand *ist* die Abwesenheit der drei, also nimmt man die
  # Klasse ab, statt eine weitere hinzuzufügen.
  style direct {!dim}
  style px {!emph}
:::

**`move` verschiebt ein Element, und alles, was daran hängt, geht mit.** Der Proxy bekommt `move px to between cl,sv`, und weil das Layout pro Schritt neu ausgewertet wird, hängen die beiden gestrichelten Pfeile weiterhin an ihm, die kurze Linie am Label zeigt weiter auf ihn, und der `container` fasst plötzlich eine Reihe statt zwei. `hide direct` nimmt den direkten Pfeil weg. `to` setzt eine Position, `by` verschiebt um einen Betrag – und **ein `move @tag to …` lehnt der Build ab**, weil es die ganze Menge auf einen Punkt legen würde; für eine Menge ist `by` gemeint.

**Ein Takt kann eine Klasse auch wieder abnehmen, und `{!klasse}` ist das einzige Wort dafür.** Ein `style`-Schritt konnte lange nur *hinzufügen*, und weil viele Slots ihren Grundzustand als die Abwesenheit aller Mitglieder buchstabieren – gewöhnliche Prominenz, ein durchgezogener Strich, die normale Schriftgröße –, konnte ein Takt einen solchen Zustand verlassen und nie wieder erreichen. Der letzte Takt hier nimmt `.dim` und `.emph` ab und gibt dem Bild seine Ausgangsgewichtung zurück. Die Marke nimmt **genau den genannten Namen** weg, nicht den Slot: `{!dim}` räumt kein `.ghost` weg, und ein späterer Takt darf `.dim` erneut setzen.

**Was an etwas Unsichtbarem hängt, bleibt selbst unsichtbar.** Weder der `container` noch die gestrichelten Pfeile noch das handschriftliche Label brauchen deshalb ein eigenes `show`: Ein Pfeil ist nur so sichtbar wie seine Enden, ein `container` nur so sichtbar wie seine Mitglieder, und ein `text` mit einer Linie nur so sichtbar wie das, worauf er zeigt. Der erste Schritt sagt `show px` und nichts weiter – die beiden gestrichelten Pfeile kommen mit dem Proxy von selbst.

**Wer ein Element beim Namen nennt, setzt diese Regel außer Kraft, und zwar in beide Richtungen.** `hide direct` nimmt den direkten Pfeil weg, obwohl beide Enden weiter dastehen; ein ausgeschriebenes `show` holt umgekehrt etwas auf den Schirm, dessen Quelle noch fehlt – ein Umriss etwa, der um seine ganze Menge stehen soll, bevor die Menge beisammen ist (die Figur dazu ist der Baum unter *Leaves first, and the brackets follow*). Beides gilt ab dem Takt, in dem es steht, und für jeden danach. Ausgeschrieben gehört es nur dorthin, wo die Regel das Falsche sagt. Wer auf jedes Element ein `show` schreibt, hat eine Figur, die beim nächsten ergänzten Element unvollständig bleibt: Das Element steht im Block, kein Schritt nennt es, und es erscheint nie.

## figure: Where the words sit {.wide #justify}

::: draw {unit=126x86}
default box {.sharp} w 0.66 h 0.72

# Ein hoher Kasten mit kurzer Beschriftung ist der Fall, für den es diese
# Wörter gibt. Ohne sie sitzt jede Zeile in der Mitte, was bei einem
# Stack-Rahmen oder einer Matrixzeile das Falsche sagt.
box  tl "top\nleft"                      at 0,0    {.top .left}
box  tc "top"           right of tl gap 0.35       {.top}
box  tr "top\nright"    right of tc gap 0.35       {.top .right}
box  ml "left"          below tl gap 0.25          {.left}
box  mc "centred"       right of ml gap 0.35
box  mr "right"         right of mc gap 0.35       {.right}
box  bl "bottom\nleft"  below ml gap 0.25          {.bottom .left}
box  bc "bottom"        right of bl gap 0.35       {.bottom}
box  br "bottom\nright" right of bc gap 0.35       {.bottom .right}

# Ein freier `text` hat keinen Rand, von dem er Abstand halten müsste, und
# deshalb auch kein Padding: seine Box *ist* der Zeilenblock. Die Wörter
# richten ihn an seiner eigenen Kante aus, nicht an einer inneren. Die
# Grundfläche macht das sichtbar – sie wird nach außen gezeichnet.
text fl "frei, links"   below bl gap 0.3 {.left .small .paper}
text fr "frei, rechts"  below br gap 0.3 {.right .small .paper}

# Und die Lesart, die *nicht* hierher gehört: An einer Kante sagen dieselben
# vier Wörter nichts über den Zeilenblock, sondern auf welcher Seite der
# Linie die Beschriftung liegt. Das ist eine Frage mit einer Antwort statt
# zweier Kanäle mit je dreien - deshalb ist es dort die Option `side` und
# keine Klasse, und deshalb lehnt der Build `{.top}` auf einer Kante ab.
edge sa tl.left,tl.top-0.5 -> tr.right,tr.top-0.5 "side top" side top {.small .muted}
edge sb bl.left,bl.bottom+0.95 -> br.right,br.bottom+0.95 "side bottom" side bottom {.small .muted}
:::

**`left` und `right` sagen, wo eine Zeile steht, `top` und `bottom`, wo der Block aus Zeilen steht.** Gemessen wird gegen das **Padding**, nicht gegen den Rand – `left` heißt „so weit nach links, wie dieser Kasten es zulässt“. Ohne eines dieser Wörter sitzt die Beschriftung mittig, was für fast jeden Kasten richtig ist; die Wörter sind für die übrigen da, für einen hohen Kasten mit kurzer Beschriftung vor allem.

Bei mehreren Zeilen bewegt sich der **Block**, nicht die einzelne Zeile. Deshalb setzt `bottom` bei zwei Zeilen die *letzte* auf die innere Kante und nicht die erste. `turn` schlägt beides: eine gedrehte Beschriftung liest von unten nach oben und ist auf ihrem Punkt zentriert, wie herum auch immer.

**Die neun Felder oben sind zwei unabhängige Kanäle, die zwei Linien darum sind einer.** Eine Kastenbeschriftung steht irgendwo in einem Rechteck aus Platz, also gibt es quer drei Antworten und längs drei; eine Kantenbeschriftung liegt auf der einen oder der anderen Seite ihrer Linie, und das ist alles. Dieselben vier Wörter für beides hieß, dass `{.top .left}` auf einer Kante schreibbar war, obwohl eine Kante nur eine Seite zu wählen hat. Auf der Kante heißt es deshalb `side <wort>`, nach demselben Muster wie `point` bei den Umrissen: eine geschlossene Wortliste als Option statt eine Klasse je Wort. Welches Paar überhaupt wählen kann, steht erst fest, wenn die Linie geroutet ist – wer das andere nennt, bekommt eine Warnung.

## figure: Six statements that expand {.full #expand}

::: draw {unit=150x62}
bars f "20,19,17,12,11,10,9,9,8,7,6,5" at 0,0 w 2.4 h 1.0 {.tone-3 .bare}
brace b1 over f-0,f-1,f-2 side bottom "Bin 1" pad 0.4 {.muted}
brace b2 over f-3,f-4,f-5,f-6,f-7 side bottom "Bin 2" pad 0.4 {.muted}
brace b3 over f-8,f-9,f-10,f-11 side bottom "Bin 3" pad 0.4 {.muted}

grid g dot 8x6 right of f gap 2.2 cell 0.13 space 0.06 {.tone-2}
text gl "8 × 6" below g gap 0.3 {.small .muted}

step bins
  show b1, b2, b3
step exception
  style g-7-0, g-7-1, g-7-2 {.tone-4}
  emph f-0, f-1, f-2
:::

**Sechs Anweisungen erzeugen beim Parsen gewöhnliche Elemente.** `bars` wird zu einer Box je Säule (`f-0` … `f-11`), einer Grundlinie und – wenn eine zweite Zeichenkette dasteht – einem Text je Beschriftung; `grid` zu einer Zelle je Feld (`g-<spalte>-<zeile>`); `plot` zu einem Rahmen mit Gitterlinien und Achsen, `table` zu einer Box je Zelle, `lanes` zu einem Band je Bahn, `sequence` zu einem Kopf, einer Lebenslinie, einer Nachricht und einer Notiz je Eintrag. Alles Weitere behandelt das Ergebnis wie jedes andere Element: Die `brace` überspannt drei Säulen, weil drei Säulen drei ganz normale Kästen sind, und ein `style`-Schritt färbt drei Zellen, weil es Kästen sind. Möglich ist das, weil eine Koordinate die eines anderen Elements sein darf – jede Zelle steht an der Kante des Rahmens, den dieselbe Anweisung anlegt. Die vier übrigen stehen weiter hinten: `plot` zwei Figuren später, `table`, `lanes` und `sequence` unter *Four arrangements*.

**Auch eine Kante ist etwas, an dem sich eine Koordinate ablesen lässt.** `w1.cx`, `w1.cy`, `above w1 gap 0.2`: Was dabei gelesen wird, ist der Hüllrahmen der Leitung. Das zählt, sobald ein Satz die Leitung beschreibt statt eines ihrer Enden. Am Kasten festgemacht hält so ein Satz seinen Abstand zum Kasten und verliert ihn zur Linie, sobald sich ein Bruchteil oder eine Höhe ändert – gewarnt wird dabei nicht. Eine Kante hat keinen Namen, bis man ihr einen gibt – und der steht, wie bei jeder anderen Anweisung, vorn: in dem Feld vor dem ersten Endpunkt, also `edge w1 mix -> log`. Anonym bleiben kostet nichts, denn das Feld ist optional. Wer im Kreis herum platziert – ein Element gegen eine Kante, die selbst an ihm hängt –, bekommt `placement cycle` mit der Zeilennummer.

**`cell` zählt auf beiden Achsen in der Höhe einer Rastereinheit, genau wie `pad`.** Ein Feld des `grid` soll quadratisch sein; eine Zahl, die quer die Breite und hoch die Höhe der Rastereinheit meinte, ergäbe Quadrate nur dort, wo die Einheit selbst quadratisch ist.

**Der Abstand *innerhalb* dieser Anweisungen heißt `space`, nicht `gap`.** Auf derselben Zeile steht eine Platzierung, und dort bedeutet `gap` den Abstand zu einem anderen Element. Der Abstand zwischen zwei Säulen ist etwas anderes und heißt deshalb anders.

## figure: A second run of columns {.full #series}

::: draw {unit=150x64}
# Dieselben acht Zahlen, zweimal gezeichnet. Die zweite Zeile legt keinen
# eigenen Rahmen an, sie tritt dem ersten bei – und die Spalten des ersten
# werden dafür schmaler, damit das Paar den Platz einer einzelnen einnimmt.
bars a  "12,15,19,24" "Q1 Q2 Q3 Q4" at 0,0 w 1.9 h 1.05 emph 3 dim 0 {.tone-2}
bars a2 "9,11,10,21"  series of a emph 3 dim 0 {.tone-3}
text an "side by side" below a gap 0.55 {.muted}

bars b  "12,15,19,24" "Q1 Q2 Q3 Q4" right of a gap 3.5 w 1.9 h 1.05 emph 3 dim 0 {.tone-2}
bars b2 "9,11,10,21"  series of b stacked emph 3 dim 0 {.tone-3}
text bn "stacked" below b gap 0.55 {.muted}

text y1 "2023" at a.left+0.32,a.top-0.34 pad 0.12 {.tone-2}
text y2 "2024" right of y1 gap 0.55 pad 0.12 {.tone-3}
:::

**`series of a` heißt: dieselben Spalten, ein zweiter Lauf.** Die zweite `bars`-Zeile bekommt keinen Rahmen, keine Grundlinie und keine Beschriftungsleiste – die gehören alle dem Rahmen, dem sie beitritt, und wer sie trotzdem hinschreibt, bekommt einen Fehler. Eine Platzierung nimmt sie aus demselben Grund nicht an. Was sie mitbringt, sind ihre Werte, ihre Klassen und – wie jede andere `bars`-Zeile auch – die beiden Wörter, die Spalten schon vom ersten Takt an auszeichnen.

**Der Unterschied zwischen den beiden Bildern ist ein Wort, und er ändert die Skala.** Ohne `stacked` stellt sich der zweite Lauf *neben* den ersten, und die Zelle einer Spalte wird unter beiden aufgeteilt; mit `stacked` stellt er sich *darauf*, und der Maßstab ist nicht mehr der höchste Einzelwert, sondern der höchste Stapel. Rechts sind dieselben Zahlen deshalb flacher als links, obwohl kein Wert sich geändert hat. Welche der beiden Lesarten man will, ist eine inhaltliche Frage: nebeneinander vergleicht die Jahre, gestapelt zählt sie zusammen.

**`emph 3 dim 0` steht auf der Anweisung, nicht in einem Schritt.** Q4 ist das, worum es geht, und Q1 wurde erst ab Februar gezählt – beides gilt, sobald das Bild da ist. Als Schritt geschrieben wäre das Erste, was der Raum sieht, vier gleichwertige Quartale, und die Aussage entstünde erst auf Tastendruck. Alle drei Prominenzwörter – `emph`, `dim`, `ghost` – nehmen hier Spaltennummern, ab 0 gezählt; eine Nummer, für die es keine Säule gibt, lehnt der Build ab. Es sind dieselben drei, die auf einer Elementzeile Klassen sind und in einem Takt Verben.

## figure: Columns laid flat | dieselben sechs Zahlen, zweimal {.full #flat}

::: draw {unit=150x54}
# Links und rechts stehen dieselben Werte. Links sind die Kategorien so breit,
# wie eine Säule breit ist, also stehen dort Nummern und die Namen müssten
# woanders stehen; rechts sind sie die Achse. Dieselbe emph-Spalte in beiden
# Bildern, damit man sieht, dass es dieselben Zahlen sind.
bars up "41,33,22,14,9,6" "1 2 3 4 5 6" at 0,0 w 1.25 h 2.0 emph 3 {.tone-3}
text upn "the names go elsewhere" below up gap 0.55 {.small .muted}

bars inc "41,33,22,14,9,6" "Phishing | Ransomware | Credential stuffing | DNS cache poisoning | Supply-chain compromise | Insider misuse" right of up gap 4.7 horizontal w 1.8 h 2.0 emph 3 {.tone-3}
text incn "the names are the axis" below inc gap 0.55 {.small .muted}
:::

**`horizontal` legt die Säulen um: die Balken laufen nach rechts, die Kategorien stapeln sich nach unten.** Es steht als einzelnes Wort auf der `bars`-Zeile, genau wie `stacked`. Die Beschriftungsleiste wird dabei zu einer rechtsbündigen Spalte im linken Rand – jedes Wort nach seiner eigenen gemessenen Breite gesetzt, damit die rechten Kanten eine Linie bilden –, und die Grundlinie steht senkrecht links, statt waagerecht unten zu liegen. Die Zahlen sind erfunden.

**Quer sind die Größenverhältnisse besser zu lesen.** Alle Balken beginnen an derselben senkrechten Kante, und das Auge vergleicht Längen von einer gemeinsamen Startlinie aus zuverlässiger als Höhen über einem gemeinsamen Boden – links muss man die Säulenoberkanten der Reihe nach ansteuern, rechts liest man die Rangfolge in einem Blick ab. Dazu kommt, dass eine absteigend sortierte Reihe von Balken von selbst wie eine Rangliste aussieht.

**Und erst quer ist überhaupt Platz für die Namen.** Eine Kategorie, die „DNS cache poisoning“ heißt, lässt sich unter eine aufrechte Säule nicht schreiben; links stehen deshalb Nummern, und der Raum schlägt in einer Legende nach, die es hier gar nicht gibt. Möglich macht das die zweite Zeichenkette: **enthält sie einen `|`, wird an dem geteilt statt an Leerzeichen**, und ein Etikett darf so viele Wörter haben, wie es braucht. `|` trennt schon die Zellen einer `table`-Zeile und die Namen einer `lanes`-Liste.

## figure: A frame to draw in {.full #plot}

::: draw {unit=150x58}
# Eine ROC-Kurve gehört ins Quadrat: beide Achsen tragen dieselbe Einheit, und
# die Diagonale muss unter 45° laufen, sonst behauptet das Bild eine Steigung,
# die es nicht gibt. `w` und `h` geben das nicht her – hier stünden 2.2 und
# 5.69 nebeneinander und sähen nach allem anderen als nach einem Quadrat aus.
plot roc "False positive rate" "True positive rate" at 0,0 w 2.2 aspect 1:1 x 0,1 y 0,1 tick 0.2

edge chance roc@0,roc@0 -- roc@1,roc@1 {.muted .dashed}
edge good roc@0,roc@0 -- roc@1,roc@1 via roc@0.03,roc@0.45 roc@0.1,roc@0.72 roc@0.3,roc@0.9 roc@0.6,roc@0.97 {.smooth .accent .thick}
# Ein Kantenlabel neben der Linie, und der Grund fährt mit: Er stanzt die
# Diagonale und die Gitterlinien aus, die unter der Kurve durchlaufen. pad 0
# ist hier nicht Sparsamkeit – der Grund ist Label plus pad, und mit dem
# üblichen pad deckte er die Linie wieder zu, von der .right ihn gerade
# weggerückt hat. Im Quadrat steigt die Kurve in ihrer Mitte steiler als sie
# läuft, also gilt hier das senkrechte Wortpaar; flach gezogen war es .bottom.
edge weak roc@0,roc@0 -- roc@1,roc@1 via roc@0.15,roc@0.3 roc@0.4,roc@0.6 roc@0.7,roc@0.85 "weaker" pad 0.08 {.smooth .paper .small} side right

# Auf der Linie, nicht daneben: der .paper-Grund ist nur dann etwas wert,
# wenn er wirklich etwas ausstanzt.
text nchance "chance" at roc@0.74,roc@0.74 pad 0.12 {.small .paper}
# Und die Leitlinie greift die Kurve an ihrem rechten Ende ab, statt quer
# durch das Feld zu laufen und dabei beide Kurven zu kreuzen. Im Quadrat
# reicht dafür ein „rechts daneben“ nicht mehr: die Mitte der rechten Kante
# liegt jetzt tief genug, dass die Leitlinie von dort aus die Diagonale
# schnitte. Die Höhe kommt deshalb aus den Einheiten des Plots selbst.
text ngood   "the one you want" at roc.right+0.6,roc@0.93 -- roc@0.86,roc@0.99 {.small .hand}

step curves
  show good, weak
step judge
  emph good
  dim weak
:::

**Ein `plot` ist ein Rahmen zum Hineinzeichnen, keine Diagrammbibliothek.** Er legt Gitterlinien, Achsenbeschriftungen und die beiden Achsentitel an – und eine Umrechnung, sodass `roc@0.35` einen Wert in den Einheiten des Plots benennt. Aufgelöst wird die erst, wenn der Block ganz gelesen ist, und zwar in das gewöhnliche `roc.left+n`; ein Punkt darf deshalb einen Plot nennen, der weiter unten steht.

**`w` und `h` sind in Rastereinheiten gemessen, und eine Rasterzelle ist nicht quadratisch – das ist die Falle.** Bei `unit=150x58` kommt ein `plot … w 1.9 h 1.5` als 285 mal 87 Pixel heraus: die beiden Zahlen liegen um ein Viertel auseinander, das Bild um mehr als das Dreifache. **`aspect W:H` sagt stattdessen das Verhältnis, das der Leser wirklich sieht**, und der Build rechnet die fehlende der beiden Zahlen aus. Diese ROC-Kurve steht deshalb auf `aspect 1:1` und ist quadratisch, wie es sich für zwei Achsen mit derselben Einheit gehört – die Zufallsdiagonale läuft unter 45°, und das ist die einzige Steigung, bei der sie das sagt, was sie heißt. Erlaubt sind `4:3`, `1:1` oder eine einzelne Zahl („so viel breit wie hoch“); `w`, `h` und `aspect` zusammen sind ein Fehler, weil sonst zwei Angaben dastünden, die sich widersprechen können. Auf `bars` gilt dasselbe Wort und dieselbe Regel.

**Die Kurven sind gewöhnliche Kanten.** `.smooth` zieht dieselben Wegpunkte als Kurve *durch* sie hindurch statt als Streckenzug – ein interpolierender Spline, damit ein Wegpunkt genau dort bleibt, wo er hingeschrieben wurde. Die Schiefe-Warnung schweigt hier, denn ihre Prämisse gilt nicht: bei einer Kurve sind zwei fast waagerechte Punkte die Form und nicht zwei Enden, die sich verfehlt haben.

**„weaker“ ist ein Kantenlabel *neben* der Linie, und der Grund fährt mit.** Eine Füllklasse an einer Kante zeichnet einen Grund hinter das Label; ohne ein `side top`, `side bottom`, `side left` oder `side right` bleibt es auf der Linie und stanzt sie aus – so wie das Flussdiagramm weiter unten es mit „yes“ und „no“ macht. Mit einem davon rückt es weg und nimmt den Grund mit. Für den Namen einer Kurve ist das die einzige Wahl: auf der Linie stanzte er genau das aus, was er benennt. Zu tun hat der Grund hier trotzdem etwas, denn unter der Kurve laufen die Diagonale und zwei Gitterlinien durch.

**Das Wort ist kurz, und das ist hier keine Geschmacksfrage.** Weggerückt wird entlang der Normalen *in der Mitte* der Kurve, aber die Kurve steigt weiter – also läuft ein langes Label an seinen Enden in die eigene Linie zurück, statt neben ihr zu bleiben. Neben einer waagerechten oder senkrechten Kante stellt sich die Frage nicht, und dort darf das Label so lang sein, wie es sein muss.

## figure: One size, two frames | zwei Plots, die sich vergleichen lassen {.full #sameframe}

::: draw {unit=150x54}
# Zwei Rahmen, die verglichen werden sollen. Der linke schreibt seine Größe
# hin, der rechte zeigt darauf. Die graue Kurve ist in beiden dieselbe: Sie
# ist der Bezug, gegen den beide Standorte gelesen werden.
plot pa "week" "alerts, site A" at 0,0 w 1.4 aspect 4:3 x 0,8 y 0,8 tick 2
plot pb "week" "alerts, site B" right of pa gap 3.2 same as pa x 0,8 y 0,8 tick 2

edge ra pa@0,pa@2 -- pa@8,pa@6.4 via pa@2,pa@3 pa@4,pa@4.4 pa@6,pa@5.6 {.smooth .muted .thick}
edge rb pb@0,pb@2 -- pb@8,pb@6.4 via pb@2,pb@3 pb@4,pb@4.4 pb@6,pb@5.6 {.smooth .muted .thick}
edge sa pa@0,pa@3.2 -- pa@8,pa@2.4 via pa@2,pa@2.6 pa@4,pa@1.8 pa@6,pa@2.2 {.smooth .accent}
edge sb pb@0,pb@3.2 -- pb@8,pb@7.6 via pb@2,pb@4.4 pb@4,pb@5.2 pb@6,pb@6.8 {.smooth .accent}
:::

**`same as` auf einer `plot`- oder `bars`-Zeile übernimmt den ganzen Rahmen.** Der rechte Plot schreibt keine eigene Größe hin, sondern zeigt auf den linken, und die beiden Bilder sind damit auf den Pixel gleich groß. Zwei Bilder, die verglichen werden sollen, muss der Blick in Gedanken übereinanderlegen können; zwei Rahmen, die sich um eine Haaresbreite unterscheiden, geben das nicht her.

**Kopiert wird beim Lesen der Zeile, nicht beim Layout – anders als bei einem Kasten.** Gitterlinien, Achsenbeschriftungen und Säulen werden aus `w` und `h` gesetzt, sobald die Zeile gelesen ist; eine Größe, die erst später ankäme, verschöbe den Rahmen und ließe alles darin stehen. Die Anweisung, von der kopiert wird, muss deshalb **über** der stehen, die kopiert, und der Build benennt, was schiefging: ein Name, der erst weiter unten steht, einer, der auf etwas anderes als `plot` oder `bars` zeigt, oder einer, den es im Block gar nicht gibt. Zusammen mit `w`, `h` oder `aspect` ist `same as` ein Fehler, und auf einer `series of`-Zeile ebenfalls: Eine Serie zeichnet in einem Rahmen, den sie nicht anlegt.

**Gleich große Rahmen sind noch kein gemeinsamer Maßstab.** `x` und `y` stehen auf jeder `plot`-Zeile für sich, und niemand prüft, ob zwei Rahmen dieselben Bereiche tragen – oben stehen sie deshalb zweimal ausgeschrieben da, und das ist die Stelle, die man vor dem Abgeben noch einmal liest. Bei `bars` gibt es nicht einmal einen Bereich zum Hinschreiben: Jede `bars`-Anweisung skaliert auf ihren eigenen höchsten Wert, zwei gleich große Rahmen können also Säulen enthalten, die sich nicht vergleichen lassen.

## figure: A raster does not follow the theme {.standard #raster}

::: draw {unit=150x60}
image swatch swatch w 0.6
text  note "a raster keeps its own colours\nin every theme" right of swatch gap 0.9 -- swatch {.small .muted .left}
:::

Beim Durchschalten der Themes mit `A` bleibt das Rasterbild, wie es ist, während Kästen, Pfeile und Vektorgrafiken umfärben. Das ist der Preis für Pixel.

# Four arrangements

## figure: The road straight down | a flowchart {.wide #flowchart}

::: draw {unit=132x70}
default box {.tone-2}

# Die Hauptstraße läuft geradewegs nach unten, jeder Zweig geht seitlich ab:
# Wer der senkrechten Linie folgt, folgt dem Fall, der durchgeht. Die beiden
# Rauten bekommen kein w. Ein festes w hilft hier auch niemandem: Die
# Zu-eng-Warnung misst gegen das Rechteck, nicht gegen den halb so breiten
# Streifen, den eine Raute wirklich anbietet.
# Man würde diese Figur gar nicht zeichnen: ein Ablauf aus Bedingungen und
# Zuweisungen liest sich als Pseudocode schneller als als Flussdiagramm. Sie
# steht hier für die *Form*, nicht als Empfehlung für diesen Inhalt.
box  pkt  "Packet arrives"          at 0,0 w 1.4 {.tone-3}
box  d1   "Known flow?"             below pkt gap 0.45 {.diamond .tone-1}
box  d2   "Rule permits?"           below d1 gap 0.45 {.diamond .tone-1}
box  fwd  "Forward"                 below d2 gap 0.45 w 1.4
box  fast "Forward,\nno rule check" right of d1 gap 1.3 w 1.4
box  drop "Drop"                    right of d2 gap 1.3 w 1.4 {.tone-4}
text note "state table,\nper five-tuple" left of d1 gap 1.15 -- d1 {.muted .right}

# Die beiden Rauten sind verschieden breit, also enden ihre Zweige an
# verschiedenen Stellen. Das align holt die zweite Spalte wieder bündig.
align x left fast, drop

edge pkt -> d1
edge d1 -> d2   "no"  {.paper}
edge d1 -> fast "yes" {.paper}
edge d2 -> fwd  "yes" {.paper}
edge d2 -> drop "no"  {.paper}
:::

**Die Raute ist der Umriss, den ein Raum nicht erklärt bekommen muss.** Er hat ihn in der Schule gelernt: Hier wird gefragt, und es geht auf zwei Arten weiter. Bezahlt wird das mit Platz. Der breiteste Streifen, den eine Raute anbietet, ist halb so breit und halb so hoch wie sie selbst, also bemisst der Build sie auf das Doppelte – zwei, drei Wörter, und die Erläuterung steht in einer Notiz daneben, so wie hier links. Ein ganzer Satz in einer Raute käme auf die vierfache Fläche der Kästen ringsum und wäre das Bild.

**Die vier Beschriftungen sitzen *auf* der Linie, und das ist eine Entscheidung, keine Voreinstellung.** Eine Füllklasse an einer Kante zeichnet einen Grund hinter das Label; steht kein `side top`, `side bottom`, `side left` oder `side right` dabei, bleibt es auf der Linie und stanzt sie hinter sich aus. Das ist die richtige Form für ein Wort, das die Linie *benennt* – „yes“, „no“, eine Portnummer, ein Nachrichtentyp –, so wie ein Straßenschild zur Straße gehört und die Straße links und rechts daran vorbeiläuft. Ein Satz, der beschreibt, was auf der Linie *unterwegs* ist, gehört daneben: Die Schwimmbahnen nebenan machen das so, und die ROC-Kurven weiter oben nehmen den Grund dabei mit. Beides in einer Figur zu mischen heißt, dass der Raum jedes Label erst einsortieren muss, bevor er eines lesen kann – deshalb ist hier alles auf der Linie.

## figure: Three roles, one incident | a swimlane {.full #swimlane}

::: draw {unit=118x72}
# lanes zeichnet den Rahmen, die Bänder und die gedrehten Namen davor. Was in
# den Bändern liegt, wird wie überall sonst einzeln platziert – gegen die
# Mitte eines Bandes (swim-1.cy) und gegen den Rahmen (swim.left+n).
lanes swim "User | SOC | IT ops" at 0,0 w 7.25 band 1.0 {.muted}

box rep  "Phishing mail\nreported" at swim.left+0.8,swim-0.cy w 1.4 {.tone-2}
box tri  "Triage"                  at swim.left+2.9,swim-1.cy w 1.0 {.tone-1}
box hunt "Who else\ngot it?"       at swim.left+4.85,swim-1.cy w 1.2 {.tone-1}
box blk  "Sender blocked"          at swim.left+6.35,swim-2.cy w 1.4 {.tone-4}

# Jede Übergabe wechselt das Band, und dafür ist .elbow da: eine gerade Linie
# von hier nach dort liefe schräg durch ein Band, das sie nie betritt.
edge rep -> tri {.elbow}
edge tri -> hunt "same sender" {.small} side top
edge hunt -> blk {.elbow}

step meldung
  show rep
step untersuchung
  show tri, hunt
step antwort
  show blk
:::

**Bahnen sind gleich lang, ihr Inhalt ist es nicht – deshalb sind sie kein `container`.** Ein Container misst sich an dem, was er hält; drei Bänder mit unterschiedlich vielen Kästen kämen so an beiden Enden verschieden weit heraus, und ausgerechnet das ist die eine Aussage, die ein Schwimmbahn-Diagramm nicht machen darf. `lanes` legt den Rahmen an, teilt ihn in gleich hohe Bänder und schreibt die Namen gedreht vor die linke Kante; die Bänder sind `.clear`, damit alles darin über ihnen liest. Eine Zeitachse braucht es nicht: Sie ist die Leserichtung.

**Jede Übergabe wechselt das Band, und `.elbow` ist die Linienführung dafür.** Die Klasse zeichnet zwei Wegpunkte selbst – eine Schiene auf halbem Weg durch die Lücke, auf der Achse, auf der die beiden Enden weiter auseinanderliegen –, statt dass man denselben doppelten Knick pro Kante von Hand hinschreibt. Eine gerade Linie täte etwas anderes: Sie liefe schräg durch ein Band, das sie gar nicht betritt, und der Raum liest sie als Beteiligung.

**Das eine Kantenlabel steht *neben* der Linie, nicht darauf.** „same sender“ beschreibt, was auf der Linie unterwegs ist, und ein Satz mit einem Strich mittendrin wird als zwei Bruchstücke gelesen, bevor er als Satz gelesen wird. `side top` hebt ihn über die Linie; an einer senkrechten Kante wären es `side left` und `side right`, und welches Paar gilt, weiß man erst, wenn die Kante geführt ist – deshalb ist das falsche Paar eine Warnung beim Bauen statt eines Fehlers beim Parsen. Weggerückt wird um das, was die Beschriftung *quer zur Linie* misst: neben einer waagerechten Kante ihre Höhe, neben einer senkrechten ihre Breite – dort mit einem Zuschlag, weil ein Spalt quer zu einer Zeile Schrift mehr Luft braucht als über ihr. Einen Grund braucht dieses Label nicht: Unter ihm liegt nur Bandfläche. Was ein Grund tut und wie groß er sein darf, steht bei den ROC-Kurven weiter oben.

## figure: Leaves first, and the brackets follow | a tree {.full #tree}

::: draw {unit=112x96}
default box {.tone-2} w 1.35

# Die Blätter sind die Fixpunkte, denn um sie geht es. Jede Ebene darüber
# sitzt zwischen ihren eigenen Kindern: ein Blatt verschieben, und alles
# darüber zentriert sich neu, ohne dass eine zweite Zeile davon weiß.
box l1 "www.example.org"  at 0,0 {.tone-3 @leaves}
box l2 "mail.example.org" right of l1 gap 0.2 same as l1 {.tone-3 @leaves}
# Die Lücke zwischen den beiden Teilbäumen ist viermal die Lücke innerhalb
# eines Teilbaums. Damit sind es zwei Gruppen, bevor jemand ein Wort liest.
box l3 "shop.example.com" right of l2 gap 0.8 same as l1 {.tone-3 @leaves}
box l4 "vpn.example.com"  right of l3 gap 0.2 same as l1 {.tone-3 @leaves}

box i1 "Issuing CA A" between l1,l2 offset 0,-2.2 w 1.2 {@issuers}
box i2 "Issuing CA B" between l3,l4 offset 0,-2.2 w 1.2 {@issuers}
box rt "Root CA"      between i1,i2 offset 0,-2.2 w 1.2 {.tone-1}

edge rt -- i1 {.elbow .muted}
edge rt -- i2 {.elbow .muted}
edge i1 -- l1 {.elbow .muted}
edge i1 -- l2 {.elbow .muted}
edge i2 -- l3 {.elbow .muted}
edge i2 -- l4 {.elbow .muted}

container scope "what A is answerable for" over i1,l1,l2 pad 0.24 {.dashed .muted}

step delegation
  show @issuers, scope
step certificates
  show @leaves
:::

**Ein Baum wird von den Blättern her gebaut.** Sie sind die Fixpunkte – um sie geht es –, und jede Ebene darüber steht `between` ihren eigenen Kindern mit einem `offset` nach oben. Andersherum aufgeschrieben hält der Compiler es aus – er liest den Block ganz und löst die Abhängigkeiten in der Reihenfolge auf, in der sie aufgehen, nicht in der Reihenfolge der Zeilen –, aber das Mittel, zu dem man dann greift, trägt nicht: `align x middle rt, i1, i2` reicht die Koordinate des *ersten* genannten Elements an die übrigen weiter, würde also nicht die Wurzel über ihre Kinder setzen, sondern beide Kinder auf die Mittellinie der Wurzel stapeln.

**Die Klammern sind sechsmal dasselbe Wort.** `.elbow` verlässt das eine Ende auf der Achse, auf der die beiden weiter auseinanderliegen, läuft eine Schiene auf halbem Weg durch die Lücke und kommt auf derselben Achse wieder an; die beiden Ansatzpunkte werden dafür auf diese Achse gezwungen, was immer die automatische Wahl sonst genommen hätte. Gemessen wird die Schiene zwischen den *zugewandten Kanten* der beiden Elemente, nicht zwischen ihren Mittelpunkten – deshalb liegt sie für beide Kinder einer Ausstellerin auf derselben Linie, und das Paar liest sich als eine Klammer statt als zwei Verbinder. Von Hand wären das zwölf Wegpunkte, die jedes Mal neu gerechnet werden müssten, wenn eine Ebene ihren Abstand ändert. Wer die Schiene woanders haben will, schreibt `via`; beides auf einer Zeile ist ein Fehler. Einen Slot teilt sich `.elbow` mit `.smooth`: Wie eine Linie gezeichnet wird, ist eine Frage mit genau einer Antwort.

**Der gestrichelte Kasten steht um die ganze Menge, bevor die Menge beisammen ist.** Er ist im selben Takt ausgeschrieben wie die Ausstellerinnen (`show @issuers, scope`), obwohl seine beiden anderen Mitglieder erst einen Takt später kommen. Ohne das ausgeschriebene `show` gilt die übliche Regel: Ein Umriss ist nur so sichtbar wie seine Mitglieder und passt sich denen an, die man sieht – er wäre erst um die Ausstellerin allein gewachsen und dann nach unten aufgegangen. Wer ihn beim Namen nennt, bekommt beides: die Sichtbarkeit *und* die volle Ausdehnung. Das ist der Sinn der Ausnahme; für den Normalfall ist sie ausdrücklich nicht gedacht.

## figure: One line per row | a table {.full #table}

::: draw {unit=150x54}
# Die Kopfzeile ist eine Zeichenkette, an | zerlegt; die Datenzeilen sind die
# bloßen Zeichenketten darunter. Jede Zelle ist eine gewöhnliche Box und
# trägt zwei erzeugte Tags, @t-row-N und @t-col-N.
table t "Attack | Layer | Countermeasure" at 0,0 col 1.0,0.45,1.35 row 0.42 {.clear .bare .left}
  "ARP spoofing | 2 | Dynamic ARP Inspection"
  "SYN flooding | 4 | SYN cookies"
  "DNS spoofing | 7 | DNSSEC"
  "TLS stripping | 7 | HSTS"

edge rule t.left,t-0-0.bottom -- t.right,t-0-0.bottom {.muted .front}

step link-layer
  style @t-row-1 {.tone-4}
step transport
  style @t-row-1 {.clear}
  style @t-row-2 {.tone-4}
step application
  style @t-row-2 {.clear}
  style @t-row-3, @t-row-4 {.tone-4}
step every-one-has-an-answer
  style @t-row-3, @t-row-4 {.clear}
  style @t-col-2 {.tone-2}
:::

**Fünf Zeilen mal drei Spalten sind fünfzehn Kästen, jeder mit eigenem Namen, eigener Breite und eigener Platzierung – und einer `below`-Kette, die man beim Einfügen einer Zeile neu ausrichtet.** `table` schreibt sie: Die Kopfzeile ist eine Zeichenkette, an `|` zerlegt, die Datenzeilen sind die bloßen Zeichenketten darunter, `col` gibt eine Breite je Spalte und `row` die Höhe einer Zeile. Der Attributschwanz `{.clear .bare .left}` landet auf den **Zellen**, nicht auf dem Rahmen – deshalb ist eine Tabelle hier ein Satzspiegel und kein Gitter aus Kästchen. Der Strich unter der Kopfzeile ist eine gewöhnliche Kante zwischen zwei Koordinaten, die je zur Hälfte vom Rahmen und von der ersten Zelle kommen.

**Jede Zelle trägt zwei erzeugte Tags, `@t-row-N` und `@t-col-N`.** Damit ist eine Zeile ein Takt und eine Spalte ein Takt, je eine Zeile Quelltext – wo sonst je Takt drei Zellennamen stünden, die von Hand mit der Tabelle Schritt halten müssten. Zeile 0 ist die Kopfzeile, gezählt wird also ab 1, wenn man Daten meint.

**Der letzte Takt ist der, der auf dem Handout landet.** Eine Figur, die eine Zeile nach der anderen hervorhebt und dann aufhört, kommt mit der letzten Zeile leuchtend aus dem Drucker und berichtet damit von einem Moment im Vortrag statt von der Tabelle. Hier nimmt ein vierter Takt die Hervorhebung wieder ab und tönt stattdessen die Spalte mit den Gegenmaßnahmen – das Bild, das ohne Vortrag etwas sagt. Dass es einen Takt kostet, ist der Grund, warum die Prominenzverben das nicht brauchen: Was ein `step` an Prominenz setzt, ist eine Vortragshandlung, und der Druck nimmt seine Prominenz aus dem Eröffnungstakt. Was auf der Zeile eines Elements steht, beschreibt dagegen die Zeichnung und steht deshalb auch im Handout.

## figure: Ein Ablauf von oben nach unten | a sequence {.full #sequence}

::: draw {unit=150x40}
# Die Beteiligten sind eigene Zeilen, weil jeder einen Namen zum Anfassen
# und einen eigenen Attributschwanz braucht. Alles darunter ist eine
# Nachricht (Pfeil zwischen zwei Namen) oder eine Notiz.
sequence wa at 0,0
  actor u  "User"
  actor br "Browser"
  actor au "Authenticator" {.tone-3}
  actor rp "Relying Party"

  u  -> br "click \"Create passkey\""
  br -> rp "request registration options"
  br <- rp "registration options" "challenge · rp.id · user.id · algs" {.dashed}
  br -> au "CTAP authenticatorMakeCredential" "clientDataHash · rp.id · user · algs"
  note br,au "CTAP runs over USB, NFC or BLE"
  au -> u  "prompt: PIN or biometric"
  u  -> au "user verified locally"
  note au "generate key pair\nbind to SHA-256(rp.id)\nstore privately · emit publicly"
  au -> br "attestation object" "authData (public key, cred ID) · signature" {.dashed}
  br -> rp "attestationObject + clientDataJSON" "clientDataJSON carries challenge · origin"
  rp -> rp "verify signature · check origin"

# Zwei Anmerkungen, die das Konstrukt nicht kennt: gewöhnliche Zeilen an
# erzeugten Namen. Ein Takt kann sie zeigen wie jedes andere Element.
brace ctap over wa-3,wa-4,wa-5 pad 0.3 "auf dem Gerät, über CTAP" side left {.small .turn}
text fresh "die Challenge ist die Frische" right of wa-2 gap 1.9 {.small .hand} -- wa-2

step im-browser
  emph @br-msgs
step auf-dem-gerät
  dim @br-msgs
  emph @au-msgs
  emph au
step zurück-zur-partei
  dim @au-msgs
  dim au
  emph @wa-msg-7, @wa-msg-8
step alles
  dim @wa-msgs
:::

**Ein Protokoll ist die eine Zeichnung, die eine Vorlesung immer wieder braucht und die von Hand geschrieben am schwersten zu ändern ist.** Ausgeschrieben trägt jede Nachricht ihre eigene y-Koordinate: Eine Nachricht in der Mitte einzufügen heißt, alle darunter zu verschieben, alle Nummern neu zu vergeben und die Länge jeder Lebenslinie neu zu raten – an genau diesem Bild nachgezählt dreizehn geschriebene Zeilen für eine eingefügte Nachricht. Und ein Notizkasten, der höher ausfällt als der geratene Abstand, schneidet still in die Beschriftung darunter.

**`sequence` regelt deshalb genau eines: den senkrechten Rhythmus.** Jeder Eintrag sagt, wie hoch er ist – eine Nachricht so hoch wie ihre Beschriftung, eine Notiz so hoch wie ihr Text –, und die Anweisung stapelt sie. Ein Kasten schiebt mit, was unter ihm steht, und eine eingefügte Zeile ist eine eingefügte Zeile. Quer misst die Anweisung sich genauso selbst: Alle Köpfe sind so breit wie die breiteste Beschriftung, damit eine Reihe gleichrangiger Beteiligter nicht ausgefranst dasteht. `w`, `header` und `space` sind Übersteuerungen, die im Regelfall niemand schreibt.

**Eine Nachricht darf sich auch selbst benennen, und der Name steht vorn.** `tunnel c -- s "…"` – in genau dem Feld, in dem eine `edge` ihren trägt, nämlich vor dem ersten Endpunkt. Das lohnt sich für die Zeilen, auf die etwas anderes zeigt: Ein erzeugter Name wie `x-4` zählt Nachrichten und wandert deshalb, sobald oberhalb eine dazukommt, während ein geschriebener bleibt, wo er ist. Anonym zu bleiben kostet nichts, und die meisten Nachrichten bleiben es.

**Alles andere beantwortet sie nicht mit neuen Wörtern, sondern damit, dass jeder Teil einen Namen behält.** Jeder Kopf behält den Namen, den die `actor`-Zeile ihm gibt; jede Lebenslinie heißt `<actor>-life`, jede Nachricht `wa-N` (von 0 gezählt, die Nummer im Bild ist `N+1`), ihre Nummer `wa-n-N`, ihre kleinere zweite Zeile `wa-sub-N`, jede Notiz `wa-note-N`. Dazu Tags für die Mengen: `@wa-msg-N` für eine Nachricht samt Nummer und zweiter Zeile, `@wa-msgs` für alle, `@au-msgs` für alle, die den Authenticator berühren, `@wa-notes`, `@wa-actors`, `@wa-lives`. Die Klammer und die handschriftliche Anmerkung oben sind deshalb gewöhnliche Zeilen, die an `wa-3` und `wa-2` andocken – das Konstrukt weiß von beiden nichts.

**Es gibt kein `alt` / `else`.** Eine Gruppe von Nachrichten zu umschließen und zu benennen ist, was `container … pad n` schon zeichnet, und im gemessenen Bestand wollten es zwei von neun Bildern. Ein Wort, das mit der ersten Veröffentlichung einfriert, sollte mehr Fälle haben als das.

## figure: Was eine Nachricht sonst sein kann {.wide #seqmore}

::: draw {unit=140x44}
sequence x at 0,0 unnumbered space 0.34
  actor c "Client"
  actor p "Proxy"
  actor s "Server"
  c -> p "CONNECT server:443"
  p -> s "TCP handshake"
  p -> p "note the destination" "host, time, byte counts"
  c <- p "200 Connection established" {.dashed}
  tunnel c -- s "encrypted tunnel, end to end" space 0.9
  note c,s "the proxy forwards bytes\nand reads none of them" {.tone-2}

# Die Klammer hängt an dem Namen, den die Nachricht sich selbst gegeben hat,
# und nicht an `x-4`: ein erzeugter Name zählt Nachrichten, also wandert er,
# sobald eine dazwischenkommt. Ein geschriebener Name tut das nicht.
brace tun over tunnel side right "das ist die Nutzlast" pad 0.35 {.muted .small}
:::

**Vier Token, und keines davon ist eine eigene Pfeilart.** `->` und `<-` sind dieselbe Nachricht, einmal vom Absender und einmal vom Empfänger her geschrieben: Wer die Antwort als `c <- p` schreibt, nennt in beiden Zeilen zuerst den Client und liest die Quelle als Spalte statt hin und her. `--` ist eine Linie ohne Kopf, also eine Beziehung ohne Richtung, und `<->` trägt an beiden Enden einen – ein Hin und Zurück, in eine Bande gefasst. Für „gestrichelt“ gibt es kein eigenes Wort, das macht `{.dashed}` – der Attributschwanz einer Nachrichtenzeile ist der einer Kante, weil eine Nachricht eine Kante *ist*.

**Das Token sagt den Kopf, nicht eine Klasse.** Jedes der vier setzt genau einen der drei Zustände – kein Kopf, einer, an beiden Enden –, und deshalb steht dieselbe Aussage nie zweimal auf einer Zeile: `{.no-head}` neben einem `->` ist ein Fehler und kein stiller Widerspruch mehr. Innerhalb eines Taktes gilt das Umgekehrte: dort ist die Klasse die einzige Schreibweise, weil ein Token sich nicht noch einmal ausführen lässt.

**Eine Selbstnachricht ist der übliche Weg, eine örtliche Handlung in den Ablauf zu setzen**, und sie schleift aus der Lebenslinie heraus und wieder hinein. Ihre Beschriftung steht neben der Schleife, ihre zweite Zeile darunter. Eine Notiz zwischen zwei Namen steht in der Mitte zwischen deren Lebenslinien und ist so breit wie ihr eigener Text – nicht so breit wie die Spanne, sonst wird aus drei Wörtern ein Banner. Sie bricht an `\n`, sodass eine dreizeilige Notiz eine Notiz bleibt.

**`space` auf einer Eintragszeile ist die Luft über genau diesem Band.** Der Tunnel unten steht mit `space 0.9` merklich abgesetzt vom Aufbau darüber – zwei oder drei solcher Lücken gliedern einen langen Ablauf in Abschnitte, die ein Raum sich merken kann. Eine Leerzeile im Quelltext tut das nicht: Die Anweisung liest über Leerzeilen hinweg, damit der Quelltext so gegliedert werden darf, wie er sich gut liest. Auf einer `actor`-Zeile ist `space` ein Fehler, denn über den Köpfen gibt es kein Band.

**Jede Nachrichtenbeschriftung bringt ihren eigenen Grund mit.** Eine Lebenslinie kreuzt jede Beschriftung im Bild, also wird der Grund von vornherein gezeichnet und die gestrichelte Linie hinter den Wörtern ausgespart. `{.clear}` nimmt ihn weg, `{.tone-2}` färbt ihn. Die kleinere zweite Zeile bekommt denselben Grund, die Nummern links keinen: Sie stehen außerhalb des Rahmens und kreuzen nichts.

**`unnumbered` nimmt die Zahlenspalte weg.** Sie ist sonst da, weil das Umnummerieren von Hand genau die Arbeit ist, die die Anweisung abnimmt, und weil die Zahl im Bild und der Index im Tag dieselbe Zahl sind: `@x-msg-3` ist der Pfeil, den der Raum als 4 liest. Wo ein Ablauf so kurz ist, dass niemand auf eine Nummer zeigt, ist die Spalte nur Papier.

## figure: Eine Figur, die sich selbst abspielt | `autoplay` und `cycle` {.wide #autoplay}

::: draw {unit=150x56 autoplay=1400 cycle}
box  cr  "Crawler"                       {.tone-1}
box  wb  "Web site"  right of cr  gap 1.5
box  dt  "Detector"  right of wb  gap 1.5 {.tone-4}
edge cr -> wb "Anfrage"
edge wb -> dt "Fingerabdruck"

step probe
  emph wb
step catch
  emph dt
  dim cr
step verdict
  style dt {.tone-2}
  label dt "Erkannt"
:::

**`autoplay=1400` läuft die Takte dieser Figur von selbst ab, `cycle` beginnt danach wieder vorn.** Eine Verzögerung in Millisekunden, dieselbe für jeden Takt – ein Deckblatt, das sich bewegt, während der Raum sich setzt, ist der Fall, für den es gebaut ist; es steht hier auf einer gewöhnlichen Folie, weil nichts daran an das Deckblatt gebunden ist.

**Es ruft dieselbe Fortschaltung wie die Leertaste.** Ein eigener Zähler hätte Zeichnung und Taktzähler auseinanderlaufen lassen, und der nächste Tastendruck wäre gesprungen. Weil es *der* Zähler ist, folgt das Rednerfenster über die gewöhnliche Synchronisation, die Einfrier-Sperre greift, und gespeichert wird nichts Neues. `cycle` spult über denselben Zähler zurück, also folgt das Rednerfenster auch dem Rücksprung.

**Der erste Tastendruck, Klick oder Scroll hält es endgültig an.** Wer das Deck angefasst hat, hat übernommen, und eine Uhr, die darunter weiterläuft, ist schlimmer als keine. Aus demselben Grund fängt es auf einer schon halb aufgedeckten Folie gar nicht erst an: Dass sie halb aufgedeckt ist, heißt, jemand hat sie so verlassen.

**Zwischen 200 ms und 60 s, und außerhalb verweigert statt gekappt.** Unter 200 ms liest der Raum keinen Takt, über einer Minute ist eine „bewegte" Figur eine stehende, die sich ändert, wenn niemand hinsieht. Eine gekappte Zahl ist eine Zahl, die niemand geschrieben hat.
