---
title: Animated Infographics
subtitle: "What ::: diagram can draw, and how it steps"
author: Dominik Herrmann
theme: dark
collapse: none
---

## title: Animated Infographics | Boxes, arrows and labels that move {#cover}

A diagram is written in the lecture source, laid out at build time, and
stepped with the same key that advances a reveal.

# Drawing

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

Boxes size themselves to their label, arrows attach to whichever edge
faces the other element, and the free `text` element carries a line
stub to whatever it comments on.

## figure: Containers, groups and braces {.wide #grouping}

::: diagram {unit=130x76}
box r1 "Registration"  at 0,0        {.tone-1}
box r2 "Provisioning"  below r1 gap 0.55  {.tone-1}
box r3 "Authorization" below r2 gap 0.55  {.tone-1}

text t1 "identity"                     below r1 gap 0.12 {.small .muted}
text t2 "issue credentials"            below r2 gap 0.12 {.small .muted}

edge r1 -> r2
edge r2 -> r3

brace sign over r1,r2 right "Signup"
container life "Creation" over r1,r2,r3 pad 0.42 {.dashed}
:::

A `container` fits itself around its members and re-fits whenever they
move. A `brace` spans a subset and hangs its label outside.

# Stepping

## figure: CBC decryption, one step at a time {.full #cbc}

::: diagram {unit=112x74}
box iv "Rand. IV" at 0,0        {.tone-1}
box c0 "c_0"      right of iv gap 0.3 {.tone-3}
box c1 "c_1"      right of c0 gap 0.3 {.tone-3}
box c2 "c_2"      right of c1 gap 0.3 {.tone-3}

box d0 "Dec" at 1.15,1.7 {.round}
box d1 "Dec" right of d0 gap 0.72 {.round}
box d2 "Dec" right of d1 gap 0.72 {.round}

text k0 "k" left of d0 gap 0.42 {.mono}
text k1 "k" left of d1 gap 0.42 {.mono}
text k2 "k" left of d2 gap 0.42 {.mono}

dot x0 "+" below d0 gap 0.55
dot x1 "+" below d1 gap 0.55
dot x2 "+" below d2 gap 0.55

box m0 "m_0" below x0 gap 0.55 {.tone-4}
box m1 "m_1" below x1 gap 0.55 {.tone-4}
box m2 "m_2" below x2 gap 0.55 {.tone-4}

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

