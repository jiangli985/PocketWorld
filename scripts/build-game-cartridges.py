"""Build PocketWorld retro game cartridges, 2-slot walnut display stand, and console expansion dock.

Generates four editable `.blend` sources and four runtime `.glb` models in Blender 5.2+:
  - assets/models/furniture/cartridge-mario.blend   -> assets/public/models/furniture/cartridge-mario.glb
  - assets/models/furniture/cartridge-shooter.blend -> assets/public/models/furniture/cartridge-shooter.glb
  - assets/models/furniture/cartridge-stand.blend   -> assets/public/models/furniture/cartridge-stand.glb
  - assets/models/furniture/cartridge-dock.blend    -> assets/public/models/furniture/cartridge-dock.glb

All dimensions match `src/scene/orbital/media/cartridge-motion.ts` 1:1 in metres (Blender Z-up -> glTF Y-up).

Usage:
  blender --background --factory-startup --python scripts/build-game-cartridges.py
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

SEED = 20261122

# ---------------------------------------------------------------------------
# Master dimensions (metres, Blender Z-up; Blender -Y maps to Three.js +Z front)
# ---------------------------------------------------------------------------
# Classic FC/GB cartridge envelope (centered at origin: X in [-0.107, +0.107], Z in [-0.125, +0.125])
CART_W = 0.214
CART_H = 0.250       # Matches CARTRIDGE_HEIGHT = 0.25
CART_T = 0.042       # Sleek authentic retro cartridge thickness
CART_SKIRT_W = 0.168
CART_SKIRT_H = 0.046
CART_SKIRT_T = 0.036

# 2-slot angled walnut & brass display stand (placed at [2.610, 1.120, -2.630])
STAND_SLOT_X = (-0.128, 0.128)  # Left = mario (2.482), Right = shooter (2.738)
STAND_LEAN = -0.244             # -14 deg backward lean (top tilts toward +Y_bl / -Z_three)
STAND_FLOOR_Z = 0.028           # Felt slot floor height above desk (Y = 1.148 in cabin)
STAND_DECK_Z = 0.046            # Walnut plinth top (18 mm deep slot cradle)
STAND_W = 0.548
STAND_D = 0.160
STAND_BACK_Z = 0.124

# Retro cream & walnut console expansion dock (placed at [2.365, 1.120, -2.050])
# Slot throat center local X = -0.105 -> Cabin X = 2.260 (= CARTRIDGE_SLOT[0])
# Pause switch bay center local X = +0.205 -> Cabin X = 2.570 (= PAUSE_SWITCH[0])
DOCK_SLOT_X = -0.105
DOCK_SWITCH_X = 0.205
DOCK_W = 0.656
DOCK_D = 0.228
DOCK_H = 0.092  # Desk Y = 1.120 -> Dock top Y = 1.212; seated cart cover sticker (Y = 1.218..1.350) stays 100% visible!


# ---------------------------------------------------------------------------
# Crisp 5x7 retro arcade bitmap font for pixel-art cartridge cover labels
# ---------------------------------------------------------------------------
FONT_5X7: dict[str, list[str]] = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01110"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "J": ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "W": ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    "0": ["01110", "10011", "10101", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
}


def hex_rgb(code: str) -> tuple[float, float, float]:
    c = code.lstrip("#")
    return (int(c[0:2], 16) / 255.0, int(c[2:4], 16) / 255.0, int(c[4:6], 16) / 255.0)


def px_rect(canvas: np.ndarray, x0: int, y0: int, x1: int, y1: int, color: tuple[float, float, float]):
    """Draw inclusive-exclusive rectangle in top-down pixel coordinates."""
    h, w, _ = canvas.shape
    cx0, cx1 = max(0, x0), min(w, x1)
    cy0, cy1 = max(0, y0), min(h, y1)
    if cx0 < cx1 and cy0 < cy1:
        canvas[cy0:cy1, cx0:cx1, :3] = color


def px_dot(canvas: np.ndarray, cx: int, cy: int, r: float, color: tuple[float, float, float]):
    h, w, _ = canvas.shape
    x0, x1 = max(0, int(cx - r - 1)), min(w, int(cx + r + 2))
    y0, y1 = max(0, int(cy - r - 1)), min(h, int(cy + r + 2))
    if x0 >= x1 or y0 >= y1:
        return
    yy, xx = np.ogrid[y0:y1, x0:x1]
    mask = (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r
    canvas[y0:y1, x0:x1, :3][mask] = color


def px_ellipse(canvas: np.ndarray, cx: float, cy: float, rx: float, ry: float, color: tuple[float, float, float]):
    h, w, _ = canvas.shape
    x0, x1 = max(0, int(cx - rx - 1)), min(w, int(cx + rx + 2))
    y0, y1 = max(0, int(cy - ry - 1)), min(h, int(cy + ry + 2))
    if x0 >= x1 or y0 >= y1:
        return
    yy, xx = np.ogrid[y0:y1, x0:x1]
    mask = ((xx - cx) / max(rx, 0.5)) ** 2 + ((yy - cy) / max(ry, 0.5)) ** 2 <= 1.0
    canvas[y0:y1, x0:x1, :3][mask] = color


def px_line(canvas: np.ndarray, x0: float, y0: float, x1: float, y1: float, color: tuple[float, float, float], thick: int = 1):
    steps = max(1, int(math.hypot(x1 - x0, y1 - y0) * 2))
    for i in range(steps + 1):
        t = i / steps
        x = int(round(x0 + (x1 - x0) * t))
        y = int(round(y0 + (y1 - y0) * t))
        px_rect(canvas, x - thick // 2, y - thick // 2, x - thick // 2 + thick, y - thick // 2 + thick, color)


def px_text(
    canvas: np.ndarray,
    text: str,
    x: int,
    y: int,
    color: tuple[float, float, float],
    scale: int = 1,
    spacing: int = 1,
    shadow: tuple[float, float, float] | None = None,
    outline: tuple[float, float, float] | None = None,
):
    """Draw crisp bitmap text in top-down pixel coordinates."""
    cur_x = x
    for ch in text.upper():
        glyph = FONT_5X7.get(ch, FONT_5X7[" "])
        if shadow is not None:
            for gy, row in enumerate(glyph):
                for gx, bit in enumerate(row):
                    if bit == "1":
                        px_rect(canvas, cur_x + gx * scale + scale, y + gy * scale + scale, cur_x + (gx + 1) * scale + scale, y + (gy + 1) * scale + scale, shadow)
        if outline is not None:
            for gy, row in enumerate(glyph):
                for gx, bit in enumerate(row):
                    if bit == "1":
                        for ox in (-1, 0, 1):
                            for oy in (-1, 0, 1):
                                if ox or oy:
                                    px_rect(canvas, cur_x + gx * scale + ox, y + gy * scale + oy, cur_x + (gx + 1) * scale + ox, y + (gy + 1) * scale + oy, outline)
        for gy, row in enumerate(glyph):
            for gx, bit in enumerate(row):
                if bit == "1":
                    px_rect(canvas, cur_x + gx * scale, y + gy * scale, cur_x + (gx + 1) * scale, y + (gy + 1) * scale, color)
        cur_x += (5 + spacing) * scale


def measure_text(text: str, scale: int = 1, spacing: int = 1) -> int:
    if not text:
        return 0
    return len(text) * (5 + spacing) * scale - spacing * scale


def build_mario_cover_art() -> np.ndarray:
    """Create crisp 128x108 retro 16-bit pixel art for 《奶娃滑雪大冒险》 (SKI ADVENTURE · NO.01), upscaled 4x to 512x432."""
    w, h = 128, 108
    c = np.ones((h, w, 4), dtype=np.float32)

    # Outer retro cream-ivory print frame
    c[..., :3] = hex_rgb("#f4ead4")
    px_rect(c, 3, 3, w - 3, h - 3, hex_rgb("#1c3554"))

    # Alpine sky gradient (stepped retro 16-bit palette bands — extends cleanly behind entire ski slope)
    sky_bands = [
        (4, 18, "#1f4e84"),
        (18, 32, "#2f74b3"),
        (32, 46, "#4da0d8"),
        (46, 58, "#88cbed"),
        (58, 68, "#d4eff8"),
        (68, h - 16, "#fce6bf"),
    ]
    for y0, y1, col in sky_bands:
        px_rect(c, 4, y0, w - 4, y1, hex_rgb(col))

    # Warm golden winter sun & soft halo rings
    px_dot(c, 104, 38, 13, hex_rgb("#ffe3a1"))
    px_dot(c, 104, 38, 9, hex_rgb("#ffd166"))
    px_dot(c, 104, 38, 6, hex_rgb("#fff5cf"))

    # Twinkling pixel stars / snow sparkles in upper sky
    for sx, sy in [(14, 24), (28, 22), (82, 23), (92, 27), (116, 24)]:
        px_rect(c, sx, sy, sx + 2, sy + 2, hex_rgb("#eef8ff"))

    # Fluffy pixel clouds
    for cx, cy in [(22, 34), (82, 43)]:
        px_ellipse(c, cx, cy, 10, 4, hex_rgb("#ffffff"))
        px_ellipse(c, cx - 6, cy + 1, 6, 3, hex_rgb("#eaf6fc"))
        px_ellipse(c, cx + 6, cy + 1, 6, 3, hex_rgb("#eaf6fc"))

    # Distant snow-capped alpine mountains (clipped cleanly inside x in [4, w-4] and extending below snowline)
    peaks = [(24, 44, 24, "#5d8db8", "#eef7fc"), (58, 38, 32, "#4c7ba8", "#ffffff"), (96, 46, 28, "#5d8db8", "#f7f3e3")]
    for px_c, py_top, half_w, body_col, snow_col in peaks:
        for row in range(py_top, h - 16):
            span = int(((row - py_top) / max(1, (h - 16) - py_top)) * (half_w + 6))
            px_rect(c, max(4, px_c - span), row, min(w - 4, px_c + span + 1), row + 1, hex_rgb(body_col))
            if row - py_top < 11:
                snow_span = max(1, span - (1 if (row % 2 == 0 and row - py_top > 6) else 0))
                px_rect(c, max(4, px_c - snow_span), row, min(w - 4, px_c + snow_span + 1), row + 1, hex_rgb(snow_col))

    # Evergreen alpine pines along mid ridge
    for tx, ty, th in [(13, 60, 12), (24, 63, 10), (108, 62, 11), (117, 58, 13)]:
        for r in range(th):
            hw = 1 + (r // 2)
            px_rect(c, tx - hw, ty + r, tx + hw + 1, ty + r + 1, hex_rgb("#24594a" if r % 3 else "#32755f"))
        px_rect(c, tx - 1, ty + th, tx + 2, ty + th + 3, hex_rgb("#5a3b26"))

    # Sweeping white & ice-blue ski slope across bottom foreground
    for x in range(4, w - 4):
        slope_y = int(68 + 0.16 * (x - 4) + 3.0 * math.sin((x - 4) * 0.06))
        px_rect(c, x, slope_y, x + 1, h - 16, hex_rgb("#f7fbff"))
        px_rect(c, x, slope_y + 1, x + 1, slope_y + 4, hex_rgb("#d6eef9"))
        px_rect(c, x, slope_y + 11, x + 1, h - 16, hex_rgb("#c5e4f5"))

    # Dynamic white speed lines & snow spray behind the skier
    for y_off, x_s, x_e in [(62, 12, 34), (67, 16, 38), (73, 14, 30)]:
        px_line(c, x_s, y_off, x_e, y_off - 4, hex_rgb("#ffffff"), thick=1)
    for sx, sy in [(38, 76), (42, 79), (47, 78), (34, 73)]:
        px_dot(c, sx, sy, 1.8, hex_rgb("#ffffff"))

    # Arcing golden coins ahead of Naiwa
    for cx, cy in [(86, 54), (96, 59), (105, 67)]:
        px_dot(c, cx, cy, 4.2, hex_rgb("#b86b11"))
        px_dot(c, cx, cy, 3.2, hex_rgb("#ffd038"))
        px_rect(c, cx - 1, cy - 2, cx + 1, cy + 2, hex_rgb("#fff6b3"))

    # Hero character: Cute pixel-art Naiwa (黄色奶娃) mid-jump on skis!
    nx, ny = 60, 62
    # Fluttering coral-red winter scarf trailing to the left
    px_line(c, nx - 5, ny + 1, nx - 18, ny - 3, hex_rgb("#eb5138"), thick=3)
    px_line(c, nx - 15, ny - 2, nx - 23, ny + 1, hex_rgb("#ff7b54"), thick=2)
    # Twin tilted walnut skis underneath
    px_line(c, nx - 15, ny + 12, nx + 15, ny + 19, hex_rgb("#7c4420"), thick=3)
    px_line(c, nx - 14, ny + 11, nx + 16, ny + 18, hex_rgb("#e89b48"), thick=1)
    # Rounded yellow Naiwa body + dark outline + cream belly
    px_ellipse(c, nx, ny + 2, 10.5, 11.5, hex_rgb("#6b4117"))
    px_ellipse(c, nx, ny + 2, 9.2, 10.2, hex_rgb("#ffd64d"))
    px_ellipse(c, nx + 2, ny + 5, 5.5, 5.8, hex_rgb("#fff3c9"))
    # Cute mittens / paws
    px_dot(c, nx - 8, ny + 4, 2.8, hex_rgb("#eb5138"))
    px_dot(c, nx + 9, ny + 2, 2.8, hex_rgb("#eb5138"))
    # Ski goggles band & shiny cyan goggles lens on forehead/eyes
    px_rect(c, nx - 9, ny - 5, nx + 9, ny - 1, hex_rgb("#354759"))
    px_rect(c, nx - 5, ny - 6, nx + 8, ny, hex_rgb("#243140"))
    px_rect(c, nx - 3, ny - 5, nx + 2, ny - 1, hex_rgb("#5ce1ff"))
    px_rect(c, nx + 3, ny - 5, nx + 7, ny - 1, hex_rgb("#5ce1ff"))
    px_rect(c, nx - 2, ny - 5, nx, ny - 3, hex_rgb("#ffffff"))
    px_rect(c, nx + 4, ny - 5, nx + 6, ny - 3, hex_rgb("#ffffff"))
    # Rosy cheek & joyful smile
    px_dot(c, nx + 6, ny + 2, 1.6, hex_rgb("#ff8a7a"))
    px_rect(c, nx + 1, ny + 2, nx + 5, ny + 4, hex_rgb("#7a391c"))

    # Crisp dark-navy retro cartridge header banner at top
    px_rect(c, 4, 4, w - 4, 19, hex_rgb("#163150"))
    px_rect(c, 4, 19, w - 4, 21, hex_rgb("#f49234"))

    # Header Title: "SKI ADVENTURE" (crisp readable 1x/scale banner + NO.01 pill)
    title = "SKI ADVENTURE"
    tw = measure_text(title, scale=1, spacing=1)
    px_text(c, title, 8, 8, hex_rgb("#fff6de"), scale=1, spacing=1, shadow=hex_rgb("#0b1929"))
    # Orange "01" badge on right of header
    px_rect(c, w - 24, 6, w - 6, 17, hex_rgb("#f28529"))
    px_text(c, "01", w - 21, 8, hex_rgb("#fff8e8"), scale=1, spacing=1)

    # Bottom footer strip ("POCKET PLAY")
    px_rect(c, 4, h - 16, w - 4, h - 4, hex_rgb("#163150"))
    px_rect(c, 4, h - 17, w - 4, h - 16, hex_rgb("#57b6e6"))
    sub = "POCKET PLAY"
    sw = measure_text(sub, scale=1, spacing=1)
    px_text(c, sub, (w - sw) // 2, h - 13, hex_rgb("#f4ead4"), scale=1, spacing=1)

    # Re-stamp crisp outer cream print margin & inner dark hairline so nothing bleeds outside the frame
    px_rect(c, 0, 0, w, 3, hex_rgb("#f4ead4"))
    px_rect(c, 0, h - 3, w, h, hex_rgb("#f4ead4"))
    px_rect(c, 0, 0, 3, h, hex_rgb("#f4ead4"))
    px_rect(c, w - 3, 0, w, h, hex_rgb("#f4ead4"))
    px_rect(c, 3, 3, w - 3, 4, hex_rgb("#1c3554"))
    px_rect(c, 3, h - 4, w - 3, h - 3, hex_rgb("#1c3554"))
    px_rect(c, 3, 3, 4, h - 3, hex_rgb("#1c3554"))
    px_rect(c, w - 4, 3, w - 3, h - 3, hex_rgb("#1c3554"))

    # Crisp 4x nearest-neighbor upscale to 512x432 (preserves true crisp pixel-art edges)
    up = np.repeat(np.repeat(c, 4, axis=0), 4, axis=1)
    # Flip vertically for Blender image buffer (bottom-up)
    return np.flipud(up).astype(np.float32)


def build_shooter_cover_art() -> np.ndarray:
    """Create crisp 128x108 retro 16-bit pixel art for 《团团魔法录》 (MAGIC GRIMOIRE · NO.02), upscaled 4x to 512x432."""
    w, h = 128, 108
    c = np.ones((h, w, 4), dtype=np.float32)

    # Outer retro warm-cream print frame
    c[..., :3] = hex_rgb("#f4ead4")
    px_rect(c, 3, 3, w - 3, h - 3, hex_rgb("#22153a"))

    # Deep twilight-violet arcane sky bands
    sky_bands = [
        (4, 24, "#1f143b"),
        (24, 42, "#2e1c57"),
        (42, 60, "#432778"),
        (60, 76, "#5b3696"),
        (76, 92, "#392062"),
    ]
    for y0, y1, col in sky_bands:
        px_rect(c, 4, y0, w - 4, y1, hex_rgb(col))

    # Glowing arcane magic circle behind the grimoire
    cx, cy = 64, 57
    for ang_deg in range(0, 360, 3):
        a = math.radians(ang_deg)
        for r, col in [(26, "#8c65d6"), (25, "#c59cff"), (19, "#704db5")]:
            px = int(round(cx + math.cos(a) * r))
            py = int(round(cy + math.sin(a) * r))
            px_rect(c, px, py, px + 1, py + 1, hex_rgb(col))
    # Inscribed golden arcane hexagram triangles
    for phase in (0.0, math.pi / 3.0):
        pts = [(cx + math.cos(phase + k * math.tau / 3.0) * 23, cy + math.sin(phase + k * math.tau / 3.0) * 23) for k in range(3)]
        for k in range(3):
            px_line(c, pts[k][0], pts[k][1], pts[(k + 1) % 3][0], pts[(k + 1) % 3][1], hex_rgb("#e5bd5e"), thick=1)

    # Golden pixel crescent moon at upper-right
    px_dot(c, 105, 34, 8, hex_rgb("#ffd66b"))
    px_dot(c, 108, 32, 6.5, hex_rgb("#2e1c57"))

    # Twinkling 4-point pixel stars
    for sx, sy, col in [(16, 30, "#ffe48a"), (26, 42, "#9be8ff"), (102, 54, "#ffb3e6"), (114, 44, "#ffe48a"), (18, 74, "#c6a3ff"), (108, 75, "#9be8ff")]:
        px_rect(c, sx - 2, sy, sx + 3, sy + 1, hex_rgb(col))
        px_rect(c, sx, sy - 2, sx + 1, sy + 3, hex_rgb(col))
        px_rect(c, sx, sy, sx + 1, sy + 1, hex_rgb("#ffffff"))

    # Orbiting elemental spell orbs (cyan, rose, mint, gold)
    orbs = [
        (30, 56, "#4de3ff", "#e8fbff"),
        (98, 57, "#ff72b6", "#ffe3f2"),
        (38, 76, "#54f0a8", "#e0fff0"),
        (90, 74, "#ffd24d", "#fff6cc"),
    ]
    for ox, oy, outer_c, core_c in orbs:
        px_dot(c, ox, oy, 5.0, hex_rgb("#22153a"))
        px_dot(c, ox, oy, 4.0, hex_rgb(outer_c))
        px_dot(c, ox - 1, oy - 1, 1.8, hex_rgb(core_c))

    # Hero emblem: Pointed Starry Wizard Hat hovering over an Open Glowing Magic Grimoire!
    # Open Grimoire pages at (64, 68)
    px_rect(c, 42, 63, 86, 80, hex_rgb("#42201f"))       # Dark leather cover backing
    px_rect(c, 44, 61, 63, 77, hex_rgb("#fbf1d6"))       # Left cream page
    px_rect(c, 65, 61, 84, 77, hex_rgb("#f2e4c0"))       # Right cream page
    px_rect(c, 63, 62, 65, 79, hex_rgb("#8c5e3a"))       # Center book spine crease
    px_rect(c, 44, 77, 84, 79, hex_rgb("#d9a94e"))       # Gold page edging
    # Tiny glowing purple rune lines on pages
    for ly in (65, 68, 71, 74):
        px_rect(c, 47, ly, 60, ly + 1, hex_rgb("#7e58c4"))
        px_rect(c, 68, ly, 81, ly + 1, hex_rgb("#7e58c4"))

    # Radiant cyan-gold magic crystal hovering above the book spine
    for dy in range(-6, 7):
        hw = max(0, 4 - abs(dy) // 2)
        px_rect(c, 64 - hw, 54 + dy, 65 + hw, 55 + dy, hex_rgb("#54e8ff" if abs(dy) > 2 else "#ffffff"))

    # Pointed Wizard Hat crowned above (64, 38)
    px_ellipse(c, 64, 46, 19, 4.5, hex_rgb("#1c1030"))
    px_ellipse(c, 64, 45, 17, 3.6, hex_rgb("#7d52c9"))
    for row in range(18):
        y_p = 27 + row
        x_shift = int((18 - row) * 0.25)
        hw = max(1, int(row * 0.65))
        px_rect(c, 64 + x_shift - hw - 1, y_p, 64 + x_shift + hw + 2, y_p + 1, hex_rgb("#1c1030"))
        px_rect(c, 64 + x_shift - hw, y_p, 64 + x_shift + hw + 1, y_p + 1, hex_rgb("#6c42b5" if row % 4 else "#8e66db"))
    # Gold hat band & star buckle
    px_rect(c, 53, 41, 75, 44, hex_rgb("#f0be4f"))
    px_rect(c, 61, 40, 67, 45, hex_rgb("#fff0a8"))
    px_rect(c, 63, 41, 65, 44, hex_rgb("#3c206b"))

    # Crisp dark-plum retro cartridge header banner at top
    px_rect(c, 4, 4, w - 4, 19, hex_rgb("#1b1033"))
    px_rect(c, 4, 19, w - 4, 21, hex_rgb("#e5b95c"))

    # Header Title: "MAGIC GRIMOIRE" + gold "02" pill badge
    title = "MAGIC GRIMOIRE"
    px_text(c, title, 7, 8, hex_rgb("#ffefb8"), scale=1, spacing=1, shadow=hex_rgb("#0d061c"))
    px_rect(c, w - 24, 6, w - 6, 17, hex_rgb("#9364db"))
    px_text(c, "02", w - 21, 8, hex_rgb("#fff9e6"), scale=1, spacing=1)

    # Bottom footer strip ("POCKET PLAY")
    px_rect(c, 4, h - 16, w - 4, h - 4, hex_rgb("#1b1033"))
    px_rect(c, 4, h - 17, w - 4, h - 16, hex_rgb("#a87af0"))
    sub = "POCKET PLAY"
    sw = measure_text(sub, scale=1, spacing=1)
    px_text(c, sub, (w - sw) // 2, h - 13, hex_rgb("#f4ead4"), scale=1, spacing=1)

    up = np.repeat(np.repeat(c, 4, axis=0), 4, axis=1)
    return np.flipud(up).astype(np.float32)


def build_spine_label_art(label_text: str, bg_hex: str, accent_hex: str, text_hex: str = "#fff8e8") -> np.ndarray:
    """Create crisp 96x20 pixel-art top-edge cartridge spine sticker, upscaled 3x to 288x60."""
    w, h = 96, 20
    c = np.ones((h, w, 4), dtype=np.float32)
    c[..., :3] = hex_rgb("#f4ead4")
    px_rect(c, 2, 2, w - 2, h - 2, hex_rgb(bg_hex))
    px_rect(c, 2, 2, 12, h - 2, hex_rgb(accent_hex))
    px_rect(c, w - 12, 2, w - 2, h - 2, hex_rgb(accent_hex))
    tw = measure_text(label_text, scale=1, spacing=1)
    px_text(c, label_text, (w - tw) // 2, 6, hex_rgb(text_hex), scale=1, spacing=1, shadow=hex_rgb("#12151f"))
    up = np.repeat(np.repeat(c, 3, axis=0), 3, axis=1)
    return np.flipud(up).astype(np.float32)


def build_back_spec_art(code_text: str) -> np.ndarray:
    """Create clean retro molded rear specification sticker (128x80 -> 256x160)."""
    w, h = 128, 80
    c = np.ones((h, w, 4), dtype=np.float32)
    c[..., :3] = hex_rgb("#dcd4c0")
    px_rect(c, 4, 4, w - 4, h - 4, hex_rgb("#ebe3cf"))
    px_rect(c, 4, 4, w - 4, 18, hex_rgb("#484c52"))
    px_text(c, "POCKET WORLD", 18, 7, hex_rgb("#f3ebd8"), scale=1, spacing=1)
    px_text(c, code_text, 14, 26, hex_rgb("#35393e"), scale=1, spacing=1)
    for y in (40, 47, 54, 61):
        px_rect(c, 14, y, w - 18, y + 2, hex_rgb("#888479"))
    px_rect(c, 14, 68, 52, 72, hex_rgb("#5d5950"))
    up = np.repeat(np.repeat(c, 2, axis=0), 2, axis=1)
    return np.flipud(up).astype(np.float32)


# ---------------------------------------------------------------------------
# Procedural surface texture generators (wood, brass, felt, retro matte ABS)
# ---------------------------------------------------------------------------
def create_packed_image(name: str, rgba: np.ndarray, colorspace: str = "sRGB") -> bpy.types.Image:
    h, w, _ = rgba.shape
    img = bpy.data.images.new(name=name, width=w, height=h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.clip(rgba, 0.0, 1.0).astype(np.float32).ravel())
    img.pack()
    return img


def smooth_noise_2d(rng: np.random.Generator, size: int, grid: int = 16) -> np.ndarray:
    coarse = rng.random((grid, grid), dtype=np.float32)
    coords = np.linspace(0, grid, size, endpoint=False)
    i0 = np.floor(coords).astype(int) % grid
    i1 = (i0 + 1) % grid
    f = (coords - np.floor(coords)).astype(np.float32)
    f = f * f * (3.0 - 2.0 * f)
    fx = f[None, :]
    fy = f[:, None]
    c00 = coarse[np.ix_(i0, i0)]
    c10 = coarse[np.ix_(i0, i1)]
    c01 = coarse[np.ix_(i1, i0)]
    c11 = coarse[np.ix_(i1, i1)]
    return (c00 * (1 - fx) + c10 * fx) * (1 - fy) + (c01 * (1 - fx) + c11 * fx) * fy


def make_walnut_textures(rng: np.random.Generator, prefix: str):
    sz = 256
    u = np.linspace(0.0, 1.0, sz, endpoint=False, dtype=np.float32)
    v = np.linspace(0.0, 1.0, sz, endpoint=False, dtype=np.float32)
    uu, vv = np.meshgrid(u, v)
    n_low = smooth_noise_2d(rng, sz, 6)
    n_mid = smooth_noise_2d(rng, sz, 18)
    n_hi = smooth_noise_2d(rng, sz, 48)
    warp = 0.22 * np.sin(math.tau * uu + 3.2 * n_low) + 0.09 * (n_mid - 0.5)
    grain = np.power(0.5 + 0.5 * np.sin(math.tau * (vv * 5.5 + warp)), 0.72)
    fine = 0.5 + 0.5 * np.sin(math.tau * (vv * 36.0 + 0.45 * n_mid + 0.12 * n_hi))
    pores = np.where(n_hi > 0.80, (n_hi - 0.80) * 4.0, 0.0)

    walnut = np.ones((sz, sz, 4), dtype=np.float32)
    walnut[..., 0] = 0.340 + 0.145 * grain + 0.024 * fine - 0.042 * pores
    walnut[..., 1] = 0.198 + 0.095 * grain + 0.016 * fine - 0.028 * pores
    walnut[..., 2] = 0.108 + 0.056 * grain + 0.010 * fine - 0.018 * pores
    albedo = create_packed_image(f"Tex_{prefix}_Walnut_Albedo", walnut, "sRGB")

    walnut_r = np.ones((sz, sz, 4), dtype=np.float32)
    wr = np.clip(0.44 + 0.13 * (1.0 - grain) + 0.08 * pores, 0.40, 0.68)
    walnut_r[..., 0] = walnut_r[..., 1] = walnut_r[..., 2] = wr
    rough = create_packed_image(f"Tex_{prefix}_Walnut_Rough", walnut_r, "Non-Color")
    return albedo, rough


def make_brass_textures(rng: np.random.Generator, prefix: str):
    sz = 128
    brush_1d = rng.normal(0.0, 0.024, (sz, 1)).astype(np.float32)
    brush_2d = np.repeat(brush_1d, sz, axis=1) + 0.012 * (smooth_noise_2d(rng, sz, 24) - 0.5)
    brass = np.ones((sz, sz, 4), dtype=np.float32)
    brass[..., 0] = 0.855 + 0.022 * brush_2d
    brass[..., 1] = 0.688 + 0.018 * brush_2d
    brass[..., 2] = 0.375 + 0.014 * brush_2d
    albedo = create_packed_image(f"Tex_{prefix}_Brass_Albedo", brass, "sRGB")

    brass_r = np.ones((sz, sz, 4), dtype=np.float32)
    br = np.clip(0.30 + 0.18 * (brush_2d + 0.04), 0.22, 0.42)
    brass_r[..., 0] = brass_r[..., 1] = brass_r[..., 2] = br
    rough = create_packed_image(f"Tex_{prefix}_Brass_Rough", brass_r, "Non-Color")
    return albedo, rough


def make_abs_texture(rng: np.random.Generator, name: str, base_hex: str, grain_amp: float = 0.014) -> bpy.types.Image:
    sz = 128
    base = hex_rgb(base_hex)
    n = smooth_noise_2d(rng, sz, 32) - 0.5
    tex = np.ones((sz, sz, 4), dtype=np.float32)
    tex[..., 0] = base[0] + grain_amp * n
    tex[..., 1] = base[1] + grain_amp * n
    tex[..., 2] = base[2] + grain_amp * n
    return create_packed_image(name, tex, "sRGB")


def make_pbr_material(
    name: str,
    albedo_img: bpy.types.Image | None = None,
    rough_img: bpy.types.Image | None = None,
    base_color=(0.8, 0.8, 0.8, 1.0),
    metallic: float = 0.0,
    roughness: float = 0.45,
    coat_weight: float = 0.0,
    coat_roughness: float = 0.2,
    nearest_filter: bool = False,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = base_color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat_weight
        bsdf.inputs["Coat Roughness"].default_value = coat_roughness
    if albedo_img is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = albedo_img
        if nearest_filter:
            tex.interpolation = "Closest"
        tex.location = (-360, 220)
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if rough_img is not None:
        tex_r = nt.nodes.new("ShaderNodeTexImage")
        tex_r.image = rough_img
        tex_r.location = (-360, -80)
        nt.links.new(tex_r.outputs["Color"], bsdf.inputs["Roughness"])
    return mat


# ---------------------------------------------------------------------------
# Geometry & Scene helpers (watertight closed manifolds, zero degenerate faces)
# ---------------------------------------------------------------------------
def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0


def get_collection(name: str):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def make_empty(name: str, location=(0.0, 0.0, 0.0), parent=None, col=None):
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "PLAIN_AXES"
    empty.empty_display_size = 0.03
    empty.location = location
    (col or bpy.context.scene.collection).objects.link(empty)
    if parent is not None:
        empty.parent = parent
    return empty


def lathe_mesh(profile, segments: int = 24):
    points = [tuple(map(float, p)) for p in profile]
    verts, rings, faces = [], [], []
    for radius, height in points:
        if radius == 0.0:
            rings.append([len(verts)])
            verts.append((0.0, 0.0, height))
        else:
            ring = []
            for idx in range(segments):
                ang = math.tau * idx / segments
                ring.append(len(verts))
                verts.append((radius * math.cos(ang), radius * math.sin(ang), height))
            rings.append(ring)
    for lower, upper in zip(rings, rings[1:]):
        for idx in range(segments):
            nxt = (idx + 1) % segments
            if len(lower) == 1 and len(upper) == 1:
                continue
            elif len(lower) == 1:
                faces.append((lower[0], upper[nxt], upper[idx]))
            elif len(upper) == 1:
                faces.append((lower[idx], lower[nxt], upper[0]))
            else:
                faces.append((lower[idx], lower[nxt], upper[nxt], upper[idx]))
    return verts, faces


def auto_uv_box(mesh: bpy.types.Mesh, scale: float = 2.5, world_offset: Vector | None = None):
    offset = Vector((0.0, 0.0, 0.0)) if world_offset is None else world_offset
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv = bm.loops.layers.uv.verify()
    for face in bm.faces:
        n = face.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in face.loops:
            co = loop.vert.co + offset
            if az >= ax and az >= ay:
                u, v = co.x * scale + 0.5, co.y * scale + 0.5
            elif ay >= ax:
                u, v = co.x * scale + 0.5, co.z * scale + 0.5
            else:
                u, v = co.y * scale + 0.5, co.z * scale + 0.5
            loop[uv].uv = (u, v)
    bm.to_mesh(mesh)
    bm.free()


def uv_front_rect(mesh: bpy.types.Mesh, x0: float, x1: float, z0: float, z1: float, flip_x: bool = False):
    """Exact [0,1]x[0,1] planar UV mapping onto -Y front (or +Y back when flip_x=True) sticker face."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv = bm.loops.layers.uv.verify()
    dx = max(1e-6, x1 - x0)
    dz = max(1e-6, z1 - z0)
    for face in bm.faces:
        for loop in face.loops:
            co = loop.vert.co
            u = (co.x - x0) / dx
            if flip_x:
                u = 1.0 - u
            v = (co.z - z0) / dz
            loop[uv].uv = (max(0.0, min(1.0, u)), max(0.0, min(1.0, v)))
    bm.to_mesh(mesh)
    bm.free()


