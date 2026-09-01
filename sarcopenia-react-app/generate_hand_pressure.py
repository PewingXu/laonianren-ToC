#!/usr/bin/env python3
"""
Generate hand pressure distribution map - LIGHT THEME (蔡司风格).
White/light gray background with soft wireframe and vibrant heatmap overlays.
"""
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.ndimage import gaussian_filter
import os

# ─── Config ───
BASE_IMG = "/home/ubuntu/hand_wireframe_base.png"
JSON_PATH = "/home/ubuntu/sarcopenia-react-app/public/grip_report_data/grip_report.json"
OUT_PATH = "/home/ubuntu/sarcopenia-react-app/public/grip_report_data/hand_pressure_map.png"

with open(JSON_PATH) as f:
    data = json.load(f)

fingers = data['fingers']
hand_type = data['handType']

# Load base image
base_orig = Image.open(BASE_IMG).convert('RGBA')
W, H = base_orig.size
print(f"Base image size: {W}x{H}")

# ─── Detect wireframe lines ───
base_arr = np.array(base_orig, dtype=np.float32)
gray = 0.299 * base_arr[:,:,0] + 0.587 * base_arr[:,:,1] + 0.114 * base_arr[:,:,2]
line_mask = gray < 200  # wireframe lines

# ─── Create hand interior mask (flood fill from outside to find hand shape) ───
from scipy.ndimage import binary_fill_holes, binary_dilation
# Dilate lines slightly to close gaps
thick_lines = binary_dilation(line_mask, iterations=3)
# Fill holes = everything inside the outline
filled = binary_fill_holes(thick_lines)
# Hand interior = filled minus the lines themselves
hand_interior = filled.astype(np.float32)
# Smooth the mask edges
hand_mask = gaussian_filter(hand_interior, sigma=8.0)
hand_mask = np.clip(hand_mask, 0, 1)
print(f"Hand mask coverage: {hand_interior.sum() / (W*H) * 100:.1f}%")

# ─── Light background ───
bg_color = np.array([248, 250, 252], dtype=np.float32)  # very light gray-blue
wire_color = np.array([180, 200, 220], dtype=np.float32)  # soft blue-gray wireframe

canvas = np.zeros((H, W, 3), dtype=np.float32)
canvas[:,:,0] = bg_color[0]
canvas[:,:,1] = bg_color[1]
canvas[:,:,2] = bg_color[2]

# Add subtle wireframe glow (very soft shadow behind lines)
glow_mask = line_mask.astype(np.float32)
glow = gaussian_filter(glow_mask, sigma=4.0)
glow = np.clip(glow * 0.12, 0, 1)
for c in range(3):
    canvas[:,:,c] = canvas[:,:,c] * (1 - glow) + 160 * glow

# Draw wireframe lines
canvas[line_mask, 0] = wire_color[0]
canvas[line_mask, 1] = wire_color[1]
canvas[line_mask, 2] = wire_color[2]

print("Light background with wireframe created")

# ─── Finger region definitions ───
regions = {
    'little_finger': {'cx': 185/W,  'cy': 692/H,  'sx': 50, 'sy': 60},
    'ring_finger':   {'cx': 429/W,  'cy': 356/H,  'sx': 50, 'sy': 60},
    'middle_finger': {'cx': 700/W,  'cy': 223/H,  'sx': 50, 'sy': 60},
    'index_finger':  {'cx': 1024/W, 'cy': 343/H,  'sx': 50, 'sy': 60},
    'thumb':         {'cx': 1400/W, 'cy': 992/H,  'sx': 55, 'sy': 65},
    'palm':          {'cx': 650/W,  'cy': 1150/H, 'sx': 140, 'sy': 130},
}

label_positions = {
    'little_finger': {'lx': 0.01,  'ly': 0.20},
    'ring_finger':   {'lx': 0.13,  'ly': 0.04},
    'middle_finger': {'lx': 0.35,  'ly': 0.01},
    'index_finger':  {'lx': 0.68,  'ly': 0.04},
    'thumb':         {'lx': 0.82,  'ly': 0.28},
    'palm':          {'lx': 0.68,  'ly': 0.45},
}

finger_names_map = {
    'thumb': '拇指', 'index_finger': '食指', 'middle_finger': '中指',
    'ring_finger': '无名指', 'little_finger': '小指', 'palm': '手掌'
}