edge iv -> x0 via 0,1.32 {#feed0}
edge c0 -> x1 via 1.28,1.32 {#feed1}
edge c1 -> x2 via 2.48,1.32 {#feed2}

step decrypt
  show d0, d1, d2, k0, k1, k2
step chain
  show x0, x1, x2
  emph feed0, feed1, feed2
step recover
  show m0, m1, m2
  calm feed0, feed1, feed2
:::

Each `step` is one press of `Space`. The chaining arrows are drawn with
one waypoint each, which is all the routing these diagrams ever need.

## figure: A stack frame that gets overrun {.wide #stack}

::: diagram {unit=150x54}
box buf  "Local variable: mystring\n(char[], 16 bytes)" at 0,0 h 1.5 w 1.7 {.tone-1}
box val  "Local variable: myvalue\n(integer, 4 bytes)" below buf gap 0 w 1.7 {.tone-1}
box bp   "Stored base pointer"  below val gap 0 w 1.7 {.tone-1}
box ret  "Return address"       below bp  gap 0 w 1.7 {.tone-1}

box sp "SP" left of buf gap 0.5 {.tone-4 .sharp .small}
box bpl "BP" left of val gap 0.5 {.tone-4 .sharp .small}
edge sp -> buf
edge bpl -> val

text dir "writing direction:\ntowards higher\naddresses" right of val gap 0.55 {.small .muted}
edge buf.tr -> ret.br via 2.05,0 2.05,2.4 {#down .muted}

step overflow
  emph buf
  style val,bp,ret {.dashed}
step reached
  emph ret
  label ret "Return address (attacker's)"
step pulled
  move sp to below bpl gap 2.2
  move dir by 0.6,0
:::

`move`, `show`, `hide`, `emph`, `style` and `label` are the whole step
vocabulary. Nothing here is positioned by a solver – every coordinate is
either a grid cell or a relation to a neighbour.

# Rebuilt from real slides

## figure: Identity lifecycle {.full #lifecycle}

::: diagram {unit=176x56}
box  create "Creation"      w 1.15 {.tone-1 .bold}
text sep1   "▶"             right of create gap 0.2 {.muted .large}
box  usage  "Usage"         right of sep1 gap 0.2 w 1.15 {.tone-1 .bold}
text sep2   "▶"             right of usage gap 0.2 {.muted .large}
box  term   "Termination"   right of sep2 gap 0.2 w 1.15 {.tone-1 .bold}

box  reg    "Registration"  below create gap 0.5 w 1.15 {.tone-4}
text regc   "identity"      below reg gap 0.2 {.small .muted}
text down1  "▼"             below regc gap 0.12 {.muted}
box  prov   "Provisioning"  below down1 gap 0.12 w 1.15 {.tone-4}
text provc  "issue credentials and\nprovide them to user"  below prov gap 0.2 {.small .muted}
text down2  "▼"             below provc gap 0.12 {.muted}
box  authz  "Authorization" below down2 gap 0.12 w 1.15 {.tone-4}
text authzc "granting of rights\nby the authority"  below authz gap 0.2 {.small .muted}

box  ident  "Identification" below usage gap 0.5 w 1.15 {.tone-4}
text identc "claim identity with\nunique name"  below ident gap 0.2 {.small .muted}
text down3  "▼"             below identc gap 0.12 {.muted}
box  authn  "Authentication" below down3 gap 0.12 w 1.15 {.tone-4}
text authnc "prove identity claim\nwith credentials"  below authn gap 0.2 {.small .muted}
text down4  "▼"             below authnc gap 0.12 {.muted}
box  acl    "Access Control" below down4 gap 0.12 w 1.15 {.tone-4}
text aclc   "granting of access\nby the system"  below acl gap 0.2 {.small .muted}

brace signup over reg,prov  right "Signup" {.muted}
brace login  over ident,authn right "Login" {.muted}

text sep3   "▶"             below authzc gap 0.5 {.muted .large}
box  selfsv "Self-services" right of sep3 gap 0.2 w 1.15 {.tone-4}

step creation
  show reg, regc, down1, prov, provc, down2, authz, authzc, signup
step usage
  show ident, identc, down3, authn, authnc, down4, acl, aclc, login
step self
  show sep3, selfsv
  emph selfsv
:::

## figure: Message authentication {.full #mac}

::: diagram {unit=150x62}
box  alice "Alice"  {.round .tone-2}
box  eve   "Eve"    right of alice gap 1.1 {.round .tone-3}
box  bob   "Bob"    right of eve gap 1.1 {.round .tone-2}

text kA "k" left of alice gap 0.18 {.mono .small}
text kB "k" right of bob gap 0.18 {.mono .small}

edge alice -> bob "M, T" via 1.18,0.8 2.36,0.8 {#wire}
edge eve.right -> bob.left "M, T   replay"      via 2.05,-0.26 2.35,-0.26 {#replay .accent .small}
edge eve.right -> bob.left "forgery   M_F, T_F" via 2.05,0.14 2.35,0.14 {#forge .accent .small}
text def "defense?" above eve gap 0.35 {.hand .small}

text macA "T = MAC_k(M)"           below alice gap 0.55 {.mono .small}
text tagA "\"authentication tag\"" below macA gap 0.14 {.hand .small}

text ver1 "Verify_k(M, T)"                 below bob gap 0.55 {.mono .small}
text ver2 "T' = MAC_k(M)\nT' equals T ?"   below ver1 gap 0.5 {.mono .small}
edge ver1 -- ver2 {.muted .dotted}
text eg   "e.g."  below ver1 gap 0.14 align left {.small .muted}

text goals "Security goals: *integrity*\nand *authenticity* but\n~not non-repudiation~" at 3.55,-1.05 {.left}

step protocol
  show macA, tagA, ver1, eg, ver2
step attack
  show eve, replay, forge, def
  emph replay, forge
:::

**Der Farbwechsel mitten im Satz war der Auslöser für `*accent*` und `~muted~`.** „Security goals" brauchte im ersten Anlauf sechs `text`-Elemente, die mit `right of` aneinandergekettet waren – unlesbar als Quelltext und beim kleinsten Wortwechsel neu zu sortieren. Jetzt ist es ein Element.

**Was noch fehlt:** `e.g.` neben dem senkrechten Verbinder ist relativ zu `ver1` platziert, weil es keinen Anker auf der Mitte einer Kante gibt.

**Die Avatare fehlen ersatzlos.** Ein Diagramm kann keine Bilder aufnehmen, also stehen hier drei beschriftete Kästen, wo im Original gezeichnete Figuren sitzen. Das ist die deutlichste Lücke, die der Nachbau gezeigt hat.
