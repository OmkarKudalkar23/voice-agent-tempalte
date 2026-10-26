# Design

<!-- impeccable:design-schema 1 -->

## World

Abyssal console stage. Near-black `#05070E` ground, hairline `rgba(148,163,184,0.12)` borders, console panels as vertical gradient `#111827→#0B0F19` with 18px blur and deep offset shadow. Single light-object (WebGL iridescent fluid) is the only saturated mass; everything else stays neutral so state color reads instantly.

## Color

- Ground: `#05070E` (dark picked from use scene: long dim-room demos, orb as light source). Strategy: Restrained + one living accent.
- Panel: `#0B0F19`, lines `slate @12%`.
- State accents: listening `#22D3EE→#3B82F6`, thinking `#A78BFA→#E879F9`, speaking `#F472B6→#8B5CF6`, idle `#3A4358→#171E2E`, active ok `#10B981`.
- Text: primary `#F8FAFC`, secondary `#94A3B8`, faint mono `#64748B`. Secondary text on tinted surfaces uses the tint (cyan-200 on cyan wash), never gray-on-color.

## Typography

- UI: Plus Jakarta Sans (400–800), display tracking `-0.03em`, headline 36–48px.
- Data: JetBrains Mono for session, latency, timers, badges. Uppercase micro-labels at 10–11px with `0.14–0.2em` tracking.

## Composition

Full-screen stage (Operate mode): 64px console top bar → centered 520px 3D orb → state headline + EQ → docked control panel → fixed bottom pipeline+latency strip. Transcript lives in a right slide-over drawer (420px), not in the grid. Mobile: orb 340px, drawer full-width, pipeline strip scrolls horizontally.

## Signature interaction

Iridescent fluid orb (Three.js custom GLSL simplex-noise shader): displacement amplitude follows real mic/output RMS via AnalyserNodes, color/speed/glow follow session state. 650 additive aura particles + 2 orbit rings. Fresnel rim + specular streak sell the liquid light. No-WebGL fallback: halo + state badge remain legible.

## Components & states

Top bar (brand mark, provider chips, timer, state pill, transcript toggle), orb canvas, headline block, control dock (START TALKING / MUTE / END SESSION), pipeline strip (5 nodes with active glow), latency readout (STT/LLM/TTS/TOTAL), transcript drawer, error toast with dismiss. States covered: ready/connected/listening/thinking/speaking + loading, muted, error, empty transcript, no-session.

## Motion

One authored moment: the orb. UI motion is single-spring drawer and 280ms state crossfade (`cubic-bezier(0.22,1,0.36,1)`), EQ bars only while active. Content visible by default; no scroll entrances.
