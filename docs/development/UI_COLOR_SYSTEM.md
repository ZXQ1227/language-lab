# Sayden UI Color System v1.0

The desktop app uses one light theme. White cards and a cloud backdrop dominate
the UI. Blue identifies primary actions and selection, lavender identifies
the conversation partner and model commentary, and warm yellow identifies
teaching hints. The brand swatches are blue `#3978F6`, lavender `#9275F5`,
sunshine `#FFC95C` and cloud `#F7F8FC`.

The desktop stylesheet defines the palette once in Tailwind's theme.
Use role-based utilities such as `bg-surface`, `text-ink`,
`border-line` and `bg-chat-ai`. Use `button-primary`, `button-secondary`,
`button-ghost`, `button-record` and `form-control` to reuse interaction colors.
The blue–lavender–pink gradient appears on the brand mark. The
blue–lavender–gold gradient appears behind the teacher portrait.
[Desktop styles](../../apps/desktop/src/styles.css)

| Use                                      | Background | Text      | Contrast |
| ---------------------------------------- | ---------- | --------- | -------- |
| Main canvas                              | `#F7F8FC`  | `#20283B` | 13.86:1  |
| Primary button and learner reply         | `#2F6DEA`  | `#FFFFFF` | 4.67:1   |
| Primary button hover                     | `#2865E6`  | `#FFFFFF` | 5.13:1   |
| Partner reply                            | `#F0EEFF`  | `#252B43` | 12.21:1  |
| Hint and incomplete objective            | `#FFF5D9`  | `#59451F` | 8.41:1   |
| Verified goal                            | `#EAF7F0`  | `#285D46` | 6.95:1   |
| Correction                               | `#FCEDEF`  | `#803B49` | 7.01:1   |
| Translation and other secondary surfaces | `#F2F4F9`  | `#59657A` | 5.35:1   |
| Selection and target vocabulary          | `#EAF1FF`  | `#2455BF` | 5.92:1   |
| Model commentary                         | `#F1EDFF`  | `#44327F` | 9.11:1   |
| Recording button                         | `#795BE7`  | `#FFFFFF` | 4.71:1   |

White on the original blue is 4.05:1. The deeper action color preserves
the white label and meets WCAG AA at small sizes. The secondary swatch
`#68738A` is available for white surfaces. Use the stronger muted text
`#59657A` across tinted surfaces. A stronger input boundary and blue
keyboard focus outline help identify controls. Speaker names, hint labels,
statuses and criterion marks convey the same distinctions in text.

Run the browser checks in `tests/e2e/focused-lesson.spec.ts` to verify
representative rendered colors and text contrast. The dialogue roleplay
and diagnosis checks also cover hint and correction colors.
See [ADR-0022](../adr/ADR-0022-sayden-light-color-system.md).
