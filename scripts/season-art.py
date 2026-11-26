"""Draws the seasonal theme art in public/seasons/: a garland along the top of each tab
screen, a sprite hanging off the Today card's corner, the badge icon and the sidebar tile.
Run: python3 scripts/season-art.py public/seasons"""
import math, sys, os
OUT = sys.argv[1]

def svg(w, h, body, vb=None):
    vb = vb or f'0 0 {w} {h}'
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="{vb}">{body}</svg>\n'
def g(x, y, body, r=0, s=1): return f'<g transform="translate({x:.1f} {y:.1f}) rotate({r}) scale({s})">{body}</g>'

# ---------- shared pieces ----------
def marigold(r=4.2):
    petals = ''.join(f'<circle cx="{math.cos(a)*r*0.62:.2f}" cy="{math.sin(a)*r*0.62:.2f}" r="{r*0.5:.2f}" fill="#f08a10"/>' for a in [i*math.pi/4 for i in range(8)])
    return petals + f'<circle r="{r*0.55:.2f}" fill="#f7b21e"/><circle r="{r*0.2:.2f}" fill="#c55a00"/>'
def mango_leaf(l=11):
    return f'<path d="M0 0 Q{l*0.38:.1f} {l*0.45:.1f} 0 {l} Q{-l*0.38:.1f} {l*0.45:.1f} 0 0Z" fill="#3f8a3a"/><path d="M0 1 L0 {l-1}" stroke="#2c6a28" stroke-width="0.6"/>'
def blossom(r=4, c='#f2a1bb', mid='#e6b422'):
    return ''.join(f'<ellipse cx="0" cy="{-r*0.62:.2f}" rx="{r*0.42:.2f}" ry="{r*0.62:.2f}" fill="{c}" transform="rotate({a})"/>' for a in range(0,360,72)) + f'<circle r="{r*0.25:.2f}" fill="{mid}"/>'
def maple(c):
    pts = [(0,-10),(2,-5),(6,-7),(5,-2),(10,-3),(7,1),(9,4),(3,3),(1,8),(0,6),(-1,8),(-3,3),(-9,4),(-7,1),(-10,-3),(-5,-2),(-6,-7),(-2,-5)]
    return '<path d="M' + ' L'.join(f'{x} {y}' for x,y in pts) + f'Z" fill="{c}"/><path d="M0 6 L0 13" stroke="{c}" stroke-width="1.3" stroke-linecap="round"/>'
def flake(c, r=10, w=1.6):
    arms = ''.join(f'<g transform="rotate({a})"><path d="M0 0 L0 {-r}"/><path d="M0 {-r*0.58:.1f} L{-r*0.3:.1f} {-r*0.86:.1f}"/><path d="M0 {-r*0.58:.1f} L{r*0.3:.1f} {-r*0.86:.1f}"/></g>' for a in range(0,360,60))
    return f'<g stroke="{c}" stroke-width="{w}" stroke-linecap="round" fill="none">{arms}</g>'
def bat(c='#4a2a6e'):
    return f'<path d="M0 -1 Q-3 -5 -7 -3 Q-11 -7 -16 -3 Q-12 -1 -12 3 Q-9 0 -7 3 Q-3 0 0 3 Q3 0 7 3 Q9 0 12 3 Q12 -1 16 -3 Q11 -7 7 -3 Q3 -5 0 -1Z" fill="{c}"/><circle cx="-1.4" cy="-1.6" r="0.7" fill="#f6c560"/><circle cx="1.4" cy="-1.6" r="0.7" fill="#f6c560"/>'
def burst(c1, c2, r=12, n=12):
    lines = ''.join(f'<path d="M{math.cos(a)*r*0.25:.1f} {math.sin(a)*r*0.25:.1f} L{math.cos(a)*r*0.85:.1f} {math.sin(a)*r*0.85:.1f}" stroke="{c1}" stroke-width="1.3" stroke-linecap="round"/><circle cx="{math.cos(a)*r:.1f}" cy="{math.sin(a)*r:.1f}" r="1.3" fill="{c2}"/>' for a in [i*2*math.pi/n for i in range(n)])
    return lines + f'<circle r="1.6" fill="{c2}"/>'
def check(cols, rows, sq, c='#16161a'):
    return ''.join(f'<rect x="{x*sq}" y="{y*sq}" width="{sq}" height="{sq}" fill="{c}"/>' for x in range(cols) for y in range(rows) if (x+y)%2==0)

files = {}

