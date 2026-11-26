# Seasonal themes: requirements

From Nachi, 20 and 22 November 2026.

**Status (26 November 2026):** built in PR 87 (branch `claude/project-thread-ob4347`), open and not merged. Nachi said "this works for now" and will send changes after using it. On `main`, Settings still offers Auto, Light, White and Dark.

## Rules

- Seasonal replaces the White theme in Settings. Anyone who had White moves onto Seasonal.
- The theme is chosen automatically by date. Priority order, higher wins when two overlap:
  1. Diwali
  2. Christmas
  3. Spring
  4. Halloween
  5. Autumn
  6. Winter
  7. Olympics
  8. F1
- Festivals take up the whole week.
- Other Hindu festivals may be added, major ones only (Holi and Navratri were added, right after Diwali).
- Each season is a full, classy palette, not just a tint and a "Happy X" badge: page and card backgrounds, text colour, buttons and the active tab all change. The Term Lines colours and the right/wrong green and red stay the same.
- Text must stay easy to read in every theme.
- Christmas is red, white and green: white page and cards, evergreen borders and tabs, cranberry buttons. Halloween: pumpkin buttons, plum tabs.
- Decoration is part of each theme, in relevant, non-intrusive places, never under text (26 November):
  - a garland along the top of every tabbed screen (marigold toran for Diwali, fairy lights for Christmas, colour sprays for Holi, bandhani bunting for Navratri, pennants for Halloween, leaves for Autumn, icicles for Winter, blossom for Spring, the ring colours for the Olympics, a chequered strip for F1);
  - a sprite hanging off the Today card's top-right corner (mistletoe, fireworks, a colour splash, dandiya sticks, a spider and bat, falling leaves, snowflakes, a blossom sprig, the rings, chequered flags), plus a strip in the season's colours on that card's top edge and a border in its accent colour;
  - faint motifs in the empty middle of the laptop sidebar, and an icon in the badge.
- The art is drawn by `scripts/season-art.py` into `public/seasons/`; edit the script and re-run it rather than editing the SVGs.

## Choices made in PR 87 that Nachi hasn't overruled

- Summer has no theme on the list, so F1 covers June to August, and the Olympics take over while the Summer Games run.
- The Winter Olympics never show, because Winter ranks higher.
- Navratri runs from the first night to Dussehra.
- The Hindu festival dates for 2025 to 2030 were written from memory. The 2028 to 2030 Navratri dates need checking against a real calendar.