def uv_top_rect(mesh: bpy.types.Mesh, x0: float, x1: float, y0: float, y1: float):
    """Exact [0,1]x[0,1] planar UV mapping onto +Z top spine label face (front -Y = bottom v=0)."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv = bm.loops.layers.uv.verify()
    dx = max(1e-6, x1 - x0)
    dy = max(1e-6, y1 - y0)
    for face in bm.faces:
        for loop in face.loops:
            co = loop.vert.co
            u = (co.x - x0) / dx
            v = (co.y - y0) / dy
            loop[uv].uv = (max(0.0, min(1.0, u)), max(0.0, min(1.0, v)))
    bm.to_mesh(mesh)
    bm.free()


def set_smart_smooth(mesh: bpy.types.Mesh, threshold: float = 0.96):
    for poly in mesh.polygons:
        n = poly.normal
        is_flat = abs(n.x) >= threshold or abs(n.y) >= threshold or abs(n.z) >= threshold
        poly.use_smooth = not is_flat
    mesh.update()


def object_from_bmesh(
    name: str,
    bm: bmesh.types.BMesh,
    material,
    col,
    parent=None,
    location=(0.0, 0.0, 0.0),
    rotation=(0.0, 0.0, 0.0),
    smooth_mode: str = "smart",
    uv_scale: float = 2.6,
    role: str = "prop_part",
):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    auto_uv_box(mesh, scale=uv_scale, world_offset=Vector(location))
    if smooth_mode == "smart":
        set_smart_smooth(mesh)
    elif smooth_mode == "smooth":
        mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
        mesh.update()
    else:
        mesh.polygons.foreach_set("use_smooth", [False] * len(mesh.polygons))
        mesh.update()
    if material is not None:
        mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.rotation_euler = rotation
    obj["bas_role"] = role
    col.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def object_from_pydata(
    name: str,
    verts,
    faces,
    material,
    col,
    parent=None,
    location=(0.0, 0.0, 0.0),
    rotation=(0.0, 0.0, 0.0),
    smooth: bool = True,
    uv_scale: float = 4.0,
    role: str = "prop_part",
):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    auto_uv_box(mesh, scale=uv_scale, world_offset=Vector(location))
    mesh.polygons.foreach_set("use_smooth", [smooth] * len(mesh.polygons))
    mesh.update()
    if material is not None:
        mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.rotation_euler = rotation
    obj["bas_role"] = role
    col.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def make_rounded_box_bm(sx: float, sy: float, sz: float, bevel: float = 0.0025, segments: int = 2) -> bmesh.types.BMesh:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0.0:
        bmesh.ops.bevel(
            bm,
            geom=list(bm.edges),
            offset=bevel,
            offset_type="OFFSET",
            segments=segments,
            profile=0.5,
            affect="EDGES",
            clamp_overlap=True,
        )
    return bm


def make_extruded_xz_bm(poly_xz: list[tuple[float, float]], y0: float, y1: float, bevel: float = 0.0022, segs: int = 2) -> bmesh.types.BMesh:
    """Extrude a 2D (x, z) CCW polygon cleanly along Y from y0 to y1."""
    bm = bmesh.new()
    v_front = [bm.verts.new((x, y0, z)) for x, z in poly_xz]
    v_back = [bm.verts.new((x, y1, z)) for x, z in poly_xz]
    n = len(poly_xz)
    bm.faces.new(v_front)
    bm.faces.new(list(reversed(v_back)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((v_front[j], v_front[i], v_back[i], v_back[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0.0:
        bmesh.ops.bevel(
            bm,
            geom=list(bm.edges),
            offset=bevel,
            offset_type="OFFSET",
            segments=segs,
            profile=0.5,
            affect="EDGES",
            clamp_overlap=True,
        )
    return bm


def make_extruded_yz_bm(poly_yz: list[tuple[float, float]], x0: float, x1: float, bevel: float = 0.0024, segs: int = 2) -> bmesh.types.BMesh:
    """Extrude a 2D (y, z) CCW polygon cleanly along X from x0 to x1."""
    bm = bmesh.new()
    v_left = [bm.verts.new((x0, y, z)) for y, z in poly_yz]
    v_right = [bm.verts.new((x1, y, z)) for y, z in poly_yz]
    n = len(poly_yz)
    bm.faces.new(list(reversed(v_left)))
    bm.faces.new(v_right)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((v_left[i], v_left[j], v_right[j], v_right[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0.0:
        bmesh.ops.bevel(
            bm,
            geom=list(bm.edges),
            offset=bevel,
            offset_type="OFFSET",
            segments=segs,
            profile=0.5,
            affect="EDGES",
            clamp_overlap=True,
        )
    return bm


def save_and_export(blend_path: Path, glb_path: Path | None, label: str):
    bpy.context.view_layer.update()
    bpy.ops.file.pack_all()
    deps = bpy.context.evaluated_depsgraph_get()
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    tris = 0
    meshes = 0
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        meshes += 1
        eo = obj.evaluated_get(deps)
        m = eo.to_mesh()
        m.calc_loop_triangles()
        tris += len(m.loop_triangles)
        for v in m.vertices:
            wp = obj.matrix_world @ v.co
            mins.x, mins.y, mins.z = min(mins.x, wp.x), min(mins.y, wp.y), min(mins.z, wp.z)
            maxs.x, maxs.y, maxs.z = max(maxs.x, wp.x), max(maxs.y, wp.y), max(maxs.z, wp.z)
        eo.to_mesh_clear()
    dims = maxs - mins
    print(
        f"{label}: meshes={meshes}, tris={tris:,}, "
        f"X=[{mins.x:.4f}, {maxs.x:.4f}] ({dims.x:.4f}m), "
        f"Y=[{mins.y:.4f}, {maxs.y:.4f}] ({dims.y:.4f}m), "
        f"Z=[{mins.z:.4f}, {maxs.z:.4f}] ({dims.z:.4f}m)"
    )
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    if glb_path is not None:
        glb_path.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=str(glb_path),
            export_format="GLB",
            export_yup=True,
            export_apply=True,
            export_texcoords=True,
            export_normals=True,
            export_materials="EXPORT",
            export_animations=False,
        )
        print(f"  Exported {glb_path.name}: {glb_path.stat().st_size:,} bytes")


# ---------------------------------------------------------------------------
# ASSET 1 & 2: Classic FC/GB Retro Color Game Cartridges (Mario & Shooter)
# Centered at origin (X in [-0.107, +0.107], Y in [-0.021, +0.021], Z in [-0.125, +0.125])
# Front artwork faces -Y (maps to +Z in Three.js).
# ---------------------------------------------------------------------------
def build_cartridge(
    game_key: str,
    shell_hex: str,
    accent_hex: str,
    cover_rgba: np.ndarray,
    spine_rgba: np.ndarray,
    spec_code: str,
    blend_path: Path,
    glb_path: Path | None,
):
    clear_scene()
    rng = np.random.default_rng(SEED + (1 if game_key == "mario" else 2))
    col = get_collection(f"01 • Cartridge ({game_key})")
    root = make_empty(f"Cartridge_{game_key}_Root", (0.0, 0.0, 0.0), col=col)

    shell_img = make_abs_texture(rng, f"Tex_Cart_{game_key}_Shell", shell_hex, grain_amp=0.012)
    accent_img = make_abs_texture(rng, f"Tex_Cart_{game_key}_Accent", accent_hex, grain_amp=0.012)
    cover_img = create_packed_image(f"Tex_Cart_{game_key}_Cover", cover_rgba, "sRGB")
    spine_img = create_packed_image(f"Tex_Cart_{game_key}_Spine", spine_rgba, "sRGB")
    spec_img = create_packed_image(f"Tex_Cart_{game_key}_Spec", build_back_spec_art(spec_code), "sRGB")
    brass_a, brass_r = make_brass_textures(rng, f"Cart_{game_key}")

    mats = {
        "shell": make_pbr_material(f"Mat_Cart_{game_key}_Shell", albedo_img=shell_img, roughness=0.40, coat_weight=0.08, coat_roughness=0.25),
        "accent": make_pbr_material(f"Mat_Cart_{game_key}_Accent", albedo_img=accent_img, roughness=0.38, coat_weight=0.10, coat_roughness=0.24),
        "cover": make_pbr_material(f"Mat_Cart_{game_key}_Cover", albedo_img=cover_img, roughness=0.28, coat_weight=0.22, coat_roughness=0.16, nearest_filter=True),
        "spine": make_pbr_material(f"Mat_Cart_{game_key}_Spine", albedo_img=spine_img, roughness=0.30, coat_weight=0.18, coat_roughness=0.18, nearest_filter=True),
        "spec": make_pbr_material(f"Mat_Cart_{game_key}_Spec", albedo_img=spec_img, roughness=0.50, nearest_filter=True),
        "pcb": make_pbr_material(f"Mat_Cart_{game_key}_PCB", base_color=(0.075, 0.245, 0.145, 1.0), roughness=0.46),
        "gold": make_pbr_material(f"Mat_Cart_{game_key}_GoldPins", albedo_img=brass_a, rough_img=brass_r, metallic=0.92, roughness=0.24),
        "steel": make_pbr_material(f"Mat_Cart_{game_key}_Steel", base_color=(0.68, 0.70, 0.72, 1.0), metallic=0.88, roughness=0.30),
        "dark": make_pbr_material(f"Mat_Cart_{game_key}_Dark", base_color=(0.12, 0.13, 0.15, 1.0), roughness=0.62),
    }

    hw = CART_W * 0.5          # 0.107
    hh = CART_H * 0.5          # 0.125
    ht = CART_T * 0.5          # 0.021
    sw = CART_SKIRT_W * 0.5    # 0.084
    sk_z = -hh + CART_SKIRT_H  # -0.079 (shoulder step where skirt widens to main body)
    notch = 0.015              # Iconic top-right Game Boy style corner notch

    # 1. Main Rear & Core Stepped Retro Shell (classic FC/GB silhouette with top-right notch & stepped lower skirt)
    # Build main upper shell body (Z = sk_z .. +hh) in front & rear halves separated by a crisp 1.4 mm center molding groove.
    upper_poly = [
        (-hw, sk_z),
        ( hw, sk_z),
        ( hw, hh - notch),
        ( hw - notch, hh),
        (-hw, hh),
    ]
    bm_rear_half = make_extruded_xz_bm(upper_poly, 0.0008, ht, bevel=0.0028, segs=2)
    object_from_bmesh(f"Cart_{game_key}_RearShell", bm_rear_half, mats["shell"], col, parent=root, role="cart_shell")

    bm_front_half = make_extruded_xz_bm(upper_poly, -ht, -0.0008, bevel=0.0028, segs=2)
    object_from_bmesh(f"Cart_{game_key}_FrontShell", bm_front_half, mats["shell"], col, parent=root, role="cart_shell")

    # Dark inner chassis seam core linking front and rear shells seamlessly
    seam_poly = [(-hw + 0.0025, sk_z + 0.002), (hw - 0.0025, sk_z + 0.002), (hw - 0.0025, hh - notch - 0.002), (hw - notch - 0.002, hh - 0.0025), (-hw + 0.0025, hh - 0.0025)]
    bm_seam = make_extruded_xz_bm(seam_poly, -0.0025, 0.0025, bevel=0.0)
    object_from_bmesh(f"Cart_{game_key}_SeamCore", bm_seam, mats["dark"], col, parent=root, smooth_mode="flat", role="cart_seam")

    # 2. Lower Connector Skirt (hollow-bottomed U-shroud around PCB pins, Z = -hh .. sk_z + 0.004)
    # Front shroud wall, back shroud wall, left wall, right wall — creating a real open bottom mouth for the gold edge connector!
    skirt_ht = CART_SKIRT_T * 0.5  # 0.018
    wall_t = 0.0052
    bm_sk_f = make_rounded_box_bm(CART_SKIRT_W, wall_t, CART_SKIRT_H + 0.006, bevel=0.0014, segments=2)
    object_from_bmesh(f"Cart_{game_key}_SkirtFront", bm_sk_f, mats["shell"], col, parent=root,
                      location=(0.0, -skirt_ht + wall_t * 0.5, -hh + CART_SKIRT_H * 0.5 + 0.002), role="cart_skirt")
    bm_sk_b = make_rounded_box_bm(CART_SKIRT_W, wall_t, CART_SKIRT_H + 0.006, bevel=0.0014, segments=2)
    object_from_bmesh(f"Cart_{game_key}_SkirtBack", bm_sk_b, mats["shell"], col, parent=root,
                      location=(0.0, skirt_ht - wall_t * 0.5, -hh + CART_SKIRT_H * 0.5 + 0.002), role="cart_skirt")
    for tag, sx in (("L", -sw + 0.0055), ("R", sw - 0.0055)):
        bm_sw = make_rounded_box_bm(0.011, CART_SKIRT_T, CART_SKIRT_H + 0.006, bevel=0.0014, segments=2)
        object_from_bmesh(f"Cart_{game_key}_SkirtSide_{tag}", bm_sw, mats["shell"], col, parent=root,
                          location=(sx, 0.0, -hh + CART_SKIRT_H * 0.5 + 0.002), role="cart_skirt")

    # 3. Recessed Fiberglass PCB Card & 14 Gleaming Gold Edge Connector Fingers inside the open bottom mouth!
    pcb_w = CART_SKIRT_W - 0.028  # 0.140
    pcb_h = 0.036
    pcb_z = -hh + 0.005 + pcb_h * 0.5  # PCB bottom stops 5 mm safely inside bottom skirt (protects fingers like real carts!)
    bm_pcb = make_rounded_box_bm(pcb_w, 0.0044, pcb_h, bevel=0.0005, segments=1)
    object_from_bmesh(f"Cart_{game_key}_PCB", bm_pcb, mats["pcb"], col, parent=root, location=(0.0, 0.0, pcb_z), role="cart_pcb")

    n_pins = 14
    pin_span = pcb_w - 0.014
    for i in range(n_pins):
        px = -pin_span * 0.5 + (i / (n_pins - 1)) * pin_span
        bm_pin = make_rounded_box_bm(0.0052, 0.0062, 0.018, bevel=0.0004, segments=1)
        object_from_bmesh(f"Cart_{game_key}_GoldPin_{i}", bm_pin, mats["gold"], col, parent=root,
                          location=(px, 0.0, -hh + 0.015), role="cart_pins")

    # 4. Contrasting Retro Accent Top Finger-Pull Cap & Horizontal Grip Ribs (classic FC/GB top handle!)
    cap_w = CART_W - 0.036  # Leaves room for top-right notch
    cap_x = -0.007
    bm_cap = make_rounded_box_bm(cap_w, CART_T + 0.0025, 0.024, bevel=0.0026, segments=2)
    object_from_bmesh(f"Cart_{game_key}_TopGripCap", bm_cap, mats["accent"], col, parent=root,
                      location=(cap_x, 0.0, hh - 0.013), role="cart_accent")

    # Four tactile horizontal grip ribs across upper front & back header strip
    for r_i, rz in enumerate((hh - 0.007, hh - 0.013, hh - 0.019)):
        for side_tag, sy in (("F", -ht - 0.0012), ("B", ht + 0.0012)):
            bm_rib = make_rounded_box_bm(cap_w - 0.018, 0.0032, 0.0026, bevel=0.0006, segments=1)
            object_from_bmesh(f"Cart_{game_key}_TopRib_{side_tag}_{r_i}", bm_rib, mats["accent"], col, parent=root,
                              location=(cap_x, sy, rz), role="cart_grip")

    # Five sculpted side thumb-grip flutes on left & right shoulders
    for side_tag, sx in (("L", -hw - 0.0006), ("R", hw + 0.0006)):
        for g_i in range(5):
            gz = -0.058 + g_i * 0.0145
            bm_flute = make_rounded_box_bm(0.0040, CART_T - 0.012, 0.0056, bevel=0.0010, segments=2)
            object_from_bmesh(f"Cart_{game_key}_SideFlute_{side_tag}_{g_i}", bm_flute, mats["accent"], col, parent=root,
                              location=(sx, 0.0, gz), role="cart_grip")

    # 5. Raised Bezel Frame around Front Cover Label + Crisp 16-bit Pixel-Art Cover Sticker!
    # Label dimensions match 128:108 aspect ratio = 0.156 m x 0.1316 m!
    lbl_w = 0.156
    lbl_h = 0.1316
    lbl_cz = 0.014
    # Raised outer molded lip frame (4 clean border rails framing the label cleanly)
    frame_t = 0.0060
    frame_d = 0.0034
    frame_y = -ht - 0.0006
    for tag, fx, fz, fw, fh in (
        ("Top", 0.0, lbl_cz + lbl_h * 0.5 + frame_t * 0.5, lbl_w + frame_t * 2.0, frame_t),
        ("Bot", 0.0, lbl_cz - lbl_h * 0.5 - frame_t * 0.5, lbl_w + frame_t * 2.0, frame_t),
        ("L", -lbl_w * 0.5 - frame_t * 0.5, lbl_cz, frame_t, lbl_h),
        ("R",  lbl_w * 0.5 + frame_t * 0.5, lbl_cz, frame_t, lbl_h),
    ):
        bm_fr = make_rounded_box_bm(fw, frame_d, fh, bevel=0.0009, segments=2)
        object_from_bmesh(f"Cart_{game_key}_LabelFrame_{tag}", bm_fr, mats["shell"], col, parent=root,
                          location=(fx, frame_y, fz), role="cart_frame")

    # Front Pixel-Art Cover Sticker Plate (exact planar [0,1]x[0,1] UVs, proud of front shell by 1.2 mm — zero z-fighting!)
    bm_lbl = make_rounded_box_bm(lbl_w, 0.0022, lbl_h, bevel=0.0003, segments=1)
    lbl_obj = object_from_bmesh(f"Cart_{game_key}_CoverSticker", bm_lbl, mats["cover"], col, parent=root,
                                location=(0.0, -ht - 0.0008, lbl_cz), smooth_mode="flat", role="cart_label")
    uv_front_rect(lbl_obj.data, -lbl_w * 0.5, lbl_w * 0.5, -lbl_h * 0.5, lbl_h * 0.5, flip_x=False)

    # 6. Top Spine Mini-Label Strip (visible from top-down & elevated views!)
    sp_w = 0.144
    sp_d = 0.030
    bm_sp = make_rounded_box_bm(sp_w, sp_d, 0.0018, bevel=0.0002, segments=1)
    sp_obj = object_from_bmesh(f"Cart_{game_key}_SpineSticker", bm_sp, mats["spine"], col, parent=root,
                               location=(cap_x, 0.0, hh + 0.0004), smooth_mode="flat", role="cart_spine_label")
    uv_top_rect(sp_obj.data, -sp_w * 0.5, sp_w * 0.5, -sp_d * 0.5, sp_d * 0.5)

    # 7. Molded Downward Insertion Triangle Indicator ("▼") below front cover label
    tri_poly = [(-0.013, -0.064), (0.013, -0.064), (0.0, -0.075)]
    bm_tri = make_extruded_xz_bm(tri_poly, -ht - 0.0020, -ht + 0.0005, bevel=0.0005, segs=1)
    object_from_bmesh(f"Cart_{game_key}_InsertArrow", bm_tri, mats["accent"], col, parent=root, role="cart_arrow")

    # 8. Rear Spec Sticker + Two Recessed Gamebit Steel Security Screws (finished reverse side!)
    spec_w, spec_h = 0.128, 0.080
    bm_spec = make_rounded_box_bm(spec_w, 0.0020, spec_h, bevel=0.0002, segments=1)
    spec_obj = object_from_bmesh(f"Cart_{game_key}_BackSpec", bm_spec, mats["spec"], col, parent=root,
                                 location=(0.0, ht + 0.0007, 0.016), smooth_mode="flat", role="cart_back_label")
    uv_front_rect(spec_obj.data, -spec_w * 0.5, spec_w * 0.5, -spec_h * 0.5, spec_h * 0.5, flip_x=True)

    screw_prof = [(0.0, 0.0), (0.0052, 0.0), (0.0052, 0.0016), (0.0036, 0.0026), (0.0, 0.0028)]
    for tag, sx, sz in (("BL", -0.068, -0.066), ("BR", 0.068, -0.066), ("TC", 0.0, 0.082)):
        v, f = lathe_mesh(screw_prof, segments=18)
        object_from_pydata(f"Cart_{game_key}_Screw_{tag}", v, f, mats["steel"], col, parent=root,
                           location=(sx, ht - 0.0005, sz), rotation=(-math.pi * 0.5, 0.0, 0.0), role="cart_screw")

    save_and_export(blend_path, glb_path, f"Cartridge-{game_key}")


# ---------------------------------------------------------------------------
# ASSET 3: Dedicated 2-Slot Walnut & Brushed-Brass Cartridge Display Stand
# Origin sits flush on desk (Z = 0 -> Y = 1.120 in cabin).
# ---------------------------------------------------------------------------
def build_cartridge_stand(blend_path: Path, glb_path: Path | None):
    clear_scene()
    rng = np.random.default_rng(SEED + 10)
    col = get_collection("01 • Cartridge Display Stand")
    root = make_empty("CartridgeStand_Root", (0.0, 0.0, 0.0), col=col)

    walnut_a, walnut_r = make_walnut_textures(rng, "Stand")
    brass_a, brass_r = make_brass_textures(rng, "Stand")
    felt_img = make_abs_texture(rng, "Tex_Stand_Felt", "#2c2927", grain_amp=0.025)

    mats = {
        "walnut": make_pbr_material("Mat_Stand_Walnut", albedo_img=walnut_a, rough_img=walnut_r, roughness=0.52, coat_weight=0.14, coat_roughness=0.28),
        "brass": make_pbr_material("Mat_Stand_Brass", albedo_img=brass_a, rough_img=brass_r, metallic=0.90, roughness=0.28),
        "felt": make_pbr_material("Mat_Stand_Felt", albedo_img=felt_img, roughness=0.94),
    }

    hw = STAND_W * 0.5  # 0.288
    hd = STAND_D * 0.5  # 0.086

    # 1. Four low turned walnut & brass-ferrule feet touching desk cleanly at Z = 0.000
    foot_pad = [(0.0, 0.0000), (0.0110, 0.0000), (0.0118, 0.0018), (0.0, 0.0018)]
    foot_brass = [(0.0, 0.0015), (0.0124, 0.0015), (0.0138, 0.0072), (0.0144, 0.0120), (0.0, 0.0120)]
    for tag, fx, fy in (("FL", -hw + 0.042, -hd + 0.026), ("FR", hw - 0.042, -hd + 0.026),
                        ("BL", -hw + 0.042,  hd - 0.026), ("BR", hw - 0.042,  hd - 0.026)):
        v, f = lathe_mesh(foot_pad, segments=20)
        object_from_pydata(f"Stand_FootPad_{tag}", v, f, mats["felt"], col, parent=root, location=(fx, fy, 0.0), role="stand_foot")
        v, f = lathe_mesh(foot_brass, segments=24)
        object_from_pydata(f"Stand_FootBrass_{tag}", v, f, mats["brass"], col, parent=root, location=(fx, fy, 0.0), role="stand_foot")

    # 2. Solid Lower Walnut Plinth Base Slab (Z = 0.008 .. STAND_FLOOR_Z = 0.028) — forms floor beneath both cartridge slots!
    bm_lower = make_rounded_box_bm(STAND_W - 0.004, STAND_D, STAND_FLOOR_Z - 0.008, bevel=0.0026, segments=2)
    object_from_bmesh("Stand_Base_Lower", bm_lower, mats["walnut"], col, parent=root,
                      location=(0.0, 0.0, 0.008 + (STAND_FLOOR_Z - 0.008) * 0.5), role="stand_base")

    # 3. Upper Slotted Walnut Cradle Walls (Z = STAND_FLOOR_Z .. STAND_DECK_Z = 0.046, creating 2 deep 18mm recessed bays!)
    # Each bay opens from X = slot_x +/- 0.111 (width 222 mm for 214 mm cart -> 4 mm margin per side)
    # and Y = -0.055 .. -0.003 (depth 52 mm for 42 mm cart tilted -14 deg -> clean snug cradle with zero clipping!)
    bay_y0 = -0.056
    bay_y1 = -0.002
    wall_h = STAND_DECK_Z - STAND_FLOOR_Z  # 0.018
    wall_cz = STAND_FLOOR_Z + wall_h * 0.5

    # Front walnut lip rail (Y = -hd .. bay_y0)
    front_d = bay_y0 - (-hd)  # 0.030
    bm_fl = make_rounded_box_bm(STAND_W - 0.004, front_d, wall_h, bevel=0.0018, segments=2)
    object_from_bmesh("Stand_FrontLip", bm_fl, mats["walnut"], col, parent=root,
                      location=(0.0, -hd + front_d * 0.5, wall_cz), role="stand_rail")

    # Rear solid walnut deck block (Y = bay_y1 .. +hd)
    rear_d = hd - bay_y1  # 0.088
    bm_rl = make_rounded_box_bm(STAND_W - 0.004, rear_d, wall_h, bevel=0.0018, segments=2)
    object_from_bmesh("Stand_RearDeck", bm_rl, mats["walnut"], col, parent=root,
                      location=(0.0, bay_y1 + rear_d * 0.5, wall_cz), role="stand_rail")

    # Left, Center, Right vertical sculpted walnut cheek/divider fins rising cleanly to STAND_BACK_Z (0.124)
    # Profile in (Y_bl, Z_bl) leans gently back along -14 deg matching the cartridges!
    cheek_poly = [
        (-hd, 0.012),
        ( hd, 0.012),
        ( hd, STAND_BACK_Z),
        ( 0.018, STAND_BACK_Z),
        (-0.044, 0.064),
        (-hd, 0.052),
    ]
    center_poly = [
        (bay_y0 - 0.002, STAND_FLOOR_Z),
        (hd - 0.002, STAND_FLOOR_Z),
        (hd - 0.002, 0.112),
        (0.014, 0.112),
        (bay_y0 - 0.002, 0.054),
    ]
    for tag, x0, x1 in (("Left", -hw, -hw + 0.022), ("Right", hw - 0.022, hw)):
        bm_ch = make_extruded_yz_bm(cheek_poly, x0, x1, bevel=0.0026, segs=2)
        object_from_bmesh(f"Stand_Cheek_{tag}", bm_ch, mats["walnut"], col, parent=root, role="stand_cheek")

    # Center sculpted walnut divider fin between Slot 01 (mario) and Slot 02 (shooter)
    # Slot 0 right edge = -0.128 + 0.111 = -0.017; Slot 1 left edge = +0.128 - 0.111 = +0.017 -> 34 mm gap -> 26 mm walnut divider!
    bm_mid = make_extruded_yz_bm(center_poly, -0.013, 0.013, bevel=0.0022, segs=2)
    object_from_bmesh("Stand_CenterDivider", bm_mid, mats["walnut"], col, parent=root, role="stand_divider")

    # Two plush charcoal wool-felt slot pads seated on the floor of both cartridge bays (Z = 0.026 .. 0.0285)
    for idx, sx in enumerate(STAND_SLOT_X):
        bm_pad = make_rounded_box_bm(0.218, 0.050, 0.0030, bevel=0.0005, segments=1)
        object_from_bmesh(f"Stand_SlotFelt_{idx}", bm_pad, mats["felt"], col, parent=root,
                          location=(sx, (bay_y0 + bay_y1) * 0.5, STAND_FLOOR_Z - 0.0005), role="stand_felt")

    # 4. Horizontal Satin-Brass Rear Backrest Support Rail positioned gracefully 3 mm behind the tilted cartridge backs!
    rail_len = STAND_W - 0.024
    bm_rail = make_rounded_box_bm(rail_len, 0.009, 0.009, bevel=0.0036, segments=3)
    object_from_bmesh("Stand_BrassBackRail", bm_rail, mats["brass"], col, parent=root,
                      location=(0.0, 0.022, 0.108), role="stand_rail")

    # Outer brass cap-bolts on both cheeks aligning with the brass backrest rail
    cap_prof = [(0.0, 0.0), (0.0075, 0.0), (0.0075, 0.0020), (0.0048, 0.0044), (0.0, 0.0046)]
    for tag, sign in (("L", -1.0), ("R", 1.0)):
        v, f = lathe_mesh(cap_prof, segments=20)
        object_from_pydata(f"Stand_CheekBolt_{tag}", v, f, mats["brass"], col, parent=root,
                           location=(sign * hw, 0.022, 0.108), rotation=(0.0, sign * math.pi * 0.5, 0.0), role="stand_hardware")

    # Sleek satin-brass front fascia trim bar & two miniature brass bay plates beneath Slot 01 & Slot 02
    bm_fstrip = make_rounded_box_bm(STAND_W - 0.056, 0.0038, 0.0042, bevel=0.0008, segments=2)
    object_from_bmesh("Stand_FrontBrassTrim", bm_fstrip, mats["brass"], col, parent=root,
                      location=(0.0, -hd - 0.0008, 0.025), role="stand_trim")
    for idx, sx in enumerate(STAND_SLOT_X):
        bm_plate = make_rounded_box_bm(0.054, 0.0044, 0.0115, bevel=0.0010, segments=2)
        object_from_bmesh(f"Stand_SlotBadge_{idx}", bm_plate, mats["brass"], col, parent=root,
                          location=(sx, -hd - 0.0012, 0.025), role="stand_badge")

    save_and_export(blend_path, glb_path, "CartridgeStand")


# ---------------------------------------------------------------------------
# ASSET 4: Retro Cream & Walnut Console Expansion Dock (Cartridge Slot + Pause Switch Bay)
# Origin sits flush on desk (Z = 0 -> Y = 1.120 in cabin). Placed at [2.365, 1.120, -2.050].
# Slot center at local X = -0.105 (Cabin X = 2.260 = CARTRIDGE_SLOT[0]).
# Pause switch bushing at local X = +0.205 (Cabin X = 2.570).
# ---------------------------------------------------------------------------
def build_cartridge_dock(blend_path: Path, glb_path: Path | None):
    clear_scene()
    rng = np.random.default_rng(SEED + 20)
    col = get_collection("01 • Retro Cartridge Expansion Dock")
    root = make_empty("CartridgeDock_Root", (0.0, 0.0, 0.0), col=col)

    walnut_a, walnut_r = make_walnut_textures(rng, "Dock")
    brass_a, brass_r = make_brass_textures(rng, "Dock")
    cream_img = make_abs_texture(rng, "Tex_Dock_Cream", "#dad2bc", grain_amp=0.012)
    slate_img = make_abs_texture(rng, "Tex_Dock_Slate", "#2b3231", grain_amp=0.014)
    felt_img = make_abs_texture(rng, "Tex_Dock_Rubber", "#232527", grain_amp=0.015)

    mats = {
        "cream": make_pbr_material("Mat_Dock_Cream", albedo_img=cream_img, roughness=0.44, coat_weight=0.06, coat_roughness=0.28),
        "walnut": make_pbr_material("Mat_Dock_Walnut", albedo_img=walnut_a, rough_img=walnut_r, roughness=0.52, coat_weight=0.14, coat_roughness=0.28),
        "slate": make_pbr_material("Mat_Dock_Slate", albedo_img=slate_img, roughness=0.52),
        "brass": make_pbr_material("Mat_Dock_Brass", albedo_img=brass_a, rough_img=brass_r, metallic=0.90, roughness=0.28),
        "rubber": make_pbr_material("Mat_Dock_Rubber", albedo_img=felt_img, roughness=0.88),
    }

    hw = DOCK_W * 0.5   # 0.328
    hd = DOCK_D * 0.5   # 0.114
    cheek_w = 0.024
    inner_hw = hw - cheek_w  # 0.304

    # 1. Four low dark rubber isolation feet (Z = 0.000 .. 0.008)
    foot_prof = [(0.0, 0.0), (0.015, 0.0), (0.016, 0.002), (0.015, 0.009), (0.0, 0.009)]
    for tag, fx, fy in (("FL", -hw + 0.048, -hd + 0.036), ("FR", hw - 0.048, -hd + 0.036),
                        ("BL", -hw + 0.048,  hd - 0.036), ("BR", hw - 0.048,  hd - 0.036)):
        v, f = lathe_mesh(foot_prof, segments=20)
        object_from_pydata(f"Dock_Foot_{tag}", v, f, mats["rubber"], col, parent=root, location=(fx, fy, 0.0), role="dock_foot")

    # 2. Dark Recessed Sub-Plinth Skirt (Z = 0.006 .. 0.022)
    bm_sub = make_rounded_box_bm(DOCK_W - 0.032, DOCK_D - 0.018, 0.018, bevel=0.0022, segments=2)
    object_from_bmesh("Dock_SubPlinth", bm_sub, mats["slate"], col, parent=root, location=(0.0, 0.0, 0.015), role="dock_base")

    # 3. Sculpted Retro Cream-Ivory Console Body — Built around a TRUE REAL OPEN CARTRIDGE SLOT CAVITY!
    # Lower solid chassis deck: Z = 0.014 .. 0.021 (allows seated cartridge at Z_center=0.150 / bottom=0.0240 to sit flush inside!)
    body_z0 = 0.014
    throat_floor_z = 0.021
    body_top_z = DOCK_H  # 0.092

    # Lower console base slab
    lower_yz = [
        (-hd, body_z0),
        ( hd, body_z0),
        ( hd, throat_floor_z),
        (-hd, throat_floor_z),
    ]
    bm_low = make_extruded_yz_bm(lower_yz, -inner_hw, inner_hw, bevel=0.0024, segs=2)
    object_from_bmesh("Dock_Body_Lower", bm_low, mats["cream"], col, parent=root, role="dock_body")

    # Upper deck blocks surrounding the real open cartridge cavity at X = DOCK_SLOT_X +/- 0.118, Y = -0.030 .. +0.030!
    cav_x0 = DOCK_SLOT_X - 0.118  # -0.223
    cav_x1 = DOCK_SLOT_X + 0.118  # +0.013
    cav_y0 = -0.030
    cav_y1 =  0.030
    up_h = body_top_z - throat_floor_z  # 0.068
    up_cz = throat_floor_z + up_h * 0.5

    # Front upper bridge (sloped retro fascia nose from Y = -hd .. cav_y0)
    front_yz = [
        (-hd, throat_floor_z - 0.001),
        (cav_y0, throat_floor_z - 0.001),
        (cav_y0, body_top_z),
        (-hd + 0.018, body_top_z),
        (-hd, body_top_z - 0.024),
    ]
    bm_up_f = make_extruded_yz_bm(front_yz, -inner_hw, inner_hw, bevel=0.0026, segs=2)
    object_from_bmesh("Dock_Body_FrontBridge", bm_up_f, mats["cream"], col, parent=root, role="dock_body")

    # Rear upper bridge (Y = cav_y1 .. +hd, gently rising 6 mm toward rear console lip)
    rear_yz = [
        (cav_y1, throat_floor_z - 0.001),
        (hd, throat_floor_z - 0.001),
        (hd, body_top_z + 0.006),
        (cav_y1, body_top_z),
    ]
    bm_up_r = make_extruded_yz_bm(rear_yz, -inner_hw, inner_hw, bevel=0.0026, segs=2)
    object_from_bmesh("Dock_Body_RearBridge", bm_up_r, mats["cream"], col, parent=root, role="dock_body")

    # Left deck block (X = -inner_hw .. cav_x0, Y = cav_y0 .. cav_y1)
    left_w = cav_x0 - (-inner_hw)  # 0.081
    bm_up_l = make_rounded_box_bm(left_w + 0.002, cav_y1 - cav_y0 + 0.004, up_h, bevel=0.0020, segments=2)
    object_from_bmesh("Dock_Body_LeftDeck", bm_up_l, mats["cream"], col, parent=root,
                      location=(-inner_hw + left_w * 0.5, 0.0, up_cz), role="dock_body")

    # Right deck block — houses the Pause Toggle Control Bay! (X = cav_x1 .. inner_hw, Y = cav_y0 .. cav_y1)
    right_w = inner_hw - cav_x1  # 0.291
    bm_up_rt = make_rounded_box_bm(right_w + 0.002, cav_y1 - cav_y0 + 0.004, up_h, bevel=0.0020, segments=2)
    object_from_bmesh("Dock_Body_RightDeck", bm_up_rt, mats["cream"], col, parent=root,
                      location=(cav_x1 + right_w * 0.5, 0.0, up_cz), role="dock_body")

    # 4. Warm Chamfered Walnut Side Cheeks flanking the cream console body (matches vinyl rack & cartridge stand!)
    cheek_yz = [
        (-hd - 0.002, body_z0 - 0.002),
        ( hd + 0.002, body_z0 - 0.002),
        ( hd + 0.002, body_top_z + 0.010),
        (-hd + 0.018, body_top_z + 0.004),
        (-hd - 0.002, body_top_z - 0.024),
    ]
    for tag, x0, x1 in (("Left", -hw, -inner_hw + 0.002), ("Right", inner_hw - 0.002, hw)):
        bm_ch = make_extruded_yz_bm(cheek_yz, x0, x1, bevel=0.0030, segs=2)
        object_from_bmesh(f"Dock_WalnutCheek_{tag}", bm_ch, mats["walnut"], col, parent=root, role="dock_cheek")

    # 5. Dark Graphite Cartridge Slot Bezel Collar, Full-Depth Inner Liners & Gold Connector Pins!
    collar_t = 0.012
    collar_h = 0.009
    collar_z = body_top_z + 0.0025
    slot_w = cav_x1 - cav_x0  # 0.236
    slot_d = cav_y1 - cav_y0  # 0.060
    for tag, cx, cy, cw, cd in (
        ("Front", DOCK_SLOT_X, cav_y0 - collar_t * 0.5, slot_w + collar_t * 2.0, collar_t),
        ("Back",  DOCK_SLOT_X, cav_y1 + collar_t * 0.5, slot_w + collar_t * 2.0, collar_t),
        ("Left",  cav_x0 - collar_t * 0.5, 0.0, collar_t, slot_d),
        ("Right", cav_x1 + collar_t * 0.5, 0.0, collar_t, slot_d),
    ):
        bm_c = make_rounded_box_bm(cw, cd, collar_h, bevel=0.0018, segments=2)
        object_from_bmesh(f"Dock_SlotCollar_{tag}", bm_c, mats["slate"], col, parent=root,
                          location=(cx, cy, collar_z), role="dock_slot_bezel")

    # Dark internal cavity liner floor & 4 dark slate throat sidewalls + 14 gleaming gold socket pins (visible inside slot!)
    bm_cav_f = make_rounded_box_bm(slot_w - 0.002, slot_d - 0.002, 0.004, bevel=0.0004, segments=1)
    object_from_bmesh("Dock_SlotFloor", bm_cav_f, mats["slate"], col, parent=root,
                      location=(DOCK_SLOT_X, 0.0, throat_floor_z + 0.001), role="dock_slot_floor")
    liner_t = 0.0030
    for tag, lx, ly, lw, ld in (
        ("Front", DOCK_SLOT_X, cav_y0 + liner_t * 0.5, slot_w, liner_t),
        ("Back",  DOCK_SLOT_X, cav_y1 - liner_t * 0.5, slot_w, liner_t),
        ("Left",  cav_x0 + liner_t * 0.5, 0.0, liner_t, slot_d),
        ("Right", cav_x1 - liner_t * 0.5, 0.0, liner_t, slot_d),
    ):
        bm_lin = make_rounded_box_bm(lw, ld, up_h + 0.002, bevel=0.0004, segments=1)
        object_from_bmesh(f"Dock_SlotLiner_{tag}", bm_lin, mats["slate"], col, parent=root,
                          location=(lx, ly, up_cz), role="dock_slot_liner")
    pin_span = 0.126
    for i in range(14):
        px = DOCK_SLOT_X - pin_span * 0.5 + (i / 13.0) * pin_span
        bm_sp = make_rounded_box_bm(0.0045, 0.008, 0.0038, bevel=0.0004, segments=1)
        object_from_bmesh(f"Dock_SlotPin_{i}", bm_sp, mats["brass"], col, parent=root,
                          location=(px, 0.0, throat_floor_z + 0.0020), role="dock_slot_pins")

    # Front brushed-brass accent trim plate + turned brass LED bezel ring on front fascia
    bm_trim = make_rounded_box_bm(0.180, 0.0042, 0.011, bevel=0.0010, segments=2)
    object_from_bmesh("Dock_FrontBrassPlate", bm_trim, mats["brass"], col, parent=root,
                      location=(DOCK_SLOT_X, -hd - 0.0008, 0.044), role="dock_trim")
    led_ring_prof = [(0.0, 0.0), (0.0095, 0.0), (0.0095, 0.0032), (0.0078, 0.0044), (0.0, 0.0044)]
    v, f = lathe_mesh(led_ring_prof, segments=20)
    object_from_pydata("Dock_LedBezel", v, f, mats["brass"], col, parent=root,
                       location=(DOCK_SLOT_X + 0.135, -hd - 0.0006, 0.044),
                       rotation=(math.pi * 0.5, 0.0, 0.0), role="dock_led_bezel")

    # 6. Integrated Right Control Bay for the Pause Toggle Switch (centered at DOCK_SWITCH_X = +0.205)
    bm_bay = make_rounded_box_bm(0.124, 0.118, 0.009, bevel=0.0020, segments=2)
    object_from_bmesh("Dock_SwitchPlate", bm_bay, mats["slate"], col, parent=root,
                      location=(DOCK_SWITCH_X, 0.0, body_top_z + 0.0025), role="dock_switch_bay")

    # Machined stepped satin-brass toggle bushing & hex nut collar centered cleanly at (DOCK_SWITCH_X, 0.0)
    bush_prof = [
        (0.0, 0.0), (0.022, 0.0), (0.022, 0.0055), (0.0185, 0.0075),
        (0.0155, 0.015), (0.0135, 0.0165), (0.0, 0.0165),
    ]
    v, f = lathe_mesh(bush_prof, segments=24)
    object_from_pydata("Dock_SwitchBushing", v, f, mats["brass"], col, parent=root,
                       location=(DOCK_SWITCH_X, 0.0, body_top_z + 0.005), role="dock_switch_bushing")

    # Twin tiny brass status pips fore/aft of the toggle switch (marking RUN / PAUSE detent positions)
    pip_prof = [(0.0, 0.0), (0.0046, 0.0), (0.0046, 0.0022), (0.0028, 0.0036), (0.0, 0.0038)]
    for tag, py in (("Front", -0.042), ("Back", 0.042)):
        v, f = lathe_mesh(pip_prof, segments=16)
        object_from_pydata(f"Dock_SwitchPip_{tag}", v, f, mats["brass"], col, parent=root,
                           location=(DOCK_SWITCH_X, py, body_top_z + 0.0065), role="dock_switch_pip")

    # 7. Retro Rear Cooling Louvres & Data Cable Strain-Relief Port on rear face (+Y)
    for i in range(6):
        vx = -0.18 + i * 0.036
        bm_v = make_rounded_box_bm(0.022, 0.005, 0.007, bevel=0.0010, segments=1)
        object_from_bmesh(f"Dock_RearVent_{i}", bm_v, mats["slate"], col, parent=root,
                          location=(vx, hd + 0.0005, 0.066), role="dock_vent")

    port_prof = [(0.0, 0.0), (0.012, 0.0), (0.012, 0.008), (0.009, 0.014), (0.008, 0.022), (0.0, 0.022)]
    v, f = lathe_mesh(port_prof, segments=18)
    object_from_pydata("Dock_CablePort", v, f, mats["rubber"], col, parent=root,
                       location=(-0.18, hd - 0.001, 0.038), rotation=(-math.pi * 0.5, 0.0, 0.0), role="dock_port")

    save_and_export(blend_path, glb_path, "CartridgeDock")


def save_flat_png(rgba_bottom_up: np.ndarray, out_path: Path):
    """Save an authored numpy RGBA image (Blender bottom-up) to PNG for direct visual inspection."""
    h, w, _ = rgba_bottom_up.shape
    img = bpy.data.images.new(name=out_path.stem, width=w, height=h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = "sRGB"
    img.pixels.foreach_set(np.clip(rgba_bottom_up, 0.0, 1.0).astype(np.float32).ravel())
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.filepath_raw = str(out_path)
    img.file_format = "PNG"
    img.save()


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Build PocketWorld retro cartridges, stand, and expansion dock.")
    parser.add_argument("--preview-labels", type=Path, default=None, help="Optional scratch dir to dump flat 2D label PNGs")
    return parser.parse_args(argv)


def main():
    opts = parse_args()
    root = Path(__file__).resolve().parents[1]
    blend_dir = root / "assets/models/furniture"
    glb_dir = root / "assets/public/models/furniture"

    mario_cover = build_mario_cover_art()
    mario_spine = build_spine_label_art("01 SKI", "#163150", "#f28529")
    shooter_cover = build_shooter_cover_art()
    shooter_spine = build_spine_label_art("02 MAGIC", "#1b1033", "#e5b95c")

    if opts.preview_labels is not None:
        clear_scene()
        save_flat_png(mario_cover, opts.preview_labels / "mario_cover.png")
        save_flat_png(mario_spine, opts.preview_labels / "mario_spine.png")
        save_flat_png(shooter_cover, opts.preview_labels / "shooter_cover.png")
        save_flat_png(shooter_spine, opts.preview_labels / "shooter_spine.png")
        print(f"Saved flat label previews to {opts.preview_labels}")

    # 1. Mario Cartridge (奶娃滑雪大冒险): Classic Glacier Ice-Blue shell + Warm Tangerine grip accents
    build_cartridge(
        game_key="mario",
        shell_hex="#4ea2d4",
        accent_hex="#ef8733",
        cover_rgba=mario_cover,
        spine_rgba=mario_spine,
        spec_code="CART-01 SKI",
        blend_path=blend_dir / "cartridge-mario.blend",
        glb_path=glb_dir / "cartridge-mario.glb",
    )

    # 2. Shooter Cartridge (团团魔法录): Classic Twilight Lavender-Violet shell + Starlight Gold grip accents
    build_cartridge(
        game_key="shooter",
        shell_hex="#7b5db8",
        accent_hex="#e6b956",
        cover_rgba=shooter_cover,
        spine_rgba=shooter_spine,
        spec_code="CART-02 MAGIC",
        blend_path=blend_dir / "cartridge-shooter.blend",
        glb_path=glb_dir / "cartridge-shooter.glb",
    )

    # 3. Dedicated 2-slot angled Walnut & Brass Display Stand
    build_cartridge_stand(
        blend_path=blend_dir / "cartridge-stand.blend",
        glb_path=glb_dir / "cartridge-stand.glb",
    )

    # 4. Retro Cream & Walnut Console Cartridge Expansion Dock
    build_cartridge_dock(
        blend_path=blend_dir / "cartridge-dock.blend",
        glb_path=glb_dir / "cartridge-dock.glb",
    )


if __name__ == "__main__":
    main()
