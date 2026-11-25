"""Build the PocketWorld retro-cozy cabin pedal trash can in Blender 5.2+ and export GLB.

Durable procedural generator for a warm porcelain, honey-oak, apricot-accent,
and brushed-brass pedal wastebin matching `assets/models/cabin/open-cabin.blend`.

Usage:
  blender --background --factory-startup --python scripts/build-trash-can.py
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

# ---------------------------------------------------------------------------
# Master dimensions (Blender Z-up metres, PocketWorld cabin scale ~1.45x)
# Front faces -Y in Blender (maps to +Z in glTF/Three.js; rotated -pi/2 in scene to face -X).
# ---------------------------------------------------------------------------
SEED = 20261120

TOTAL_HEIGHT = 0.560
BASE_Z0 = 0.000
BASE_SKIRT_Z0 = 0.004
BASE_Z1 = 0.044
BODY_Z0 = 0.036
BODY_Z1 = 0.464
BODY_R_BOT = 0.165
BODY_R_TOP = 0.188

COLLAR_Z0 = 0.456
COLLAR_Z1 = 0.480
COLLAR_R_OUT = 0.193

LID_Z0 = 0.480
LID_CROWN_Z = TOTAL_HEIGHT  # 0.560
LID_R_OUT = 0.192

FLUTE_COUNT = 24
FLUTE_DEPTH = 0.0021
FLUTE_Z0 = 0.072
FLUTE_Z1 = 0.416

BAND_Z0 = 0.424
BAND_Z1 = 0.452

RADIAL_SEGS = 64


def body_radius_at(z: float) -> float:
    t = max(0.0, min(1.0, (z - BODY_Z0) / (BODY_Z1 - BODY_Z0)))
    return BODY_R_BOT + (BODY_R_TOP - BODY_R_BOT) * t


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


# ---------------------------------------------------------------------------
# Pole-safe revolved-surface helper (shared pole vertices, watertight rings)
# ---------------------------------------------------------------------------
def lathe_mesh(
    profile,
    segments=RADIAL_SEGS,
    close_profile=False,
    cap_bottom=False,
    cap_top=False,
    radius_mod_fn=None,
):
    """Revolve distinct (nonnegative radius, height) points around local Z.

    When `close_profile=True` (for toroidal/ring cross-sections with all r > 0),
    connects the last ring cleanly back to the first ring for a watertight manifold.
    """
    points = [tuple(map(float, point)) for point in profile]
    vertices, rings, faces = [], [], []
    for radius, height in points:
        if radius == 0.0:
            rings.append([len(vertices)])
            vertices.append((0.0, 0.0, height))
        else:
            ring = []
            for index in range(segments):
                angle = math.tau * index / segments
                r = radius_mod_fn(radius, height, angle) if radius_mod_fn is not None else radius
                ring.append(len(vertices))
                vertices.append((r * math.cos(angle), r * math.sin(angle), height))
            rings.append(ring)

    pairs = list(zip(rings, rings[1:]))
    if close_profile and len(rings) >= 3 and len(rings[0]) > 1 and len(rings[-1]) > 1:
        pairs.append((rings[-1], rings[0]))

    for lower, upper in pairs:
        for index in range(segments):
            next_index = (index + 1) % segments
            if len(lower) == 1 and len(upper) == 1:
                continue
            elif len(lower) == 1:
                faces.append((lower[0], upper[next_index], upper[index]))
            elif len(upper) == 1:
                faces.append((lower[index], lower[next_index], upper[0]))
            else:
                faces.append((lower[index], lower[next_index], upper[next_index], upper[index]))

    if not close_profile:
        if cap_bottom and len(rings[0]) > 1:
            faces.append(tuple(reversed(rings[0])))
        if cap_top and len(rings[-1]) > 1:
            faces.append(tuple(rings[-1]))
    return vertices, faces


# ---------------------------------------------------------------------------
# Scene & mesh utilities
# ---------------------------------------------------------------------------
def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.frame_start = 1
    scene.frame_end = 1
    scene.frame_set(1)


def get_collection(name: str, parent=None):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        target = parent or bpy.context.scene.collection
        target.children.link(col)
    return col


def link_object(obj, col):
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    col.objects.link(obj)


def make_empty(name: str, location=(0.0, 0.0, 0.0), parent=None, col=None):
    empty = bpy.data.objects.new(name, None)
    empty.location = location
    empty.empty_display_type = "PLAIN_AXES"
    empty.empty_display_size = 0.08
    link_object(empty, col or bpy.context.scene.collection)
    if parent is not None:
        empty.parent = parent
    return empty


def set_smooth(mesh: bpy.types.Mesh, smooth: bool = True):
    if len(mesh.polygons) > 0:
        mesh.polygons.foreach_set("use_smooth", [smooth] * len(mesh.polygons))


def auto_uv_box(mesh: bpy.types.Mesh, scale: float = 2.0):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv_layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        n = face.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in face.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                u, v = co.x * scale + 0.5, co.y * scale + 0.5
            elif ay >= ax and ay >= az:
                u, v = co.x * scale + 0.5, co.z * scale
            else:
                u, v = co.y * scale + 0.5, co.z * scale
            loop[uv_layer].uv = (u, v)
    bm.to_mesh(mesh)
    bm.free()


def uv_cylindrical(mesh: bpy.types.Mesh, u_repeat: float = 2.0, v_scale: float = 2.0):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv_layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        angles = [math.atan2(loop.vert.co.y, loop.vert.co.x) for loop in face.loops]
        span = max(angles) - min(angles)
        wrap_shift = span > math.pi
        for loop, ang in zip(face.loops, angles):
            if wrap_shift and ang < 0.0:
                ang += math.tau
            u = ((ang / math.tau) + 0.5) * u_repeat
            v = loop.vert.co.z * v_scale
            loop[uv_layer].uv = (u, v)
    bm.to_mesh(mesh)
    bm.free()


def uv_top_planar(mesh: bpy.types.Mesh, scale: float = 2.4):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv_layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        for loop in face.loops:
            co = loop.vert.co
            loop[uv_layer].uv = (co.x * scale + 0.5, co.y * scale + 0.5)
    bm.to_mesh(mesh)
    bm.free()


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
    uv_mode: str = "box",
    uv_scale: float = 2.2,
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

    if uv_mode == "cylindrical":
        uv_cylindrical(mesh, u_repeat=2.0, v_scale=uv_scale)
    elif uv_mode == "top":
        uv_top_planar(mesh, scale=uv_scale)
    else:
        auto_uv_box(mesh, scale=uv_scale)

    set_smooth(mesh, smooth)
    if material is not None:
        mesh.materials.append(material)

    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.rotation_euler = rotation
    obj["bas_role"] = role
    link_object(obj, col)
    if parent is not None:
        obj.parent = parent
    return obj


def object_from_bmesh(
    name: str,
    bm: bmesh.types.BMesh,
    material,
    col,
    parent=None,
    location=(0.0, 0.0, 0.0),
    rotation=(0.0, 0.0, 0.0),
    smooth: bool = True,
    uv_mode: str = "box",
    uv_scale: float = 2.4,
    role: str = "prop_part",
):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    if uv_mode == "cylindrical":
        uv_cylindrical(mesh, u_repeat=2.0, v_scale=uv_scale)
    elif uv_mode == "top":
        uv_top_planar(mesh, scale=uv_scale)
    else:
        auto_uv_box(mesh, scale=uv_scale)

    set_smooth(mesh, smooth)
    if material is not None:
        mesh.materials.append(material)

    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.rotation_euler = rotation
    obj["bas_role"] = role
    link_object(obj, col)
    if parent is not None:
        obj.parent = parent
    return obj


def make_rounded_box_bm(sx: float, sy: float, sz: float, bevel_width: float, segments: int = 3) -> bmesh.types.BMesh:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel_width > 0.0:
        bmesh.ops.bevel(
            bm,
            geom=list(bm.edges),
            offset=bevel_width,
            offset_type="OFFSET",
            segments=segments,
            profile=0.55,
            affect="EDGES",
            clamp_overlap=True,
        )
    return bm


def make_swept_tube_bm(
    points: list[Vector],
    radius_n: float,
    radius_b: float | None = None,
    ring_segs: int = 18,
    cap_ends: bool = True,
    ref_hint: Vector | None = None,
) -> bmesh.types.BMesh:
    """Sweep an elliptical or circular cross-section cleanly along a 3D polyline.

    `radius_n` lies along the projected `ref_hint` normal; `radius_b` lies along binormal.
    """
    rb = radius_n if radius_b is None else radius_b
    bm = bmesh.new()
    rings = []
    prev_n = None
    n_pts = len(points)
    for i, pt in enumerate(points):
        if i == 0:
            tangent = (points[1] - points[0]).normalized()
        elif i == n_pts - 1:
            tangent = (points[-1] - points[-2]).normalized()
        else:
            tangent = ((points[i] - points[i - 1]).normalized() + (points[i + 1] - points[i]).normalized()).normalized()
        if prev_n is None:
            if ref_hint is not None and abs(tangent.dot(ref_hint.normalized())) < 0.95:
                ref = ref_hint.normalized()
            else:
                ref = Vector((0.0, 0.0, 1.0)) if abs(tangent.z) < 0.9 else Vector((1.0, 0.0, 0.0))
            normal = (ref - tangent * ref.dot(tangent)).normalized()
        else:
            normal = prev_n - tangent * prev_n.dot(tangent)
            if normal.length < 1e-5:
                ref = Vector((1.0, 0.0, 0.0))
                normal = (ref - tangent * ref.dot(tangent)).normalized()
            else:
                normal.normalize()
        binormal = tangent.cross(normal).normalized()
        prev_n = normal

        ring = []
        for s in range(ring_segs):
            a = math.tau * s / ring_segs
            pos = pt + normal * (math.cos(a) * radius_n) + binormal * (math.sin(a) * rb)
            ring.append(bm.verts.new(pos))
        rings.append(ring)

    for r0, r1 in zip(rings, rings[1:]):
        for s in range(ring_segs):
            sn = (s + 1) % ring_segs
            bm.faces.new((r0[s], r0[sn], r1[sn], r1[s]))

    if cap_ends:
        c0 = bm.verts.new(points[0])
        c1 = bm.verts.new(points[-1])
        for s in range(ring_segs):
            sn = (s + 1) % ring_segs
            bm.faces.new((c0, rings[0][sn], rings[0][s]))
            bm.faces.new((c1, rings[-1][s], rings[-1][sn]))

    return bm


# ---------------------------------------------------------------------------
# Packed procedural PNG textures (lightweight 256px, glTF-safe, zero external files)
# ---------------------------------------------------------------------------
def create_packed_image(name: str, rgba: np.ndarray, colorspace: str = "sRGB"):
    h, w, _ = rgba.shape
    img = bpy.data.images.new(name=name, width=w, height=h, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.clip(rgba, 0.0, 1.0).astype(np.float32).ravel())
    img.pack()
    return img


def generate_textures():
    rng = np.random.default_rng(SEED)
    textures = {}
    sz = 256
    yy, xx = np.mgrid[0:sz, 0:sz] / float(sz)

    # Smooth micro-noise helper (low-entropy so PNG compresses cleanly)
    raw = rng.normal(0.0, 1.0, (sz, sz))
    grain = raw.copy()
    for _ in range(3):
        grain = (
            grain
            + np.roll(grain, 1, 0) + np.roll(grain, -1, 0)
            + np.roll(grain, 1, 1) + np.roll(grain, -1, 1)
        ) / 5.0

    # 1. Warm Cream-Porcelain Ceramic Enamel (delicate stoneware speckle & soft glaze)
    speckle = (rng.random((sz, sz)) > 0.986).astype(np.float32) * rng.uniform(0.35, 0.95, (sz, sz))
    glaze_wave = 0.5 * np.sin(yy * math.tau * 3.0 + np.cos(xx * math.tau * 2.0) * 0.4) + 0.5 * np.cos(xx * math.tau * 4.0)

    porc = np.ones((sz, sz, 4), dtype=np.float32)
    porc[..., 0] = 0.945 + 0.008 * glaze_wave + 0.005 * grain - 0.12 * speckle
    porc[..., 1] = 0.928 + 0.008 * glaze_wave + 0.005 * grain - 0.12 * speckle
    porc[..., 2] = 0.895 + 0.007 * glaze_wave + 0.004 * grain - 0.11 * speckle
    textures["porcelain_albedo"] = create_packed_image("Tex_BinPorcelain_Albedo", porc, "sRGB")

    porc_r = np.ones((sz, sz, 4), dtype=np.float32)
    pr = 0.56 + 0.035 * glaze_wave + 0.025 * grain + 0.12 * speckle
    porc_r[..., 0] = porc_r[..., 1] = porc_r[..., 2] = np.clip(pr, 0.46, 0.76)
    textures["porcelain_rough"] = create_packed_image("Tex_BinPorcelain_Rough", porc_r, "Non-Color")

    # 2. Warm Mid-Walnut Bentwood Lid (matching desk legs & chair frame)
    wx = (xx - 0.5) * 2.0
    wy = (yy - 0.5) * 2.0
    warp = 0.11 * np.sin(wy * 4.8 + 0.4) + 0.055 * np.cos(wx * 3.8 - wy * 2.6)
    rings = np.sin((wx * 9.0 + warp * 4.2 + np.hypot(wx * 1.05, wy * 0.28) * 5.0) * math.pi)
    rings = 0.5 + 0.5 * rings
    rings_sharp = np.power(rings, 1.55)
    fine_fiber = 0.5 + 0.5 * np.sin(xx * math.tau * 36.0 + wy * 5.0 + 0.9 * grain)
    pore = np.clip(grain * 0.5 + 0.5, 0.0, 1.0)

    oak = np.ones((sz, sz, 4), dtype=np.float32)
    oak[..., 0] = 0.505 + 0.105 * rings_sharp + 0.022 * fine_fiber - 0.026 * pore
    oak[..., 1] = 0.352 + 0.082 * rings_sharp + 0.017 * fine_fiber - 0.021 * pore
    oak[..., 2] = 0.245 + 0.058 * rings_sharp + 0.012 * fine_fiber - 0.015 * pore
    textures["oak_albedo"] = create_packed_image("Tex_BinHoneyOak_Albedo", oak, "sRGB")

    oak_r = np.ones((sz, sz, 4), dtype=np.float32)
    or_v = 0.58 - 0.07 * rings_sharp + 0.05 * pore
    oak_r[..., 0] = oak_r[..., 1] = oak_r[..., 2] = np.clip(or_v, 0.46, 0.74)
    textures["oak_rough"] = create_packed_image("Tex_BinHoneyOak_Rough", oak_r, "Non-Color")

    # 3. Satin Brushed Antique Brass (warm vintage gold)
    brush_line = rng.normal(0.0, 0.65, (sz, 1))
    brush_line = (brush_line + np.roll(brush_line, 1, 0) + np.roll(brush_line, -1, 0)) / 3.0
    brush_2d = np.repeat(brush_line, sz, axis=1) * 0.7 + grain * 0.3
    brass = np.ones((sz, sz, 4), dtype=np.float32)
    brass[..., 0] = 0.845 + 0.018 * brush_2d
    brass[..., 1] = 0.715 + 0.016 * brush_2d
    brass[..., 2] = 0.440 + 0.012 * brush_2d
    textures["brass_albedo"] = create_packed_image("Tex_BinBrass_Albedo", brass, "sRGB")

    brass_r = np.ones((sz, sz, 4), dtype=np.float32)
    # Green channel ~0.52-0.60 so even when Three.js ReusableAsset sets scalar roughness >= 0.55,
    # roughness * map.g gives a refined satin brushed sheen (~0.30-0.34).
    br = 0.54 + 0.04 * brush_2d
    brass_r[..., 0] = brass_r[..., 1] = brass_r[..., 2] = np.clip(br, 0.44, 0.66)
    textures["brass_rough"] = create_packed_image("Tex_BinBrass_Rough", brass_r, "Non-Color")

    # 4. Vintage Moss-Sage Ceramic Accent Band (matches Floor 1 painted bookcase)
    sz_s = 128
    yy_s, xx_s = np.mgrid[0:sz_s, 0:sz_s] / float(sz_s)
    wave_s = 0.5 * np.sin(yy_s * math.tau * 2.0) + 0.5 * np.cos(xx_s * math.tau * 3.0)
    speck_s = (rng.random((sz_s, sz_s)) > 0.985).astype(np.float32) * 0.6
    apri = np.ones((sz_s, sz_s, 4), dtype=np.float32)
    apri[..., 0] = 0.440 + 0.010 * wave_s - 0.05 * speck_s
    apri[..., 1] = 0.562 + 0.010 * wave_s - 0.05 * speck_s
    apri[..., 2] = 0.502 + 0.008 * wave_s - 0.05 * speck_s
    textures["apricot_albedo"] = create_packed_image("Tex_BinApricot_Albedo", apri, "sRGB")

    return textures


def make_pbr_material(
    name: str,
    albedo_img=None,
    rough_img=None,
    base_color=(0.8, 0.7, 0.6, 1.0),
    metallic: float = 0.0,
    roughness: float = 0.58,
):
    mat = bpy.data.materials.new(name=name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (420, 0)

    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (120, 0)
    bsdf.inputs["Base Color"].default_value = base_color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    if albedo_img is not None:
        tex_c = nt.nodes.new("ShaderNodeTexImage")
        tex_c.image = albedo_img
        tex_c.location = (-260, 140)
        nt.links.new(tex_c.outputs["Color"], bsdf.inputs["Base Color"])

    if rough_img is not None:
        tex_r = nt.nodes.new("ShaderNodeTexImage")
        tex_r.image = rough_img
        tex_r.location = (-260, -140)
        nt.links.new(tex_r.outputs["Color"], bsdf.inputs["Roughness"])

    return mat


def build_materials(textures):
    return {
        "porcelain": make_pbr_material(
            "Mat_Bin_Porcelain",
            albedo_img=textures["porcelain_albedo"],
            rough_img=textures["porcelain_rough"],
            metallic=0.0,
            roughness=0.58,
        ),
        "apricot": make_pbr_material(
            "Mat_Bin_ApricotBand",
            albedo_img=textures["apricot_albedo"],
            rough_img=textures["porcelain_rough"],
            metallic=0.0,
            roughness=0.56,
        ),
        "oak": make_pbr_material(
            "Mat_Bin_HoneyOak",
            albedo_img=textures["oak_albedo"],
            rough_img=textures["oak_rough"],
            metallic=0.0,
            roughness=0.62,
        ),
        "brass": make_pbr_material(
            "Mat_Bin_BrushedBrass",
            albedo_img=textures["brass_albedo"],
            rough_img=textures["brass_rough"],
            metallic=0.80,
            roughness=0.55,
        ),
        "slate": make_pbr_material(
            "Mat_Bin_SlateRubber",
            # Deep charcoal-slate linear color matching open-cabin Window gasket & FURNITURE.ink
            base_color=(0.042, 0.058, 0.064, 1.0),
            metallic=0.0,
            roughness=0.82,
        ),
    }


# ---------------------------------------------------------------------------
# Geometry builders (all parts watertight manifold)
# ---------------------------------------------------------------------------
def build_base_and_feet(mats, col, parent):
    # 1. Weighted non-slip base skirt ring with recessed underside pan (pole-to-pole closed)
    base_profile = [
        (0.000, 0.012),
        (0.145, 0.012),
        (0.154, 0.005),
        (0.168, 0.004),
        (0.174, 0.007),
        (0.175, 0.016),
        (0.172, 0.036),
        (0.168, 0.044),
        (0.161, 0.044),
        (0.158, 0.036),
        (0.000, 0.036),
    ]
    verts, faces = lathe_mesh(base_profile, segments=RADIAL_SEGS)
    base_ring = object_from_pydata(
        "Bin_Base_Ring", verts, faces, mats["slate"], col, parent=parent,
        uv_mode="cylindrical", uv_scale=2.0, role="base",
    )

    # 2. Four ground-contact rubber isolation foot pads resting cleanly at Z = 0.000
    bm_feet = bmesh.new()
    for i in range(4):
        ang = math.radians(45.0 + i * 90.0)
        fx = math.cos(ang) * 0.140
        fy = math.sin(ang) * 0.140
        pad = bmesh.new()
        bmesh.ops.create_cone(
            pad, cap_ends=True, cap_tris=False, segments=20,
            radius1=0.018, radius2=0.016, depth=0.012,
        )
        bmesh.ops.translate(pad, vec=(fx, fy, 0.006), verts=pad.verts)
        vmap = {v: bm_feet.verts.new(v.co) for v in pad.verts}
        for f in pad.faces:
            bm_feet.faces.new([vmap[v] for v in f.verts])
        pad.free()
    foot_pads = object_from_bmesh(
        "Bin_Foot_Pads", bm_feet, mats["slate"], col, parent=parent,
        uv_mode="box", uv_scale=3.0, role="base_foot",
    )

    # 3. Front recessed pedal exit housing bezel at -Y
    bm_house = make_rounded_box_bm(0.092, 0.056, 0.038, bevel_width=0.006, segments=3)
    bmesh.ops.translate(bm_house, vec=(0.0, -0.164, 0.023), verts=bm_house.verts)
    pedal_housing = object_from_bmesh(
        "Bin_Pedal_Housing", bm_house, mats["slate"], col, parent=parent,
        uv_mode="box", uv_scale=3.0, role="pedal_housing",
    )

    return base_ring, foot_pads, pedal_housing


def build_outer_body_and_band(mats, col, parent):
    # Denser vertical rings at flute fade-in/fade-out transitions, clean spacing in belly
    z_samples = [
        0.036, 0.044, 0.058, 0.068, 0.076, 0.088, 0.104,
        0.155, 0.210, 0.265, 0.320, 0.375,
        0.394, 0.408, 0.418, 0.424, 0.452, 0.460, 0.464,
    ]
    outer_profile = [
        (BODY_R_BOT - 0.009, 0.038),
        (BODY_R_BOT - 0.002, 0.036),
    ]
    for z in z_samples:
        r = body_radius_at(z)
        if BAND_Z0 + 0.001 <= z <= BAND_Z1 - 0.001:
            r -= 0.0015
        outer_profile.append((r, z))
    outer_profile.append((BODY_R_TOP - 0.010, 0.464))
    outer_profile.append((BODY_R_TOP - 0.011, 0.456))
    outer_profile.append((BODY_R_BOT - 0.010, 0.046))

    def flute_mod(r, z, ang):
        if r < 0.160 or z < 0.066 or z > 0.422:
            return r
        fade_in = smoothstep(0.068, 0.098, z)
        fade_out = 1.0 - smoothstep(0.392, 0.420, z)
        return r + fade_in * fade_out * FLUTE_DEPTH * math.cos(ang * FLUTE_COUNT)

    body_segs = FLUTE_COUNT * 4  # 96 segments: 4 per flute for velvety smooth scallops
    verts, faces = lathe_mesh(outer_profile, segments=body_segs, close_profile=True, radius_mod_fn=flute_mod)
    body = object_from_pydata(
        "Bin_Outer_Body", verts, faces, mats["porcelain"], col, parent=parent,
        uv_mode="cylindrical", uv_scale=2.2, role="main_body",
    )

    # Warm apricot ceramic accent band seated cleanly around the upper waist groove (closed ring)
    r_b0 = body_radius_at(BAND_Z0)
    r_b1 = body_radius_at(BAND_Z1)
    band_profile = [
        (r_b0 - 0.003, BAND_Z0),
        (r_b0 + 0.0006, BAND_Z0 + 0.002),
        (r_b0 + 0.0017, BAND_Z0 + 0.005),
        (r_b1 + 0.0017, BAND_Z1 - 0.005),
        (r_b1 + 0.0006, BAND_Z1 - 0.002),
        (r_b1 - 0.003, BAND_Z1),
    ]
    b_verts, b_faces = lathe_mesh(band_profile, segments=RADIAL_SEGS, close_profile=True)
    band = object_from_pydata(
        "Bin_Accent_Band", b_verts, b_faces, mats["apricot"], col, parent=parent,
        uv_mode="cylindrical", uv_scale=2.4, role="accent_band",
    )

    return body, band


def build_collar_liner_and_gasket(mats, col, parent):
    # 1. Rolled brushed-brass upper collar rim (closed ring)
    collar_profile = [
        (0.172, 0.448),
        (0.176, 0.448),
        (0.177, 0.468),
        (0.181, 0.476),
        (0.187, 0.480),
        (0.192, 0.478),
        (COLLAR_R_OUT, 0.472),
        (COLLAR_R_OUT, 0.461),
        (0.190, 0.456),
        (0.183, 0.456),
        (0.174, 0.456),
    ]
    c_verts, c_faces = lathe_mesh(collar_profile, segments=RADIAL_SEGS, close_profile=True)
    collar = object_from_pydata(
        "Bin_Collar_Rim", c_verts, c_faces, mats["brass"], col, parent=parent,
        uv_mode="cylindrical", uv_scale=3.0, role="collar_rim",
    )

    # 2. Removable dark-slate inner liner bucket nestled cleanly inside (pole-to-pole closed)
    liner_profile = [
        (0.000, 0.048),
        (0.146, 0.048),
        (0.152, 0.054),
        (0.171, 0.456),
        (0.175, 0.463),
        (0.173, 0.467),
        (0.165, 0.467),
        (0.163, 0.456),
        (0.145, 0.060),
        (0.138, 0.056),
        (0.000, 0.056),
    ]
    l_verts, l_faces = lathe_mesh(liner_profile, segments=48)
    liner = object_from_pydata(
        "Bin_Inner_Liner", l_verts, l_faces, mats["slate"], col, parent=parent,
        uv_mode="cylindrical", uv_scale=2.0, role="inner_liner",
    )

    # 3. Soft-close silicone cushion gasket ring between collar and lid (closed ring)
    gasket_profile = [
        (0.182, 0.477),
        (0.189, 0.477),
        (0.190, 0.481),
        (0.188, 0.483),
        (0.183, 0.483),
        (0.181, 0.480),
    ]
    g_verts, g_faces = lathe_mesh(gasket_profile, segments=RADIAL_SEGS, close_profile=True)
    gasket = object_from_pydata(
        "Bin_Lid_Gasket", g_verts, g_faces, mats["slate"], col, parent=parent,
        uv_mode="cylindrical", uv_scale=3.0, role="gasket",
    )

    return collar, liner, gasket


def build_domed_wood_lid(mats, col, parent):
    # Smooth domed honey-oak bentwood lid (pole-to-pole watertight)
    lid_profile = [
        (0.000, 0.476),
        (0.160, 0.476),
        (0.166, 0.472),
        (0.171, 0.472),
        (0.174, 0.480),
        (0.189, 0.480),
        (LID_R_OUT, 0.483),
        (LID_R_OUT, 0.494),
        (0.190, 0.502),
    ]
    n_dome = 16
    for i in range(1, n_dome + 1):
        u = i / n_dome
        theta = u * (math.pi * 0.5)
        r = 0.190 * math.cos(theta)
        z = 0.502 + (LID_CROWN_Z - 0.502) * (math.sin(theta) ** 0.86)
        if i == n_dome:
            r = 0.0
            z = LID_CROWN_Z
        lid_profile.append((r, z))

    verts, faces = lathe_mesh(lid_profile, segments=RADIAL_SEGS)
    lid = object_from_pydata(
        "Bin_Wood_Lid", verts, faces, mats["oak"], col, parent=parent,
        uv_mode="top", uv_scale=2.5, role="lid",
    )

    # Brushed-brass lower bezel ring framing the bentwood lid edge (closed ring)
    bezel_profile = [
        (0.189, 0.480),
        (0.194, 0.481),
        (0.195, 0.485),
        (0.1945, 0.491),
        (0.1915, 0.493),
        (0.1895, 0.491),
    ]
    bz_verts, bz_faces = lathe_mesh(bezel_profile, segments=RADIAL_SEGS, close_profile=True)
    lid_trim = object_from_pydata(
        "Bin_Lid_Trim", bz_verts, bz_faces, mats["brass"], col, parent=parent,
        uv_mode="cylindrical", uv_scale=3.0, role="lid_trim",
    )

    # Ergonomic front brass finger-lift tab on the lid bezel (-Y)
    bm_tab = make_rounded_box_bm(0.062, 0.022, 0.010, bevel_width=0.0032, segments=3)
    bmesh.ops.translate(bm_tab, vec=(0.0, -0.195, 0.486), verts=bm_tab.verts)
    lid_tab = object_from_bmesh(
        "Bin_Lid_Tab", bm_tab, mats["brass"], col, parent=parent,
        uv_mode="box", uv_scale=3.2, role="lid_tab",
    )

    return lid, lid_trim, lid_tab


def build_foot_pedal(mats, col, parent):
    # 1. Brushed-brass pedal lever arm emerging from inside the front pedal housing (-Y)
    # Normal is +Z (thin vertically 6mm), binormal is +/-X (wide horizontally 17mm half-width = 34mm)
    arm_pts = [
        Vector((0.0, -0.148, 0.021)),
        Vector((0.0, -0.172, 0.021)),
        Vector((0.0, -0.194, 0.023)),
        Vector((0.0, -0.214, 0.027)),
        Vector((0.0, -0.226, 0.030)),
    ]
    bm_arm = make_swept_tube_bm(
        arm_pts, radius_n=0.006, radius_b=0.017, ring_segs=18,
        cap_ends=True, ref_hint=Vector((0.0, 0.0, 1.0)),
    )
    pedal_arm = object_from_bmesh(
        "Bin_Pedal_Arm", bm_arm, mats["brass"], col, parent=parent,
        uv_mode="box", uv_scale=3.5, role="pedal_arm",
    )

    # 2. Ergonomic stadium-rounded brushed-brass foot pedal plate tilted 8 deg toward toe
    bm_pad = make_rounded_box_bm(0.106, 0.056, 0.013, bevel_width=0.0052, segments=4)
    tilt = Matrix.Rotation(math.radians(-8.0), 4, "X")
    bmesh.ops.transform(bm_pad, matrix=tilt, verts=bm_pad.verts)
    bmesh.ops.translate(bm_pad, vec=(0.0, -0.222, 0.031), verts=bm_pad.verts)
    pedal_pad = object_from_bmesh(
        "Bin_Pedal_Pad", bm_pad, mats["brass"], col, parent=parent,
        uv_mode="top", uv_scale=4.0, role="pedal_pad",
    )

    # 3. Five anti-slip charcoal rubber grip ribs seated cleanly atop the pedal pad
    bm_grip = bmesh.new()
    for i in range(-2, 3):
        rib = make_rounded_box_bm(0.011, 0.038, 0.006, bevel_width=0.0022, segments=2)
        bmesh.ops.transform(rib, matrix=tilt, verts=rib.verts)
        bmesh.ops.translate(rib, vec=(i * 0.0185, -0.222, 0.0382), verts=rib.verts)
        vmap = {v: bm_grip.verts.new(v.co) for v in rib.verts}
        for f in rib.faces:
            bm_grip.faces.new([vmap[v] for v in f.verts])
        rib.free()
    pedal_grip = object_from_bmesh(
        "Bin_Pedal_Grip", bm_grip, mats["slate"], col, parent=parent,
        uv_mode="box", uv_scale=4.0, role="pedal_grip",
    )

    return pedal_arm, pedal_pad, pedal_grip


def build_rear_hinge_and_linkage(mats, col, parent):
    # Mechanically coherent rear pedal-to-lid linkage along +Y
    # 1. Lower rod guide housing bolted onto rear of base ring
    bm_low = make_rounded_box_bm(0.044, 0.036, 0.030, bevel_width=0.0045, segments=3)
    bmesh.ops.translate(bm_low, vec=(0.0, 0.178, 0.026), verts=bm_low.verts)
    rod_guide = object_from_bmesh(
        "Bin_Rod_Guide", bm_low, mats["brass"], col, parent=parent,
        uv_mode="box", uv_scale=3.5, role="hinge_guide",
    )

    # 2. Sleek vertical external brushed-brass push rod following barrel taper
    rod_pts = [
        Vector((0.0, 0.184, 0.028)),
        Vector((0.0, 0.193, 0.160)),
        Vector((0.0, 0.200, 0.310)),
        Vector((0.0, 0.206, 0.468)),
    ]
    bm_rod = make_swept_tube_bm(rod_pts, radius_n=0.0065, radius_b=0.0065, ring_segs=18, cap_ends=True)
    lift_rod = object_from_bmesh(
        "Bin_Lift_Rod", bm_rod, mats["brass"], col, parent=parent,
        uv_mode="cylindrical", uv_scale=3.5, role="lift_rod",
    )

    # 3. Mid-height brass guide bracket securing lift rod to barrel
    z_clip = 0.245
    r_clip = body_radius_at(z_clip)
    bm_clip = make_rounded_box_bm(0.038, 0.032, 0.020, bevel_width=0.0038, segments=3)
    bmesh.ops.translate(bm_clip, vec=(0.0, r_clip + 0.011, z_clip), verts=bm_clip.verts)
    rod_clip = object_from_bmesh(
        "Bin_Rod_Clip", bm_clip, mats["brass"], col, parent=parent,
        uv_mode="box", uv_scale=3.5, role="hinge_guide",
    )

    # 4. Upper rear hinge housing mounted to brass collar
    bm_hbody = make_rounded_box_bm(0.068, 0.038, 0.036, bevel_width=0.005, segments=3)
    bmesh.ops.translate(bm_hbody, vec=(0.0, 0.197, 0.468), verts=bm_hbody.verts)
    hinge_body = object_from_bmesh(
        "Bin_Hinge_Body", bm_hbody, mats["brass"], col, parent=parent,
        uv_mode="box", uv_scale=3.5, role="hinge",
    )

    # 5. Horizontal cylindrical hinge pivot pin
    bm_pin = bmesh.new()
    bmesh.ops.create_cone(
        bm_pin, cap_ends=True, cap_tris=False, segments=24,
        radius1=0.0085, radius2=0.0085, depth=0.082,
    )
    bmesh.ops.rotate(bm_pin, matrix=Matrix.Rotation(math.pi * 0.5, 3, "Y"), verts=bm_pin.verts)
    bmesh.ops.translate(bm_pin, vec=(0.0, 0.207, 0.483), verts=bm_pin.verts)
    hinge_pin = object_from_bmesh(
        "Bin_Hinge_Pin", bm_pin, mats["brass"], col, parent=parent,
        uv_mode="box", uv_scale=3.5, role="hinge_pin",
    )

    # 6. Flat wide curved lid rear hinge strap hugging the honey-oak lid shoulder
    # ref_hint = +X so radius_n = 0.022 is wide horizontally (44mm wide across X),
    # and radius_b = 0.0055 is thin perpendicular to the lid dome (11mm thick).
    strap_pts = [
        Vector((0.0, 0.207, 0.483)),
        Vector((0.0, 0.201, 0.493)),
        Vector((0.0, 0.188, 0.504)),
        Vector((0.0, 0.168, 0.514)),
        Vector((0.0, 0.150, 0.521)),
    ]
    bm_strap = make_swept_tube_bm(
        strap_pts, radius_n=0.021, radius_b=0.0055, ring_segs=20,
        cap_ends=True, ref_hint=Vector((1.0, 0.0, 0.0)),
    )
    hinge_lid_tab = object_from_bmesh(
        "Bin_Hinge_LidTab", bm_strap, mats["brass"], col, parent=parent,
        uv_mode="box", uv_scale=3.5, role="hinge_strap",
    )

    return rod_guide, lift_rod, rod_clip, hinge_body, hinge_pin, hinge_lid_tab


def build_side_handles_and_badge(mats, col, parent):
    objs = []
    z_h = 0.356
    r_h = body_radius_at(z_h)

    # Left (-X) and Right (+X) refined brushed-brass carry lugs
    for side, suffix in ((-1.0, "L"), (1.0, "R")):
        bm_esc = make_rounded_box_bm(0.018, 0.084, 0.026, bevel_width=0.0042, segments=3)
        bmesh.ops.translate(bm_esc, vec=(side * (r_h - 0.001), 0.0, z_h), verts=bm_esc.verts)
        esc = object_from_bmesh(
            f"Bin_Handle_Escutcheon_{suffix}", bm_esc, mats["brass"], col, parent=parent,
            uv_mode="box", uv_scale=3.5, role="handle_mount",
        )
        objs.append(esc)

        # Compact, sculpted downward-canted brass pull bail
        loop_pts = []
        n_arc = 14
        for i in range(n_arc + 1):
            t = i / n_arc
            ang = -math.pi * 0.5 + t * math.pi
            y_pos = math.sin(ang) * 0.030
            out_proj = math.cos(ang) * 0.021
            x_pos = side * (r_h + 0.002 + out_proj)
            z_pos = z_h - math.cos(ang) * 0.011
            loop_pts.append(Vector((x_pos, y_pos, z_pos)))
        bm_loop = make_swept_tube_bm(loop_pts, radius_n=0.0056, radius_b=0.0056, ring_segs=16, cap_ends=True)
        loop_obj = object_from_bmesh(
            f"Bin_Handle_Loop_{suffix}", bm_loop, mats["brass"], col, parent=parent,
            uv_mode="box", uv_scale=3.5, role="handle",
        )
        objs.append(loop_obj)

    # Front curved brass pill badge escutcheon on upper front (-Y)
    z_b = 0.352
    r_b = body_radius_at(z_b)
    badge_pts = []
    for i in range(9):
        t = (i / 8.0) * 2.0 - 1.0
        ang = -math.pi * 0.5 + t * 0.165
        badge_pts.append(Vector((math.cos(ang) * (r_b + 0.0018), math.sin(ang) * (r_b + 0.0018), z_b)))
    bm_badge = make_swept_tube_bm(
        badge_pts, radius_n=0.0110, radius_b=0.0040, ring_segs=16,
        cap_ends=True, ref_hint=Vector((0.0, 0.0, 1.0)),
    )
    badge = object_from_bmesh(
        "Bin_Front_Badge", bm_badge, mats["brass"], col, parent=parent,
        uv_mode="box", uv_scale=4.0, role="badge",
    )
    objs.append(badge)

    return objs


def build_trash_can(blend_path: Path, glb_path: Path | None):
    clear_scene()

    col_root = get_collection("01 • Pedal Trash Can")
    root = make_empty("TrashCan_Root", (0.0, 0.0, 0.0), col=col_root)

    textures = generate_textures()
    mats = build_materials(textures)

    build_base_and_feet(mats, col_root, root)
    build_outer_body_and_band(mats, col_root, root)
    build_collar_liner_and_gasket(mats, col_root, root)
    build_domed_wood_lid(mats, col_root, root)
    build_foot_pedal(mats, col_root, root)
    build_rear_hinge_and_linkage(mats, col_root, root)
    build_side_handles_and_badge(mats, col_root, root)

    bpy.context.view_layer.update()
    bpy.ops.file.pack_all()

    deps = bpy.context.evaluated_depsgraph_get()
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    total_tris = 0
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        eo = obj.evaluated_get(deps)
        mesh = eo.to_mesh()
        mesh.calc_loop_triangles()
        total_tris += len(mesh.loop_triangles)
        for v in mesh.vertices:
            wp = obj.matrix_world @ v.co
            mins.x = min(mins.x, wp.x)
            mins.y = min(mins.y, wp.y)
            mins.z = min(mins.z, wp.z)
            maxs.x = max(maxs.x, wp.x)
            maxs.y = max(maxs.y, wp.y)
            maxs.z = max(maxs.z, wp.z)
        eo.to_mesh_clear()
    dims = maxs - mins
    print(
        f"TrashCan evaluated: tris={total_tris:,}, "
        f"X=[{mins.x:.4f}, {maxs.x:.4f}] ({dims.x:.4f}m), "
        f"Y=[{mins.y:.4f}, {maxs.y:.4f}] ({dims.y:.4f}m), "
        f"Z=[{mins.z:.4f}, {maxs.z:.4f}] ({dims.z:.4f}m)"
    )

    blend_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    print(f"Saved editable blend: {blend_path}")

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
        print(f"Exported GLB: {glb_path} ({glb_path.stat().st_size:,} bytes)")


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Build PocketWorld cabin pedal trash can.")
    root = Path(__file__).resolve().parents[1]
    parser.add_argument(
        "--blend",
        type=Path,
        default=root / "assets/models/furniture/trash-can.blend",
        help="Output .blend path",
    )
    parser.add_argument(
        "--glb",
        type=Path,
        default=root / "assets/public/models/furniture/trash-can.glb",
        help="Output .glb path (pass 'none' to skip GLB export)",
    )
    args = parser.parse_args(argv)
    if str(args.glb).lower() == "none":
        args.glb = None
    return args


if __name__ == "__main__":
    opts = parse_args()
    build_trash_can(opts.blend, opts.glb)
