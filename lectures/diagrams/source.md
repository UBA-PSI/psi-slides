---
title: Animated Infographics
subtitle: "Six real lecture slides, rebuilt in ::: diagram"
author: Dominik Herrmann
theme: dark
collapse: none
diagram-defaults: |
  default text      {.small}
  default container pad 0.34
---

## title: Animated Infographics | Six real slides, rebuilt from text {#cover}

Every figure in this lecture is written in the lecture source, laid out at
build time, and stepped with the same key that advances a reveal.

# Memory safety

## figure: Types of memory unsafety {.full #unsafety}

::: diagram {unit=150x52}
default box {.tone-2} w 1.05

text tlab "Temporal" at 0,0 {.left .large}
box  tobj "object" right of tlab gap 0.7 w 0.62 {.tone-3}
edge tobj.left-0.36,tobj.top-0.7 -> tobj.tl {.thick .muted}

box  uaf  "Use After Free" below tlab gap 0.75 align left {@temporal}
box  df   "Double free"    right of uaf gap 0.22 same as uaf {@temporal}
text tcode "free(ptr);\n*ptr;" below uaf gap 0.28 align left {.mono .left @temporal}

text slab "Spatial" below tcode gap 0.9 align left {.left .large}
box  sobj "object" right of slab gap 0.7 w 0.62 {.tone-4}
edge sobj.left-0.36,sobj.top-0.7 -> sobj.tl {.thick .accent}

box  bo   "Buffer Overflow" below slab gap 0.75 align left {.accent @spatial}
box  bor  "Buffer Overread" right of bo gap 0.22 same as bo {.accent @spatial}
text scode "char buf[16];\nbuf[42];" below bo gap 0.28 align left {.mono .left @spatial}

# Die beiden Spalten hängen schon über align left aneinander. Die Kästchen
# rechts nicht: sie sitzen je 0.7 neben einem Wort, und "Temporal" ist ein
# Zeichen länger als "Spatial".
align x center tobj, sobj

step temporal
  show @temporal
step spatial
  show @spatial
:::

**Zwei Familien, dieselbe Form.** Das `align left` am Ende einer Platzierung hält jede `below`-Kette an ihrer linken Kante bündig, obwohl der obere Code zweizeilig und der untere anders breit ist, und `same as` gibt den Paaren jeweils gleiche Kästen. Die *Anweisung* `align x center tobj, sobj` ist etwas anderes: sie holt eine Koordinate von einem Meister, und hier ist sie nötig, weil die beiden Kästchen neben verschieden langen Wörtern hängen. Die Schritte adressieren `@temporal` und `@spatial` statt acht Namen.

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
::: diagram {unit=150x52}
default box {.tone-2 .sharp} w 1.5 pad 0.16

box buf "Local variable: mystring\n(char[], 16 bytes)" at 0,0 h 1.5
box val "Local variable: myvalue\n(integer, 4 bytes)" below buf gap 0 same as buf h 0.75
box bp  "Stored base pointer" below val gap 0 same as val
box ret "Return address"      below bp gap 0 same as val

box sp  "SP" left of buf gap 0.55 w 0.3 {.tone-4}
box bpl "BP" left of val gap 0.55 same as sp {.tone-4}
edge sp -> buf.left
edge bpl -> val.left
align x center sp, bpl

brace dir over buf,ret right "writing direction:\ntowards higher\naddresses" pad 0.28 {.muted}

step overrun
  emph buf
  style val,bp,ret {.dashed}
step reached
  emph ret
  label ret "Return address (attacker's)"
:::
:::

**Der Code ist eine Markdown-Fence, das Bild daneben ein Diagramm.** `::: side` stellt beide nebeneinander; das Diagramm muss dafür nichts können. Innen halten `same as` und `gap 0` die vier Rahmen als einen Stapel zusammen, und die `brace` misst die Schreibrichtung über alle vier.

# Block ciphers

## figure: Cipher Block Chaining, decryption {.full #cbc}

