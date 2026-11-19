"""Build the PocketWorld orbital spacecraft hull in Blender 5.2+ and export GLB.

Durable procedural generator for the retro-cozy orbital living vessel ("PW-01")
designed to enclose `assets/models/cabin/open-cabin.blend` cleanly while matching
its warm porcelain, apricot, dusty-rose, and brushed-brass visual language.

Usage:
  blender --background --factory-startup --python scripts/build-spacecraft-hull.py
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

# ---------------------------------------------------------------------------
# Cabin envelope constants (measured from assets/models/cabin/open-cabin.blend)
# Blender Z-up coordinates; glTF export maps (X, Y, Z) -> (X, Z, -Y).
# ---------------------------------------------------------------------------
CABIN_X_MIN = -6.67
CABIN_X_MAX = 4.24
CABIN_Y_MIN = -3.17
CABIN_Y_MAX = 3.40
CABIN_Z_MIN = -0.28
CABIN_Z_MAX = 3.76

CX = (CABIN_X_MIN + CABIN_X_MAX) * 0.5  # -1.215
CY = (CABIN_Y_MIN + CABIN_Y_MAX) * 0.5  # +0.115
CZ = (CABIN_Z_MIN + CABIN_Z_MAX) * 0.5  # +1.740

# Cabin existing panoramic window on +Y wall (back wall in Three.js -Z)
BACK_WIN_X0, BACK_WIN_X1 = -2.36, 3.26
BACK_WIN_Z0, BACK_WIN_Z1 = 1.825, 3.415

# Hero viewing bay window on -Y flank (front side facing initial camera)
FRONT_WIN_X0, FRONT_WIN_X1 = -3.35, 2.55
FRONT_WIN_Z0, FRONT_WIN_Z1 = 1.18, 3.05

# Hull primary dimensions (generous clearance around the entire cabin)
HULL_X_STERN = -8.95
HULL_X_MID_AFT = -6.95
HULL_X_MID_FORE = 4.65
HULL_X_BOW = 7.85

HULL_RY = 4.26          # half-beam in Y (cabin half-width is 3.285 -> ~0.97m clearance)
HULL_RZ_UP = 2.76       # roof crown at CZ + 2.76 = 4.50 (cabin top 3.76 -> 0.74m clearance)
HULL_RZ_DOWN = 2.70     # belly keel at CZ - 2.70 = -0.96 (cabin plinth -0.28 -> 0.68m clearance)

# Thrusters & solar wings
THRUSTER_Y_OFFSET = 1.98
THRUSTER_Z = 1.50
THRUSTER_MOUNT_X = -8.72

WING_ROOT_X = -4.55     # clear of front bay window and sits harmoniously above bedroom porthole
WING_ROOT_Z = 3.46
WING_CHORD = 2.48
WING_DIHEDRAL_DEG = 15.0
WING_SWEEP_DEG = -9.0

SEED = 20261119


# ---------------------------------------------------------------------------
# Reusable revolved-surface helper (shared pole vertices, zero degenerate edges)
# ---------------------------------------------------------------------------
def lathe_mesh(profile, segments=48, cap_bottom=True, cap_top=True):
    """Revolve distinct (nonnegative radius, height) points around local Z."""
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
                ring.append(len(vertices))
                vertices.append((radius * math.cos(angle), radius * math.sin(angle), height))
            rings.append(ring)
    for lower, upper in zip(rings, rings[1:]):
        for index in range(segments):
            next_index = (index + 1) % segments
            if len(lower) == 1:
                faces.append((lower[0], upper[next_index], upper[index]))
            elif len(upper) == 1:
                faces.append((lower[index], lower[next_index], upper[0]))
            else:
                faces.append((lower[index], lower[next_index], upper[next_index], upper[index]))
    if cap_bottom and len(rings[0]) > 1:
        faces.append(tuple(reversed(rings[0])))
    if cap_top and len(rings[-1]) > 1:
        faces.append(tuple(rings[-1]))
    return vertices, faces


# ---------------------------------------------------------------------------
# Scene & collection utilities
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
    empty.empty_display_size = 0.45
    link_object(empty, col or bpy.context.scene.collection)
    if parent is not None:
        empty.parent = parent
    return empty


def set_smooth(mesh: bpy.types.Mesh, smooth: bool = True):
    if len(mesh.polygons) > 0:
        mesh.polygons.foreach_set("use_smooth", [smooth] * len(mesh.polygons))


def auto_uv_box(mesh: bpy.types.Mesh, scale: float = 0.25):
    """Assign clean deterministic triplanar-box UVs so packed textures never stretch."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv_layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        n = face.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in face.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                u, v = co.x * scale, co.y * scale
            elif ay >= ax and ay >= az:
                u, v = co.x * scale, co.z * scale
            else:
                u, v = co.y * scale, co.z * scale
            loop[uv_layer].uv = (u, v)
    bm.to_mesh(mesh)
    bm.free()


def finish_mesh_object(
    name: str,
    bm: bmesh.types.BMesh,
    material,
    col,
    parent=None,
    location=(0.0, 0.0, 0.0),
    rotation=(0.0, 0.0, 0.0),
    smooth: bool = True,
    uv_scale: float = 0.22,
    auto_uv: bool = True,
    recalc_normals: bool = True,
):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    if recalc_normals:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if auto_uv:
        auto_uv_box(mesh, scale=uv_scale)
    set_smooth(mesh, smooth)
    if material is not None:
        if isinstance(material, (list, tuple)):
            for m in material:
                mesh.materials.append(m)
        else:
            mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.rotation_euler = rotation
    link_object(obj, col)
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
    uv_scale: float = 0.35,
    custom_uv_fn=None,
):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if custom_uv_fn is not None:
        uv_layer = bm.loops.layers.uv.verify()
        for face in bm.faces:
            for loop in face.loops:
                loop[uv_layer].uv = custom_uv_fn(loop.vert.co)
    bm.to_mesh(mesh)
    bm.free()
    if custom_uv_fn is None:
        auto_uv_box(mesh, scale=uv_scale)
    set_smooth(mesh, smooth)
    if material is not None:
        mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.rotation_euler = rotation
    link_object(obj, col)
    if parent is not None:
        obj.parent = parent
    return obj


# ---------------------------------------------------------------------------
# Packed procedural PNG textures (glTF-safe, lightweight, zero external files)
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

    # 1. Warm Porcelain Ceramic enamel (tileable micro-speckle & subtle panel seams)
    sz = 512
    yy, xx = np.mgrid[0:sz, 0:sz] / float(sz)
    wave = (
        0.5 * np.sin(xx * math.tau * 2.0 + np.cos(yy * math.tau * 2.0) * 0.4)
        + 0.3 * np.cos(yy * math.tau * 3.0)
        + 0.2 * np.sin((xx + yy) * math.tau * 5.0)
    )
    grain = rng.normal(0.0, 1.0, (sz, sz))
    grain_s = (
        grain
        + np.roll(grain, 1, 0) + np.roll(grain, -1, 0)
        + np.roll(grain, 1, 1) + np.roll(grain, -1, 1)
    ) / 5.0
    seam_x = np.exp(-((np.minimum(xx % 0.5, 0.5 - (xx % 0.5))) / 0.0030) ** 2)
    seam_y = np.exp(-((np.minimum(yy % 0.5, 0.5 - (yy % 0.5))) / 0.0030) ** 2)
    seam = np.clip(np.maximum(seam_x, seam_y), 0.0, 1.0)

    porc = np.ones((sz, sz, 4), dtype=np.float32)
    porc[..., 0] = 0.948 + 0.012 * wave + 0.009 * grain_s - 0.055 * seam
    porc[..., 1] = 0.875 + 0.011 * wave + 0.008 * grain_s - 0.058 * seam
    porc[..., 2] = 0.788 + 0.010 * wave + 0.008 * grain_s - 0.052 * seam
    textures["porcelain_albedo"] = create_packed_image("Tex_HullPorcelain_Albedo", porc, "sRGB")

    porc_r = np.ones((sz, sz, 4), dtype=np.float32)
    r_val = 0.35 + 0.04 * wave + 0.03 * grain_s + 0.22 * seam
    porc_r[..., 0] = porc_r[..., 1] = porc_r[..., 2] = np.clip(r_val, 0.22, 0.75)
    textures["porcelain_rough"] = create_packed_image("Tex_HullPorcelain_Rough", porc_r, "Non-Color")

    # 2. Warm Apricot Enamel paint (matches Apricot limewash)
    apri = np.ones((sz, sz, 4), dtype=np.float32)
    apri[..., 0] = 0.892 + 0.016 * wave + 0.010 * grain_s - 0.065 * seam
    apri[..., 1] = 0.678 + 0.014 * wave + 0.009 * grain_s - 0.060 * seam
    apri[..., 2] = 0.568 + 0.012 * wave + 0.009 * grain_s - 0.052 * seam
    textures["apricot_albedo"] = create_packed_image("Tex_HullApricot_Albedo", apri, "sRGB")

    # 3. Photovoltaic Solar Cell array (midnight indigo wafers + champagne-gold busbars)
    s_sz = 512
    sy, sx = np.mgrid[0:s_sz, 0:s_sz] / float(s_sz)
    cx = (sx * 8.0) % 1.0
    cy = (sy * 4.0) % 1.0
    dx = np.minimum(cx, 1.0 - cx)
    dy = np.minimum(cy, 1.0 - cy)
    cell_gap = ((dx < 0.032) | (dy < 0.038)).astype(np.float32)
    corner_chamfer = ((dx + dy) < 0.115).astype(np.float32)
    busbar = (np.abs(cx - 0.5) < 0.015).astype(np.float32)
    micro_finger = (np.minimum((cy * 10.0) % 1.0, 1.0 - ((cy * 10.0) % 1.0)) < 0.045).astype(np.float32)

    cell_idx_x = np.floor(sx * 8.0)
    cell_idx_y = np.floor(sy * 4.0)
    cell_var = np.sin(cell_idx_x * 2.7 + cell_idx_y * 4.1) * 0.025

    solar = np.ones((s_sz, s_sz, 4), dtype=np.float32)
    solar[..., 0] = 0.155 + cell_var + 0.028 * np.sin(sy * math.pi)
    solar[..., 1] = 0.205 + cell_var + 0.020 * np.cos(sx * math.pi)
    solar[..., 2] = 0.390 + cell_var * 1.3 + 0.040 * np.sin((sx + sy) * math.pi)

    mf = micro_finger * (1.0 - cell_gap) * 0.25
    solar[..., 0] = solar[..., 0] * (1.0 - mf) + 0.72 * mf
    solar[..., 1] = solar[..., 1] * (1.0 - mf) + 0.62 * mf
    solar[..., 2] = solar[..., 2] * (1.0 - mf) + 0.45 * mf

    gold_mask = np.clip(busbar + corner_chamfer * 0.9, 0.0, 1.0) * (1.0 - cell_gap)
    solar[..., 0] = solar[..., 0] * (1.0 - gold_mask) + 0.86 * gold_mask
    solar[..., 1] = solar[..., 1] * (1.0 - gold_mask) + 0.70 * gold_mask
    solar[..., 2] = solar[..., 2] * (1.0 - gold_mask) + 0.42 * gold_mask

    solar[..., 0] = solar[..., 0] * (1.0 - cell_gap) + 0.10 * cell_gap
    solar[..., 1] = solar[..., 1] * (1.0 - cell_gap) + 0.11 * cell_gap
    solar[..., 2] = solar[..., 2] * (1.0 - cell_gap) + 0.16 * cell_gap
    textures["solar_albedo"] = create_packed_image("Tex_SolarPanel_Albedo", solar, "sRGB")

    solar_r = np.ones((s_sz, s_sz, 4), dtype=np.float32)
    sr = 0.17 + 0.38 * cell_gap + 0.14 * gold_mask
    solar_r[..., 0] = solar_r[..., 1] = solar_r[..., 2] = np.clip(sr, 0.12, 0.65)
    textures["solar_rough"] = create_packed_image("Tex_SolarPanel_Rough", solar_r, "Non-Color")

    # 4. Rich Cozy Interior Window Glow (deep warm cabin depth + glowing honey-amber lamps)
    wy, wx = np.mgrid[0:256, 0:512]
    u = wx / 512.0
    v = wy / 256.0
    # Cozy warm room vignette: darker warm walnut-plum shadow near ceiling/edges, rich honey lamp pools inside
    lamp_dist = np.hypot((u - 0.25) * 1.65, (v - 0.48) * 1.35)
    desk_dist = np.hypot((u - 0.72) * 1.45, (v - 0.44) * 1.35)
    lamp_pool = np.exp(-lamp_dist * lamp_dist * 4.2) * 1.05
    desk_pool = np.exp(-desk_dist * desk_dist * 5.0) * 0.68
    edge_vig = np.clip(1.0 - 0.55 * ((u - 0.5) * 2.0) ** 4 - 0.45 * ((v - 0.46) * 2.0) ** 2, 0.22, 1.0)
    # Subtle lower warm-wood furniture horizon band for interior depth illusion
    furniture_band = 1.0 - 0.32 * np.clip((0.26 - v) / 0.26, 0.0, 1.0)
    base_warm = edge_vig * furniture_band

    win = np.ones((256, 512, 4), dtype=np.float32)
    win[..., 0] = np.clip(0.56 * base_warm + 0.46 * lamp_pool + 0.36 * desk_pool, 0.0, 1.0)
    win[..., 1] = np.clip(0.28 * base_warm + 0.44 * lamp_pool + 0.30 * desk_pool, 0.0, 1.0)
    win[..., 2] = np.clip(0.16 * base_warm + 0.24 * lamp_pool + 0.16 * desk_pool, 0.0, 1.0)
    textures["window_glow"] = create_packed_image("Tex_CabinWindow_Glow", win, "sRGB")

    # 5. Ethereal Thruster Exhaust Plume Gradient (RGBA fade: bright aqua-gold core -> indigo-cyan -> transparent tip)
    py, px = np.mgrid[0:128, 0:64]
    t = py / 127.0  # 0 at nozzle exit -> 1 at plume tip
    plume = np.zeros((128, 64, 4), dtype=np.float32)
    # Color transitions from hot cream-cyan at throat to sapphire-aqua mid to dreamy indigo tail
    plume[..., 0] = np.clip(0.88 * np.exp(-t * 4.2) + 0.22 * (1.0 - t), 0.0, 1.0)
    plume[..., 1] = np.clip(0.95 * np.exp(-t * 2.0) + 0.45 * (1.0 - t) ** 1.3, 0.0, 1.0)
    plume[..., 2] = np.clip(1.00 * np.exp(-t * 0.9) + 0.35 * (1.0 - t), 0.0, 1.0)
    # Smooth feathered alpha fade: 0 at tip, soft peak near throat
    alpha_fade = np.sin(np.clip(t / 0.14, 0.0, 1.0) * math.pi * 0.5) * ((1.0 - t) ** 2.15) * 0.72
    plume[..., 3] = np.clip(alpha_fade, 0.0, 1.0)
    textures["plume_grad"] = create_packed_image("Tex_ThrusterPlume_Grad", plume, "sRGB")

    return textures


