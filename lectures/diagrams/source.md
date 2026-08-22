---
title: Animated Infographics
subtitle: "Six real lecture slides, rebuilt in ::: diagram"
author: Dominik Herrmann
theme: dark
collapse: none
---

## title: Animated Infographics | Six real slides, rebuilt from text {#cover}

Every figure in this lecture is written in the lecture source, laid out at
build time, and stepped with the same key that advances a reveal.

# Memory safety

## figure: Types of memory unsafety {.full #unsafety}

::: diagram {unit=150x52}
default box  {.tone-2} w 1.05
default text {.small}

text tlab "Temporal" at 0,0 {.left .large}
box  tobj "object" right of tlab gap 0.7 w 0.62 {.tone-3}
edge 0.62,-1.05 -> tobj.tl {.thick .muted}

box  uaf  "Use After Free" below tlab gap 0.75 align left {@temporal}
box  df   "Double free"    right of uaf gap 0.22 same as uaf {@temporal}
text tcode "free(ptr);\n*ptr;" below uaf gap 0.28 align left {.mono .left @temporal}

text slab "Spatial" below tcode gap 0.9 align left {.left .large}
box  sobj "object" right of slab gap 0.7 w 0.62 {.tone-4}
edge 0.62,2.60 -> sobj.tl {.thick .accent}

box  bo   "Buffer Overflow" below slab gap 0.75 align left {.accent @spatial}
box  bor  "Buffer Overread" right of bo gap 0.22 same as bo {.accent @spatial}
text scode "char buf[16];\nbuf[42];" below bor gap 0.28 align left {.mono .left @spatial}

align left tlab, slab
align left uaf, bo
align center tobj, sobj

step temporal
  show @temporal
step spatial
  show @spatial
:::

**Zwei Familien, dieselbe Form.** `align left` hält die beiden Blöcke bündig, obwohl der obere Code zweizeilig und der untere anders breit ist, und `same as` gibt den Paaren jeweils gleiche Kästen. Die Schritte adressieren `@temporal` und `@spatial` statt acht Namen.

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
default box {.tone-2 .sharp} w 1.5

box buf "Local variable: mystring\n(char[], 16 bytes)" at 0,0 h 1.5
box val "Local variable: myvalue\n(integer, 4 bytes)" below buf gap 0 same as buf h 0.75
box bp  "Stored base pointer" below val gap 0 same as val
box ret "Return address"      below bp gap 0 same as val

box sp  "SP" left of buf gap 0.55 w 0.3 {.tone-4}
box bpl "BP" left of val gap 0.55 same as sp {.tone-4}
edge sp -> buf.left
edge bpl -> val.left
align center sp, bpl

brace dir over buf,ret right "writing direction:\ntowards higher\naddresses" gap 0.28 {.muted}

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
default text {.mono}

box iv "Rand. IV" at 0,0 {.tone-1}
box c0 "c_0" right of iv gap 0.3
box c1 "c_1" right of c0 gap 0.3
box c2 "c_2" right of c1 gap 0.3