::: diagram {unit=112x74}
default box {.tone-3} w 0.82
default box @dec {.round .tone-2} w 0.48
default text {.mono}

box iv "Rand. IV" at 0,0 {.tone-1}
box c0 "c_0" right of iv gap 0.3
box c1 "c_1" right of c0 gap 0.3
box c2 "c_2" right of c1 gap 0.3

box d0 "Dec" below c0 gap 0.95 {@dec}
box d1 "Dec" below c1 gap 0.95 {@dec}
box d2 "Dec" below c2 gap 0.95 {@dec}
text k0 "k" left of d0 gap 0.3 {@dec}
text k1 "k" left of d1 gap 0.3 {@dec}
text k2 "k" left of d2 gap 0.3 {@dec}

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
edge iv -> x0 via iv.cx,d0.bottom+0.28 {#feed0}
edge c0 -> x1 via c0.cx,d0.bottom+0.28 {#feed1}
edge c1 -> x2 via c1.cx,d0.bottom+0.28 {#feed2}

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
  calm feed0, feed1, feed2
:::

Jeder `step` ist ein Druck auf `Space`. Die Verkettungspfeile haben je einen Wegpunkt – mehr Routing brauchen diese Bilder nie.

## figure: Counter mode, encryption {.full #ctr}

::: diagram {unit=104x66}
default text {.mono}
default box @enc {.round .tone-3}
default box @stream {.tone-2}
default box @msg {.tone-3}
default box @cipher {.tone-4}

box iv0 "IV" at 0,0    w 0.5 {.tone-1}
box n0  "0"  right of iv0 gap 0 w 0.42 {.tone-2}
box iv1 "IV" right of n0 gap 1.0 same as iv0 {.tone-1}
box n1  "1"  right of iv1 gap 0 same as n0 {.tone-2}
box iv2 "IV" right of n1 gap 1.0 same as iv0 {.tone-1}
box n2  "2"  right of iv2 gap 0 same as n0 {.tone-2}

box e0 "Enc" between iv0,n0 offset 0,1.35 {@enc}
box e1 "Enc" between iv1,n1 offset 0,1.35 same as e0 {@enc}
box e2 "Enc" between iv2,n2 offset 0,1.35 same as e0 {@enc}
text ke0 "k" left of e0 gap 0.4 {@enc}
text ke1 "k" left of e1 gap 0.4 {@enc}
text ke2 "k" left of e2 gap 0.4 {@enc}

box s0 "s_0" below e0 gap 0.6 w 0.8 {@stream}
box s1 "s_1" below e1 gap 0.6 same as s0 {@stream}
box s2 "s_2" below e2 gap 0.6 same as s0 {@stream}
dot x0 "+" below s0 gap 0.5 r 0.2 {@stream}
dot x1 "+" below s1 gap 0.5 same as x0 {@stream}
dot x2 "+" below s2 gap 0.5 same as x0 {@stream}
box mm0 "m_0" left of x0 gap 0.45 w 0.55 {@msg}
box mm1 "m_1" left of x1 gap 0.45 same as mm0 {@msg}
box mm2 "m_2" left of x2 gap 0.45 same as mm0 {@msg}
box cc0 "c_0" below x0 gap 0.5 same as s0 {@cipher}
box cc1 "c_1" below x1 gap 0.5 same as s0 {@cipher}
box cc2 "c_2" below x2 gap 0.5 same as s0 {@cipher}

edge n0 -> e0 {@enc}
edge n1 -> e1 {@enc}
edge n2 -> e2 {@enc}
edge ke0 -> e0 {@enc}
edge ke1 -> e1 {@enc}
edge ke2 -> e2 {@enc}

# Diese neun brauchen kein eigenes @tag und kein show: eine Kante ist nur so
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

::: diagram {unit=176x56}
default box  {.tone-4} w 1.15
default text {.small .muted}

box  create "Creation"      {.tone-1 .bold}
text sep1   "▶"             between create,usage {.large}
box  usage  "Usage"         right of create gap 0.62 same as create {.tone-1 .bold}
text sep2   "▶"             between usage,term {.large}
box  term   "Termination"   right of usage gap 0.62 same as create {.tone-1 .bold}

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

# Der Pfeil sitzt zwischen Bildunterschrift und nächstem Kasten – nicht in
# der below-Kette, sonst schöbe ihn eine zweizeilige Unterschrift in den
# Kasten, den align y middle gerade festgenagelt hat.
text down1  "▼"  between regc,prov   {@creation}
text down2  "▼"  between provc,authz {@creation}
text down3  "▼"  between identc,authn {@usage}
text down4  "▼"  between authnc,acl   {@usage}

brace signup over reg,prov    right "Signup" {.muted}
brace login  over ident,authn right "Login"  {.muted}

text sep3   "▶"              below authzc gap 0.5 {.large}
box  selfsv "Self-services"  right of sep3 gap 0.2

step creation
  show @creation, signup
step usage
  show @usage, login
step self
  show sep3, selfsv
  emph selfsv
:::

**Ohne `align y middle` driften die beiden Spalten auseinander.** Sie sind getrennte `below`-Ketten, und die Bildunterschriften sind mal ein-, mal zweizeilig – drei Zeilen halten die Reihen bündig.

## figure: Message authentication | it is not about confidentiality {.full #mac}

::: diagram {unit=150x60}
image alice avatar-alice "Alice" w 0.42
image eve   avatar-bob   "Eve"   right of alice gap 1.4 same as alice {.ghost @attack}
image bob   avatar-bob   "Bob"   right of eve gap 1.4 same as alice
align y middle alice, eve, bob

text nA "Alice" below alice gap 0.06 {.small}
text nE "Eve"   below eve gap 0.06 {.small .muted @attack}
text nB "Bob"   below bob gap 0.06 {.small}
text kA "k" left of alice gap 0.2 {.mono .small}
text kB "k" right of bob gap 0.2 {.mono .small}

edge alice -> bob "M, T" via 1.28,1.5 2.42,1.5 {#wire}
edge eve.right:0.28 -> bob.left:0.28 "M, T   replay"      {#replay .accent .small @attack}
edge eve.right:0.72 -> bob.left:0.72 "forgery   M_F, T_F" {#forge .accent .small @attack}
text def "defense?" above eve gap 0.3 {.hand .small @attack}

text macA "T = MAC_k(M)"            below nA gap 0.3 {.mono .small @proto}
text tagA "\"authentication tag\""  below macA gap 0.14 {.hand .small @proto}
text ver1 "Verify_k(M, T)"                below nB gap 0.3 {.mono .small @proto}
text ver2 "T' = MAC_k(M)\nT' equals T ?"  below ver1 gap 0.55 {.mono .small @proto}
edge ver1 -- ver2 {#howto .muted .dotted @proto}
text eg   "e.g." between ver1,ver2 pad 0.12 {.paper .muted @proto}
align y middle macA, ver1

text goals "Security goals: *integrity*\nand *authenticity* but\n~not non-repudiation~" at 3.55,-1.05 {.left .serif}

step protocol
  show @proto
step attack
  show @attack
  emph replay, forge
:::

**Die Avatare sind Vektor-Assets und folgen dem Theme.** `image alice avatar-alice` löst gegen `assets/` auf wie `![](fig-id)`; eine SVG-Datei wird als verschachteltes `<svg>` eingesetzt und erbt `--ink` und `--paper`. Die beiden Angriffspfeile hängen an `eve.right:0.28` und `:0.72` – zwei parallele Pfeile statt zweier Bögen über derselben Sehne.

# The vocabulary

## figure: The pieces {.wide #primitives}

::: diagram {unit=130x76}
box  a "Sender"
box  b "Mix"        right of a gap 0.6
box  c "Empfänger"  right of b gap 0.6
dot  x "+"          below b gap 0.8
text n "a free label, placed\nwherever it reads best"  right of x gap 0.85 -> x {.muted .small}
edge a -> b "encrypted"
edge b -> c "recoded"
edge b -> x {.dashed}
:::

`box`, `dot`, `text`, `image`, `edge`, `brace`, `container`, `align`, `spread`, `default`, `step` – elf Anweisungen, mehr nicht. Ein `text` bekommt mit `-> x` einen Linien-Stummel zu dem, worüber es spricht.

## figure: Alignment {.wide #alignment}

::: diagram {unit=140x70}
default box {.tone-2}

box a "one"                     at 0,0
box b "a much longer label"     right of a gap 0.6
box c "two"                     right of b gap 0.6
box d "middling"                right of c gap 0.6

box p "first"   below a gap 1.1
box s "fourth"  right of p gap 3.6
box q "a considerably wider one"  below p gap 0 h 0.8
box r "third"   below p gap 0 h 0.5
align y middle p, q, r, s
spread x p, q, r, s

edge a.left-0.8,a.cy -> a "from outside" {.muted}
:::

Oben gleiche *Kantenabstände* – das gibt schon eine Kette aus `right of … gap n` her. Unten gleiche *Mittelpunktabstände*: `spread x` verteilt die inneren Elemente zwischen dem ersten und dem letzten, und weil der zweite Kasten viel breiter ist als seine Nachbarn, sind die Lücken links und rechts von ihm sichtbar kleiner. Das ist der Unterschied, den die beiden Reihen zeigen sollen. Der Pfeil links oben hat einen Endpunkt ohne Objekt – eine Koordinate statt eines unsichtbaren Ankers.

## figure: Containers and braces {.wide #grouping}

::: diagram {unit=130x76}
default box {.tone-1} w 1.0

box r1 "Registration"  at 0,0
box r2 "Provisioning"  below r1 gap 0.55 same as r1
box r3 "Authorization" below r2 gap 0.55 same as r1
edge r1 -> r2
edge r2 -> r3
brace sign over r1,r2 right "Signup" pad 0.62
container life "Creation" over r1,r2,r3 pad 0.42 {.dashed}
:::

Ein `container` legt sich um seine Mitglieder und passt sich neu an, wenn sie sich bewegen. Eine `brace` überspannt eine Teilmenge und hängt ihr Label nach außen. Beide messen ihren Abstand zum Inhalt mit demselben Wort, `pad` – die Klammer bekommt hier `0.62`, damit sie außerhalb der `0.42` des Containers zu liegen kommt.

## figure: The look of a thing {.full #look}

::: diagram {unit=118x74}
default box {.sharp} w 0.62 h 0.42

# Every fill the vocabulary has, over a line, so `.clear` and `.paper` are
# telling apart: one lets the rule through, the other knocks it out.
edge -0.45,0 -- 6.1,0 {.muted}
box f1 "paper"  at 0,0    {.paper}
box f2 "tone-1" right of f1 gap 0.28 same as f1 {.tone-1}
box f3 "tone-2" right of f2 gap 0.28 same as f1 {.tone-2}
box f4 "tone-3" right of f3 gap 0.28 same as f1 {.tone-3}
box f5 "tone-4" right of f4 gap 0.28 same as f1 {.tone-4}
box f6 "clear"  right of f5 gap 0.28 same as f1 {.clear}
text fl "fill" left of f1 gap 0.5 {.muted}

text t1 "sans"  at 0.31,1.25
text t2 "mono"  right of t1 gap 0.62 {.mono}
text t3 "serif" right of t2 gap 0.62 {.serif}
text t4 "hand"  right of t3 gap 0.62 {.hand}
text tl "family" left of t1 gap 0.72 {.muted}

# One width, three answers. The box grows to the type, or the type shrinks to
# the box, or it fills the box in both directions.
box g1 "a label that is too long" at 0,2.3 w 1.2 h 0.46
box g2 "a label that is too long" right of g1 gap 0.34 same as g1 {.shrink}
box g3 "short"                    right of g2 gap 0.34 same as g1 {.fit}
text n1 "no"     below g1 gap 0.16 {.muted}
text n2 "shrink" below g2 gap 0.16 {.muted}
text n3 "fit"    below g3 gap 0.16 {.muted}
text gl "type meets\nits box" left of g1 gap 0.5 {.muted .right}
:::

**Der Editor zeigt genau diese Reihen in seiner Seitenleiste.** Die Klassen sind eine geschlossene Aufzählung, keine freien Farben – jede Füllung mischt sich aus `--emph` und `--ink` über `--paper` und überlebt damit alle sieben Themes. `.paper` ist nicht der No-Op, nach dem es aussieht: Es ist die Voreinstellung einer Box, aber eine Box unter `default box {.tone-3}` kam ohne die Klasse nicht mehr dorthin zurück, und ein freier `text` konnte gar keinen Grund bekommen – und genau der ist es, der eine Linie hinter einer Beschriftung ausstanzt.

**Bei `w` und Schriftgröße gibt es drei Antworten, nicht zwei.** Ohne Angabe wächst der Kasten zur Schrift; `.shrink` verkleinert die Schrift, bis sie hineinpasst; `.fit` füllt den Kasten in beide Richtungen aus, auf 0.6–1.5× der Grundgröße geklemmt. Weil die Textbreite zur Buildzeit *geschätzt* wird – es gibt keinen Browser – fällt die gewählte Größe eine Spur zu klein aus. Das ist die sichere Richtung.

**Der erste Kasten läuft absichtlich über, und der Build sagt das auch:** `box g1 is 1.2 units wide but its label needs about 1.55`. Diese Warnung beim Bauen dieser Vorlesung ist kein Defekt, sie ist die dritte Antwort – die, die man nicht will.

## figure: Steps that move {.wide #motion}

::: diagram {unit=140x72}
default box w 0.92

box  cl "Client"  at 0,0
box  sv "Server"  right of cl gap 2.9 same as cl
box  px "Proxy"   below cl gap 1.05

container zone "auf dem Weg" over cl,sv,px {.bare .tone-2}

edge cl -> sv "HTTP" {#direct .both-heads}
edge cl -> px {#up .dashed}
edge px -> sv {#down .dashed}

text note "der Kasten wandert,\ndie Pfeile folgen" below px gap 0.5 -> px {.hand .small}

step erscheint
  show px, up, down
step dazwischen
  hide direct
  move px to between cl,sv
  emph px
:::

**`move` ist der Grund, warum es diese Sprache gibt.** Der Proxy bekommt `move px to between cl,sv`, und weil das Layout pro Schritt neu ausgewertet wird, hängen die beiden gestrichelten Pfeile weiterhin an ihm, der Linien-Stummel des Labels zeigt weiter auf ihn, und der `container` fasst plötzlich eine Reihe statt zwei. `hide direct` nimmt den direkten Pfeil weg. `to` setzt eine Position, `by` verschiebt um einen Betrag – und **ein `move @tag to …` lehnt der Build ab**, weil es die ganze Menge auf einen Punkt legen würde; für eine Menge ist `by` gemeint.

**Sichtbarkeit vererbt sich nach unten.** Weder der `container` noch die gestrichelten Pfeile noch das handschriftliche Label brauchen ein eigenes `show`: ein Pfeil ist nur so sichtbar wie seine Enden, ein `container` nur so sichtbar wie seine Mitglieder, und ein `text` mit Linien-Stummel nur so sichtbar wie das, worauf er zeigt.

## figure: A raster does not follow the theme {.standard #raster}

::: diagram {unit=150x60}
image swatch swatch w 0.6
text  note "a raster keeps its own colours\nin every theme" right of swatch gap 0.35 -> swatch {.small .muted}
:::

Beim Zyklus durch die Themes mit `A` bleibt das Rasterfeld, wie es ist, während Kästen, Pfeile und Vektor-Figuren umfärben. Das ist der Preis für Pixel.