# ---------------------------------------------------------------------------
# Materials (glTF-friendly Principled BSDF with packed image maps)
# ---------------------------------------------------------------------------
def build_materials(textures):
    mats = {}

    def make_pbr(
        name,
        base_color=(0.8, 0.8, 0.8, 1.0),
        metallic=0.0,
        roughness=0.45,
        albedo_img=None,
        rough_img=None,
        emission_color=None,
        emission_strength=0.0,
        emission_img=None,
        rgba_emissive_img=None,
        alpha=1.0,
        coat=0.0,
    ):
        mat = bpy.data.materials.new(name=name)
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        out.location = (440, 0)
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.location = (110, 0)
        bsdf.inputs["Base Color"].default_value = base_color
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Alpha"].default_value = alpha
        if "Coat Weight" in bsdf.inputs and coat > 0.0:
            bsdf.inputs["Coat Weight"].default_value = coat
            bsdf.inputs["Coat Roughness"].default_value = 0.16
        if rgba_emissive_img is not None:
            tex = nt.nodes.new("ShaderNodeTexImage")
            tex.image = rgba_emissive_img
            tex.extension = "EXTEND"
            tex.location = (-280, 0)
            nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
            nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
            nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
            bsdf.inputs["Emission Strength"].default_value = emission_strength
            if hasattr(mat, "surface_render_method"):
                mat.surface_render_method = "BLENDED"
            mat.use_backface_culling = False
        else:
            if albedo_img is not None:
                tex = nt.nodes.new("ShaderNodeTexImage")
                tex.image = albedo_img
                tex.location = (-280, 180)
                nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
            if rough_img is not None:
                rtex = nt.nodes.new("ShaderNodeTexImage")
                rtex.image = rough_img
                rtex.location = (-280, -80)
                nt.links.new(rtex.outputs["Color"], bsdf.inputs["Roughness"])
            if emission_img is not None:
                etex = nt.nodes.new("ShaderNodeTexImage")
                etex.image = emission_img
                etex.location = (-280, -320)
                nt.links.new(etex.outputs["Color"], bsdf.inputs["Base Color"])
                nt.links.new(etex.outputs["Color"], bsdf.inputs["Emission Color"])
                bsdf.inputs["Emission Strength"].default_value = emission_strength
            elif emission_color is not None and emission_strength > 0.0:
                bsdf.inputs["Emission Color"].default_value = emission_color
                bsdf.inputs["Emission Strength"].default_value = emission_strength
            if alpha < 0.999:
                if hasattr(mat, "surface_render_method"):
                    mat.surface_render_method = "BLENDED"
                mat.use_backface_culling = False
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        return mat

    mats["porcelain"] = make_pbr(
        "Hull_Porcelain",
        base_color=(0.896, 0.760, 0.625, 1.0),
        metallic=0.04,
        roughness=0.36,
        albedo_img=textures["porcelain_albedo"],
        rough_img=textures["porcelain_rough"],
        coat=0.18,
    )
    mats["apricot"] = make_pbr(
        "Hull_Apricot",
        base_color=(0.791, 0.454, 0.325, 1.0),
        metallic=0.05,
        roughness=0.40,
        albedo_img=textures["apricot_albedo"],
        rough_img=textures["porcelain_rough"],
        coat=0.12,
    )
    mats["rose"] = make_pbr(
        "Hull_RoseStripe",
        base_color=(0.640, 0.235, 0.228, 1.0),
        metallic=0.06,
        roughness=0.38,
        coat=0.12,
    )
    mats["vanilla"] = make_pbr(
        "Hull_VanillaTrim",
        base_color=(0.840, 0.675, 0.525, 1.0),
        metallic=0.04,
        roughness=0.42,
    )
    mats["brass"] = make_pbr(
        "Hull_BrushedBrass",
        base_color=(0.685, 0.450, 0.188, 1.0),
        metallic=0.82,
        roughness=0.27,
    )
    mats["slate"] = make_pbr(
        "Hull_CharcoalSlate",
        base_color=(0.130, 0.128, 0.158, 1.0),
        metallic=0.38,
        roughness=0.46,
    )
    mats["titanium"] = make_pbr(
        "Hull_NozzleBronze",
        base_color=(0.240, 0.205, 0.200, 1.0),
        metallic=0.72,
        roughness=0.34,
    )
    mats["solar"] = make_pbr(
        "Hull_SolarCells",
        base_color=(0.06, 0.09, 0.22, 1.0),
        metallic=0.32,
        roughness=0.20,
        albedo_img=textures["solar_albedo"],
        rough_img=textures["solar_rough"],
        coat=0.28,
    )
    # Glossy deep-sapphire tinted viewport glazing (clear contrast over warm cabin glow)
    mats["glass"] = make_pbr(
        "Hull_ViewportGlass",
        base_color=(0.16, 0.24, 0.36, 1.0),
        metallic=0.12,
        roughness=0.07,
        alpha=0.26,
        coat=0.60,
    )
    # Richer dark-tinted bridge visor glass for bow cockpit canopy
    mats["canopy_glass"] = make_pbr(
        "Hull_BowCanopyGlass",
        base_color=(0.08, 0.14, 0.26, 1.0),
        metallic=0.18,
        roughness=0.06,
        alpha=0.52,
        coat=0.75,
    )
    mats["window_glow"] = make_pbr(
        "Hull_CabinWarmGlow",
        base_color=(0.92, 0.56, 0.26, 1.0),
        metallic=0.0,
        roughness=0.85,
        emission_img=textures["window_glow"],
        emission_strength=1.25,
    )
    mats["thruster_core"] = make_pbr(
        "Hull_ThrusterCore",
        base_color=(0.24, 0.72, 1.0, 1.0),
        metallic=0.0,
        roughness=0.20,
        emission_color=(0.30, 0.76, 1.0, 1.0),
        emission_strength=2.4,
    )
    mats["thruster_plume"] = make_pbr(
        "Hull_ThrusterPlume",
        base_color=(0.18, 0.58, 0.96, 1.0),
        metallic=0.0,
        roughness=1.0,
        rgba_emissive_img=textures["plume_grad"],
        emission_strength=2.2,
    )
    mats["beacon_rose"] = make_pbr(
        "Hull_BeaconPort",
        base_color=(0.95, 0.30, 0.34, 1.0),
        roughness=0.18,
        emission_color=(1.0, 0.34, 0.36, 1.0),
        emission_strength=2.8,
    )
    mats["beacon_mint"] = make_pbr(
        "Hull_BeaconStarboard",
        base_color=(0.32, 0.88, 0.76, 1.0),
        roughness=0.18,
        emission_color=(0.34, 0.92, 0.80, 1.0),
        emission_strength=2.8,
    )
    mats["beacon_amber"] = make_pbr(
        "Hull_BeaconAmber",
        base_color=(1.0, 0.78, 0.42, 1.0),
        roughness=0.18,
        emission_color=(1.0, 0.80, 0.44, 1.0),
        emission_strength=3.0,
    )
    return mats