# ---------- garlands: tiles that repeat along the top edge ----------
# Diwali: a toran of marigolds on a swag, with mango leaves between.
files['diwali-garland.svg'] = svg(56, 22,
    '<path d="M0 2 Q28 9 56 2" stroke="#9a5a1a" stroke-width="1" fill="none"/>'
    + g(14, 5.6, marigold()) + g(42, 5.6, marigold())
    + g(28, 5.5, mango_leaf(14)) + g(0, 2, mango_leaf(10)) + g(56, 2, mango_leaf(10)))
# Christmas: fairy lights in red, white and green on a dark wire.
def bulb(c, edge):
    return f'<rect x="-1.6" y="0" width="3.2" height="2.6" rx="0.6" fill="#5b6b62"/><path d="M0 2 Q4 6 0 12 Q-4 6 0 2Z" fill="{c}" stroke="{edge}" stroke-width="0.6"/><ellipse cx="-1" cy="6" rx="0.7" ry="1.6" fill="#fff" opacity="0.6"/>'
files['christmas-garland.svg'] = svg(66, 22,
    '<path d="M0 3 Q11 9 22 3 Q33 9 44 3 Q55 9 66 3" stroke="#2f4a3c" stroke-width="1" fill="none"/>'
    + g(11, 5.5, bulb('#d0263a', '#9e1628')) + g(33, 5.5, bulb('#ffffff', '#c9d2cc')) + g(55, 5.5, bulb('#1f8a4c', '#126435')))
# Holi: sweeps of coloured powder and a few flecks.
hc = ['#e0409a', '#f2b600', '#2a8ad8', '#28a860', '#8a4fd0', '#f0702a']
streaks = ''
for i, (x, y, l, a) in enumerate([(4,6,16,-8),(26,12,12,6),(44,5,18,-4),(70,11,14,10),(92,6,16,-6),(112,13,9,4)]):
    c = hc[i % len(hc)]
    streaks += g(x, y, f'<path d="M0 0 L{l} 0" stroke="{c}" stroke-width="4.2" stroke-linecap="round" opacity="0.85"/><circle cx="{l+5}" cy="1" r="1.3" fill="{c}"/><circle cx="{l+8.5}" cy="-1" r="0.8" fill="{c}"/>', a)
files['holi-garland.svg'] = svg(128, 20, streaks)
# Navratri: bandhani bunting, red and saffron flags with white dots.
def flag(c):
    dots = ''.join(f'<circle cx="{x}" cy="{y}" r="0.9" fill="#fff"/>' for x, y in [(-5,3),(0,3),(5,3),(-2.5,7),(2.5,7),(0,11)])
    return f'<path d="M-8 0 L8 0 L0 16Z" fill="{c}"/>' + dots
files['navratri-garland.svg'] = svg(48, 20,
    '<path d="M0 2 L48 2" stroke="#7a2a10" stroke-width="1"/>' + g(12, 2.5, flag('#c8142e')) + g(36, 2.5, flag('#ee7a10')))
# Halloween: pennants in pumpkin, plum and black.
def pennant(c): return f'<path d="M-7 0 L7 0 L0 14Z" fill="{c}"/>'
files['halloween-garland.svg'] = svg(66, 18,
    '<path d="M0 2 Q16.5 6 33 2 Q49.5 6 66 2" stroke="#3a2a40" stroke-width="1" fill="none"/>'
    + g(11, 3.4, pennant('#e8741a')) + g(33, 3.4, pennant('#5c2c8a')) + g(55, 3.4, pennant('#2a2230')))
# Autumn: a vine of maple leaves.
files['autumn-garland.svg'] = svg(60, 22,
    '<path d="M0 2 Q15 7 30 2 Q45 7 60 2" stroke="#7a4a20" stroke-width="1" fill="none"/>'
    + g(15, 11, maple('#c0501e'), 10, 0.75) + g(45, 11, maple('#d49428'), -12, 0.75))
# Winter: icicles under a frosted edge.
ice = '<rect width="40" height="3" fill="#d6e8f5"/>'
for x, l in [(3,8),(9,15),(15,6),(21,11),(28,17),(34,7)]:
    ice += f'<path d="M{x-2.6} 2.5 L{x+2.6} 2.5 L{x} {l}Z" fill="#b8d6ee"/><path d="M{x-0.8} 3 L{x-0.2} {l*0.7:.1f}" stroke="#fff" stroke-width="0.8" opacity="0.8"/>'
