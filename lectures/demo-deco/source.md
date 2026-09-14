---
title: Decoration Probe
subtitle: Every never-used slot, once
presenter: Test
info: |
  Coverage of the untested decoration vocabulary
cover: hero
cover-image: photo
theme: light-blue
collapse: none
---

## title: {#title}

# Cards grounds and scrims {#cardgrounds}

## figure: Photo ground, veil scrim {.full #photo-veil}

::: cards 2 {.photo .veil}
- **Alpha**\
  ![](photo)
  text over the veiled picture
- **Beta**\
  ![](photo)
  second card with a picture ground
:::

## figure: Photo ground, invert scrim {.full #photo-invert}

::: cards 2 {.photo .invert}
- **Gamma**\
  ![](photo)
  light text over a darkened picture
- **Delta**\
  ![](photo)
  second card
:::

## figure: Photo ground, plain scrim {.full #photo-plain}

::: cards 2 {.photo .plain}
- **Epsilon**\
  ![](photo)
  no scrim at all
- **Zeta**\
  ![](photo)
  second card
:::

# Backdrops {#backdrops}

## figure: Contain fill {.full .bare #bd-contain}

::: backdrop photo {.contain .veil}

::: overlay {.center .paper .card}
### contain
The whole picture inside the frame, letterboxed.
:::

## figure: Blur focus {.full .bare #bd-blur}

::: backdrop photo {.cover .blur .veil}

::: overlay {.center .paper .card}
### blur
A blurred ground behind sharp type.
:::

## figure: Layer over {.full .bare #bd-over}

The title below should be covered by the picture on beat 2.

---

::: backdrop photo {.cover .over}

# Overlay heights {#ovheights}

## figure: Snug band {.full .bare #ov-snug}

::: backdrop dusk {.cover}

::: overlay {.bottom .ink .snug}
A snug band across the bottom.
:::

## figure: Third band {.full .bare #ov-third}

::: backdrop dusk {.cover}

::: overlay {.bottom .glass .panel .third}
A third-height band.
:::

## figure: Half band {.full .bare #ov-half}

::: backdrop dusk {.cover}

::: overlay {.top .accent .panel .half}
A half-height top band.
:::

# Dock grounds {#dockgrounds}

## free: Tint dock {.wide #dock-tint}

::: dock {.right .tint}
- side note one
- side note two
:::

Body beside a tint dock.

## free: Paper dock {.wide #dock-paper}

::: dock {.bottom .paper .third}
A paper band – on the slide's own paper it should have no visible edge.
:::

Body above a paper dock.

## free: Clear dock {.wide #dock-clear}

::: dock {.left .clear}
- clear one
- clear two
:::

Body beside a clear dock.
