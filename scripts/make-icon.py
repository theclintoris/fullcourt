"""Generate the FullCourt app icon from the same court geometry as LogoMark."""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
BUILD.mkdir(exist_ok=True)

SCALE = 4
SIZE = 1024
W = SIZE * SCALE
PAD = 56 * SCALE
RADIUS = 220 * SCALE

# Vertical orange gradient, clipped to a rounded square.
top = (255, 139, 61)
bottom = (225, 87, 22)
gradient = Image.new("RGB", (W, W), top)
draw = ImageDraw.Draw(gradient)
for y in range(W):
    t = y / max(1, W - 1)
    color = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
    draw.line([(0, y), (W, y)], fill=color)

mask = Image.new("L", (W, W), 0)
ImageDraw.Draw(mask).rounded_rectangle(
    (PAD, PAD, W - PAD, W - PAD), radius=RADIUS, fill=255
)
icon = Image.new("RGBA", (W, W), (0, 0, 0, 0))
icon.paste(gradient, (0, 0), mask)

ink = (11, 14, 19, 255)
ink_soft = (11, 14, 19, 150)
d = ImageDraw.Draw(icon)

# Inset court boundary.
left = PAD + 98 * SCALE
right = W - PAD - 98 * SCALE
top_y = PAD + 98 * SCALE
bottom_y = W - PAD - 98 * SCALE
d.rounded_rectangle(
    (left, top_y, right, bottom_y),
    radius=64 * SCALE,
    outline=ink,
    width=12 * SCALE,
)

# Half-court line and centre circle.
cx = W // 2
d.line([(cx, top_y), (cx, bottom_y)], fill=ink_soft, width=8 * SCALE)
circle_r = 142 * SCALE
d.ellipse(
    (cx - circle_r, W // 2 - circle_r, cx + circle_r, W // 2 + circle_r),
    outline=ink,
    width=12 * SCALE,
)
inner_r = 24 * SCALE
d.ellipse(
    (cx - inner_r, W // 2 - inner_r, cx + inner_r, W // 2 + inner_r),
    fill=ink,
)

# Painted keys, top and bottom.
key_w = 150 * SCALE
key_d = 210 * SCALE
for y0, y1 in ((top_y, top_y + key_d), (bottom_y - key_d, bottom_y)):
    d.rectangle(
        (cx - key_w // 2, y0, cx + key_w // 2, y1),
        outline=ink_soft,
        width=7 * SCALE,
    )
    rim_r = 34 * SCALE
    cy = y0 + rim_r + 12 * SCALE if y0 == top_y else y1 - rim_r - 12 * SCALE
    d.ellipse(
        (cx - rim_r, cy - rim_r, cx + rim_r, cy + rim_r),
        outline=ink,
        width=7 * SCALE,
    )

# Three-point arcs, roughly to the court edges.
arc_box = (
    left + 22 * SCALE,
    top_y + 120 * SCALE,
    right - 22 * SCALE,
    bottom_y - 120 * SCALE,
)
d.arc(arc_box, start=128, end=232, fill=ink_soft, width=7 * SCALE)
d.arc(arc_box, start=308, end=52, fill=ink_soft, width=7 * SCALE)

# Touch of top-light for depth.
shine = Image.new("RGBA", (W, W), (0, 0, 0, 0))
sd = ImageDraw.Draw(shine)
sd.ellipse(
    (W * 0.08, -W * 0.18, W * 0.92, W * 0.5),
    fill=(255, 255, 255, 20),
)
icon = Image.alpha_composite(icon, shine)

final = icon.resize((SIZE, SIZE), Image.LANCZOS)
final.save(BUILD / "icon.png")

sizes = [16, 24, 32, 48, 64, 128, 256]
frames = [final.resize((s, s), Image.LANCZOS) for s in sizes]
frames[-1].save(
    BUILD / "icon.ico",
    format="ICO",
    sizes=[(s, s) for s in sizes],
    append_images=frames[:-1],
)
print(f"wrote {BUILD / 'icon.png'} and {BUILD / 'icon.ico'}")