files['winter-garland.svg'] = svg(40, 20, ice)
# Spring: a blossom branch.
files['spring-garland.svg'] = svg(64, 20,
    '<path d="M0 3 Q16 8 32 3 Q48 8 64 3" stroke="#7a5a3a" stroke-width="1.2" fill="none"/>'
    + g(10, 5.5, '<ellipse rx="2" ry="4.2" fill="#6fae5a"/>', -40) + g(42, 5.5, '<ellipse rx="2" ry="4.2" fill="#6fae5a"/>', 40)
    + g(22, 8, blossom(5)) + g(54, 7, blossom(4, '#f7c4d4')))
# Olympics: a ribbon in the five ring colours.
oc = ['#0081c8', '#fcb131', '#16161a', '#00a651', '#ee334e']
files['olympics-garland.svg'] = svg(100, 5, ''.join(f'<rect x="{i*20}" width="20" height="5" fill="{c}"/>' for i, c in enumerate(oc)))
# F1: a chequered strip.
files['f1-garland.svg'] = svg(12, 12, check(2, 2, 6))

# ---------- corner sprites: hang off the Today card's top-right corner ----------
W = 72
# Christmas: mistletoe tied with a red bow, white berries.
def leaf(l, w, c):
    return f'<path d="M0 0 Q{w} {l*0.5:.1f} 0 {l} Q{-w} {l*0.5:.1f} 0 0Z" fill="{c}"/>'
mist = ('<path d="M36 0 L36 14" stroke="#b81d30" stroke-width="2"/>'
        '<path d="M36 14 Q28 8 25 14 Q28 19 36 14Z" fill="#d0263a"/><path d="M36 14 Q44 8 47 14 Q44 19 36 14Z" fill="#d0263a"/>'
        '<path d="M35 15 L31 26 M37 15 L41 26" stroke="#b81d30" stroke-width="2" stroke-linecap="round"/><circle cx="36" cy="14" r="2.4" fill="#9e1628"/>'
        '<path d="M36 16 Q34 30 30 42 M36 16 Q39 30 44 40" stroke="#5a7a3a" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
        + g(32, 24, leaf(16, 5, '#3f8a3a'), 50) + g(33, 30, leaf(15, 5, '#2f7a3a'), 120)
        + g(41, 24, leaf(16, 5, '#2f7a3a'), -50) + g(42, 30, leaf(15, 5, '#3f8a3a'), -120)
        + g(30, 40, leaf(14, 4.5, '#3f8a3a'), 30) + g(44, 39, leaf(14, 4.5, '#2f7a3a'), -30)
        + ''.join(f'<circle cx="{x}" cy="{y}" r="2.6" fill="#fbfbf6" stroke="#c8d0c4" stroke-width="0.6"/>' for x, y in [(34,31),(38,32),(36,35),(30,44),(44,42)]))
files['christmas-corner.svg'] = svg(W, 56, mist)
# Diwali: fireworks over a lit diya.
files['diwali-corner.svg'] = svg(W, 56,
    g(22, 16, burst('#f0a020', '#ffd36a', 13)) + g(52, 12, burst('#d6336c', '#f6a0c0', 10, 10)) + g(44, 34, burst('#e8742a', '#ffcf5a', 7, 8)))
# Holi: a splash of coloured powder.
def splash(c, r):
    return f'<circle r="{r}" fill="{c}" opacity="0.9"/>' + ''.join(f'<circle cx="{math.cos(a)*r*1.5:.1f}" cy="{math.sin(a)*r*1.5:.1f}" r="{r*0.28:.1f}" fill="{c}"/>' for a in [0.3, 1.4, 2.5, 3.9, 5.2])
files['holi-corner.svg'] = svg(W, 56, g(24, 16, splash('#e0409a', 7)) + g(48, 12, splash('#f2b600', 5.5)) + g(40, 34, splash('#2a8ad8', 6)) + g(60, 32, splash('#28a860', 3.5)))
# Navratri: a pair of decorated dandiya sticks.
def dandiya(c):
    bands = ''.join(f'<rect x="-2" y="{y}" width="4" height="2.2" fill="{c2}"/>' for y, c2 in [(6,'#f6b020'),(14,'#2a8a4c'),(22,'#f6b020'),(30,'#2a8a4c')])
    return f'<rect x="-2" y="0" width="4" height="40" rx="2" fill="{c}"/>' + bands + '<path d="M0 40 L-3 48 M0 40 L0 49 M0 40 L3 48" stroke="#f6b020" stroke-width="1.2" stroke-linecap="round"/>'