# Build force lookup
force_map = {}
area_map = {}
for f in fingers:
    force_map[f['key']] = f['force']
    area_map[f['key']] = f['area']

max_force = max(force_map.values()) if force_map else 1.0

# ─── Zeiss-style colormap: soft blue → teal → green → amber → red ───
def force_to_rgb(force, max_f):
    """Zeiss-inspired colormap: cool blue → teal → warm orange → red"""
    ratio = min(force / max_f, 1.0) if max_f > 0 else 0
    # 5-stop gradient: blue(0) → teal(0.25) → green(0.5) → amber(0.75) → red(1.0)
    stops = [
        (0.0,  (60, 140, 220)),    # Zeiss blue
        (0.25, (8, 145, 178)),     # teal
        (0.5,  (5, 150, 105)),     # green
        (0.75, (217, 119, 6)),     # amber
        (1.0,  (220, 38, 38)),     # red
    ]
    for i in range(len(stops) - 1):
        r0, c0 = stops[i]
        r1, c1 = stops[i + 1]
        if ratio <= r1:
            t = (ratio - r0) / (r1 - r0) if r1 > r0 else 0
            return tuple(int(c0[j] + (c1[j] - c0[j]) * t) for j in range(3))
    return stops[-1][1]

# ─── Overlay heatmap blobs ───
y_coords = np.arange(H).reshape(-1, 1)
x_coords = np.arange(W).reshape(1, -1)

for key, reg in regions.items():
    force = force_map.get(key, 0)
    if force <= 0:
        continue
    
    cx = reg['cx'] * W
    cy = reg['cy'] * H
    sx = reg['sx']
    sy = reg['sy']
    
    color = np.array(force_to_rgb(force, max_force), dtype=np.float32)
    
    gauss = np.exp(-0.5 * ((x_coords - cx)**2 / sx**2 + (y_coords - cy)**2 / sy**2))
    
    force_ratio = force / max_force
    # On light background, use moderate alpha so colors pop but don't overwhelm
    peak_alpha = 0.25 + 0.55 * force_ratio
    alpha = gauss * peak_alpha
    alpha_3d = alpha[:,:,np.newaxis]
    
    # Apply hand mask to constrain heatmap within hand outline
    alpha = alpha * hand_mask
    alpha_3d = alpha[:,:,np.newaxis]
    canvas = canvas * (1 - alpha_3d) + color[np.newaxis, np.newaxis, :] * alpha_3d

# Re-draw wireframe lines on top (darker where heatmap is underneath)
wire_dark = np.array([120, 150, 180], dtype=np.float32)
canvas[line_mask, 0] = canvas[line_mask, 0] * 0.4 + wire_dark[0] * 0.6
canvas[line_mask, 1] = canvas[line_mask, 1] * 0.4 + wire_dark[1] * 0.6
canvas[line_mask, 2] = canvas[line_mask, 2] * 0.4 + wire_dark[2] * 0.6

canvas_uint8 = np.clip(canvas, 0, 255).astype(np.uint8)
composite = Image.fromarray(canvas_uint8, 'RGB')
print("Heatmap overlaid on wireframe")

# ─── Crop first ───
crop_bottom = int(H * 0.84)
composite = composite.crop((0, 0, W, crop_bottom))
cW, cH = composite.size

# ─── Add annotation labels (蔡司风格: clean, minimal) ───
draw = ImageDraw.Draw(composite)

font_paths = [
    '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
]
font = font_small = font_title = font_value = None
for fp in font_paths:
    if os.path.exists(fp):
        font = ImageFont.truetype(fp, 40)
        font_small = ImageFont.truetype(fp, 32)
        font_title = ImageFont.truetype(fp, 34)
        font_value = ImageFont.truetype(fp, 36)
        break
if font is None:
    font = ImageFont.load_default()
    font_small = font_title = font_value = font

# Zeiss brand colors
zeiss_blue = (0, 102, 204)
zeiss_dark = (26, 35, 50)
zeiss_gray = (107, 123, 141)
zeiss_light_border = (229, 233, 239)

scale_y = H / cH  # map original coords to cropped coords