box d0 "Dec" below c0 gap 0.95 w 0.48 {.round .tone-2 @dec}
box d1 "Dec" below c1 gap 0.95 same as d0 {.round .tone-2 @dec}
box d2 "Dec" below c2 gap 0.95 same as d0 {.round .tone-2 @dec}
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
edge iv -> x0 via 0,1.95    {#feed0}
edge c0 -> x1 via 1.12,1.95 {#feed1}
edge c1 -> x2 via 2.24,1.95 {#feed2}

align middle iv, c0, c1, c2
align middle d0, d1, d2
align middle x0, x1, x2
align middle m0, m1, m2

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

box iv0 "IV" at 0,0    w 0.5 {.tone-1}
box n0  "0"  right of iv0 gap 0 w 0.42 {.tone-2}
box iv1 "IV" right of n0 gap 0.42 same as iv0 {.tone-1}
box n1  "1"  right of iv1 gap 0 same as n0 {.tone-2}
box iv2 "IV" right of n1 gap 0.42 same as iv0 {.tone-1}
box n2  "2"  right of iv2 gap 0 same as n0 {.tone-2}

box e0 "Enc" between iv0,n0 offset 0,1.35 {.round .tone-3 @enc}
box e1 "Enc" between iv1,n1 offset 0,1.35 same as e0 {.round .tone-3 @enc}
box e2 "Enc" between iv2,n2 offset 0,1.35 same as e0 {.round .tone-3 @enc}
text ke0 "k" left of e0 gap 0.4 {@enc}
text ke1 "k" left of e1 gap 0.4 {@enc}
text ke2 "k" left of e2 gap 0.4 {@enc}

box s0 "s_0" below e0 gap 0.6 w 0.95 {.tone-2 @stream}
box s1 "s_1" below e1 gap 0.6 same as s0 {.tone-2 @stream}
box s2 "s_2" below e2 gap 0.6 same as s0 {.tone-2 @stream}
dot p0 "+" below s0 gap 0.22 r 0.2 {@stream}
dot p1 "+" below s1 gap 0.22 r 0.2 {@stream}
dot p2 "+" below s2 gap 0.22 r 0.2 {@stream}
box mm0 "m_0" below p0 gap 0.22 same as s0 {.tone-3 @msg}
box mm1 "m_1" below p1 gap 0.22 same as s0 {.tone-3 @msg}
box mm2 "m_2" below p2 gap 0.22 same as s0 {.tone-3 @msg}
box cc0 "c_0" below mm0 gap 0.5 same as s0 {.tone-4 @cipher}
box cc1 "c_1" below mm1 gap 0.5 same as s0 {.tone-4 @cipher}
box cc2 "c_2" below mm2 gap 0.5 same as s0 {.tone-4 @cipher}

edge n0 -> e0 {@enc}
edge n1 -> e1 {@enc}
edge n2 -> e2 {@enc}
edge ke0 -> e0 {@enc}
edge ke1 -> e1 {@enc}
edge ke2 -> e2 {@enc}
edge e0 -> s0 {@stream}
edge e1 -> s1 {@stream}
edge e2 -> s2 {@stream}

edge -0.32,3.62 -> 3.02,3.62 {#rule .no-head .muted @cipher}

align middle iv0, iv1, iv2
align middle e0, e1, e2
align middle s0, s1, s2
align middle cc0, cc1, cc2

step keystream
  show @enc, @stream
step message
  show @msg
step cipher
  show @cipher
  emph cc0, cc1, cc2
:::

**Die geteilten Kästen sind zwei Kästen mit `gap 0`.** IV und Zähler tragen verschiedene Tönungen und stehen bündig aneinander; `between iv0,n0 offset 0,1.35` setzt die `Enc`-Box unter die Mitte des Paares, statt sie gegen einen der beiden zu schätzen.

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
text down1  "▼"             below regc gap 0.12 {@creation}
box  prov   "Provisioning"  below down1 gap 0.12 {@creation}
text provc  "issue credentials and\nprovide them to user"  below prov gap 0.2 {@creation}
text down2  "▼"             below provc gap 0.12 {@creation}
box  authz  "Authorization" below down2 gap 0.12 {@creation}
text authzc "granting of rights\nby the authority"  below authz gap 0.2 {@creation}

box  ident  "Identification" below usage gap 0.5 {@usage}
text identc "claim identity with\nunique name"  below ident gap 0.2 {@usage}
text down3  "▼"              below identc gap 0.12 {@usage}
box  authn  "Authentication" below down3 gap 0.12 {@usage}
text authnc "prove identity claim\nwith credentials"  below authn gap 0.2 {@usage}
text down4  "▼"              below authnc gap 0.12 {@usage}
box  acl    "Access Control" below down4 gap 0.12 {@usage}
text aclc   "granting of access\nby the system"  below acl gap 0.2 {@usage}

align middle reg, ident
align middle prov, authn
align middle authz, acl

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

**Ohne `align middle` driften die beiden Spalten auseinander.** Sie sind getrennte `below`-Ketten, und die Bildunterschriften sind mal ein-, mal zweizeilig – drei Zeilen halten die Reihen bündig.

## figure: Message authentication | it is not about confidentiality {.full #mac}

::: diagram {unit=150x60}
image alice avatar-alice "Alice" w 0.42
image eve   avatar-bob   "Eve"   right of alice gap 1.4 same as alice {.ghost @attack}
image bob   avatar-bob   "Bob"   right of eve gap 1.4 same as alice
align middle alice, eve, bob

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
text eg   "e.g." between ver1,ver2 offset -0.16,0 {.small .muted @proto}
align middle macA, ver1

text goals "Security goals: *integrity*\nand *authenticity* but\n~not non-repudiation~" at 3.55,-1.05 {.left}

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
text n "a free label, placed\nwherever it reads best"  right of c gap 0.7 -> x {.muted .small}
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
box s "fourth"  right of p gap 3.0
box q "second"  below p gap 0 h 0.8
box r "third"   below p gap 0 h 0.5
align middle p, q, r, s
spread x p, q, r, s

edge -0.8,0 -> a "from outside" {.muted}
:::

Oben gleiche *Kantenabstände*, unten gleiche *Mittelpunktabstände*. Der Pfeil links hat einen Endpunkt ohne Objekt – eine Koordinate statt eines unsichtbaren Ankers.

## figure: Containers and braces {.wide #grouping}

::: diagram {unit=130x76}
default box {.tone-1} w 1.0

box r1 "Registration"  at 0,0
box r2 "Provisioning"  below r1 gap 0.55 same as r1
box r3 "Authorization" below r2 gap 0.55 same as r1
edge r1 -> r2
edge r2 -> r3
brace sign over r1,r2 right "Signup"
container life "Creation" over r1,r2,r3 pad 0.42 {.dashed}
:::

Ein `container` legt sich um seine Mitglieder und passt sich neu an, wenn sie sich bewegen. Eine `brace` überspannt eine Teilmenge und hängt ihr Label nach außen.

## figure: A raster does not follow the theme {.standard #raster}

::: diagram {unit=150x60}
image swatch swatch w 0.6
text  note "a raster keeps its own colours\nin every theme" right of swatch gap 0.35 -> swatch {.small .muted}
:::

Beim Zyklus durch die Themes mit `A` bleibt das Rasterfeld, wie es ist, während Kästen, Pfeile und Vektor-Figuren umfärben. Das ist der Preis für Pixel.