# ---------------------------------------------------------------------------
# Analytic fuselage cross-section evaluator (shared by hull, seams, windows)
# ---------------------------------------------------------------------------
def smoothstep(e0: float, e1: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


def hull_section_params(x: float):
    """Return (ry, rz_up, rz_down, z_center, superellipse_n) at longitudinal station x."""
    if HULL_X_MID_AFT <= x <= HULL_X_MID_FORE:
        u = (x - CX) / ((HULL_X_MID_FORE - HULL_X_MID_AFT) * 0.5)
        swell = 1.0 + 0.032 * max(0.0, 1.0 - u * u)
        return HULL_RY * swell, HULL_RZ_UP * swell, HULL_RZ_DOWN * swell, CZ, 3.6

    if x > HULL_X_MID_FORE:
        t = max(0.0, min(1.0, (x - HULL_X_MID_FORE) / (HULL_X_BOW - HULL_X_MID_FORE)))
        profile = math.sqrt(max(0.0, 1.0 - (t ** 1.85) * 0.875))
        zc = CZ - 0.18 * (t ** 1.4)
        exp_n = 3.6 - 1.5 * smoothstep(0.0, 0.85, t)
        return HULL_RY * profile, HULL_RZ_UP * profile, HULL_RZ_DOWN * profile, zc, exp_n

    t = max(0.0, min(1.0, (HULL_X_MID_AFT - x) / (HULL_X_MID_AFT - HULL_X_STERN)))
    profile = math.sqrt(max(0.0, 1.0 - (t ** 1.75) * 0.42))
    zc = CZ - 0.12 * (t ** 1.3)
    exp_n = 3.6 - 0.8 * smoothstep(0.0, 1.0, t)
    return HULL_RY * profile, HULL_RZ_UP * profile, HULL_RZ_DOWN * profile, zc, exp_n


def eval_hull_point(x: float, theta: float, inset: float = 0.0) -> Vector:
    """Evaluate point on outer (or inset) fuselage shell at (x, theta)."""
    ry, rz_up, rz_down, zc, n = hull_section_params(x)
    ry = max(0.08, ry - inset)
    rz_up = max(0.08, rz_up - inset)
    rz_down = max(0.08, rz_down - inset)

    c = math.cos(theta)
    s = math.sin(theta)
    p = 2.0 / n
    sy = math.copysign(abs(c) ** p, c)
    sz = math.copysign(abs(s) ** p, s)
    rz = rz_up if sz >= 0.0 else rz_down
    return Vector((x, CY + ry * sy, zc + rz * sz))


def hull_y_at_xz(x: float, z: float, side: int = -1, inset: float = 0.0) -> float:
    """Compute exact outer hull Y coordinate on side (-1 = front/-Y, +1 = back/+Y) at (x, z)."""
    ry, rz_up, rz_down, zc, n = hull_section_params(x)
    ry = max(0.08, ry - inset)
    rz = max(0.08, (rz_up if z >= zc else rz_down) - inset)
    dz = max(-0.98, min(0.98, (z - zc) / rz))
    rem = max(0.0, 1.0 - abs(dz) ** n)
    sy = rem ** (1.0 / n)
    return CY + side * ry * sy


def hull_z_at_xy(x: float, y: float, top: bool = True, inset: float = 0.0) -> float:
    """Compute exact outer hull Z coordinate on roof (top=True) or belly (top=False) at (x, y)."""
    ry, rz_up, rz_down, zc, n = hull_section_params(x)
    ry = max(0.08, ry - inset)
    rz = max(0.08, (rz_up if top else rz_down) - inset)
    dy = max(-0.98, min(0.98, (y - CY) / ry))
    rem = max(0.0, 1.0 - abs(dy) ** n)
    sz = rem ** (1.0 / n)
    return zc + (rz * sz if top else -rz * sz)


def stadium_2d_loop(w: float, h: float, radius: float, segs_corner: int = 8):
    r = min(radius, w * 0.48, h * 0.48)
    hx = w * 0.5 - r
    hy = h * 0.5 - r
    corners = [
        (hx, hy, 0.0, math.pi * 0.5),
        (-hx, hy, math.pi * 0.5, math.pi),
        (-hx, -hy, math.pi, math.pi * 1.5),
        (hx, -hy, math.pi * 1.5, math.tau),
    ]
    pts = []
    for cx, cy, a0, a1 in corners:
        for i in range(segs_corner + 1):
            if i == segs_corner and len(pts) > 0:
                continue
            a = a0 + (a1 - a0) * (i / float(segs_corner))
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def inside_stadium(u: float, v: float, w: float, h: float, radius: float) -> bool:
    r = min(radius, w * 0.48, h * 0.48)
    dx = max(0.0, abs(u) - (w * 0.5 - r))
    dy = max(0.0, abs(v) - (h * 0.5 - r))
    return (dx * dx + dy * dy) <= r * r


# ---------------------------------------------------------------------------
# 1. Primary Fuselage Loft (clean quad-aligned material split, zero stair-step!)
# ---------------------------------------------------------------------------
def build_fuselage(mats, col, root):
    xs = []
    for i in range(10):
        t = i / 10.0
        xs.append(HULL_X_STERN + (HULL_X_MID_AFT - HULL_X_STERN) * t)
    n_mid = 36
    for i in range(n_mid + 1):
        t = i / float(n_mid)
        xs.append(HULL_X_MID_AFT + (HULL_X_MID_FORE - HULL_X_MID_AFT) * t)
    for i in range(1, 15):
        t = i / 14.0
        xs.append(HULL_X_MID_FORE + (HULL_X_BOW - HULL_X_MID_FORE) * t)

    n_theta = 72  # exact 5-degree steps -> split along constant theta line gives razor-clean seam!
    wall_thickness = 0.24

    # Material slots: 0 = porcelain (upper), 1 = apricot (lower), 2 = slate (inner/belly/stern)
    hull_mats = [mats["porcelain"], mats["apricot"], mats["slate"]]

    # Exact constant angular waist line (theta_waist = -20 deg on +Y side, 200 deg on -Y side)
    # With n_theta = 72, j=68 is 340 deg (-20 deg), j=40 is 200 deg -> perfectly smooth curve along the entire hull!
    j_split_back = 68   # theta = 340 deg (-20 deg, Z ~ 0.68 at mid-hull)
    j_split_front = 40  # theta = 200 deg (Z ~ 0.68 at mid-hull)
    # Belly thermal heat-shield angular band: j in [47..60] (235 deg .. 305 deg, bottom keel)
    j_belly_start = 48
    j_belly_end = 60

    front_cx = (FRONT_WIN_X0 + FRONT_WIN_X1) * 0.5
    front_cz = (FRONT_WIN_Z0 + FRONT_WIN_Z1) * 0.5
    front_w = (FRONT_WIN_X1 - FRONT_WIN_X0) - 0.16
    front_h = (FRONT_WIN_Z1 - FRONT_WIN_Z0) - 0.16

    back_cx = (BACK_WIN_X0 + BACK_WIN_X1) * 0.5
    back_cz = (BACK_WIN_Z0 + BACK_WIN_Z1) * 0.5
    back_w = (BACK_WIN_X1 - BACK_WIN_X0) - 0.16
    back_h = (BACK_WIN_Z1 - BACK_WIN_Z0) - 0.16

    def is_cutout_face(p: Vector) -> bool:
        if p.y < CY - 2.5 and inside_stadium(p.x - front_cx, p.z - front_cz, front_w, front_h, 0.52):
            return True
        if p.y > CY + 2.5 and inside_stadium(p.x - back_cx, p.z - back_cz, back_w, back_h, 0.45):
            return True
        return False

    def face_mat_idx(ix: int, j: int, is_inner: bool) -> int:
        if is_inner:
            return 2
        if j_belly_start <= j < j_belly_end and 8 <= ix <= len(xs) - 14:
            return 2  # dark slate ventral thermal keel
        if j_split_front <= j < j_split_back:
            return 1  # warm apricot lower hull (razor-smooth loop edge!)
        return 0  # warm porcelain upper hull

    bm = bmesh.new()
    outer_rings = []
    inner_rings = []
    for x in xs:
        o_ring = []
        i_ring = []
        for j in range(n_theta):
            th = math.tau * j / float(n_theta)
            o_ring.append(bm.verts.new(eval_hull_point(x, th, inset=0.0)))
            i_ring.append(bm.verts.new(eval_hull_point(x, th, inset=wall_thickness)))
        outer_rings.append(o_ring)
        inner_rings.append(i_ring)

    keep_grid = [[True] * n_theta for _ in range(len(xs) - 1)]
    for ix in range(len(xs) - 1):
        for j in range(n_theta):
            jn = (j + 1) % n_theta
            center = (
                outer_rings[ix][j].co
                + outer_rings[ix + 1][j].co
                + outer_rings[ix + 1][jn].co
                + outer_rings[ix][jn].co
            ) * 0.25
            if is_cutout_face(center):
                keep_grid[ix][j] = False
                continue
            f_out = bm.faces.new((
                outer_rings[ix][j],
                outer_rings[ix][jn],
                outer_rings[ix + 1][jn],
                outer_rings[ix + 1][j],
            ))
            f_out.material_index = face_mat_idx(ix, j, is_inner=False)

            f_in = bm.faces.new((
                inner_rings[ix][j],
                inner_rings[ix + 1][j],
                inner_rings[ix + 1][jn],
                inner_rings[ix][jn],
            ))
            f_in.material_index = 2

    # Bridge cutout borders between outer & inner skin
    for ix in range(len(xs) - 1):
        for j in range(n_theta):
            if not keep_grid[ix][j]:
                continue
            jn = (j + 1) % n_theta
            if ix > 0 and not keep_grid[ix - 1][j]:
                f = bm.faces.new((outer_rings[ix][j], inner_rings[ix][j], inner_rings[ix][jn], outer_rings[ix][jn]))
                f.material_index = 2
            if ix < len(xs) - 2 and not keep_grid[ix + 1][j]:
                f = bm.faces.new((outer_rings[ix + 1][jn], inner_rings[ix + 1][jn], inner_rings[ix + 1][j], outer_rings[ix + 1][j]))
                f.material_index = 2
            j_prev = (j - 1) % n_theta
            if not keep_grid[ix][j_prev]:
                f = bm.faces.new((outer_rings[ix][j], outer_rings[ix + 1][j], inner_rings[ix + 1][j], inner_rings[ix][j]))
                f.material_index = 2
            if not keep_grid[ix][jn]:
                f = bm.faces.new((outer_rings[ix + 1][jn], outer_rings[ix][jn], inner_rings[ix][jn], inner_rings[ix + 1][jn]))
                f.material_index = 2

    # Cap stern bulkhead cleanly inside exact stern ring (zero overhang!)
    stern_center_out = bm.verts.new((HULL_X_STERN + 0.16, CY, CZ - 0.12))
    stern_center_in = bm.verts.new((HULL_X_STERN + 0.36, CY, CZ - 0.12))
    for j in range(n_theta):
        jn = (j + 1) % n_theta
        f1 = bm.faces.new((outer_rings[0][jn], outer_rings[0][j], stern_center_out))
        f1.material_index = 2
        f2 = bm.faces.new((inner_rings[0][j], inner_rings[0][jn], stern_center_in))
        f2.material_index = 2

    # Cap bow nose cleanly
    bow_center_out = bm.verts.new((HULL_X_BOW + 0.10, CY, CZ - 0.18))
    bow_center_in = bm.verts.new((HULL_X_BOW - 0.16, CY, CZ - 0.18))
    for j in range(n_theta):
        jn = (j + 1) % n_theta
        f1 = bm.faces.new((outer_rings[-1][j], outer_rings[-1][jn], bow_center_out))
        f1.material_index = 0
        f2 = bm.faces.new((inner_rings[-1][jn], inner_rings[-1][j], bow_center_in))
        f2.material_index = 2

    unused = [v for v in bm.verts if not v.link_faces]
    if unused:
        bmesh.ops.delete(bm, geom=unused, context="VERTS")

    hull_obj = finish_mesh_object("Hull_MainBody", bm, hull_mats, col, parent=root, smooth=True, uv_scale=0.18)

    # Flush super-elliptical recessed stern thermal bulkhead + brass rim (fits stern cross-section 100%!)
    bm_st = bmesh.new()
    st_r0 = [bm_st.verts.new(eval_hull_point(HULL_X_STERN, math.tau * j / n_theta, inset=0.06)) for j in range(n_theta)]
    st_r1 = [bm_st.verts.new(eval_hull_point(HULL_X_STERN - 0.08, math.tau * j / n_theta, inset=0.14)) for j in range(n_theta)]
    st_r2 = [bm_st.verts.new(eval_hull_point(HULL_X_STERN - 0.02, math.tau * j / n_theta, inset=0.34)) for j in range(n_theta)]
    st_c = bm_st.verts.new((HULL_X_STERN - 0.04, CY, CZ - 0.12))
    for j in range(n_theta):
        jn = (j + 1) % n_theta
        f_a = bm_st.faces.new((st_r0[jn], st_r0[j], st_r1[j], st_r1[jn]))
        f_a.material_index = 1  # brass rim
        f_b = bm_st.faces.new((st_r1[jn], st_r1[j], st_r2[j], st_r2[jn]))
        f_b.material_index = 1
        f_c = bm_st.faces.new((st_r2[jn], st_r2[j], st_c))
        f_c.material_index = 0  # slate thermal plate
    finish_mesh_object("Stern_BulkheadPlate", bm_st, [mats["slate"], mats["brass"]], col, parent=root, smooth=True, uv_scale=0.35)

    # Structural circumferential bulkhead collars (aft & fore)
    for label, x_pos, width, rad_out, mat_key in [
        ("Hull_Collar_Aft", HULL_X_MID_AFT, 0.28, 0.085, "vanilla"),
        ("Hull_Collar_AftBrass", HULL_X_MID_AFT, 0.10, 0.118, "brass"),
        ("Hull_Collar_Fore", HULL_X_MID_FORE, 0.28, 0.085, "vanilla"),
        ("Hull_Collar_ForeBrass", HULL_X_MID_FORE, 0.10, 0.118, "brass"),
    ]:
        bm_c = bmesh.new()
        profile_x = [
            (x_pos - width * 0.5, -0.02),
            (x_pos - width * 0.36, rad_out),
            (x_pos + width * 0.36, rad_out),
            (x_pos + width * 0.5, -0.02),
        ]
        rings = [
            [bm_c.verts.new(eval_hull_point(px, math.tau * j / n_theta, inset=-off)) for j in range(n_theta)]
            for px, off in profile_x
        ]
        for ri in range(len(rings) - 1):
            for j in range(n_theta):
                jn = (j + 1) % n_theta
                bm_c.faces.new((rings[ri][j], rings[ri][jn], rings[ri + 1][jn], rings[ri + 1][j]))
        for j in range(n_theta):
            jn = (j + 1) % n_theta
            bm_c.faces.new((rings[-1][j], rings[-1][jn], rings[0][jn], rings[0][j]))
        finish_mesh_object(label, bm_c, mats[mat_key], col, parent=root, smooth=True, uv_scale=0.35)

    # Razor-smooth sculpted Dusty-Rose accent stripe + Brushed-Brass belt along the EXACT waist theta seam!
    def build_waist_band(name: str, th_offset_deg: float, half_span_deg: float, proud: float, mat):
        bm_b = bmesh.new()
        for base_th_deg in (200.0, 340.0):
            sign = 1.0 if base_th_deg < 270.0 else -1.0  # keep upward offset consistent on both flanks
            c_th = math.radians(base_th_deg - sign * th_offset_deg)
            d_th = math.radians(half_span_deg)
            prev = None
            for x in xs[1:-2]:
                ring = [
                    bm_b.verts.new(eval_hull_point(x, c_th - d_th, inset=0.02)),
                    bm_b.verts.new(eval_hull_point(x, c_th - d_th * 0.78, inset=-proud)),
                    bm_b.verts.new(eval_hull_point(x, c_th + d_th * 0.78, inset=-proud)),
                    bm_b.verts.new(eval_hull_point(x, c_th + d_th, inset=0.02)),
                ]
                if prev is not None:
                    for k in range(4):
                        kn = (k + 1) % 4
                        bm_b.faces.new((prev[k], prev[kn], ring[kn], ring[k]))
                prev = ring
            # Cap fore and aft ends of strip
            if prev is not None:
                bm_b.faces.new(tuple(prev))
        finish_mesh_object(name, bm_b, mat, col, parent=root, smooth=True, uv_scale=0.45)

    build_waist_band("Hull_RoseAccentBand", th_offset_deg=1.4, half_span_deg=1.7, proud=0.032, mat=mats["rose"])
    build_waist_band("Hull_BrassBeltTrim", th_offset_deg=3.4, half_span_deg=0.75, proud=0.056, mat=mats["brass"])

    return hull_obj


# ---------------------------------------------------------------------------
# 2. Recessed Panoramic & Bay Windows + Portholes + Forward Bridge Canopy
# ---------------------------------------------------------------------------
def build_stadium_viewport(
    name_prefix: str,
    cx: float,
    cz: float,
    width: float,
    height: float,
    corner_r: float,
    side: int,
    mullion_xs,
    mats,
    col_shell,
    col_win,
    root_shell,
    root_win,
):
    outer_pts = stadium_2d_loop(width + 0.44, height + 0.44, corner_r + 0.18, segs_corner=7)
    mid_pts = stadium_2d_loop(width + 0.16, height + 0.16, corner_r + 0.06, segs_corner=7)
    inner_pts = stadium_2d_loop(width - 0.04, height - 0.04, corner_r, segs_corner=7)
    n = len(outer_pts)

    def pt_on_hull(u, v, proud):
        x = cx + u
        z = cz + v
        y = hull_y_at_xz(x, z, side=side, inset=-proud)
        return Vector((x, y, z))

    # A. Cream Porcelain outer cowling fairing
    bm_cowl = bmesh.new()
    loops = [
        [bm_cowl.verts.new(pt_on_hull(u, v, -0.08)) for u, v in outer_pts],
        [bm_cowl.verts.new(pt_on_hull(u, v, 0.14)) for u, v in outer_pts],
        [bm_cowl.verts.new(pt_on_hull(u, v, 0.19)) for u, v in mid_pts],
        [bm_cowl.verts.new(pt_on_hull(u, v, -0.28)) for u, v in inner_pts],
        [bm_cowl.verts.new(pt_on_hull(u, v, -0.32)) for u, v in outer_pts],
    ]
    for li in range(len(loops)):
        ln = (li + 1) % len(loops)
        for i in range(n):
            inext = (i + 1) % n
            bm_cowl.faces.new((loops[li][i], loops[li][inext], loops[ln][inext], loops[ln][i]))
    finish_mesh_object(f"{name_prefix}_Cowl", bm_cowl, mats["porcelain"], col_shell, parent=root_shell, smooth=True, uv_scale=0.3)

    # B. Brushed Brass inner trim ring (crisp proud rim)
    bm_bezel = bmesh.new()
    b_outer = stadium_2d_loop(width + 0.13, height + 0.13, corner_r + 0.05, segs_corner=7)
    b_inner = stadium_2d_loop(width - 0.06, height - 0.06, corner_r - 0.01, segs_corner=7)
    b_loops = [
        [bm_bezel.verts.new(pt_on_hull(u, v, 0.06)) for u, v in b_outer],
        [bm_bezel.verts.new(pt_on_hull(u, v, 0.165)) for u, v in b_outer],
        [bm_bezel.verts.new(pt_on_hull(u, v, 0.165)) for u, v in b_inner],
        [bm_bezel.verts.new(pt_on_hull(u, v, -0.14)) for u, v in b_inner],
    ]
    for li in range(len(b_loops)):
        ln = (li + 1) % len(b_loops)
        for i in range(n):
            inext = (i + 1) % n
            bm_bezel.faces.new((b_loops[li][i], b_loops[li][inext], b_loops[ln][inext], b_loops[ln][i]))
    finish_mesh_object(f"{name_prefix}_BrassBezel", bm_bezel, mats["brass"], col_shell, parent=root_shell, smooth=True, uv_scale=0.5)

    # C. Dark Slate inner seal gasket
    bm_gask = bmesh.new()
    g_outer = stadium_2d_loop(width - 0.03, height - 0.03, corner_r, segs_corner=7)
    g_inner = stadium_2d_loop(width - 0.16, height - 0.16, max(0.05, corner_r - 0.05), segs_corner=7)
    g_loops = [
        [bm_gask.verts.new(pt_on_hull(u, v, 0.01)) for u, v in g_outer],
        [bm_gask.verts.new(pt_on_hull(u, v, 0.065)) for u, v in g_inner],
        [bm_gask.verts.new(pt_on_hull(u, v, -0.22)) for u, v in g_inner],
        [bm_gask.verts.new(pt_on_hull(u, v, -0.22)) for u, v in g_outer],
    ]
    for li in range(len(g_loops)):
        ln = (li + 1) % len(g_loops)
        for i in range(n):
            inext = (i + 1) % n
            bm_gask.faces.new((g_loops[li][i], g_loops[li][inext], g_loops[ln][inext], g_loops[ln][i]))
    finish_mesh_object(f"{name_prefix}_Gasket", bm_gask, mats["slate"], col_shell, parent=root_shell, smooth=True, uv_scale=0.5)

    # D. Vertical Brass Mullions
    if mullion_xs:
        bm_mul = bmesh.new()
        for mx in mullion_xs:
            n_z = 12
            prev = None
            for iz in range(n_z + 1):
                z = (cz - height * 0.5 + 0.02) + (height - 0.04) * (iz / float(n_z))
                ring = [
                    bm_mul.verts.new((mx - 0.045, hull_y_at_xz(mx - 0.045, z, side=side, inset=0.14), z)),
                    bm_mul.verts.new((mx - 0.036, hull_y_at_xz(mx - 0.036, z, side=side, inset=-0.105), z)),
                    bm_mul.verts.new((mx + 0.036, hull_y_at_xz(mx + 0.036, z, side=side, inset=-0.105), z)),
                    bm_mul.verts.new((mx + 0.045, hull_y_at_xz(mx + 0.045, z, side=side, inset=0.14), z)),
                ]
                if prev is not None:
                    for k in range(4):
                        kn = (k + 1) % 4
                        bm_mul.faces.new((prev[k], prev[kn], ring[kn], ring[k]))
                prev = ring
        finish_mesh_object(f"{name_prefix}_Mullions", bm_mul, mats["brass"], col_shell, parent=root_shell, smooth=True, uv_scale=0.6)

    # E. Curved Glazing Pane + Cozy Backlit Interior Diffuser
    def build_curved_pane(pane_name: str, proud_offset: float, mat):
        bm_p = bmesh.new()
        uv_layer = bm_p.loops.layers.uv.verify()
        nx, nz = 24, 12
        pw = width - 0.08
        ph = height - 0.08
        grid = []
        for ix in range(nx + 1):
            u = -pw * 0.5 + pw * (ix / float(nx))
            col_v = []
            for iz in range(nz + 1):
                v = -ph * 0.5 + ph * (iz / float(nz))
                r = min(corner_r, pw * 0.48, ph * 0.48)
                hx = pw * 0.5 - r
                hy = ph * 0.5 - r
                du = max(0.0, abs(u) - hx)
                dv = max(0.0, abs(v) - hy)
                d = math.hypot(du, dv)
                if d > r and d > 1e-6:
                    scale = r / d
                    uu = math.copysign(hx + du * scale, u)
                    vv = math.copysign(hy + dv * scale, v)
                else:
                    uu, vv = u, v
                bulge = 0.035 * (1.0 - (uu / (pw * 0.52)) ** 2) * (1.0 - (vv / (ph * 0.52)) ** 2)
                col_v.append((bm_p.verts.new(pt_on_hull(uu, vv, proud_offset + bulge)), uu / pw + 0.5, vv / ph + 0.5))
            grid.append(col_v)
        for ix in range(nx):
            for iz in range(nz):
                a, au, av = grid[ix][iz]
                b, bu, bv = grid[ix + 1][iz]
                c, cu, cv = grid[ix + 1][iz + 1]
                d_v, du, dv = grid[ix][iz + 1]
                verts = (a, b, c, d_v) if side == -1 else (a, d_v, c, b)
                uvs = [(au, av), (bu, bv), (cu, cv), (du, dv)] if side == -1 else [(au, av), (du, dv), (cu, cv), (bu, bv)]
                try:
                    f = bm_p.faces.new(verts)
                    for loop, uv in zip(f.loops, uvs):
                        loop[uv_layer].uv = uv
                except ValueError:
                    pass
        return finish_mesh_object(pane_name, bm_p, mat, col_win, parent=root_win, smooth=True, auto_uv=False)

    build_curved_pane(f"{name_prefix}_Glass", -0.02, mats["glass"])
    build_curved_pane(f"{name_prefix}_WarmGlow", -0.19, mats["window_glow"])


def build_porthole(name: str, x: float, z: float, radius: float, side: int, mats, col_shell, col_win, root_shell, root_win):
    y_surf = hull_y_at_xz(x, z, side=side, inset=0.0)
    rot = Euler((math.pi * 0.5, 0.0, 0.0), "XYZ") if side == -1 else Euler((-math.pi * 0.5, 0.0, 0.0), "XYZ")
    loc = (x, y_surf, z)

    collar_prof = [
        (radius + 0.22, -0.14),
        (radius + 0.22, 0.05),
        (radius + 0.14, 0.13),
        (radius - 0.02, 0.13),
        (radius - 0.02, -0.14),
    ]
    v, f = lathe_mesh(collar_prof, segments=36, cap_bottom=False, cap_top=False)
    object_from_pydata(f"{name}_Collar", v, f, mats["porcelain"], col_shell, parent=root_shell, location=loc, rotation=rot)

    bezel_prof = [
        (radius + 0.11, 0.07),
        (radius + 0.11, 0.175),
        (radius + 0.05, 0.195),
        (radius - 0.05, 0.175),
        (radius - 0.05, 0.04),
    ]
    v, f = lathe_mesh(bezel_prof, segments=36, cap_bottom=False, cap_top=False)
    object_from_pydata(f"{name}_BrassRing", v, f, mats["brass"], col_shell, parent=root_shell, location=loc, rotation=rot)

    bm_r = bmesh.new()
    for i in range(8):
        ang = math.tau * i / 8.0 + math.pi / 8.0
        rx = (radius + 0.078) * math.cos(ang)
        rz_l = (radius + 0.078) * math.sin(ang)
        bmesh.ops.create_icosphere(bm_r, subdivisions=2, radius=0.028, matrix=Matrix.Translation((rx, rz_l, 0.18)))
    finish_mesh_object(f"{name}_Rivets", bm_r, mats["brass"], col_shell, parent=root_shell, location=loc, rotation=rot, smooth=True)

    glow_prof = [(0.0, 0.03), (radius - 0.04, 0.03)]
    v, f = lathe_mesh(glow_prof, segments=32, cap_bottom=False, cap_top=False)
    object_from_pydata(
        f"{name}_WarmGlow", v, f, mats["window_glow"], col_win, parent=root_win, location=loc, rotation=rot,
        custom_uv_fn=lambda p: (0.25 + p.x / (radius * 4.5), 0.48 + p.y / (radius * 4.5)),
    )

    dome_prof = [
        (radius - 0.03, 0.09),
        ((radius - 0.03) * 0.72, 0.16),
        ((radius - 0.03) * 0.35, 0.20),
        (0.0, 0.215),
    ]
    v, f = lathe_mesh(dome_prof, segments=32, cap_bottom=False, cap_top=False)
    object_from_pydata(f"{name}_GlassDome", v, f, mats["glass"], col_win, parent=root_win, location=loc, rotation=rot)


def build_bow_canopy(mats, col_shell, col_win, root_shell, root_win):
    """Build a crisp dark-sapphire wrap-around bridge canopy, brass frame, docking collar & bow headlights."""
    x0, x1 = 5.05, 6.82
    a0, a1 = math.pi * 0.5 - 1.06, math.pi * 0.5 + 1.06

    def build_curved_patch(bm, x_start, x_end, ang0, ang1, proud, nx=12, nt=26, planar_uv=False):
        uv_layer = bm.loops.layers.uv.verify() if planar_uv else None
        grid = []
        for ix in range(nx + 1):
            tx = ix / float(nx)
            x = x_start + (x_end - x_start) * tx
            row = []
            for it in range(nt + 1):
                tt = it / float(nt)
                th = ang0 + (ang1 - ang0) * tt
                row.append((bm.verts.new(eval_hull_point(x, th, inset=-proud)), tt, tx))
            grid.append(row)
        for ix in range(nx):
            for it in range(nt):
                a, au, av = grid[ix][it]
                b, bu, bv = grid[ix][it + 1]
                c, cu, cv = grid[ix + 1][it + 1]
                d, du, dv = grid[ix + 1][it]
                f = bm.faces.new((a, b, c, d))
                if planar_uv:
                    for loop, uv in zip(f.loops, [(au, av), (bu, bv), (cu, cv), (du, dv)]):
                        loop[uv_layer].uv = uv

    bm_frame = bmesh.new()
    bm_glow = bmesh.new()
    bm_glass = bmesh.new()

    build_curved_patch(bm_frame, x0 - 0.14, x1 + 0.14, a0 - 0.08, a1 + 0.08, proud=0.055)
    build_curved_patch(bm_glow, x0, x1, a0, a1, proud=0.082, planar_uv=True)
    build_curved_patch(bm_glass, x0 - 0.01, x1 + 0.01, a0 - 0.01, a1 + 0.01, proud=0.125)

    # Full perimeter brass bezel + 2 interior vertical canopy ribs
    bm_trim = bmesh.new()
    # Longitudinal ribs (including left/right outer borders)
    for rib_t in (a0 - 0.05, math.pi * 0.5 - 0.36, math.pi * 0.5 + 0.36, a1 + 0.05):
        prev = None
        for ix in range(13):
            x = (x0 - 0.15) + (x1 - x0 + 0.30) * (ix / 12.0)
            ring = [
                bm_trim.verts.new(eval_hull_point(x, rib_t - 0.022, inset=0.02)),
                bm_trim.verts.new(eval_hull_point(x, rib_t - 0.016, inset=-0.16)),
                bm_trim.verts.new(eval_hull_point(x, rib_t + 0.016, inset=-0.16)),
                bm_trim.verts.new(eval_hull_point(x, rib_t + 0.022, inset=0.02)),
            ]
            if prev is not None:
                for k in range(4):
                    kn = (k + 1) % 4
                    bm_trim.faces.new((prev[k], prev[kn], ring[kn], ring[k]))
            prev = ring
    # Upper & lower arched brass brows wrapping the canopy top and bottom edges
    for bx in (x0 - 0.14, x1 + 0.14):
        prev = None
        for it in range(25):
            th = (a0 - 0.06) + (a1 - a0 + 0.12) * (it / 24.0)
            ring = [
                bm_trim.verts.new(eval_hull_point(bx - 0.055, th, inset=0.02)),
                bm_trim.verts.new(eval_hull_point(bx - 0.040, th, inset=-0.16)),
                bm_trim.verts.new(eval_hull_point(bx + 0.040, th, inset=-0.16)),
                bm_trim.verts.new(eval_hull_point(bx + 0.055, th, inset=0.02)),
            ]
            if prev is not None:
                for k in range(4):
                    kn = (k + 1) % 4
                    bm_trim.faces.new((prev[k], prev[kn], ring[kn], ring[k]))
            prev = ring

    finish_mesh_object("BowCanopy_SlateFrame", bm_frame, mats["slate"], col_shell, parent=root_shell, smooth=True)
    finish_mesh_object("BowCanopy_BrassFrame", bm_trim, mats["brass"], col_shell, parent=root_shell, smooth=True)
    finish_mesh_object("BowCanopy_WarmGlow", bm_glow, mats["window_glow"], col_win, parent=root_win, smooth=True, auto_uv=False)
    finish_mesh_object("BowCanopy_Glass", bm_glass, mats["canopy_glass"], col_win, parent=root_win, smooth=True)

    # Forward Docking Collar & Nose Hatch at +X
    nose_loc = (HULL_X_BOW - 0.18, CY, CZ - 0.18)
    nose_rot = Euler((0.0, math.pi * 0.5, 0.0), "XYZ")

    collar_prof = [
        (1.38, -0.35),
        (1.38, 0.08),
        (1.26, 0.34),
        (1.12, 0.42),
        (0.92, 0.42),
        (0.86, 0.30),
        (0.86, 0.16),
    ]
    v, f = lathe_mesh(collar_prof, segments=48, cap_bottom=False, cap_top=True)
    object_from_pydata("Bow_DockingCollar", v, f, mats["porcelain"], col_shell, parent=root_shell, location=nose_loc, rotation=nose_rot)

    ring_prof = [(1.18, 0.30), (1.18, 0.46), (1.06, 0.50), (0.94, 0.46), (0.94, 0.32)]
    v, f = lathe_mesh(ring_prof, segments=48, cap_bottom=False, cap_top=False)
    object_from_pydata("Bow_DockingBrassRing", v, f, mats["brass"], col_shell, parent=root_shell, location=nose_loc, rotation=nose_rot)

    hatch_prof = [(0.90, 0.32), (0.82, 0.40), (0.42, 0.44), (0.0, 0.45)]
    v, f = lathe_mesh(hatch_prof, segments=36, cap_bottom=True, cap_top=False)
    object_from_pydata("Bow_DockingHatch", v, f, mats["apricot"], col_shell, parent=root_shell, location=nose_loc, rotation=nose_rot)

    bm_lug = bmesh.new()
    for i in range(6):
        ang = math.tau * i / 6.0
        m = (
            Matrix.Translation((1.12 * math.cos(ang), 1.12 * math.sin(ang), 0.43))
            @ Matrix.Rotation(ang, 4, "Z")
            @ Matrix.Diagonal((0.14, 0.18, 0.16, 1.0))
        )
        bmesh.ops.create_cube(bm_lug, size=1.0, matrix=m)
    bmesh.ops.bevel(bm_lug, geom=bm_lug.edges, offset=0.025, segments=2, affect="EDGES")
    finish_mesh_object("Bow_DockingLatches", bm_lug, mats["slate"], col_shell, parent=root_shell, location=nose_loc, rotation=nose_rot, smooth=True)

    # Twin charming warm amber bow headlights flanking the docking nose
    for tag, side in (("L", -1), ("R", 1)):
        hx = 7.12
        hz = 1.48
        hy = hull_y_at_xz(hx, hz, side=side, inset=0.08)
        h_rot = Euler((0.0, math.pi * 0.5, side * 0.32), "XYZ")
        bez_p = [(0.24, -0.22), (0.24, 0.08), (0.20, 0.16), (0.14, 0.16), (0.14, 0.02)]
        v, f = lathe_mesh(bez_p, segments=24, cap_bottom=True, cap_top=False)
        object_from_pydata(f"Bow_HeadlightBezel_{tag}", v, f, mats["brass"], col_shell, parent=root_shell, location=(hx, hy, hz), rotation=h_rot)

        lens_p = [(0.15, 0.08), (0.11, 0.17), (0.0, 0.20)]
        v, f = lathe_mesh(lens_p, segments=20, cap_bottom=True, cap_top=False)
        object_from_pydata(f"Bow_HeadlightLens_{tag}", v, f, mats["beacon_amber"], col_win, parent=root_win, location=(hx, hy, hz), rotation=h_rot)


# ---------------------------------------------------------------------------
# 3. Twin Retro-Orbital Main Thruster Nacelles + Feathered Plume Cones + Tail Fin
# ---------------------------------------------------------------------------
def build_thrusters_and_fin(mats, col_thr, col_shell, root_thr, root_shell):
    for tag, sign in (("L", -1), ("R", 1)):
        loc = (THRUSTER_MOUNT_X, CY + sign * THRUSTER_Y_OFFSET, THRUSTER_Z)
        rot = Euler((0.0, -math.pi * 0.5, 0.0), "XYZ")  # local +Z points aft (-X)

        cowl_prof = [
            (0.88, -1.55),
            (1.18, -1.10),
            (1.26, -0.45),
            (1.22, 0.22),
            (1.06, 0.58),
            (0.92, 0.58),
            (0.92, 0.15),
        ]
        v, f = lathe_mesh(cowl_prof, segments=48, cap_bottom=True, cap_top=False)
        object_from_pydata(f"Thruster_Cowl_{tag}", v, f, mats["porcelain"], col_thr, parent=root_thr, location=loc, rotation=rot)

        band_prof = [(1.255, -0.78), (1.285, -0.68), (1.275, -0.15), (1.235, -0.08)]
        v, f = lathe_mesh(band_prof, segments=48, cap_bottom=False, cap_top=False)
        object_from_pydata(f"Thruster_ApricotBand_{tag}", v, f, mats["apricot"], col_thr, parent=root_thr, location=loc, rotation=rot)

        brass_prof = [(1.10, 0.42), (1.15, 0.48), (1.15, 0.64), (1.04, 0.68), (0.90, 0.64)]
        v, f = lathe_mesh(brass_prof, segments=48, cap_bottom=False, cap_top=False)
        object_from_pydata(f"Thruster_BrassCollar_{tag}", v, f, mats["brass"], col_thr, parent=root_thr, location=loc, rotation=rot)

        bell_prof = [
            (0.68, 0.52),
            (0.60, 0.72),
            (0.76, 0.98),
            (0.96, 1.38),
            (1.04, 1.72),
            (0.95, 1.74),
            (0.86, 1.36),
            (0.55, 0.78),
            (0.0, 0.72),
        ]
        v, f = lathe_mesh(bell_prof, segments=48, cap_bottom=False, cap_top=False)
        object_from_pydata(f"Thruster_Bell_{tag}", v, f, mats["titanium"], col_thr, parent=root_thr, location=loc, rotation=rot)

        bm_fin = bmesh.new()
        for fi in range(12):
            ang = math.tau * fi / 12.0
            m = (
                Matrix.Rotation(ang, 4, "Z")
                @ Matrix.Translation((0.86, 0.0, 0.95))
                @ Matrix.Rotation(-0.18, 4, "Y")
                @ Matrix.Diagonal((0.30, 0.045, 0.62, 1.0))
            )
            bmesh.ops.create_cube(bm_fin, size=1.0, matrix=m)
        bmesh.ops.bevel(bm_fin, geom=bm_fin.edges, offset=0.012, segments=2, affect="EDGES")
        finish_mesh_object(f"Thruster_CoolingFins_{tag}", bm_fin, mats["brass"], col_thr, parent=root_thr, location=loc, rotation=rot, smooth=True)

        core_prof = [(0.0, 0.80), (0.50, 0.88), (0.72, 1.34), (0.56, 1.64), (0.0, 1.84)]
        v, f = lathe_mesh(core_prof, segments=32, cap_bottom=False, cap_top=False)
        object_from_pydata(f"Thruster_Core_{tag}", v, f, mats["thruster_core"], col_thr, parent=root_thr, location=loc, rotation=rot)

        # Soft gradient-feathered translucent exhaust plume (pivot at exit lip, V maps along Z [0..2.95])
        plume_loc = (THRUSTER_MOUNT_X - 1.56, CY + sign * THRUSTER_Y_OFFSET, THRUSTER_Z)
        plume_len = 2.95
        plume_prof = [
            (0.0, 0.0),
            (0.68, 0.14),
            (0.76, 0.55),
            (0.58, 1.35),
            (0.28, 2.25),
            (0.0, plume_len),
        ]
        v, f = lathe_mesh(plume_prof, segments=32, cap_bottom=False, cap_top=False)
        object_from_pydata(
            f"Thruster_Plume_{tag}", v, f, mats["thruster_plume"], col_thr, parent=root_thr,
            location=plume_loc, rotation=rot,
            custom_uv_fn=lambda p: (0.5, max(0.0, min(1.0, p.z / plume_len))),
        )

    # Center lower vernier/auxiliary thruster
    aux_loc = (HULL_X_STERN - 0.02, CY, 0.34)
    aux_rot = Euler((0.0, -math.pi * 0.5, 0.0), "XYZ")
    aux_prof = [
        (0.56, -0.55), (0.54, 0.10), (0.40, 0.28), (0.52, 0.65),
        (0.58, 0.88), (0.50, 0.88), (0.35, 0.34), (0.0, 0.30),
    ]
    v, f = lathe_mesh(aux_prof, segments=36, cap_bottom=True, cap_top=False)
    object_from_pydata("Thruster_AuxBell", v, f, mats["titanium"], col_thr, parent=root_thr, location=aux_loc, rotation=aux_rot)

    aux_core = [(0.0, 0.36), (0.33, 0.42), (0.38, 0.78), (0.0, 0.94)]
    v, f = lathe_mesh(aux_core, segments=24, cap_bottom=False, cap_top=False)
    object_from_pydata("Thruster_AuxCore", v, f, mats["thruster_core"], col_thr, parent=root_thr, location=aux_loc, rotation=aux_rot)

    # Dorsal Swept Stabilizer Tail Fin (apricot main fin + cream leading-edge cap)
    bm_fin = bmesh.new()
    fin_stations = [
        (3.80, -4.85, -8.30, 0.34),
        (4.45, -5.25, -8.40, 0.26),
        (5.25, -6.08, -8.60, 0.16),
        (5.95, -6.98, -8.78, 0.09),
        (6.18, -7.38, -8.68, 0.045),
    ]
    n_af = 12
    af_rings = []
    for zf, xl, xt, ht in fin_stations:
        chord = xl - xt
        ring = []
        for i in range(n_af):
            a = math.tau * i / float(n_af)
            u = 0.5 * (1.0 + math.cos(a))
            x_pt = xt + chord * u
            y_off = ht * math.sin(a) * (0.65 + 0.35 * math.sqrt(max(0.0, u)))
            ring.append(bm_fin.verts.new((x_pt, CY + y_off, zf)))
        af_rings.append(ring)
    for ri in range(len(af_rings) - 1):
        for i in range(n_af):
            inext = (i + 1) % n_af
            bm_fin.faces.new((af_rings[ri][i], af_rings[ri][inext], af_rings[ri + 1][inext], af_rings[ri + 1][i]))
    tip_c = bm_fin.verts.new((-8.05, CY, 6.24))
    for i in range(n_af):
        inext = (i + 1) % n_af
        bm_fin.faces.new((af_rings[-1][i], af_rings[-1][inext], tip_c))
    finish_mesh_object("Hull_DorsalTailFin", bm_fin, mats["apricot"], col_shell, parent=root_shell, smooth=True, uv_scale=0.35)

    tip_loc = (-8.05, CY, 6.24)
    tip_rot = Euler((0.0, -math.pi * 0.5, 0.0), "XYZ")
    pod_prof = [(0.0, -0.52), (0.11, -0.36), (0.12, 0.22), (0.09, 0.38), (0.0, 0.44)]
    v, f = lathe_mesh(pod_prof, segments=24, cap_bottom=False, cap_top=False)
    object_from_pydata("TailFin_TipPod", v, f, mats["brass"], col_shell, parent=root_shell, location=tip_loc, rotation=tip_rot)

    bm_tb = bmesh.new()
    bmesh.ops.create_icosphere(bm_tb, subdivisions=3, radius=0.115, matrix=Matrix.Translation((-8.48, CY, 6.24)))
    finish_mesh_object("TailFin_Beacon", bm_tb, mats["beacon_amber"], col_shell, parent=root_shell, smooth=True)


# ---------------------------------------------------------------------------
# 4. Articulated Orbital Solar Wings (cleaner placement, wider 2-bay span + ventral spar)
# ---------------------------------------------------------------------------
def build_solar_wings(mats, col_wings, root_wings):
    for tag, side in (("Port", -1), ("Starboard", 1)):
        y_hull = hull_y_at_xz(WING_ROOT_X, WING_ROOT_Z, side=side, inset=0.14)
        pivot = make_empty(f"SolarWing_Pivot_{tag}", location=(WING_ROOT_X, y_hull, WING_ROOT_Z), parent=root_wings, col=col_wings)

        bm_blist = bmesh.new()
        bmesh.ops.create_icosphere(
            bm_blist, subdivisions=3, radius=1.0,
            matrix=Matrix.Translation((0.0, -side * 0.14, 0.0)) @ Matrix.Diagonal((1.02, 0.62, 0.52, 1.0)),
        )
        finish_mesh_object(f"SolarWing_ShoulderPod_{tag}", bm_blist, mats["apricot"], col_wings, parent=pivot, smooth=True)

        dih = math.radians(WING_DIHEDRAL_DEG)
        swp = math.radians(WING_SWEEP_DEG)
        wing_rot = Euler((side * dih, 0.0, -side * swp), "XYZ")
        wing_arm = make_empty(f"SolarWing_Arm_{tag}", location=(0.0, side * 0.30, 0.0), parent=pivot, col=col_wings)
        wing_arm.rotation_euler = wing_rot

        gimbal_rot = Euler((-side * math.pi * 0.5, 0.0, 0.0), "XYZ")
        g_prof = [
            (0.38, -0.35), (0.38, 0.18), (0.30, 0.28), (0.16, 0.34),
            (0.14, 0.92), (0.22, 0.96), (0.22, 1.06), (0.0, 1.06),
        ]
        v, f = lathe_mesh(g_prof, segments=32, cap_bottom=True, cap_top=False)
        object_from_pydata(f"SolarWing_Gimbal_{tag}", v, f, mats["brass"], col_wings, parent=wing_arm, rotation=gimbal_rot)

        # Central structural brass boom spar beneath solar bays (reads crisply edge-on)
        bm_spar = bmesh.new()
        m_sp = Matrix.Translation((0.0, side * 2.80, -0.055)) @ Matrix.Diagonal((0.20, 3.85, 0.085, 1.0))
        bmesh.ops.create_cube(bm_spar, size=1.0, matrix=m_sp)
        bmesh.ops.bevel(bm_spar, geom=bm_spar.edges, offset=0.025, segments=2, affect="EDGES")
        finish_mesh_object(f"SolarWing_Spar_{tag}", bm_spar, mats["brass"], col_wings, parent=wing_arm, smooth=True)

        bay_specs = [
            (f"SolarWing_BayInner_{tag}", 0.94, 2.74, WING_CHORD),
            (f"SolarWing_BayOuter_{tag}", 2.92, 4.72, WING_CHORD * 0.88),
        ]
        for bname, y0, y1, chord in bay_specs:
            ymid = side * (y0 + y1) * 0.5
            blen = y1 - y0
            thick = 0.095

            bm_fr = bmesh.new()
            m_fr = Matrix.Translation((0.0, ymid, 0.0)) @ Matrix.Diagonal((chord, blen, thick, 1.0))
            bmesh.ops.create_cube(bm_fr, size=1.0, matrix=m_fr)
            bmesh.ops.bevel(bm_fr, geom=bm_fr.edges, offset=0.042, segments=3, affect="EDGES")
            finish_mesh_object(f"{bname}_Frame", bm_fr, mats["porcelain"], col_wings, parent=wing_arm, smooth=True, uv_scale=0.4)

            bm_rail = bmesh.new()
            for ex in (-chord * 0.49, chord * 0.49):
                m_r = Matrix.Translation((ex, ymid, 0.0)) @ Matrix.Diagonal((0.085, blen * 0.96, thick * 1.15, 1.0))
                bmesh.ops.create_cube(bm_rail, size=1.0, matrix=m_r)
            bmesh.ops.bevel(bm_rail, geom=bm_rail.edges, offset=0.02, segments=2, affect="EDGES")
            finish_mesh_object(f"{bname}_BrassRails", bm_rail, mats["brass"], col_wings, parent=wing_arm, smooth=True)

            bm_cell = bmesh.new()
            uv_layer = bm_cell.loops.layers.uv.verify()
            cw = chord * 0.86
            cl = blen * 0.88
            for z_sign in (-1.0, 1.0):
                zc_p = z_sign * (thick * 0.5 + 0.008)
                v0 = bm_cell.verts.new((-cw * 0.5, ymid - cl * 0.5, zc_p))
                v1 = bm_cell.verts.new((cw * 0.5, ymid - cl * 0.5, zc_p))
                v2 = bm_cell.verts.new((cw * 0.5, ymid + cl * 0.5, zc_p))
                v3 = bm_cell.verts.new((-cw * 0.5, ymid + cl * 0.5, zc_p))
                verts = (v0, v1, v2, v3) if z_sign > 0 else (v0, v3, v2, v1)
                face = bm_cell.faces.new(verts)
                for loop, uv in zip(face.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
                    loop[uv_layer].uv = uv
            finish_mesh_object(f"{bname}_Cells", bm_cell, mats["solar"], col_wings, parent=wing_arm, smooth=False, auto_uv=False)

        bm_hinge = bmesh.new()
        for hx in (-0.68, 0.68):
            m_h = Matrix.Translation((hx, side * 2.83, 0.0)) @ Matrix.Diagonal((0.18, 0.28, 0.14, 1.0))
            bmesh.ops.create_cube(bm_hinge, size=1.0, matrix=m_h)
        bmesh.ops.bevel(bm_hinge, geom=bm_hinge.edges, offset=0.03, segments=2, affect="EDGES")
        finish_mesh_object(f"SolarWing_Hinges_{tag}", bm_hinge, mats["brass"], col_wings, parent=wing_arm, smooth=True)

        bm_tip = bmesh.new()
        bmesh.ops.create_icosphere(bm_tip, subdivisions=3, radius=0.115, matrix=Matrix.Translation((0.0, side * 4.78, 0.0)))
        beacon_mat = mats["beacon_rose"] if side == -1 else mats["beacon_mint"]
        finish_mesh_object(f"SolarWing_Beacon_{tag}", bm_tip, beacon_mat, col_wings, parent=wing_arm, smooth=True)


# ---------------------------------------------------------------------------
# 5. Dorsal Comms, Skylight, Ventral Keel/Skids & RCS Pods
# ---------------------------------------------------------------------------
def build_dorsal_and_ventral_details(mats, col_det, col_win, root_det, root_win):
    bm_spine = bmesh.new()
    sp_xs = [-5.3, -4.6, -2.5, 0.0, 2.2, 3.6, 4.3]
    prev_ring = None
    for i, x in enumerate(sp_xs):
        w = 1.05 if 1 <= i <= 5 else 0.52
        h = 0.34 if 1 <= i <= 5 else 0.04
        z_base = hull_z_at_xy(x, CY, top=True, inset=0.10)
        z_top = hull_z_at_xy(x, CY, top=True, inset=-h)
        ring = [
            bm_spine.verts.new((x, CY - w, z_base)),
            bm_spine.verts.new((x, CY - w * 0.72, z_top)),
            bm_spine.verts.new((x, CY + w * 0.72, z_top)),
            bm_spine.verts.new((x, CY + w, z_base)),
        ]
        if prev_ring is not None:
            for k in range(4):
                kn = (k + 1) % 4
                bm_spine.faces.new((prev_ring[k], prev_ring[kn], ring[kn], ring[k]))
        prev_ring = ring
    bm_spine.faces.new(tuple(reversed(bm_spine.verts[:4])))
    bm_spine.faces.new(tuple(bm_spine.verts[-4:]))
    finish_mesh_object("Dorsal_RoofSpine", bm_spine, mats["vanilla"], col_det, parent=root_det, smooth=True, uv_scale=0.35)

    # Dorsal skylight frame + warm glow
    z_sky = hull_z_at_xy(-0.5, CY, top=True, inset=-0.35)
    bm_sf = bmesh.new()
    bmesh.ops.create_cube(bm_sf, size=1.0, matrix=Matrix.Translation((-0.6, CY, z_sky)) @ Matrix.Diagonal((3.2, 1.05, 0.14, 1.0)))
    bmesh.ops.bevel(bm_sf, geom=bm_sf.edges, offset=0.05, segments=3, affect="EDGES")
    finish_mesh_object("Dorsal_SkylightFrame", bm_sf, mats["brass"], col_det, parent=root_det, smooth=True)

    bm_sg = bmesh.new()
    bmesh.ops.create_cube(bm_sg, size=1.0, matrix=Matrix.Translation((-0.6, CY, z_sky + 0.05)) @ Matrix.Diagonal((2.92, 0.82, 0.06, 1.0)))
    bmesh.ops.bevel(bm_sg, geom=bm_sg.edges, offset=0.02, segments=2, affect="EDGES")
    finish_mesh_object("Dorsal_SkylightGlow", bm_sg, mats["window_glow"], col_win, parent=root_win, smooth=True, uv_scale=0.32)

    # Dorsal Comms Dish Assembly
    dish_x, dish_y = 2.45, CY + 0.52
    dish_z = hull_z_at_xy(dish_x, dish_y, top=True, inset=0.06)
    ped_prof = [(0.52, -0.15), (0.48, 0.16), (0.32, 0.34), (0.14, 0.38), (0.12, 0.82), (0.0, 0.84)]
    v, f = lathe_mesh(ped_prof, segments=32, cap_bottom=True, cap_top=False)
    object_from_pydata("Comms_Pedestal", v, f, mats["porcelain"], col_det, parent=root_det, location=(dish_x, dish_y, dish_z))

    dish_loc = (dish_x + 0.04, dish_y, dish_z + 0.92)
    dish_rot = Euler((0.18, 0.55, 0.25), "XYZ")
    dish_prof = [
        (0.0, 0.0), (0.32, 0.04), (0.68, 0.16), (0.92, 0.34),
        (0.96, 0.34), (0.72, 0.12), (0.34, -0.02), (0.0, -0.06),
    ]
    v, f = lathe_mesh(dish_prof, segments=40, cap_bottom=False, cap_top=False)
    object_from_pydata("Comms_ParabolicDish", v, f, mats["brass"], col_det, parent=root_det, location=dish_loc, rotation=dish_rot)

    feed_prof = [(0.06, 0.0), (0.035, 0.52), (0.11, 0.56), (0.11, 0.66), (0.0, 0.70)]
    v, f = lathe_mesh(feed_prof, segments=20, cap_bottom=True, cap_top=False)
    object_from_pydata("Comms_FeedHorn", v, f, mats["slate"], col_det, parent=root_det, location=dish_loc, rotation=dish_rot)

    # Dorsal Telemetry Mast
    ant_x, ant_y = -4.25, CY - 0.55
    ant_z = hull_z_at_xy(ant_x, ant_y, top=True, inset=0.05)
    ant_prof = [(0.26, -0.10), (0.22, 0.14), (0.06, 0.22), (0.032, 1.35), (0.075, 1.40), (0.0, 1.46)]
    v, f = lathe_mesh(ant_prof, segments=20, cap_bottom=True, cap_top=False)
    object_from_pydata("Comms_TelemetryMast", v, f, mats["brass"], col_det, parent=root_det, location=(ant_x, ant_y, ant_z))

    # Four Streamlined RCS Attitude Thruster Blister Pods
    for tag, rx, side in (
        ("Fore_Port", 3.55, -1),
        ("Fore_Starboard", 3.55, 1),
        ("Aft_Port", -5.85, -1),
        ("Aft_Starboard", -5.85, 1),
    ):
        rz = 0.42
        ry = hull_y_at_xz(rx, rz, side=side, inset=0.08)
        bm_rcs = bmesh.new()
        bmesh.ops.create_icosphere(bm_rcs, subdivisions=3, radius=1.0, matrix=Matrix.Diagonal((0.68, 0.34, 0.28, 1.0)))
        finish_mesh_object(f"RCS_Pod_{tag}", bm_rcs, mats["slate"], col_det, parent=root_det, location=(rx, ry, rz), smooth=True)

        for ntag, n_off, n_rot in (
            ("Out", (0.0, side * 0.28, 0.0), Euler((-side * math.pi * 0.5, 0.0, 0.0), "XYZ")),
            ("Up", (0.0, side * 0.14, 0.22), Euler((0.0, 0.0, 0.0), "XYZ")),
            ("Down", (0.0, side * 0.14, -0.22), Euler((math.pi, 0.0, 0.0), "XYZ")),
        ):
            n_prof = [(0.055, -0.06), (0.045, 0.04), (0.082, 0.14), (0.068, 0.14), (0.035, 0.04), (0.0, 0.02)]
            v, f = lathe_mesh(n_prof, segments=16, cap_bottom=False, cap_top=False)
            object_from_pydata(
                f"RCS_Nozzle_{tag}_{ntag}", v, f, mats["brass"], col_det, parent=root_det,
                location=(rx + n_off[0], ry + n_off[1], rz + n_off[2]), rotation=n_rot,
            )

    # Ventral Belly Docking Ring, Radiator Louvres & 4 Tucked Landing Pods
    z_belly = hull_z_at_xy(CX, CY, top=False, inset=0.05)
    vd_loc = (CX + 0.35, CY, z_belly - 0.04)
    vd_rot = Euler((math.pi, 0.0, 0.0), "XYZ")
    vd_prof = [(1.48, -0.20), (1.42, 0.08), (1.24, 0.18), (1.06, 0.18), (1.00, 0.08), (0.0, 0.05)]
    v, f = lathe_mesh(vd_prof, segments=40, cap_bottom=True, cap_top=False)
    object_from_pydata("Ventral_DockingRing", v, f, mats["brass"], col_det, parent=root_det, location=vd_loc, rotation=vd_rot)

    bm_vent = bmesh.new()
    for bx in (-4.45, 2.35):
        for vi in range(5):
            vy = CY - 0.90 + vi * 0.45
            vz = hull_z_at_xy(bx, vy, top=False, inset=0.0)
            m_v = Matrix.Translation((bx, vy, vz - 0.02)) @ Matrix.Diagonal((1.45, 0.16, 0.12, 1.0))
            bmesh.ops.create_cube(bm_vent, size=1.0, matrix=m_v)
    bmesh.ops.bevel(bm_vent, geom=bm_vent.edges, offset=0.03, segments=2, affect="EDGES")
    finish_mesh_object("Ventral_RadiatorLouvres", bm_vent, mats["titanium"], col_det, parent=root_det, smooth=True)

    for tag, lx, ly_sign in (
        ("Fore_Port", 2.95, -1),
        ("Fore_Starboard", 2.95, 1),
        ("Aft_Port", -5.25, -1),
        ("Aft_Starboard", -5.25, 1),
    ):
        ly = CY + ly_sign * 2.55
        lz = hull_z_at_xy(lx, ly, top=False, inset=0.08)
        bm_skid = bmesh.new()
        bmesh.ops.create_icosphere(
            bm_skid, subdivisions=3, radius=1.0,
            matrix=Matrix.Translation((lx, ly, lz - 0.10)) @ Matrix.Diagonal((1.05, 0.46, 0.32, 1.0)),
        )
        finish_mesh_object(f"Ventral_LandingPod_{tag}", bm_skid, mats["porcelain"], col_det, parent=root_det, smooth=True)

        pad_loc = (lx, ly, lz - 0.36)
        pad_prof = [(0.34, -0.06), (0.38, 0.04), (0.30, 0.12), (0.0, 0.12)]
        v, f = lathe_mesh(pad_prof, segments=24, cap_bottom=True, cap_top=False)
        object_from_pydata(f"Ventral_ShockPad_{tag}", v, f, mats["slate"], col_det, parent=root_det, location=pad_loc, rotation=vd_rot)


# ---------------------------------------------------------------------------
# Main build + save .blend + export .glb
# ---------------------------------------------------------------------------
def build_spacecraft(blend_path: Path, glb_path: Path | None):
    clear_scene()

    col_root = get_collection("Spacecraft_Hull")
    col_shell = get_collection("01_Hull_Body", col_root)
    col_win = get_collection("02_Hull_Windows", col_root)
    col_thr = get_collection("03_Hull_Thrusters", col_root)
    col_wings = get_collection("04_Hull_SolarWings", col_root)
    col_det = get_collection("05_Hull_Details", col_root)

    root = make_empty("Spacecraft_Root", (0.0, 0.0, 0.0), col=col_root)
    root_shell = make_empty("Hull_UpperShell", (0.0, 0.0, 0.0), parent=root, col=col_shell)
    root_win = make_empty("Hull_Windows", (0.0, 0.0, 0.0), parent=root, col=col_win)
    root_thr = make_empty("Hull_Thrusters", (0.0, 0.0, 0.0), parent=root, col=col_thr)
    root_wings = make_empty("Hull_SolarWings", (0.0, 0.0, 0.0), parent=root, col=col_wings)
    root_det = make_empty("Hull_Details", (0.0, 0.0, 0.0), parent=root, col=col_det)

    textures = generate_textures()
    mats = build_materials(textures)

    build_fuselage(mats, col_shell, root_shell)

    build_stadium_viewport(
        "Viewport_FrontBay",
        cx=(FRONT_WIN_X0 + FRONT_WIN_X1) * 0.5,
        cz=(FRONT_WIN_Z0 + FRONT_WIN_Z1) * 0.5,
        width=(FRONT_WIN_X1 - FRONT_WIN_X0),
        height=(FRONT_WIN_Z1 - FRONT_WIN_Z0),
        corner_r=0.58,
        side=-1,
        mullion_xs=[-1.40, 0.60],
        mats=mats,
        col_shell=col_shell,
        col_win=col_win,
        root_shell=root_shell,
        root_win=root_win,
    )
    build_stadium_viewport(
        "Viewport_BackPanorama",
        cx=(BACK_WIN_X0 + BACK_WIN_X1) * 0.5,
        cz=(BACK_WIN_Z0 + BACK_WIN_Z1) * 0.5,
        width=(BACK_WIN_X1 - BACK_WIN_X0),
        height=(BACK_WIN_Z1 - BACK_WIN_Z0),
        corner_r=0.50,
        side=1,
        mullion_xs=[],
        mats=mats,
        col_shell=col_shell,
        col_win=col_win,
        root_shell=root_shell,
        root_win=root_win,
    )
    build_porthole("Porthole_BedroomFront", -5.25, 1.98, 0.62, side=-1, mats=mats, col_shell=col_shell, col_win=col_win, root_shell=root_shell, root_win=root_win)
    build_porthole("Porthole_BedroomBack", -4.75, 2.02, 0.62, side=1, mats=mats, col_shell=col_shell, col_win=col_win, root_shell=root_shell, root_win=root_win)
    build_bow_canopy(mats, col_shell, col_win, root_shell, root_win)

    build_thrusters_and_fin(mats, col_thr, col_shell, root_thr, root_shell)
    build_solar_wings(mats, col_wings, root_wings)
    build_dorsal_and_ventral_details(mats, col_det, col_win, root_det, root_win)

    bpy.context.view_layer.update()
    bpy.ops.file.pack_all()

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
    parser = argparse.ArgumentParser(description="Build PocketWorld orbital spacecraft hull.")
    root = Path(__file__).resolve().parents[1]
    parser.add_argument(
        "--blend",
        type=Path,
        default=root / "assets/models/cabin/spacecraft-hull.blend",
        help="Output .blend path",
    )
    parser.add_argument(
        "--glb",
        type=Path,
        default=root / "assets/public/models/cabin/spacecraft-hull.glb",
        help="Output .glb path (pass 'none' to skip GLB export)",
    )
    args = parser.parse_args(argv)
    if str(args.glb).lower() == "none":
        args.glb = None
    return args


if __name__ == "__main__":
    opts = parse_args()
    build_spacecraft(opts.blend, opts.glb)
