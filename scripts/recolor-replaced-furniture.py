"""Recolor supplied furniture GLBs in assets/public/models/replaced/ to Scheme C
(Sea-Salt Ice Blue / Milk-White / Pale Maple / Soft Sakura Pink) while preserving
exact mesh topology, node names, bounding boxes, AO/grain, normal, and RM maps.

Run from repository root:
  blender --background --factory-startup --python scripts/recolor-replaced-furniture.py
"""
from pathlib import Path
import numpy as np
import bpy


ROOT = Path(__file__).resolve().parents[1]
REPLACED = ROOT / "assets/public/models/replaced"


def rgb_to_hsv(rgb: np.ndarray):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    cmax = np.maximum(np.maximum(r, g), b)
    cmin = np.minimum(np.minimum(r, g), b)
    delta = cmax - cmin
    h = np.zeros_like(cmax)
    nz = delta > 1e-6
    rm = nz & (cmax == r)
    gm = nz & (cmax == g) & ~rm
    bm = nz & ~rm & ~gm
    h[rm] = ((g[rm] - b[rm]) / delta[rm]) % 6.0
    h[gm] = ((b[gm] - r[gm]) / delta[gm]) + 2.0
    h[bm] = ((r[bm] - g[bm]) / delta[bm]) + 4.0
    h = (h * 60.0) % 360.0
    s = np.where(cmax > 1e-6, delta / np.maximum(cmax, 1e-6), 0.0)
    return h, s, cmax


def smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / max(edge1 - edge0, 1e-6), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def hue_band(h: np.ndarray, lo: float, hi: float, feather: float = 5.0) -> np.ndarray:
    """Smooth mask for hue in [lo, hi] degrees (handles wrap-around when lo > hi)."""
    if lo <= hi:
        return smoothstep(lo - feather, lo + feather, h) * (1.0 - smoothstep(hi - feather, hi + feather, h))
    # Wrap-around (e.g. 335..14)
    upper = smoothstep(lo - feather, lo + feather, h)
    lower = 1.0 - smoothstep(hi - feather, hi + feather, h)
    return np.maximum(upper, lower)


def recolor_preserving_shading(rgb: np.ndarray, target_srgb, ref_lum: float, contrast: float = 0.85,
                               min_ratio: float = 0.25, max_ratio: float = 1.12) -> np.ndarray:
    """Shift hue/chroma to target_srgb while keeping local shading, wood grain, and baked AO."""
    lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    ratio = np.clip(1.0 + (lum / max(ref_lum, 1e-4) - 1.0) * contrast, min_ratio, max_ratio)
    # Preserve deep dark crevices smoothly
    crevice = smoothstep(0.03, 0.20, lum)
    out = np.empty_like(rgb)
    for c in range(3):
        tinted = target_srgb[c] * ratio
        out[..., c] = np.clip(rgb[..., c] * (1.0 - crevice) + tinted * crevice, 0.0, 1.0)
    return out


def rasterize_uv_region_mask(objs, predicate_fn, res: int = 512, dilate_iters: int = 8) -> np.ndarray:
    """Rasterize 3D triangle spatial labels onto a UV grid and dilate across UV gutters."""
    label_grid = np.zeros((res, res), dtype=np.int8)
    for obj in objs:
        if obj.type != "MESH" or not obj.data.uv_layers:
            continue
        mesh = obj.data
        mesh.calc_loop_triangles()
        uv_layer = mesh.uv_layers.active.data
        mw = obj.matrix_world
        rot = mw.to_3x3()
        verts = mesh.vertices

        for tri in mesh.loop_triangles:
            v0 = mw @ verts[tri.vertices[0]].co
            v1 = mw @ verts[tri.vertices[1]].co
            v2 = mw @ verts[tri.vertices[2]].co
            centroid = (v0 + v1 + v2) / 3.0
            normal = (rot @ tri.normal).normalized()
            cls = 1 if predicate_fn(obj.name, centroid, normal) else 2

            uv0 = uv_layer[tri.loops[0]].uv
            uv1 = uv_layer[tri.loops[1]].uv
            uv2 = uv_layer[tri.loops[2]].uv
            x0, y0 = uv0.x * (res - 1), uv0.y * (res - 1)
            x1, y1 = uv1.x * (res - 1), uv1.y * (res - 1)
            x2, y2 = uv2.x * (res - 1), uv2.y * (res - 1)

            ix0 = max(0, int(np.floor(min(x0, x1, x2))))
            ix1 = min(res - 1, int(np.ceil(max(x0, x1, x2))))
            iy0 = max(0, int(np.floor(min(y0, y1, y2))))
            iy1 = min(res - 1, int(np.ceil(max(y0, y1, y2))))
            if ix1 < ix0 or iy1 < iy0:
                continue

            denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
            if abs(denom) < 1e-8:
                label_grid[iy0:iy1 + 1, ix0:ix1 + 1] = cls
                continue
            gx = np.arange(ix0, ix1 + 1, dtype=np.float32)[None, :]
            gy = np.arange(iy0, iy1 + 1, dtype=np.float32)[:, None]
            w0 = ((y1 - y2) * (gx - x2) + (x2 - x1) * (gy - y2)) / denom
            w1 = ((y2 - y0) * (gx - x2) + (x0 - x2) * (gy - y2)) / denom
            w2 = 1.0 - w0 - w1
            inside = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
            sub = label_grid[iy0:iy1 + 1, ix0:ix1 + 1]
            sub[inside] = cls

    # Dilate labels into UV padding gutters so mipmaps never bleed old seam colors
    for _ in range(dilate_iters):
        empty = label_grid == 0
        if not empty.any():
            break
        padded = np.pad(label_grid, 1, mode="edge")
        # Prefer class 1 / 2 neighbors (4-connected then diagonal)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            nbr = padded[1 + dy:1 + dy + res, 1 + dx:1 + dx + res]
            fill = empty & (nbr != 0)
            label_grid[fill] = nbr[fill]
            empty = label_grid == 0

    return (label_grid == 1).astype(np.float32)