files['navratri-corner.svg'] = svg(W, 56, g(28, 4, dandiya('#c8142e'), -28) + g(46, 4, dandiya('#ee7a10'), 28))
# Halloween: a spider on its thread, and a bat.
spider = ('<path d="M44 0 L44 26" stroke="#3a2a40" stroke-width="0.8"/>'
          '<g stroke="#2a1e30" stroke-width="1.4" fill="none" stroke-linecap="round">'
          + ''.join(f'<path d="M44 31 Q{44+s*7} {31+dy-4} {44+s*11} {31+dy+3}"/>' for s in (-1, 1) for dy in (-3, 0, 3, 6)) + '</g>'
          '<ellipse cx="44" cy="31" rx="5" ry="6" fill="#2a1e30"/><circle cx="44" cy="25" r="3.2" fill="#2a1e30"/>'
          '<circle cx="42.8" cy="24.6" r="0.8" fill="#f08a20"/><circle cx="45.2" cy="24.6" r="0.8" fill="#f08a20"/>')
files['halloween-corner.svg'] = svg(W, 56, spider + g(18, 14, bat(), -8, 0.9))
# Autumn: falling leaves.
files['autumn-corner.svg'] = svg(W, 56, g(24, 16, maple('#c0501e'), -20, 1.05) + g(50, 26, maple('#d49428'), 25, 0.85) + g(34, 42, maple('#a8401a'), 60, 0.6))
# Winter: a drift of snowflakes.
files['winter-corner.svg'] = svg(W, 56, g(24, 18, flake('#5a90c0', 11, 1.8)) + g(52, 14, flake('#8ab4d8', 7, 1.5)) + g(44, 38, flake('#7aa6cc', 8, 1.5)))
# Spring: a blossom sprig.
files['spring-corner.svg'] = svg(W, 56,
    '<path d="M8 6 Q30 10 40 24 Q48 34 62 38" stroke="#7a5a3a" stroke-width="2" fill="none" stroke-linecap="round"/>'
    + g(26, 9, '<ellipse rx="2.6" ry="5" fill="#6fae5a"/>', 60) + g(50, 33, '<ellipse rx="2.6" ry="5" fill="#6fae5a"/>', -30)
    + g(20, 10, blossom(7)) + g(40, 24, blossom(8, '#f7c4d4')) + g(62, 38, blossom(6)))
# Olympics: the rings.
rings = ''.join(f'<circle cx="{x}" cy="{y}" r="9" fill="none" stroke="{c}" stroke-width="2.6"/>' for x, y, c in [(16,18,'#0081c8'),(36,18,'#16161a'),(56,18,'#ee334e'),(26,27,'#fcb131'),(46,27,'#00a651')])
files['olympics-corner.svg'] = svg(W, 56, rings)
# F1: crossed chequered flags.
def cflag(): return '<path d="M0 0 L0 40" stroke="#3a3a42" stroke-width="2" stroke-linecap="round"/>' + g(1, 1, check(5, 4, 4) + '<rect width="20" height="16" fill="none" stroke="#16161a" stroke-width="0.8"/>')
files['f1-corner.svg'] = svg(W, 56, g(12, 6, cflag(), -30) + g(60, 6, '<g transform="scale(-1 1)">' + cflag() + '</g>', 30))

# ---------- badge icons ----------
def icon(body, vb='-16 -16 32 32'): return svg(32, 32, body, vb)
holly_icon = ('<path d="M0 0 Q-7 -9 -15 -7 Q-11 -3 -13 2 Q-7 2 0 0Z" fill="#1f7a46"/><path d="M0 0 Q7 -9 15 -7 Q11 -3 13 2 Q7 2 0 0Z" fill="#2f8a52"/>'
              '<circle cx="-3" cy="3" r="4" fill="#c8202f"/><circle cx="3.5" cy="4" r="4" fill="#d6283a"/><circle cx="0" cy="-1" r="3.6" fill="#b81d30"/>'
              '<circle cx="-4" cy="1.8" r="1" fill="#fff" opacity="0.7"/>')