for key, lpos in label_positions.items():
    force = force_map.get(key, 0)
    area = area_map.get(key, 0)
    name = finger_names_map[key]
    color_rgb = force_to_rgb(force, max_force)
    
    lx = int(lpos['lx'] * W)
    ly = int(lpos['ly'] * H / scale_y)
    
    line1 = name
    line2 = f"{force:.1f}N"
    line3 = f"{area:.0f}mm²"
    
    bbox1 = draw.textbbox((0, 0), line1, font=font_title)
    bbox2 = draw.textbbox((0, 0), line2, font=font_value)
    bbox3 = draw.textbbox((0, 0), line3, font=font_small)
    
    tw = max(bbox1[2] - bbox1[0], bbox2[2] - bbox2[0], bbox3[2] - bbox3[0]) + 44
    th = 46 + 42 + 36 + 32
    
    box_x = max(5, min(lx, cW - tw - 5))
    box_y = max(5, min(ly, cH - th - 180))
    
    # White card with subtle shadow effect (draw slightly offset darker rect first)
    shadow_offset = 3
    draw.rounded_rectangle(
        [box_x + shadow_offset, box_y + shadow_offset, box_x + tw + shadow_offset, box_y + th + shadow_offset],
        radius=10, fill=(200, 205, 215))
    # Main white card
    draw.rounded_rectangle(
        [box_x, box_y, box_x + tw, box_y + th],
        radius=10, fill=(255, 255, 255), outline=zeiss_light_border, width=2)
    
    # Color accent bar on left side
    draw.rounded_rectangle(
        [box_x, box_y, box_x + 6, box_y + th],
        radius=3, fill=color_rgb)
    
    # Title (finger name) - Zeiss blue
    draw.text((box_x + 16, box_y + 6), line1, fill=zeiss_blue, font=font_title)
    # Force value - dark, bold
    draw.text((box_x + 16, box_y + 48), line2, fill=zeiss_dark, font=font_value)
    # Area - gray
    draw.text((box_x + 16, box_y + 90), line3, fill=zeiss_gray, font=font_small)
    
    # Connection line to finger region
    reg = regions[key]
    rcx = int(reg['cx'] * W)
    rcy = int(reg['cy'] * H / scale_y)
    
    line_start_x = box_x + tw // 2
    line_start_y = box_y + th if box_y + th < rcy else box_y
    
    # Subtle dashed connection line
    draw.line([(line_start_x, line_start_y), (rcx, rcy)], 
              fill=(*zeiss_blue, 120), width=2)
    # Small colored dot at finger position
    dot_r = 7
    draw.ellipse([rcx - dot_r, rcy - dot_r, rcx + dot_r, rcy + dot_r], 
                 fill=color_rgb, outline=(255, 255, 255), width=2)

# ─── Color scale bar ───
bar_y = cH - 100
bar_x = cW // 2 - 300
bar_w = 600
bar_h = 24

scale_text = "压力等级 (kPa)"
stb = draw.textbbox((0, 0), scale_text, font=font_small)
stw = stb[2] - stb[0]
draw.text((cW // 2 - stw // 2, bar_y - 44), scale_text, fill=zeiss_gray, font=font_small)

# Draw gradient bar with rounded ends
for i in range(bar_w):
    ratio = i / bar_w
    c = force_to_rgb(ratio * max_force, max_force)
    draw.line([(bar_x + i, bar_y), (bar_x + i, bar_y + bar_h)], fill=c)

# Border
draw.rounded_rectangle([bar_x - 1, bar_y - 1, bar_x + bar_w + 1, bar_y + bar_h + 1], 
                        radius=4, outline=zeiss_light_border, width=2)

# Labels
draw.text((bar_x, bar_y + bar_h + 10), "0", fill=zeiss_gray, font=font_small)
mid_text = f"{max_force/2:.0f}"
mtb = draw.textbbox((0, 0), mid_text, font=font_small)
draw.text((bar_x + bar_w // 2 - (mtb[2] - mtb[0]) // 2, bar_y + bar_h + 10), mid_text, fill=zeiss_gray, font=font_small)
max_text = f"{max_force:.0f}"
mxtb = draw.textbbox((0, 0), max_text, font=font_small)
draw.text((bar_x + bar_w - (mxtb[2] - mxtb[0]), bar_y + bar_h + 10), max_text, fill=zeiss_gray, font=font_small)

# Save
composite.save(OUT_PATH, quality=95)
print(f"Saved: {OUT_PATH} ({composite.size})")