def upsample_mask(mask_low: np.ndarray, h: int, w: int) -> np.ndarray:
    """Bilinear upsample + light box blur for clean anti-aliased transitions."""
    lh, lw = mask_low.shape
    ys = np.linspace(0, lh - 1, h, dtype=np.float32)
    xs = np.linspace(0, lw - 1, w, dtype=np.float32)
    y0 = np.floor(ys).astype(np.int32)
    x0 = np.floor(xs).astype(np.int32)
    y1 = np.minimum(y0 + 1, lh - 1)
    x1 = np.minimum(x0 + 1, lw - 1)
    wy = (ys - y0)[:, None]
    wx = (xs - x0)[None, :]
    top = mask_low[y0[:, None], x0[None, :]] * (1.0 - wx) + mask_low[y0[:, None], x1[None, :]] * wx
    bot = mask_low[y1[:, None], x0[None, :]] * (1.0 - wx) + mask_low[y1[:, None], x1[None, :]] * wx
    return top * (1.0 - wy) + bot * wy


def find_basecolor_image():
    for img in bpy.data.images:
        if "basecolor" in img.name.lower():
            return img
    # Fallback: image linked to Principled BSDF Base Color
    for mat in bpy.data.materials:
        if not mat.node_tree:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                bc = node.inputs["Base Color"]
                if bc.is_linked and bc.links[0].from_node.type == "TEX_IMAGE":
                    return bc.links[0].from_node.image
    return None


def process_glb(filename: str, transform_fn):
    path = REPLACED / filename
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    img = find_basecolor_image()
    assert img is not None, f"No basecolor image found in {filename}"
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    rgb = px[:, :, :3].copy()

    objs = [o for o in bpy.data.objects if o.type == "MESH"]
    new_rgb = transform_fn(rgb, objs, h, w)
    px[:, :, :3] = np.clip(new_rgb, 0.0, 1.0)
    img.pixels.foreach_set(px.ravel())
    img.pack()

    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_yup=True,
        export_animations=False,
        export_image_format="JPEG",
        export_jpeg_quality=90,
    )
    print(f"Recolored {filename}: {path.stat().st_size / 1024:.1f} KB")


def recolor_desk(rgb, objs, h, w):
    """Tabletop slab -> warm matte milk-white (#F2EEE6); legs -> rich dark walnut (#6E4B38)."""
    h_deg, s, v = rgb_to_hsv(rgb)
    # Keep neutral grey metal corner brackets subtle pewter
    wood_mask = smoothstep(0.16, 0.30, s) * smoothstep(0.15, 0.30, v)
    top_low = rasterize_uv_region_mask(objs, lambda _n, c, _no: c.z >= 0.476, res=512, dilate_iters=10)
    top_mask = upsample_mask(top_low, h, w)

    milk_white = recolor_preserving_shading(rgb, (0.946, 0.930, 0.896), ref_lum=0.56, contrast=0.55, min_ratio=0.55, max_ratio=1.06)
    dark_walnut = recolor_preserving_shading(rgb, (0.435, 0.298, 0.222), ref_lum=0.54, contrast=0.88, min_ratio=0.38, max_ratio=1.12)

    target = dark_walnut * (1.0 - top_mask[..., None]) + milk_white * top_mask[..., None]
    pewter = np.clip(rgb * 0.92 + 0.02, 0.0, 1.0)
    return pewter * (1.0 - wood_mask[..., None]) + target * wood_mask[..., None]


