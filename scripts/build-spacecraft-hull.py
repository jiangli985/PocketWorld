"""Build the PocketWorld duplex orbital spacecraft hull in Blender 5.2+ and export GLB.

Durable procedural generator for the retro-cozy two-story duplex orbital living vessel
designed to enclose the stacked two-deck `open-cabin.glb` + `CabinStaircase` cleanly
while matching its warm porcelain, apricot, dusty-rose, and brushed-brass visual language.

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
# Duplex cabin envelope constants (measured from assembled open-cabin.glb +
# UPPER_DECK_OFFSET=[5.97, 3.82, 0] + CabinStaircase + BedroomGuard).
# Blender Z-up coordinates; glTF export maps (X, Y, Z) -> (X, Z, -Y).
# ---------------------------------------------------------------------------
LOWER_X_MIN, LOWER_X_MAX = -1.862, 4.246
LOWER_Y_MIN, LOWER_Y_MAX = -3.184, 3.408
LOWER_Z_MIN, LOWER_Z_MAX = -0.273, 3.762

UPPER_X_MIN, UPPER_X_MAX = -1.896, 4.260
UPPER_Y_MIN, UPPER_Y_MAX = -3.184, 3.411
UPPER_Z_MIN, UPPER_Z_MAX = 3.610, 7.582

STAIR_X_MIN, STAIR_X_MAX = -2.990, -1.780
STAIR_Y_MIN, STAIR_Y_MAX = -3.140, 2.370
STAIR_Z_MIN, STAIR_Z_MAX = -0.220, 4.610

CX = 1.150          # horizontal center of the two stacked main decks (-1.88 .. +4.26)
CY = 0.113          # shared Y symmetry centerline of both decks (-3.184 .. +3.411)
Z_BELT = 3.820      # exact inter-deck floor slab height (UPPER_DECK_OFFSET[1])

# Lower & Upper hull primary dimensions (sleek yacht L/H ~ 1.70, generous clearance)
HULL_X_STERN = -7.20       # extended swept stern deck
HULL_X_MID_AFT = -3.45     # cleanly aft of staircase (-2.99)
HULL_X_MID_FORE = 4.92     # cleanly fore of both decks' right wall (+4.26)
HULL_X_BOW = 9.55          # sleek protruding lower yacht nose cone

UPPER_X_TAIL_END = -6.55   # aft fastback blends smoothly into aft engine deck
UPPER_X_AFT = -2.25        # full-height upper loft rear shoulder (high arch over stairs)
UPPER_X_FORE = 4.88        # full-height upper loft fore brow (+0.62m clear of upper wall)
UPPER_X_NOSE_TOE = 7.15    # forward-raked panoramic loft bridge meets foredeck terrace

HULL_RY_LOWER = 4.70       # wide lower deck half-beam (Y in [-4.59, +4.81])
HULL_RY_UPPER = 4.22       # inset upper loft half-beam (0.48m sculpted terrace step/side)
HULL_Z_BOT = -1.08         # belly keel (0.81m below lower plinth -0.273)
HULL_Z_ROOF = 8.80         # upper roof crown (1.22m above upper wall top 7.582)
STEP_HALF_H = 0.165        # inter-deck sculpted terrace vertical transition half-height
WALL_THICKNESS = 0.22

# Hero Viewports (aligned vertically across Deck 1 and Deck 2)
LOWER_FRONT_WIN_X0, LOWER_FRONT_WIN_X1 = -1.35, 3.65
LOWER_FRONT_WIN_Z0, LOWER_FRONT_WIN_Z1 = 1.32, 3.04

UPPER_FRONT_WIN_X0, UPPER_FRONT_WIN_X1 = -1.25, 3.55
UPPER_FRONT_WIN_Z0, UPPER_FRONT_WIN_Z1 = 5.10, 6.95

# Lower back panoramic window (matches real interior panorama on +Y wall, clean margin below belt)
BACK_WIN_X0, BACK_WIN_X1 = -1.45, 3.35
BACK_WIN_Z0, BACK_WIN_Z1 = 1.50, 3.04

# Thrusters & articulated solar wings
THRUSTER_Y_OFFSET = 2.15
THRUSTER_Z = 2.02
THRUSTER_MOUNT_X = -7.02

WING_ROOT_X = -4.70        # aft inter-deck shoulder, cleanly clear of collars, windows & portholes
WING_ROOT_Z = 3.82
WING_CHORD = 2.66
WING_DIHEDRAL_DEG = 17.0
WING_SWEEP_DEG = -8.5

SEED = 20261122


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
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=list(bm.edges))
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

    # 1. Warm Porcelain Ceramic enamel
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

    # 2. Warm Apricot Enamel paint
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

    # 4. Rich Cozy Interior Window Glow
    wy, wx = np.mgrid[0:256, 0:512]
    u = wx / 512.0
    v = wy / 256.0
    lamp_dist = np.hypot((u - 0.26) * 1.65, (v - 0.48) * 1.35)
    desk_dist = np.hypot((u - 0.73) * 1.45, (v - 0.44) * 1.35)
    lamp_pool = np.exp(-lamp_dist * lamp_dist * 4.2) * 1.05
    desk_pool = np.exp(-desk_dist * desk_dist * 5.0) * 0.68
    edge_vig = np.clip(1.0 - 0.55 * ((u - 0.5) * 2.0) ** 4 - 0.45 * ((v - 0.46) * 2.0) ** 2, 0.22, 1.0)
    furniture_band = 1.0 - 0.32 * np.clip((0.26 - v) / 0.26, 0.0, 1.0)
    base_warm = edge_vig * furniture_band

    win = np.ones((256, 512, 4), dtype=np.float32)
    win[..., 0] = np.clip(0.56 * base_warm + 0.46 * lamp_pool + 0.36 * desk_pool, 0.0, 1.0)
    win[..., 1] = np.clip(0.28 * base_warm + 0.44 * lamp_pool + 0.30 * desk_pool, 0.0, 1.0)
    win[..., 2] = np.clip(0.16 * base_warm + 0.24 * lamp_pool + 0.16 * desk_pool, 0.0, 1.0)
    textures["window_glow"] = create_packed_image("Tex_CabinWindow_Glow", win, "sRGB")

    # 5. Ethereal Thruster Exhaust Plume Gradient
    py, px = np.mgrid[0:128, 0:64]
    t = py / 127.0
    plume = np.zeros((128, 64, 4), dtype=np.float32)
    plume[..., 0] = np.clip(0.88 * np.exp(-t * 4.2) + 0.22 * (1.0 - t), 0.0, 1.0)
    plume[..., 1] = np.clip(0.95 * np.exp(-t * 2.0) + 0.45 * (1.0 - t) ** 1.3, 0.0, 1.0)
    plume[..., 2] = np.clip(1.00 * np.exp(-t * 0.9) + 0.35 * (1.0 - t), 0.0, 1.0)
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
    mats["glass"] = make_pbr(
        "Hull_ViewportGlass",
        base_color=(0.16, 0.24, 0.36, 1.0),
        metallic=0.12,
        roughness=0.07,
        alpha=0.26,
        coat=0.60,
    )
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
# Analytic Stepped Two-Story Duplex Fuselage Evaluator
# ---------------------------------------------------------------------------
def smoothstep(e0: float, e1: float, x: float) -> float:
    if abs(e1 - e0) < 1e-9:
        return 1.0 if x >= e1 else 0.0
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


def duplex_section_params(x: float):
    """Return analytic stepped duplex hull parameters at longitudinal station x:
    (ry_low, ry_up, z_bot, z_belt, z_top, n_low, n_up, h_up, step_h).
    """
    z_nose = 1.94
    if HULL_X_MID_AFT <= x <= HULL_X_MID_FORE:
        u = (x - CX) / ((HULL_X_MID_FORE - HULL_X_MID_AFT) * 0.5)
        swell = 1.0 + 0.024 * max(0.0, 1.0 - u * u)
        ry_low = HULL_RY_LOWER * swell
        z_bot = HULL_Z_BOT - 0.05 * max(0.0, 1.0 - u * u)
        z_belt = Z_BELT
        n_low = 4.2
    elif x > HULL_X_MID_FORE:
        bow_t = max(0.0, min(1.0, (x - HULL_X_MID_FORE) / (HULL_X_BOW - HULL_X_MID_FORE)))
        profile = math.sqrt(max(0.0, 1.0 - (bow_t ** 2.08) * 0.890))
        ry_low = HULL_RY_LOWER * profile
        z_bot = HULL_Z_BOT + (z_nose - 1.15 - HULL_Z_BOT) * (bow_t ** 1.80)
        z_belt = Z_BELT + (z_nose + 1.06 - Z_BELT) * (bow_t ** 2.25)
        n_low = 4.2 - 1.7 * smoothstep(0.0, 0.90, bow_t)
    else:
        stern_t = max(0.0, min(1.0, (HULL_X_MID_AFT - x) / (HULL_X_MID_AFT - HULL_X_STERN)))
        profile = math.sqrt(max(0.0, 1.0 - (stern_t ** 1.85) * 0.36))
        ry_low = HULL_RY_LOWER * profile
        z_bot = HULL_Z_BOT + 0.64 * (stern_t ** 1.65)
        z_belt = Z_BELT - 0.24 * (stern_t ** 1.50)
        n_low = 4.2 - 0.8 * smoothstep(0.0, 1.0, stern_t)

    # Upper duplex loft height profile h_up(x) in [0, 1]
    if UPPER_X_AFT <= x <= UPPER_X_FORE:
        u_up = (x - CX) / ((UPPER_X_FORE - UPPER_X_AFT) * 0.5)
        h_up = 1.0 + 0.014 * max(0.0, 1.0 - u_up * u_up)
        n_up = 4.4
        ry_up_scale = 1.0 + 0.015 * max(0.0, 1.0 - u_up * u_up)
    elif x < UPPER_X_AFT:
        if x <= UPPER_X_TAIL_END:
            h_up = 0.0
            n_up = 2.4
            ry_up_scale = 0.80
        else:
            tf = max(0.0, min(1.0, (UPPER_X_AFT - x) / (UPPER_X_AFT - UPPER_X_TAIL_END)))
            # Smooth fastback sweep staying high over stairwell (-2.99 => tf=0.172 => h_up=0.92!)
            h_up = max(0.0, 1.0 - smoothstep(0.0, 1.0, tf ** 1.15))
            n_up = 4.4 - 2.0 * smoothstep(0.15, 1.0, tf)
            ry_up_scale = 1.0 - 0.20 * smoothstep(0.0, 1.0, tf)
    else:
        if x >= UPPER_X_NOSE_TOE:
            h_up = 0.0
            n_up = 2.4
            ry_up_scale = 0.80
        else:
            tb = max(0.0, min(1.0, (x - UPPER_X_FORE) / (UPPER_X_NOSE_TOE - UPPER_X_FORE)))
            # Sleek aerodynamic forward-raked upper bridge brow (graceful curve onto foredeck)
            h_up = math.sqrt(max(0.0, 1.0 - (tb ** 1.68)))
            n_up = 4.4 - 2.0 * smoothstep(0.0, 1.0, tb)
            ry_up_scale = 1.0 - 0.20 * smoothstep(0.0, 1.0, tb)

    target_ry_up = HULL_RY_UPPER * ry_up_scale
    inset_margin = 0.46 * smoothstep(0.0, 0.35, h_up) + 0.24 * (1.0 - smoothstep(0.0, 0.35, h_up))
    inset_margin *= min(1.0, ry_low / 2.2)
    ry_up = max(0.14, min(target_ry_up, ry_low - inset_margin))

    step_h = STEP_HALF_H * (0.35 + 0.65 * smoothstep(0.0, 0.30, h_up)) * min(1.0, ry_low / 2.4)

    deck_camber = 0.22 * min(1.0, ry_low / 3.0)
    rz_loft = (HULL_Z_ROOF - Z_BELT) * h_up
    z_top = z_belt + step_h + max(deck_camber, rz_loft)

    return ry_low, ry_up, z_bot, z_belt, z_top, n_low, n_up, h_up, step_h


# Cross-section ring layout (N_HALF = 48 => N_RING = 96 vertices per station):
#   k = 0..4   : Ventral slate thermal keel
#   k = 4..11  : Warm Apricot lower hull apron (rises cleanly up to Z ~ 0.95 beneath lower bay!)
#   k = 11..20 : Warm Porcelain lower deck flank
#   k = 20..26 : Sculpted inter-deck promenade terrace step (Z ~ 3.66 .. 3.98)
#   k = 26..48 : Warm Porcelain upper duplex loft & roof crown
K_LOWER_END = 20
K_STEP_END = 26
N_HALF = 48
N_RING = N_HALF * 2  # 96


def eval_half_profile_yz(x: float, k_float: float) -> tuple[float, float]:
    """Evaluate (y_offset >= 0, z) on the +Y outer duplex cross-section for k in [0..N_HALF]."""
    ry_low, ry_up, z_bot, z_belt, z_top, n_low, n_up, h_up, step_h = duplex_section_params(x)
    z_low_top = z_belt - step_h
    z_up_bot = z_belt + step_h

    if k_float <= K_LOWER_END:
        t = max(0.0, min(1.0, k_float / float(K_LOWER_END)))
        phi = -math.pi * 0.5 + math.pi * 0.5 * t
        c = max(0.0, math.cos(phi))
        s = max(0.0, -math.sin(phi))
        p = 2.0 / n_low
        y = ry_low * (c ** p)
        z = z_low_top - (z_low_top - z_bot) * (s ** p)
        return y, z

    if k_float <= K_STEP_END:
        u = max(0.0, min(1.0, (k_float - K_LOWER_END) / float(K_STEP_END - K_LOWER_END)))
        su_y = smoothstep(0.08, 0.92, u)
        su_z = 0.5 * u + 0.5 * smoothstep(0.0, 1.0, u)
        y = ry_low + (ry_up - ry_low) * su_y
        z = z_low_top + (z_up_bot - z_low_top) * su_z
        return y, z

    t = max(0.0, min(1.0, (k_float - K_STEP_END) / float(N_HALF - K_STEP_END)))
    psi = math.pi * 0.5 * t
    c = max(0.0, math.cos(psi))
    s = max(0.0, math.sin(psi))
    p = 2.0 / n_up
    y = ry_up * (c ** p)
    z = z_up_bot + (z_top - z_up_bot) * (s ** p)
    return y, z


def eval_hull_surface_pt(x: float, k_float: float, side: int = 1) -> Vector:
    yo, z = eval_half_profile_yz(x, k_float)
    return Vector((x, CY + side * yo, z))


def eval_hull_point_k(x: float, k_float: float, side: int = 1, proud: float = 0.0) -> Vector:
    """Evaluate point on outer hull offset along 2D cross-section normal (ideal for longitudinal belts)."""
    y0, z0 = eval_half_profile_yz(x, k_float)
    eps = 0.15
    ym, zm = eval_half_profile_yz(x, max(0.0, k_float - eps))
    yp, zp = eval_half_profile_yz(x, min(float(N_HALF), k_float + eps))
    ty, tz = yp - ym, zp - zm
    ln = math.hypot(ty, tz)
    if ln < 1e-6:
        ny, nz = 1.0, 0.0
    else:
        ny, nz = tz / ln, -ty / ln
    return Vector((x, CY + side * (y0 + ny * proud), z0 + nz * proud))


def eval_hull_point_k_3d(x: float, k_float: float, side: int = 1, proud: float = 0.0) -> Vector:
    """Evaluate point on outer hull offset along true 3D outward surface normal (ideal for sloped bow canopy!)."""
    p0 = eval_hull_surface_pt(x, k_float, side=side)
    if abs(proud) < 1e-6:
        return p0
    dx = 0.06
    dk = 0.20
    px_m = eval_hull_surface_pt(max(HULL_X_STERN, x - dx), k_float, side=side)
    px_p = eval_hull_surface_pt(min(HULL_X_BOW, x + dx), k_float, side=side)
    pk_m = eval_hull_surface_pt(x, max(0.0, k_float - dk), side=side)
    pk_p = eval_hull_surface_pt(x, min(float(N_HALF), k_float + dk), side=side)
    tx = px_p - px_m
    tk = pk_p - pk_m
    # On +Y side, tk points upward/inward (+Z/-Y), tx points +X -> tk x tx points outward (+Y/+Z/+X)!
    # On -Y side, tk points upward/inward (+Z/+Y), tx points +X -> tx x tk points outward (-Y/+Z/+X)!
    n = (tk.cross(tx) if side == 1 else tx.cross(tk))
    if n.length < 1e-6:
        return p0
    n.normalize()
    return p0 + n * proud


def eval_section_ring(x: float, inset: float = 0.0) -> list[Vector]:
    """Evaluate all N_RING=96 outer (or normal-inset) 3D points around station x."""
    outer_yz = [eval_half_profile_yz(x, float(k)) for k in range(N_HALF + 1)]
    full_yz = list(outer_yz)
    for k in range(N_HALF - 1, 0, -1):
        y_off, z = outer_yz[k]
        full_yz.append((-y_off, z))

    if abs(inset) < 1e-6:
        return [Vector((x, CY + yo, z)) for yo, z in full_yz]

    _, _, z_bot, _, z_top, _, _, _, _ = duplex_section_params(x)
    max_half_z = max(0.12, 0.5 * (z_top - z_bot) - 0.08)
    eff_inset = inset if inset < 0.0 else min(inset, max_half_z * 0.65)

    pts = []
    n = len(full_yz)
    for i in range(n):
        yp, zp = full_yz[(i - 1) % n]
        yn, zn = full_yz[(i + 1) % n]
        ty, tz = yn - yp, zn - zp
        length = math.hypot(ty, tz)
        if length < 1e-6:
            ny, nz = 0.0, 1.0
        else:
            ny, nz = -tz / length, ty / length
        yo, z = full_yz[i]
        yo_new = yo + ny * eff_inset
        z_new = z + nz * eff_inset
        if i == 0 or i == N_HALF:
            yo_new = 0.0
        if eff_inset > 0.0:
            if 0 < i < N_HALF and yo_new < 0.02:
                yo_new = 0.02
            elif i > N_HALF and yo_new > -0.02:
                yo_new = -0.02
        pts.append(Vector((x, CY + yo_new, z_new)))
    return pts


def hull_y_at_xz(x: float, z: float, side: int = -1, inset: float = 0.0, tier: str = "auto") -> float:
    """Exact outer hull Y coordinate on side (-1 = front/-Y, +1 = back/+Y) at (x, z)."""
    ry_low, ry_up, z_bot, z_belt, z_top, n_low, n_up, h_up, step_h = duplex_section_params(x)
    z_low_top = z_belt - step_h
    z_up_bot = z_belt + step_h

    use_upper = (tier == "upper") or (tier == "auto" and z >= z_belt)
    if not use_upper:
        ry = max(0.08, ry_low - inset)
        rz = max(0.08, (z_low_top - z_bot) - inset)
        dz = max(0.0, min(0.985, (z_low_top - z) / rz))
        rem = max(0.0, 1.0 - (dz ** n_low))
        sy = rem ** (1.0 / n_low)
        return CY + side * ry * sy

    ry = max(0.08, ry_up - inset)
    rz = max(0.08, (z_top - z_up_bot) - inset)
    dz = max(0.0, min(0.985, (z - z_up_bot) / rz))
    rem = max(0.0, 1.0 - (dz ** n_up))
    sy = rem ** (1.0 / n_up)
    return CY + side * ry * sy


def hull_z_at_xy(x: float, y: float, top: bool = True, inset: float = 0.0) -> float:
    """Exact outer hull Z coordinate on upper roof (top=True) or lower belly (top=False) at (x, y)."""
    ry_low, ry_up, z_bot, z_belt, z_top, n_low, n_up, h_up, step_h = duplex_section_params(x)
    z_low_top = z_belt - step_h
    z_up_bot = z_belt + step_h

    if top:
        ry = max(0.08, ry_up - inset)
        rz = max(0.08, (z_top - z_up_bot) - inset)
        dy = max(0.0, min(0.985, abs(y - CY) / ry))
        rem = max(0.0, 1.0 - (dy ** n_up))
        sz = rem ** (1.0 / n_up)
        return z_up_bot + rz * sz

    ry = max(0.08, ry_low - inset)
    rz = max(0.08, (z_low_top - z_bot) - inset)
    dy = max(0.0, min(0.985, abs(y - CY) / ry))
    rem = max(0.0, 1.0 - (dy ** n_low))
    sz = rem ** (1.0 / n_low)
    return z_low_top - rz * sz


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
# 1. Primary Stepped Two-Story Duplex Fuselage + Inter-Deck Belts & Collars
# ---------------------------------------------------------------------------
def build_fuselage(mats, col, root):
    xs = []
    def add_seg(x0, x1, steps, include_end=False):
        n_end = steps + 1 if include_end else steps
        for i in range(n_end):
            xs.append(x0 + (x1 - x0) * (i / float(steps)))

    add_seg(HULL_X_STERN, UPPER_X_TAIL_END, 4)         # stern lip
    add_seg(UPPER_X_TAIL_END, HULL_X_MID_AFT, 10)      # aft fastback climb
    add_seg(HULL_X_MID_AFT, UPPER_X_AFT, 6)            # stairwell arch
    add_seg(UPPER_X_AFT, UPPER_X_FORE, 28)             # full two-story duplex main pavilion
    add_seg(UPPER_X_FORE, UPPER_X_NOSE_TOE, 14)        # forward-raked upper bridge slope
    add_seg(UPPER_X_NOSE_TOE, HULL_X_BOW, 12, True)    # protruding lower yacht foredeck & bow nose

    # Material slots:
    # 0 = porcelain (upper loft + lower main flank)
    # 1 = apricot (lower belly apron up to Z ~ 0.95!)
    # 2 = slate (inner skin + ventral thermal keel + stern bulkhead)
    # 3 = vanilla (inter-deck promenade terrace step)
    hull_mats = [mats["porcelain"], mats["apricot"], mats["slate"], mats["vanilla"]]

    lf_cx = (LOWER_FRONT_WIN_X0 + LOWER_FRONT_WIN_X1) * 0.5
    lf_cz = (LOWER_FRONT_WIN_Z0 + LOWER_FRONT_WIN_Z1) * 0.5
    lf_w = (LOWER_FRONT_WIN_X1 - LOWER_FRONT_WIN_X0) - 0.28
    lf_h = (LOWER_FRONT_WIN_Z1 - LOWER_FRONT_WIN_Z0) - 0.28

    uf_cx = (UPPER_FRONT_WIN_X0 + UPPER_FRONT_WIN_X1) * 0.5
    uf_cz = (UPPER_FRONT_WIN_Z0 + UPPER_FRONT_WIN_Z1) * 0.5
    uf_w = (UPPER_FRONT_WIN_X1 - UPPER_FRONT_WIN_X0) - 0.28
    uf_h = (UPPER_FRONT_WIN_Z1 - UPPER_FRONT_WIN_Z0) - 0.28

    bk_cx = (BACK_WIN_X0 + BACK_WIN_X1) * 0.5
    bk_cz = (BACK_WIN_Z0 + BACK_WIN_Z1) * 0.5
    bk_w = (BACK_WIN_X1 - BACK_WIN_X0) - 0.28
    bk_h = (BACK_WIN_Z1 - BACK_WIN_Z0) - 0.28

    def is_cutout_face(p: Vector) -> bool:
        if p.y < CY - 2.4:
            if inside_stadium(p.x - lf_cx, p.z - lf_cz, lf_w, lf_h, 0.44):
                return True
            if inside_stadium(p.x - uf_cx, p.z - uf_cz, uf_w, uf_h, 0.46):
                return True
        if p.y > CY + 2.4:
            if inside_stadium(p.x - bk_cx, p.z - bk_cz, bk_w, bk_h, 0.40):
                return True
        return False

    def face_mat_idx(ix: int, j: int, is_inner: bool) -> int:
        if is_inner:
            return 2
        k = j if j < N_HALF else (N_RING - 1 - j)
        x_mid = 0.5 * (xs[ix] + xs[ix + 1])
        if k < 4 and HULL_X_MID_AFT - 1.2 <= x_mid <= HULL_X_MID_FORE + 1.6:
            return 2  # dark charcoal-slate ventral thermal keel
        if k < 11:
            return 1  # warm apricot lower hull apron (clearly visible from side & perspective!)
        if 22 <= k < 24 and UPPER_X_TAIL_END - 0.1 <= x_mid <= UPPER_X_NOSE_TOE + 1.8:
            return 3  # warm vanilla inter-deck promenade terrace shelf
        return 0  # warm porcelain ceramic shell

    bm = bmesh.new()
    outer_rings = []
    inner_rings = []
    for x in xs:
        o_pts = eval_section_ring(x, inset=0.0)
        i_pts = eval_section_ring(x, inset=WALL_THICKNESS)
        outer_rings.append([bm.verts.new(p) for p in o_pts])
        inner_rings.append([bm.verts.new(p) for p in i_pts])

    keep_grid = [[True] * N_RING for _ in range(len(xs) - 1)]
    for ix in range(len(xs) - 1):
        for j in range(N_RING):
            jn = (j + 1) % N_RING
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

    # Bridge cutout borders cleanly between outer & inner skin
    for ix in range(len(xs) - 1):
        for j in range(N_RING):
            if not keep_grid[ix][j]:
                continue
            jn = (j + 1) % N_RING
            if ix > 0 and not keep_grid[ix - 1][j]:
                f = bm.faces.new((outer_rings[ix][j], inner_rings[ix][j], inner_rings[ix][jn], outer_rings[ix][jn]))
                f.material_index = 2
            if ix < len(xs) - 2 and not keep_grid[ix + 1][j]:
                f = bm.faces.new((outer_rings[ix + 1][jn], inner_rings[ix + 1][jn], inner_rings[ix + 1][j], outer_rings[ix + 1][j]))
                f.material_index = 2
            j_prev = (j - 1) % N_RING
            if not keep_grid[ix][j_prev]:
                f = bm.faces.new((outer_rings[ix][j], outer_rings[ix + 1][j], inner_rings[ix + 1][j], inner_rings[ix][j]))
                f.material_index = 2
            if not keep_grid[ix][jn]:
                f = bm.faces.new((outer_rings[ix + 1][jn], outer_rings[ix][jn], inner_rings[ix][jn], inner_rings[ix + 1][jn]))
                f.material_index = 2

    # Cap stern bulkhead cleanly inside exact stern ring
    _, _, z_bot_st, _, z_top_st, _, _, _, _ = duplex_section_params(HULL_X_STERN)
    z_st_c = 0.5 * (z_bot_st + z_top_st)
    stern_center_out = bm.verts.new((HULL_X_STERN + 0.14, CY, z_st_c))
    stern_center_in = bm.verts.new((HULL_X_STERN + 0.34, CY, z_st_c))
    for j in range(N_RING):
        jn = (j + 1) % N_RING
        f1 = bm.faces.new((outer_rings[0][jn], outer_rings[0][j], stern_center_out))
        f1.material_index = 2
        f2 = bm.faces.new((inner_rings[0][j], inner_rings[0][jn], stern_center_in))
        f2.material_index = 2

    # Cap bow nose cleanly
    _, _, z_bot_bw, _, z_top_bw, _, _, _, _ = duplex_section_params(HULL_X_BOW)
    z_bw_c = 0.5 * (z_bot_bw + z_top_bw)
    bow_center_out = bm.verts.new((HULL_X_BOW + 0.10, CY, z_bw_c))
    bow_center_in = bm.verts.new((HULL_X_BOW - 0.16, CY, z_bw_c))
    for j in range(N_RING):
        jn = (j + 1) % N_RING
        f1 = bm.faces.new((outer_rings[-1][j], outer_rings[-1][jn], bow_center_out))
        f1.material_index = 0
        f2 = bm.faces.new((inner_rings[-1][jn], inner_rings[-1][j], bow_center_in))
        f2.material_index = 2

    unused = [v for v in bm.verts if not v.link_faces]
    if unused:
        bmesh.ops.delete(bm, geom=unused, context="VERTS")

    hull_obj = finish_mesh_object("Hull_MainBody", bm, hull_mats, col, parent=root, smooth=True, uv_scale=0.16)

    # Flush super-elliptical recessed stern thermal bulkhead + brass rim
    bm_st = bmesh.new()
    st_r0 = [bm_st.verts.new(p) for p in eval_section_ring(HULL_X_STERN, inset=0.05)]
    st_r1 = [bm_st.verts.new(Vector((p.x - 0.08, p.y, p.z))) for p in eval_section_ring(HULL_X_STERN, inset=0.14)]
    st_r2 = [bm_st.verts.new(Vector((p.x - 0.02, p.y, p.z))) for p in eval_section_ring(HULL_X_STERN, inset=0.34)]
    st_c = bm_st.verts.new((HULL_X_STERN - 0.04, CY, z_st_c))
    for j in range(N_RING):
        jn = (j + 1) % N_RING
        f_a = bm_st.faces.new((st_r0[jn], st_r0[j], st_r1[j], st_r1[jn]))
        f_a.material_index = 1
        f_b = bm_st.faces.new((st_r1[jn], st_r1[j], st_r2[j], st_r2[jn]))
        f_b.material_index = 1
        f_c = bm_st.faces.new((st_r2[jn], st_r2[j], st_c))
        f_c.material_index = 0
    finish_mesh_object("Stern_BulkheadPlate", bm_st, [mats["slate"], mats["brass"]], col, parent=root, smooth=True, uv_scale=0.35)

    # Structural circumferential bulkhead collars wrapping BOTH decks (unifying Deck 1 & Deck 2!)
    for label, x_pos, width, rad_out, mat_key in [
        ("Hull_Collar_Aft", HULL_X_MID_AFT, 0.30, 0.092, "vanilla"),
        ("Hull_Collar_AftBrass", HULL_X_MID_AFT, 0.11, 0.126, "brass"),
        ("Hull_Collar_Fore", HULL_X_MID_FORE - 0.08, 0.30, 0.092, "vanilla"),
        ("Hull_Collar_ForeBrass", HULL_X_MID_FORE - 0.08, 0.11, 0.126, "brass"),
    ]:
        bm_c = bmesh.new()
        profile_x = [
            (x_pos - width * 0.5, 0.02),
            (x_pos - width * 0.36, -rad_out),
            (x_pos + width * 0.36, -rad_out),
            (x_pos + width * 0.5, 0.02),
        ]
        rings = [
            [bm_c.verts.new(p) for p in eval_section_ring(px, inset=ins)]
            for px, ins in profile_x
        ]
        for ri in range(len(rings) - 1):
            for j in range(N_RING):
                jn = (j + 1) % N_RING
                bm_c.faces.new((rings[ri][j], rings[ri][jn], rings[ri + 1][jn], rings[ri + 1][j]))
        for j in range(N_RING):
            jn = (j + 1) % N_RING
            bm_c.faces.new((rings[-1][j], rings[-1][jn], rings[0][jn], rings[0][j]))
        finish_mesh_object(label, bm_c, mats[mat_key], col, parent=root, smooth=True, uv_scale=0.35)

    # Sculpted longitudinal accent belts riding on exact half-index k curves!
    def build_hull_band(name: str, k_center: float, k_half_span: float, proud: float, mat, x_start_idx=1, x_end_idx=-2):
        bm_b = bmesh.new()
        band_xs = xs[x_start_idx:x_end_idx]
        for side in (-1, 1):
            prev = None
            first = None
            for x in band_xs:
                ring = [
                    bm_b.verts.new(eval_hull_point_k(x, k_center - k_half_span, side=side, proud=-0.02)),
                    bm_b.verts.new(eval_hull_point_k(x, k_center - k_half_span * 0.72, side=side, proud=proud)),
                    bm_b.verts.new(eval_hull_point_k(x, k_center + k_half_span * 0.72, side=side, proud=proud)),
                    bm_b.verts.new(eval_hull_point_k(x, k_center + k_half_span, side=side, proud=-0.02)),
                ]
                if first is None:
                    first = ring
                if prev is not None:
                    for m in range(4):
                        mn = (m + 1) % 4
                        bm_b.faces.new((prev[m], prev[mn], ring[mn], ring[m]))
                prev = ring
            if first is not None:
                bm_b.faces.new(tuple(reversed(first)))
            if prev is not None:
                bm_b.faces.new(tuple(prev))
        finish_mesh_object(name, bm_b, mat, col, parent=root, smooth=True, uv_scale=0.45)

    # 1. Signature Inter-Deck Promenade Dusty-Rose Stripe + proud Brushed-Brass Belt right at Z = 3.82!
    build_hull_band("Hull_InterDeckRoseBand", k_center=21.0, k_half_span=0.78, proud=0.048, mat=mats["rose"])
    build_hull_band("Hull_InterDeckBrassBelt", k_center=22.4, k_half_span=0.44, proud=0.082, mat=mats["brass"])

    # 2. Lower Apricot-to-Porcelain Waterline Dusty-Rose & Brass Trim (Z ~ 0.95)
    build_hull_band("Hull_RoseAccentBand", k_center=11.1, k_half_span=0.65, proud=0.040, mat=mats["rose"])
    build_hull_band("Hull_BrassBeltTrim", k_center=12.0, k_half_span=0.34, proud=0.064, mat=mats["brass"])

    return hull_obj


# ---------------------------------------------------------------------------
# 2. Recessed Stacked Bay Windows, Outward-Facing Portholes & Upper Bridge Canopy
# ---------------------------------------------------------------------------
def build_stadium_viewport(
    name_prefix: str,
    cx: float,
    cz: float,
    width: float,
    height: float,
    corner_r: float,
    side: int,
    tier: str,
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
        y = hull_y_at_xz(x, z, side=side, inset=-proud, tier=tier)
        return Vector((x, y, z))

    # A. Cream Porcelain outer cowling fairing
    bm_cowl = bmesh.new()
    loops = [
        [bm_cowl.verts.new(pt_on_hull(u, v, -0.08)) for u, v in outer_pts],
        [bm_cowl.verts.new(pt_on_hull(u, v, 0.14)) for u, v in outer_pts],
        [bm_cowl.verts.new(pt_on_hull(u, v, 0.19)) for u, v in mid_pts],
        [bm_cowl.verts.new(pt_on_hull(u, v, -0.26)) for u, v in inner_pts],
        [bm_cowl.verts.new(pt_on_hull(u, v, -0.30)) for u, v in outer_pts],
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
        [bm_gask.verts.new(pt_on_hull(u, v, -0.20)) for u, v in g_inner],
        [bm_gask.verts.new(pt_on_hull(u, v, -0.20)) for u, v in g_outer],
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
                    bm_mul.verts.new((mx - 0.045, hull_y_at_xz(mx - 0.045, z, side=side, inset=0.14, tier=tier), z)),
                    bm_mul.verts.new((mx - 0.036, hull_y_at_xz(mx - 0.036, z, side=side, inset=-0.105, tier=tier), z)),
                    bm_mul.verts.new((mx + 0.036, hull_y_at_xz(mx + 0.036, z, side=side, inset=-0.105, tier=tier), z)),
                    bm_mul.verts.new((mx + 0.045, hull_y_at_xz(mx + 0.045, z, side=side, inset=0.14, tier=tier), z)),
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
    build_curved_pane(f"{name_prefix}_WarmGlow", -0.17, mats["window_glow"])


def build_porthole(name: str, x: float, z: float, radius: float, side: int, tier: str, mats, col_shell, col_win, root_shell, root_win):
    y_surf = hull_y_at_xz(x, z, side=side, inset=0.0, tier=tier)
    # Compute true OUTWARD surface normal so local +Z always faces cleanly out into space!
    # tx points +X, tz points +Z -> tx x tz = (0, -1, 0) (side=-1), tz x tx = (0, +1, 0) (side=+1).
    y_up = hull_y_at_xz(x, z + 0.25, side=side, inset=0.0, tier=tier)
    y_dn = hull_y_at_xz(x, z - 0.25, side=side, inset=0.0, tier=tier)
    y_fw = hull_y_at_xz(x + 0.25, z, side=side, inset=0.0, tier=tier)
    y_bk = hull_y_at_xz(x - 0.25, z, side=side, inset=0.0, tier=tier)
    tx = Vector((0.50, y_fw - y_bk, 0.0))
    tz = Vector((0.0, y_up - y_dn, 0.50))
    normal = (tx.cross(tz) if side == -1 else tz.cross(tx)).normalized()
    rot = normal.to_track_quat("Z", "Y").to_euler()
    loc = (x, y_surf, z)

    collar_prof = [
        (radius + 0.22, -0.20),
        (radius + 0.22, 0.05),
        (radius + 0.14, 0.13),
        (radius - 0.02, 0.13),
        (radius - 0.02, -0.20),
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

    glow_prof = [(0.0, 0.04), (radius - 0.04, 0.04)]
    v, f = lathe_mesh(glow_prof, segments=32, cap_bottom=False, cap_top=False)
    object_from_pydata(
        f"{name}_WarmGlow", v, f, mats["window_glow"], col_win, parent=root_win, location=loc, rotation=rot,
        custom_uv_fn=lambda p: (0.26 + p.x / (radius * 4.5), 0.48 + p.y / (radius * 4.5)),
    )

    dome_prof = [
        (radius - 0.03, 0.09),
        ((radius - 0.03) * 0.72, 0.16),
        ((radius - 0.03) * 0.35, 0.20),
        (0.0, 0.215),
    ]
    v, f = lathe_mesh(dome_prof, segments=32, cap_bottom=False, cap_top=False)
    object_from_pydata(f"{name}_GlassDome", v, f, mats["glass"], col_win, parent=root_win, location=loc, rotation=rot)


def build_bow_canopy_and_nose(mats, col_shell, col_win, root_shell, root_win):
    """Build the flush 3D-normal-offset upper bridge canopy + lower docking nose & headlights."""
    # --- A. Upper Duplex Forward Panoramic Loft Bridge Canopy ---
    # Sits smoothly on the sloped front brow [5.38 .. 6.84], clear of the fore collar at 4.84
    # and terminating flush above the foredeck terrace (UPPER_X_NOSE_TOE = 7.15)!
    x0, x1 = 5.40, 6.82

    def eval_canopy_pt(x: float, lat_u: float, proud: float) -> Vector:
        side = 1 if lat_u >= 0.0 else -1
        # Keep lateral sweep nicely contained on upper cheek (k in [33.5 .. 48])
        k_val = float(N_HALF) - abs(lat_u) * 14.5
        return eval_hull_point_k_3d(x, k_val, side=side, proud=proud)

    def build_canopy_patch(bm, x_start, x_end, u_span, proud, nx=14, nu=28, planar_uv=False):
        uv_layer = bm.loops.layers.uv.verify() if planar_uv else None
        grid = []
        for ix in range(nx + 1):
            tx = ix / float(nx)
            x = x_start + (x_end - x_start) * tx
            row = []
            for iu in range(nu + 1):
                tu = iu / float(nu)
                lat_u = -u_span + 2.0 * u_span * tu
                row.append((bm.verts.new(eval_canopy_pt(x, lat_u, proud)), tu, 1.0 - tx))
            grid.append(row)
        for ix in range(nx):
            for iu in range(nu):
                a, au, av = grid[ix][iu]
                b, bu, bv = grid[ix][iu + 1]
                c, cu, cv = grid[ix + 1][iu + 1]
                d, du, dv = grid[ix + 1][iu]
                f = bm.faces.new((a, b, c, d))
                if planar_uv:
                    for loop, uv in zip(f.loops, [(au, av), (bu, bv), (cu, cv), (du, dv)]):
                        loop[uv_layer].uv = uv

    bm_frame = bmesh.new()
    bm_glow = bmesh.new()
    bm_glass = bmesh.new()

    build_canopy_patch(bm_frame, x0 - 0.12, x1 + 0.12, u_span=1.06, proud=0.048)
    build_canopy_patch(bm_glow, x0, x1, u_span=1.00, proud=0.078, planar_uv=True)
    build_canopy_patch(bm_glass, x0 - 0.01, x1 + 0.01, u_span=1.01, proud=0.118)

    # Flush 3D-normal perimeter brass bezel + 2 curved interior vertical mullions (zero gaps!)
    bm_trim = bmesh.new()
    for rib_u in (-1.04, -0.34, 0.34, 1.04):
        prev = None
        first = None
        for ix in range(15):
            x = (x0 - 0.13) + (x1 - x0 + 0.26) * (ix / 14.0)
            ring = [
                bm_trim.verts.new(eval_canopy_pt(x, rib_u - 0.028, proud=-0.03)),
                bm_trim.verts.new(eval_canopy_pt(x, rib_u - 0.018, proud=0.145)),
                bm_trim.verts.new(eval_canopy_pt(x, rib_u + 0.018, proud=0.145)),
                bm_trim.verts.new(eval_canopy_pt(x, rib_u + 0.028, proud=-0.03)),
            ]
            if first is None:
                first = ring
            if prev is not None:
                for m in range(4):
                    mn = (m + 1) % 4
                    bm_trim.faces.new((prev[m], prev[mn], ring[mn], ring[m]))
            prev = ring
        if first is not None:
            bm_trim.faces.new(tuple(reversed(first)))
        if prev is not None:
            bm_trim.faces.new(tuple(prev))

    for bx in (x0 - 0.12, x1 + 0.12):
        prev = None
        first = None
        for iu in range(29):
            lat_u = -1.06 + 2.12 * (iu / 28.0)
            ring = [
                bm_trim.verts.new(eval_canopy_pt(bx - 0.055, lat_u, proud=-0.03)),
                bm_trim.verts.new(eval_canopy_pt(bx - 0.038, lat_u, proud=0.145)),
                bm_trim.verts.new(eval_canopy_pt(bx + 0.038, lat_u, proud=0.145)),
                bm_trim.verts.new(eval_canopy_pt(bx + 0.055, lat_u, proud=-0.03)),
            ]
            if first is None:
                first = ring
            if prev is not None:
                for m in range(4):
                    mn = (m + 1) % 4
                    bm_trim.faces.new((prev[m], prev[mn], ring[mn], ring[m]))
            prev = ring
        if first is not None:
            bm_trim.faces.new(tuple(reversed(first)))
        if prev is not None:
            bm_trim.faces.new(tuple(prev))

    finish_mesh_object("BowCanopy_SlateFrame", bm_frame, mats["slate"], col_shell, parent=root_shell, smooth=True)
    finish_mesh_object("BowCanopy_BrassFrame", bm_trim, mats["brass"], col_shell, parent=root_shell, smooth=True)
    finish_mesh_object("BowCanopy_WarmGlow", bm_glow, mats["window_glow"], col_win, parent=root_win, smooth=True, auto_uv=False)
    finish_mesh_object("BowCanopy_Glass", bm_glass, mats["canopy_glass"], col_win, parent=root_win, smooth=True)

    # --- B. Lower Deck Forward Docking Collar & Nose Hatch at +X ---
    _, _, z_bot_bw, _, z_top_bw, _, _, _, _ = duplex_section_params(HULL_X_BOW)
    nose_z = 0.5 * (z_bot_bw + z_top_bw)
    nose_loc = (HULL_X_BOW - 0.18, CY, nose_z)
    nose_rot = Euler((0.0, math.pi * 0.5, 0.0), "XYZ")

    collar_prof = [
        (1.42, -0.35),
        (1.42, 0.08),
        (1.30, 0.34),
        (1.16, 0.42),
        (0.96, 0.42),
        (0.90, 0.30),
        (0.90, 0.16),
    ]
    v, f = lathe_mesh(collar_prof, segments=48, cap_bottom=False, cap_top=True)
    object_from_pydata("Bow_DockingCollar", v, f, mats["porcelain"], col_shell, parent=root_shell, location=nose_loc, rotation=nose_rot)

    ring_prof = [(1.22, 0.30), (1.22, 0.46), (1.10, 0.50), (0.98, 0.46), (0.98, 0.32)]
    v, f = lathe_mesh(ring_prof, segments=48, cap_bottom=False, cap_top=False)
    object_from_pydata("Bow_DockingBrassRing", v, f, mats["brass"], col_shell, parent=root_shell, location=nose_loc, rotation=nose_rot)

    hatch_prof = [(0.94, 0.32), (0.86, 0.40), (0.44, 0.44), (0.0, 0.45)]
    v, f = lathe_mesh(hatch_prof, segments=36, cap_bottom=True, cap_top=False)
    object_from_pydata("Bow_DockingHatch", v, f, mats["apricot"], col_shell, parent=root_shell, location=nose_loc, rotation=nose_rot)

    bm_lug = bmesh.new()
    for i in range(6):
        ang = math.tau * i / 6.0
        m = (
            Matrix.Translation((1.16 * math.cos(ang), 1.16 * math.sin(ang), 0.43))
            @ Matrix.Rotation(ang, 4, "Z")
            @ Matrix.Diagonal((0.14, 0.18, 0.16, 1.0))
        )
        bmesh.ops.create_cube(bm_lug, size=1.0, matrix=m)
    bmesh.ops.bevel(bm_lug, geom=bm_lug.edges, offset=0.025, segments=2, affect="EDGES")
    finish_mesh_object("Bow_DockingLatches", bm_lug, mats["slate"], col_shell, parent=root_shell, location=nose_loc, rotation=nose_rot, smooth=True)

    # Twin warm-amber bow headlights flanking the lower docking nose
    for tag, side in (("L", -1), ("R", 1)):
        hx = HULL_X_BOW - 0.80
        hz = nose_z - 0.04
        hy = hull_y_at_xz(hx, hz, side=side, inset=0.06, tier="lower")
        h_rot = Euler((0.0, math.pi * 0.5, side * 0.34), "XYZ")
        bez_p = [(0.25, -0.24), (0.25, 0.08), (0.21, 0.16), (0.15, 0.16), (0.15, 0.02)]
        v, f = lathe_mesh(bez_p, segments=24, cap_bottom=True, cap_top=False)
        object_from_pydata(f"Bow_HeadlightBezel_{tag}", v, f, mats["brass"], col_shell, parent=root_shell, location=(hx, hy, hz), rotation=h_rot)

        lens_p = [(0.16, 0.08), (0.12, 0.17), (0.0, 0.20)]
        v, f = lathe_mesh(lens_p, segments=20, cap_bottom=True, cap_top=False)
        object_from_pydata(f"Bow_HeadlightLens_{tag}", v, f, mats["beacon_amber"], col_win, parent=root_win, location=(hx, hy, hz), rotation=h_rot)

    # Charming forward lower observation portholes on the sleek bow cheeks
    for tag, side in (("Port", -1), ("Starboard", 1)):
        build_porthole(
            f"Porthole_LowerBow_{tag}", 7.35, 2.15, 0.46, side=side, tier="lower",
            mats=mats, col_shell=col_shell, col_win=col_win, root_shell=root_shell, root_win=root_win,
        )


# ---------------------------------------------------------------------------
# 3. Twin Retro-Orbital Main Thruster Nacelles + Feathered Plumes + Tail Fin
# ---------------------------------------------------------------------------
def build_thrusters_and_fin(mats, col_thr, col_shell, root_thr, root_shell):
    for tag, sign in (("L", -1), ("R", 1)):
        loc = (THRUSTER_MOUNT_X, CY + sign * THRUSTER_Y_OFFSET, THRUSTER_Z)
        rot = Euler((0.0, -math.pi * 0.5, 0.0), "XYZ")  # local +Z points aft (-X)

        cowl_prof = [
            (0.94, -1.55),
            (1.26, -1.10),
            (1.34, -0.45),
            (1.30, 0.24),
            (1.14, 0.62),
            (0.98, 0.62),
            (0.98, 0.16),
        ]
        v, f = lathe_mesh(cowl_prof, segments=48, cap_bottom=True, cap_top=False)
        object_from_pydata(f"Thruster_Cowl_{tag}", v, f, mats["porcelain"], col_thr, parent=root_thr, location=loc, rotation=rot)

        band_prof = [(1.335, -0.78), (1.368, -0.68), (1.358, -0.15), (1.315, -0.08)]
        v, f = lathe_mesh(band_prof, segments=48, cap_bottom=False, cap_top=False)
        object_from_pydata(f"Thruster_ApricotBand_{tag}", v, f, mats["apricot"], col_thr, parent=root_thr, location=loc, rotation=rot)

        brass_prof = [(1.18, 0.44), (1.23, 0.50), (1.23, 0.68), (1.12, 0.72), (0.96, 0.68)]
        v, f = lathe_mesh(brass_prof, segments=48, cap_bottom=False, cap_top=False)
        object_from_pydata(f"Thruster_BrassCollar_{tag}", v, f, mats["brass"], col_thr, parent=root_thr, location=loc, rotation=rot)

        bell_prof = [
            (0.72, 0.54),
            (0.64, 0.74),
            (0.82, 1.04),
            (1.04, 1.46),
            (1.12, 1.82),
            (1.02, 1.84),
            (0.92, 1.44),
            (0.58, 0.82),
            (0.0, 0.76),
        ]
        v, f = lathe_mesh(bell_prof, segments=48, cap_bottom=False, cap_top=False)
        object_from_pydata(f"Thruster_Bell_{tag}", v, f, mats["titanium"], col_thr, parent=root_thr, location=loc, rotation=rot)

        bm_fin = bmesh.new()
        for fi in range(12):
            ang = math.tau * fi / 12.0
            m = (
                Matrix.Rotation(ang, 4, "Z")
                @ Matrix.Translation((0.92, 0.0, 1.00))
                @ Matrix.Rotation(-0.18, 4, "Y")
                @ Matrix.Diagonal((0.32, 0.048, 0.66, 1.0))
            )
            bmesh.ops.create_cube(bm_fin, size=1.0, matrix=m)
        bmesh.ops.bevel(bm_fin, geom=bm_fin.edges, offset=0.012, segments=2, affect="EDGES")
        finish_mesh_object(f"Thruster_CoolingFins_{tag}", bm_fin, mats["brass"], col_thr, parent=root_thr, location=loc, rotation=rot, smooth=True)

        core_prof = [(0.0, 0.84), (0.54, 0.92), (0.78, 1.42), (0.60, 1.74), (0.0, 1.96)]
        v, f = lathe_mesh(core_prof, segments=32, cap_bottom=False, cap_top=False)
        object_from_pydata(f"Thruster_Core_{tag}", v, f, mats["thruster_core"], col_thr, parent=root_thr, location=loc, rotation=rot)

        plume_loc = (THRUSTER_MOUNT_X - 1.66, CY + sign * THRUSTER_Y_OFFSET, THRUSTER_Z)
        plume_len = 3.35
        plume_prof = [
            (0.0, 0.0),
            (0.74, 0.16),
            (0.82, 0.60),
            (0.62, 1.48),
            (0.30, 2.55),
            (0.0, plume_len),
        ]
        v, f = lathe_mesh(plume_prof, segments=32, cap_bottom=False, cap_top=False)
        object_from_pydata(
            f"Thruster_Plume_{tag}", v, f, mats["thruster_plume"], col_thr, parent=root_thr,
            location=plume_loc, rotation=rot,
            custom_uv_fn=lambda p: (0.5, max(0.0, min(1.0, p.z / plume_len))),
        )

    # Center lower vernier/auxiliary thruster
    aux_loc = (HULL_X_STERN - 0.02, CY, 0.68)
    aux_rot = Euler((0.0, -math.pi * 0.5, 0.0), "XYZ")
    aux_prof = [
        (0.60, -0.58), (0.58, 0.10), (0.43, 0.30), (0.56, 0.68),
        (0.62, 0.92), (0.54, 0.92), (0.38, 0.36), (0.0, 0.32),
    ]
    v, f = lathe_mesh(aux_prof, segments=36, cap_bottom=True, cap_top=False)
    object_from_pydata("Thruster_AuxBell", v, f, mats["titanium"], col_thr, parent=root_thr, location=aux_loc, rotation=aux_rot)

    aux_core = [(0.0, 0.38), (0.36, 0.44), (0.41, 0.82), (0.0, 0.98)]
    v, f = lathe_mesh(aux_core, segments=24, cap_bottom=False, cap_top=False)
    object_from_pydata("Thruster_AuxCore", v, f, mats["thruster_core"], col_thr, parent=root_thr, location=aux_loc, rotation=aux_rot)

    # Dorsal Swept Stabilizer Tail Fin seated seamlessly along the extended aft fastback!
    bm_fin = bmesh.new()
    fin_stations = [
        (3.65, -3.65, -6.55, 0.42),   # deeply rooted inside aft deck & fastback spine
        (5.40, -3.65, -6.65, 0.34),
        (7.10, -4.35, -6.82, 0.24),
        (8.60, -5.12, -7.02, 0.14),
        (9.75, -5.75, -7.14, 0.075),
        (10.10, -6.12, -7.00, 0.042),
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
    tip_c = bm_fin.verts.new((-6.58, CY, 10.18))
    for i in range(n_af):
        inext = (i + 1) % n_af
        bm_fin.faces.new((af_rings[-1][i], af_rings[-1][inext], tip_c))
    finish_mesh_object("Hull_DorsalTailFin", bm_fin, mats["apricot"], col_shell, parent=root_shell, smooth=True, uv_scale=0.35)

    tip_loc = (-6.58, CY, 10.16)
    tip_rot = Euler((0.0, -math.pi * 0.5, 0.0), "XYZ")
    pod_prof = [(0.0, -0.60), (0.125, -0.40), (0.135, 0.24), (0.10, 0.42), (0.0, 0.48)]
    v, f = lathe_mesh(pod_prof, segments=24, cap_bottom=False, cap_top=False)
    object_from_pydata("TailFin_TipPod", v, f, mats["brass"], col_shell, parent=root_shell, location=tip_loc, rotation=tip_rot)

    bm_tb = bmesh.new()
    bmesh.ops.create_icosphere(bm_tb, subdivisions=3, radius=0.128, matrix=Matrix.Translation((-7.06, CY, 10.16)))
    finish_mesh_object("TailFin_Beacon", bm_tb, mats["beacon_amber"], col_shell, parent=root_shell, smooth=True)


# ---------------------------------------------------------------------------
# 4. Articulated Orbital Solar Wings (stately 2-bay wings on aft shoulder)
# ---------------------------------------------------------------------------
def build_solar_wings(mats, col_wings, root_wings):
    for tag, side in (("Port", -1), ("Starboard", 1)):
        p_sh = eval_hull_point_k(WING_ROOT_X, 21.5, side=side, proud=-0.16)
        pivot = make_empty(f"SolarWing_Pivot_{tag}", location=(p_sh.x, p_sh.y, p_sh.z), parent=root_wings, col=col_wings)

        bm_blist = bmesh.new()
        bmesh.ops.create_icosphere(
            bm_blist, subdivisions=3, radius=1.0,
            matrix=Matrix.Translation((0.0, -side * 0.14, 0.0)) @ Matrix.Diagonal((1.12, 0.70, 0.58, 1.0)),
        )
        finish_mesh_object(f"SolarWing_ShoulderPod_{tag}", bm_blist, mats["apricot"], col_wings, parent=pivot, smooth=True)

        dih = math.radians(WING_DIHEDRAL_DEG)
        swp = math.radians(WING_SWEEP_DEG)
        wing_rot = Euler((side * dih, 0.0, -side * swp), "XYZ")
        wing_arm = make_empty(f"SolarWing_Arm_{tag}", location=(0.0, side * 0.34, 0.0), parent=pivot, col=col_wings)
        wing_arm.rotation_euler = wing_rot

        gimbal_rot = Euler((-side * math.pi * 0.5, 0.0, 0.0), "XYZ")
        g_prof = [
            (0.42, -0.38), (0.42, 0.18), (0.34, 0.28), (0.18, 0.35),
            (0.16, 0.98), (0.25, 1.02), (0.25, 1.12), (0.0, 1.12),
        ]
        v, f = lathe_mesh(g_prof, segments=32, cap_bottom=True, cap_top=False)
        object_from_pydata(f"SolarWing_Gimbal_{tag}", v, f, mats["brass"], col_wings, parent=wing_arm, rotation=gimbal_rot)

        bm_spar = bmesh.new()
        m_sp = Matrix.Translation((0.0, side * 3.16, -0.058)) @ Matrix.Diagonal((0.23, 4.46, 0.092, 1.0))
        bmesh.ops.create_cube(bm_spar, size=1.0, matrix=m_sp)
        bmesh.ops.bevel(bm_spar, geom=bm_spar.edges, offset=0.025, segments=2, affect="EDGES")
        finish_mesh_object(f"SolarWing_Spar_{tag}", bm_spar, mats["brass"], col_wings, parent=wing_arm, smooth=True)

        bay_specs = [
            (f"SolarWing_BayInner_{tag}", 1.00, 3.08, WING_CHORD),
            (f"SolarWing_BayOuter_{tag}", 3.26, 5.34, WING_CHORD * 0.88),
        ]
        for bname, y0, y1, chord in bay_specs:
            ymid = side * (y0 + y1) * 0.5
            blen = y1 - y0
            thick = 0.102

            bm_fr = bmesh.new()
            m_fr = Matrix.Translation((0.0, ymid, 0.0)) @ Matrix.Diagonal((chord, blen, thick, 1.0))
            bmesh.ops.create_cube(bm_fr, size=1.0, matrix=m_fr)
            bmesh.ops.bevel(bm_fr, geom=bm_fr.edges, offset=0.044, segments=3, affect="EDGES")
            finish_mesh_object(f"{bname}_Frame", bm_fr, mats["porcelain"], col_wings, parent=wing_arm, smooth=True, uv_scale=0.4)

            bm_rail = bmesh.new()
            for ex in (-chord * 0.49, chord * 0.49):
                m_r = Matrix.Translation((ex, ymid, 0.0)) @ Matrix.Diagonal((0.09, blen * 0.96, thick * 1.15, 1.0))
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
        for hx in (-0.72, 0.72):
            m_h = Matrix.Translation((hx, side * 3.17, 0.0)) @ Matrix.Diagonal((0.18, 0.28, 0.14, 1.0))
            bmesh.ops.create_cube(bm_hinge, size=1.0, matrix=m_h)
        bmesh.ops.bevel(bm_hinge, geom=bm_hinge.edges, offset=0.03, segments=2, affect="EDGES")
        finish_mesh_object(f"SolarWing_Hinges_{tag}", bm_hinge, mats["brass"], col_wings, parent=wing_arm, smooth=True)

        bm_tip = bmesh.new()
        bmesh.ops.create_icosphere(bm_tip, subdivisions=3, radius=0.125, matrix=Matrix.Translation((0.0, side * 5.42, 0.0)))
        beacon_mat = mats["beacon_rose"] if side == -1 else mats["beacon_mint"]
        finish_mesh_object(f"SolarWing_Beacon_{tag}", bm_tip, beacon_mat, col_wings, parent=wing_arm, smooth=True)


# ---------------------------------------------------------------------------
# 5. Dorsal Roof Crown (Skylight, Comms Dish, Mast), Ventral Keel/Skids & RCS
# ---------------------------------------------------------------------------
def build_dorsal_and_ventral_details(mats, col_det, col_win, root_det, root_win):
    # Dorsal roof spine perched cleanly atop the Upper Duplex Loft roof crown
    bm_spine = bmesh.new()
    sp_xs = [-2.25, -1.75, -0.30, 1.25, 2.80, 4.05, 4.65]
    prev_ring = None
    for i, x in enumerate(sp_xs):
        w = 1.08 if 1 <= i <= 5 else 0.54
        h = 0.34 if 1 <= i <= 5 else 0.04
        z_base = hull_z_at_xy(x, CY, top=True, inset=0.12)
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

    # Dorsal skylight frame + warm glow directly above upper bedroom
    sky_x = 1.15
    z_sky = hull_z_at_xy(sky_x, CY, top=True, inset=-0.35)
    bm_sf = bmesh.new()
    bmesh.ops.create_cube(bm_sf, size=1.0, matrix=Matrix.Translation((sky_x, CY, z_sky)) @ Matrix.Diagonal((3.10, 1.08, 0.14, 1.0)))
    bmesh.ops.bevel(bm_sf, geom=bm_sf.edges, offset=0.05, segments=3, affect="EDGES")
    finish_mesh_object("Dorsal_SkylightFrame", bm_sf, mats["brass"], col_det, parent=root_det, smooth=True)

    bm_sg = bmesh.new()
    bmesh.ops.create_cube(bm_sg, size=1.0, matrix=Matrix.Translation((sky_x, CY, z_sky + 0.05)) @ Matrix.Diagonal((2.82, 0.84, 0.06, 1.0)))
    bmesh.ops.bevel(bm_sg, geom=bm_sg.edges, offset=0.02, segments=2, affect="EDGES")
    finish_mesh_object("Dorsal_SkylightGlow", bm_sg, mats["window_glow"], col_win, parent=root_win, smooth=True, uv_scale=0.32)

    # Dorsal Comms Dish Assembly (preserves exact name `Comms_ParabolicDish` for animation!)
    dish_x, dish_y = 3.65, CY + 0.48
    dish_z = hull_z_at_xy(dish_x, dish_y, top=True, inset=0.06)
    ped_prof = [(0.52, -0.18), (0.48, 0.16), (0.32, 0.34), (0.14, 0.38), (0.12, 0.84), (0.0, 0.86)]
    v, f = lathe_mesh(ped_prof, segments=32, cap_bottom=True, cap_top=False)
    object_from_pydata("Comms_Pedestal", v, f, mats["porcelain"], col_det, parent=root_det, location=(dish_x, dish_y, dish_z))

    dish_loc = (dish_x + 0.04, dish_y, dish_z + 0.94)
    dish_rot = Euler((0.18, 0.55, 0.25), "XYZ")
    dish_prof = [
        (0.0, 0.0), (0.32, 0.04), (0.68, 0.16), (0.94, 0.35),
        (0.98, 0.35), (0.74, 0.12), (0.34, -0.02), (0.0, -0.06),
    ]
    v, f = lathe_mesh(dish_prof, segments=40, cap_bottom=False, cap_top=False)
    object_from_pydata("Comms_ParabolicDish", v, f, mats["brass"], col_det, parent=root_det, location=dish_loc, rotation=dish_rot)

    feed_prof = [(0.06, 0.0), (0.035, 0.52), (0.11, 0.56), (0.11, 0.66), (0.0, 0.70)]
    v, f = lathe_mesh(feed_prof, segments=20, cap_bottom=True, cap_top=False)
    object_from_pydata("Comms_FeedHorn", v, f, mats["slate"], col_det, parent=root_det, location=dish_loc, rotation=dish_rot)

    # Dorsal Telemetry Mast
    ant_x, ant_y = -1.55, CY - 0.55
    ant_z = hull_z_at_xy(ant_x, ant_y, top=True, inset=0.05)
    ant_prof = [(0.26, -0.14), (0.22, 0.14), (0.06, 0.22), (0.032, 1.38), (0.075, 1.43), (0.0, 1.49)]
    v, f = lathe_mesh(ant_prof, segments=20, cap_bottom=True, cap_top=False)
    object_from_pydata("Comms_TelemetryMast", v, f, mats["brass"], col_det, parent=root_det, location=(ant_x, ant_y, ant_z))

    # Four Streamlined RCS Attitude Thruster Blister Pods (cleanly clear of vertical collars!)
    for tag, rx, rz, side in (
        ("Fore_Port", 5.85, 1.20, -1),
        ("Fore_Starboard", 5.85, 1.20, 1),
        ("Aft_Port", -5.45, 1.15, -1),
        ("Aft_Starboard", -5.45, 1.15, 1),
    ):
        ry = hull_y_at_xz(rx, rz, side=side, inset=0.08, tier="lower")
        bm_rcs = bmesh.new()
        bmesh.ops.create_icosphere(bm_rcs, subdivisions=3, radius=1.0, matrix=Matrix.Diagonal((0.72, 0.36, 0.30, 1.0)))
        finish_mesh_object(f"RCS_Pod_{tag}", bm_rcs, mats["slate"], col_det, parent=root_det, location=(rx, ry, rz), smooth=True)

        for ntag, n_off, n_rot in (
            ("Out", (0.0, side * 0.30, 0.0), Euler((-side * math.pi * 0.5, 0.0, 0.0), "XYZ")),
            ("Up", (0.0, side * 0.15, 0.24), Euler((0.0, 0.0, 0.0), "XYZ")),
            ("Down", (0.0, side * 0.15, -0.24), Euler((math.pi, 0.0, 0.0), "XYZ")),
        ):
            n_prof = [(0.058, -0.06), (0.048, 0.04), (0.085, 0.15), (0.070, 0.15), (0.038, 0.04), (0.0, 0.02)]
            v, f = lathe_mesh(n_prof, segments=16, cap_bottom=False, cap_top=False)
            object_from_pydata(
                f"RCS_Nozzle_{tag}_{ntag}", v, f, mats["brass"], col_det, parent=root_det,
                location=(rx + n_off[0], ry + n_off[1], rz + n_off[2]), rotation=n_rot,
            )

    # Ventral Belly Docking Ring, Radiator Louvres & 4 Tucked Landing Pods
    z_belly = hull_z_at_xy(CX, CY, top=False, inset=0.04)
    vd_loc = (CX, CY, z_belly - 0.04)
    vd_rot = Euler((math.pi, 0.0, 0.0), "XYZ")
    vd_prof = [(1.54, -0.22), (1.48, 0.08), (1.28, 0.18), (1.10, 0.18), (1.04, 0.08), (0.0, 0.05)]
    v, f = lathe_mesh(vd_prof, segments=40, cap_bottom=True, cap_top=False)
    object_from_pydata("Ventral_DockingRing", v, f, mats["brass"], col_det, parent=root_det, location=vd_loc, rotation=vd_rot)

    bm_vent = bmesh.new()
    for bx in (-1.85, 3.85):
        for vi in range(5):
            vy = CY - 0.96 + vi * 0.48
            vz = hull_z_at_xy(bx, vy, top=False, inset=0.0)
            m_v = Matrix.Translation((bx, vy, vz - 0.02)) @ Matrix.Diagonal((1.45, 0.16, 0.12, 1.0))
            bmesh.ops.create_cube(bm_vent, size=1.0, matrix=m_v)
    bmesh.ops.bevel(bm_vent, geom=bm_vent.edges, offset=0.03, segments=2, affect="EDGES")
    finish_mesh_object("Ventral_RadiatorLouvres", bm_vent, mats["titanium"], col_det, parent=root_det, smooth=True)

    for tag, lx, ly_sign in (
        ("Fore_Port", 4.15, -1),
        ("Fore_Starboard", 4.15, 1),
        ("Aft_Port", -2.55, -1),
        ("Aft_Starboard", -2.55, 1),
    ):
        ly = CY + ly_sign * 2.75
        lz = hull_z_at_xy(lx, ly, top=False, inset=0.08)
        bm_skid = bmesh.new()
        bmesh.ops.create_icosphere(
            bm_skid, subdivisions=3, radius=1.0,
            matrix=Matrix.Translation((lx, ly, lz - 0.10)) @ Matrix.Diagonal((1.10, 0.48, 0.34, 1.0)),
        )
        finish_mesh_object(f"Ventral_LandingPod_{tag}", bm_skid, mats["porcelain"], col_det, parent=root_det, smooth=True)

        pad_loc = (lx, ly, lz - 0.38)
        pad_prof = [(0.36, -0.06), (0.40, 0.04), (0.32, 0.12), (0.0, 0.12)]
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

    # Stacked Front Hero Viewports (Deck 1 Studio + Deck 2 Loft Bedroom)
    build_stadium_viewport(
        "Viewport_FrontBay",
        cx=(LOWER_FRONT_WIN_X0 + LOWER_FRONT_WIN_X1) * 0.5,
        cz=(LOWER_FRONT_WIN_Z0 + LOWER_FRONT_WIN_Z1) * 0.5,
        width=(LOWER_FRONT_WIN_X1 - LOWER_FRONT_WIN_X0),
        height=(LOWER_FRONT_WIN_Z1 - LOWER_FRONT_WIN_Z0),
        corner_r=0.54,
        side=-1,
        tier="lower",
        mullion_xs=[0.30, 2.00],
        mats=mats,
        col_shell=col_shell,
        col_win=col_win,
        root_shell=root_shell,
        root_win=root_win,
    )
    build_stadium_viewport(
        "Viewport_UpperFrontBay",
        cx=(UPPER_FRONT_WIN_X0 + UPPER_FRONT_WIN_X1) * 0.5,
        cz=(UPPER_FRONT_WIN_Z0 + UPPER_FRONT_WIN_Z1) * 0.5,
        width=(UPPER_FRONT_WIN_X1 - UPPER_FRONT_WIN_X0),
        height=(UPPER_FRONT_WIN_Z1 - UPPER_FRONT_WIN_Z0),
        corner_r=0.58,
        side=-1,
        tier="upper",
        mullion_xs=[0.30, 2.00],
        mats=mats,
        col_shell=col_shell,
        col_win=col_win,
        root_shell=root_shell,
        root_win=root_win,
    )

    # Lower Back Panoramic Window (matches interior Earth-facing panorama)
    build_stadium_viewport(
        "Viewport_BackPanorama",
        cx=(BACK_WIN_X0 + BACK_WIN_X1) * 0.5,
        cz=(BACK_WIN_Z0 + BACK_WIN_Z1) * 0.5,
        width=(BACK_WIN_X1 - BACK_WIN_X0),
        height=(BACK_WIN_Z1 - BACK_WIN_Z0),
        corner_r=0.46,
        side=1,
        tier="lower",
        mullion_xs=[],
        mats=mats,
        col_shell=col_shell,
        col_win=col_win,
        root_shell=root_shell,
        root_win=root_win,
    )

    # Upper Back Bedroom Trio of Cozy Riveted Brass Portholes (+Y flank)
    for idx, px in enumerate((-0.60, 1.15, 2.90), start=1):
        build_porthole(
            f"Porthole_UpperBack_{idx}", px, 6.02, 0.58, side=1, tier="upper",
            mats=mats, col_shell=col_shell, col_win=col_win, root_shell=root_shell, root_win=root_win,
        )

    # Stairwell Portholes on Aft Flank (echoing the two-story interior staircase!)
    build_porthole(
        "Porthole_StairLowerFront", -2.55, 2.18, 0.56, side=-1, tier="lower",
        mats=mats, col_shell=col_shell, col_win=col_win, root_shell=root_shell, root_win=root_win,
    )
    build_porthole(
        "Porthole_StairUpperFront", -2.55, 5.75, 0.50, side=-1, tier="upper",
        mats=mats, col_shell=col_shell, col_win=col_win, root_shell=root_shell, root_win=root_win,
    )
    build_porthole(
        "Porthole_StairLowerBack", -2.60, 2.28, 0.56, side=1, tier="lower",
        mats=mats, col_shell=col_shell, col_win=col_win, root_shell=root_shell, root_win=root_win,
    )

    build_bow_canopy_and_nose(mats, col_shell, col_win, root_shell, root_win)
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
    parser = argparse.ArgumentParser(description="Build PocketWorld duplex orbital spacecraft hull.")
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