files['christmas-icon.svg'] = icon(g(0, 2, holly_icon, 0, 1.05))
files['diwali-icon.svg'] = icon(g(0, 6, '<path d="M-13 0 Q0 13 13 0 Q0 4 -13 0Z" fill="#c8610a"/><path d="M0 -15 Q6 -7 0 -2 Q-6 -7 0 -15Z" fill="#f0a020"/>'))
files['holi-icon.svg'] = icon('<circle cx="-5" cy="-4" r="7" fill="#e0409a"/><circle cx="6" cy="-3" r="6" fill="#f2b600"/><circle cx="0" cy="7" r="6.5" fill="#2a8ad8"/>')
files['navratri-icon.svg'] = icon(marigold(13))
files['halloween-icon.svg'] = icon('<ellipse rx="13" ry="10.5" fill="#e8741a" cy="2"/><ellipse rx="5" ry="10.5" fill="#d0600e" cy="2"/><path d="M0 -8 Q1 -13 4 -14" stroke="#4a7a30" stroke-width="2.6" fill="none"/>')
files['autumn-icon.svg'] = icon(g(0, -1, maple('#c0501e'), 0, 1.25))
files['winter-icon.svg'] = icon(flake('#4a86b8', 13, 2.4))
files['spring-icon.svg'] = icon(blossom(15))
files['olympics-icon.svg'] = svg(32, 32, rings, '4 6 64 34')
files['f1-icon.svg'] = svg(32, 32, g(16, 4, cflag()), '10 0 32 32')

# ---------- sidebar tiles: a loose scatter of the season's sprites ----------
def tile(items, op=0.55): return svg(180, 180, f'<g opacity="{op}">' + ''.join(items) + '</g>')
files['christmas.svg'] = tile([g(20, 10, mist, 0, 0.7), g(120, 110, flake('#9fb4c4', 9)), g(130, 30, g(0,0,bulb('#d0263a','#9e1628')), 20, 1.4), g(40, 140, g(0,0,bulb('#1f8a4c','#126435')), -15, 1.4)])
files['diwali.svg'] = tile([g(45, 45, burst('#f0a020', '#ffd36a', 14)), g(135, 125, burst('#d6336c', '#f6a0c0', 11, 10)), g(130, 35, marigold(6)), g(40, 140, g(0, 6, '<path d="M-13 0 Q0 13 13 0 Q0 4 -13 0Z" fill="#c8610a"/><path d="M0 -15 Q6 -7 0 -2 Q-6 -7 0 -15Z" fill="#f0a020"/>'), 0, 0.9)])
files['holi.svg'] = tile([g(35, 40, splash('#e0409a', 7)), g(130, 55, splash('#f2b600', 6)), g(75, 130, splash('#2a8ad8', 7)), g(155, 150, splash('#28a860', 4))], 0.45)
files['navratri.svg'] = tile([g(20, 10, dandiya('#c8142e'), -28, 0.8), g(40, 10, dandiya('#ee7a10'), 28, 0.8), g(130, 120, marigold(8)), g(130, 40, marigold(5)), g(50, 150, marigold(6))])
files['halloween.svg'] = tile([g(45, 45, bat(), -10, 1.1), g(130, 130, '<ellipse rx="12" ry="9.5" fill="#e8741a"/><ellipse rx="4.5" ry="9.5" fill="#d0600e"/><path d="M0 -9 Q1 -13 4 -14" stroke="#4a7a30" stroke-width="2.2" fill="none"/>'), g(130, 40, bat(), 8, 0.7), g(45, 140, '<ellipse rx="9" ry="7" fill="#e8741a"/><ellipse rx="3.4" ry="7" fill="#d0600e"/>')])
files['autumn.svg'] = tile([g(40, 45, maple('#c05a22'), -20, 1.2), g(135, 120, maple('#d49428'), 30, 1.1), g(125, 35, maple('#a84820'), 60, 0.8), g(50, 140, maple('#d49428'), -60, 0.9)])
files['winter.svg'] = tile([g(40, 45, flake('#6a98c0', 12)), g(135, 125, flake('#6a98c0', 10)), g(130, 40, flake('#8ab4d8', 7)), g(45, 140, flake('#8ab4d8', 8)), g(90, 90, flake('#a8c8e4', 5))])
files['spring.svg'] = tile([g(40, 45, blossom(8)), g(135, 120, blossom(7, '#f7c4d4')), g(125, 35, '<ellipse rx="3" ry="6" fill="#6fae5a"/>', 30), g(50, 140, '<ellipse rx="3" ry="6" fill="#6fae5a"/>', -40), g(95, 90, blossom(5))])
files['olympics.svg'] = tile([g(20, 30, rings, 0, 0.9), g(100, 120, rings, 0, 0.7)], 0.4)
files['f1.svg'] = tile([g(30, 20, cflag(), -12), g(120, 100, cflag(), 10)], 0.3)

os.makedirs(OUT, exist_ok=True)
for name, body in files.items():
    open(os.path.join(OUT, name), 'w').write(body)
print(len(files), 'files')