def recolor_cabinet(rgb, objs, h, w):
    """Outer bookcase frame & door -> vintage moss-sage green (#6C8A7D); inner back panel -> warm cream-linen (#EFE9DD)."""
    back_low = rasterize_uv_region_mask(
        objs,
        lambda name, c, n: name == "body" and (0.042 < c.y < 0.148) and c.z > 0.35 and abs(c.x) < 0.212 and n.y < -0.50,
        res=512,
        dilate_iters=8,
    )
    back_mask = upsample_mask(back_low, h, w)

    moss_sage = recolor_preserving_shading(rgb, (0.425, 0.542, 0.492), ref_lum=0.59, contrast=0.72, min_ratio=0.42, max_ratio=1.10)
    cream_back = recolor_preserving_shading(rgb, (0.938, 0.914, 0.868), ref_lum=0.57, contrast=0.56, min_ratio=0.52, max_ratio=1.06)
    return moss_sage * (1.0 - back_mask[..., None]) + cream_back * back_mask[..., None]


def recolor_bed(rgb, objs, h, w):
    """Wood frame -> warm light natural oak (#D4B48E); sheets/pillow -> cloud white (#F7F3EB); quilt -> sakura-coral rose (#E59AA7)."""
    h_deg, s, v = rgb_to_hsv(rgb)
    wood_m = hue_band(h_deg, 15.0, 33.0, feather=4.0) * smoothstep(0.36, 0.46, s) * (1.0 - smoothstep(0.84, 0.94, v))
    cream_m = hue_band(h_deg, 24.0, 52.0, feather=5.0) * smoothstep(0.74, 0.86, v) * (1.0 - smoothstep(0.42, 0.54, s))
    pink_m = hue_band(h_deg, 335.0, 14.0, feather=4.5) * smoothstep(0.14, 0.24, s) * smoothstep(0.30, 0.45, v)

    light_oak = recolor_preserving_shading(rgb, (0.832, 0.706, 0.558), ref_lum=0.52, contrast=0.82, min_ratio=0.42, max_ratio=1.08)
    cloud_white = recolor_preserving_shading(rgb, (0.968, 0.952, 0.922), ref_lum=0.80, contrast=0.55, min_ratio=0.65, max_ratio=1.04)
    coral_rose = recolor_preserving_shading(rgb, (0.902, 0.605, 0.658), ref_lum=0.66, contrast=0.78, min_ratio=0.48, max_ratio=1.08)

    out = rgb.copy()
    out = out * (1.0 - wood_m[..., None]) + light_oak * wood_m[..., None]
    out = out * (1.0 - cream_m[..., None]) + cloud_white * cream_m[..., None]
    out = out * (1.0 - pink_m[..., None]) + coral_rose * pink_m[..., None]
    return out


def recolor_turntable(rgb, objs, h, w):
    """Wood plinth -> vintage deep cherry-burgundy (#8E4448); brass -> warm vintage gold; black platter untouched."""
    h_deg, s, v = rgb_to_hsv(rgb)
    wood_m = hue_band(h_deg, 8.0, 37.0, feather=4.5) * smoothstep(0.32, 0.46, s) * smoothstep(0.22, 0.34, v) * (1.0 - smoothstep(0.64, 0.76, v))
    brass_m = hue_band(h_deg, 35.0, 58.0, feather=5.0) * smoothstep(0.35, 0.50, s) * smoothstep(0.60, 0.72, v)

    burgundy = recolor_preserving_shading(rgb, (0.560, 0.268, 0.285), ref_lum=0.39, contrast=0.78, min_ratio=0.42, max_ratio=1.14)
    vintage_gold = recolor_preserving_shading(rgb, (0.880, 0.762, 0.502), ref_lum=0.70, contrast=0.68, min_ratio=0.58, max_ratio=1.08)

    out = rgb.copy()
    out = out * (1.0 - wood_m[..., None]) + burgundy * wood_m[..., None]
    out = out * (1.0 - brass_m[..., None]) + vintage_gold * brass_m[..., None]
    return out


def recolor_computer(rgb, objs, h, w):
    """Yellowed beige CRT shell -> clean retro warm-ivory (#EFEBE2); dark teal-green screen untouched."""
    h_deg, s, v = rgb_to_hsv(rgb)
    shell_m = hue_band(h_deg, 22.0, 60.0, feather=8.0) * (1.0 - smoothstep(0.42, 0.56, s)) * smoothstep(0.45, 0.62, v)
    ivory = recolor_preserving_shading(rgb, (0.942, 0.924, 0.888), ref_lum=0.84, contrast=0.68, min_ratio=0.55, max_ratio=1.05)
    return rgb * (1.0 - shell_m[..., None]) + ivory * shell_m[..., None]


def recolor_hatch(rgb, objs, h, w):
    """Bulkhead door -> crisp warm spacecraft porcelain (#EEECE7); trim -> brushed slate-pewter (#A4B4BE); ocean porthole untouched."""
    h_deg, s, v = rgb_to_hsv(rgb)
    not_glass = 1.0 - hue_band(h_deg, 170.0, 240.0, feather=10.0) * smoothstep(0.20, 0.35, s)
    trim_m = not_glass * hue_band(h_deg, 24.0, 52.0, feather=6.0) * smoothstep(0.32, 0.44, s) * smoothstep(0.35, 0.50, v)
    body_m = not_glass * (1.0 - trim_m) * (1.0 - smoothstep(0.34, 0.46, s)) * smoothstep(0.58, 0.72, v)

    porcelain = recolor_preserving_shading(rgb, (0.936, 0.928, 0.908), ref_lum=0.84, contrast=0.68, min_ratio=0.55, max_ratio=1.04)
    slate_pewter = recolor_preserving_shading(rgb, (0.648, 0.710, 0.752), ref_lum=0.62, contrast=0.75, min_ratio=0.50, max_ratio=1.08)

    out = rgb.copy()
    out = out * (1.0 - body_m[..., None]) + porcelain * body_m[..., None]
    out = out * (1.0 - trim_m[..., None]) + slate_pewter * trim_m[..., None]
    return out


def recolor_plant(rgb, objs, h, w):
    """Orange terracotta pot -> warm speckled cream ceramic (#F2ECE2); green foliage & dark soil untouched."""
    h_deg, s, v = rgb_to_hsv(rgb)
    pot_m = hue_band(h_deg, 6.0, 36.0, feather=5.0) * smoothstep(0.35, 0.48, s) * smoothstep(0.38, 0.52, v)
    ceramic = recolor_preserving_shading(rgb, (0.948, 0.926, 0.888), ref_lum=0.56, contrast=0.58, min_ratio=0.55, max_ratio=1.06)
    return rgb * (1.0 - pot_m[..., None]) + ceramic * pot_m[..., None]


def recolor_lamp(rgb, objs, h, w):
    """Warm butter-cream silk lampshade (#F6E9C8); keep charcoal base & warm gold stem."""
    h_deg, s, v = rgb_to_hsv(rgb)
    shade_m = hue_band(h_deg, 25.0, 52.0, feather=6.0) * smoothstep(0.68, 0.80, v)
    cream_silk = recolor_preserving_shading(rgb, (0.965, 0.914, 0.785), ref_lum=0.82, contrast=0.62, min_ratio=0.65, max_ratio=1.05)
    return rgb * (1.0 - shade_m[..., None]) + cream_silk * shade_m[..., None]


def recolor_storage_box(rgb, objs, h, w):
    """Warm honey-mustard fabric storage box (#D4A55A) inside the moss-sage lower cabinet."""
    h_deg, s, v = rgb_to_hsv(rgb)
    box_m = hue_band(h_deg, 60.0, 160.0, feather=12.0) * smoothstep(0.14, 0.25, s) * smoothstep(0.25, 0.40, v)
    mustard = recolor_preserving_shading(rgb, (0.832, 0.648, 0.355), ref_lum=0.54, contrast=0.78, min_ratio=0.45, max_ratio=1.08)
    return rgb * (1.0 - box_m[..., None]) + mustard * box_m[..., None]


def main():
    jobs = [
        ("desk.parts.glb", recolor_desk),
        ("cabinet.parts.glb", recolor_cabinet),
        ("bed.glb", recolor_bed),
        ("turntable.parts.glb", recolor_turntable),
        ("computer.fitted.glb", recolor_computer),
        ("hatch.glb", recolor_hatch),
        ("plant.glb", recolor_plant),
        ("lamp.parts.glb", recolor_lamp),
        ("storage-box.glb", recolor_storage_box),
    ]
    for filename, fn in jobs:
        process_glb(filename, fn)
    print("All replaced furniture GLBs recolored cleanly.")


if __name__ == "__main__":
    main()
