"""Build the PocketWorld mid-century walnut & brushed-brass tabletop vinyl record rack in Blender 5.2+.

Durable procedural generator matching `assets/models/cabin/open-cabin.blend` and the exact slot
kinematics in `src/scene/orbital/media/record-motion.ts`.

Usage:
  blender --background --factory-startup --python scripts/build-vinyl-rack.py
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
# Master dimensions (Blender Z-up metres, exact 1:1 match with Three.js cabin local space)
# Blender (-Y) maps to Three.js (+Z, front toward room/turntable).
# Blender (+Z) maps to Three.js (+Y, up).
# Blender (+X) maps to Three.js (+X, right toward turntable).
# ---------------------------------------------------------------------------
SEED = 20261121

SLOT_COUNT = 6
SLOT_PITCH_X = 0.146
SLOT_X0 = -0.380  # Slots at local X: -0.380, -0.234, -0.088, +0.058, +0.204, +0.350

DISC_RADIUS = 0.170
DISC_YAW = math.pi / 6.0  # +30 deg around vertical axis (Three.js +Y / Blender +Z)
DISC_LEAN = -0.140        # -8.02 deg top tilt backward along slot normal

COS_YAW = math.cos(DISC_YAW)
SIN_YAW = math.sin(DISC_YAW)
COS_LEAN = math.cos(DISC_LEAN)
SIN_NEG_LEAN = math.sin(-DISC_LEAN)

# In-plane basis vectors for each vinyl slot (Blender coordinates: Y_bl = -Z_three, Z_bl = +Y_three)
SLOT_AXIS_X = Vector((COS_YAW, SIN_YAW, 0.0))
SLOT_AXIS_UP = Vector((-SIN_YAW * SIN_NEG_LEAN, COS_YAW * SIN_NEG_LEAN, COS_LEAN))
SLOT_AXIS_NORM = Vector((SIN_YAW * COS_LEAN, -COS_YAW * COS_LEAN, SIN_NEG_LEAN))

# Bottom rim contact offset in Blender XY relative to disc center (x_slot, 0, DISC_CENTER_Z)
DISC_CENTER_Z = 0.222
DISC_BOT_DX = DISC_RADIUS * SIN_YAW * SIN_NEG_LEAN     # +0.01186 m
DISC_BOT_DY = -DISC_RADIUS * COS_YAW * SIN_NEG_LEAN    # -0.02054 m

# Base plinth & feet
PLINTH_HALF_X = 0.580   # Inner span between left and right sculpted walnut cheek panels
CHEEK_THICK = 0.028
OUTER_HALF_X = PLINTH_HALF_X + CHEEK_THICK  # 0.608 m (total width 1.216 m)
PLINTH_HALF_Y = 0.148                       # total depth 0.296 m

FOOT_Z0 = 0.000
PLINTH_Z0 = 0.022
PLINTH_FLOOR_Z = 0.052  # Solid lower walnut slab top (floor under grooves)
PLINTH_TOP_Z = 0.068    # Slotted upper walnut deck top (16 mm deep milled grooves)

# Diagonal 30-degree milled groove band
GROOVE_Y0 = -0.088
GROOVE_Y1 = 0.048
GROOVE_WIDTH_PERP = 0.026
GROOVE_HALF_X = (GROOVE_WIDTH_PERP * 0.5) / SIN_YAW  # 0.026 m horizontal half-width
COT_YAW = COS_YAW / SIN_YAW                           # sqrt(3) = 1.73205

# Felt pad inside each groove (lowest disc vinyl rim sits at Z = 0.222 - 0.16931 = 0.05269)
FELT_Z0 = 0.0500
FELT_Z1 = 0.0525

# Seven brushed-brass wire dividers (k = 0..6, centered in the 73 mm perpendicular gap between discs)
DIVIDER_X0 = -0.447
DIVIDER_RADIUS = 0.0038  # 7.6 mm diameter satin-brass rod (crisp readability from panorama & focus views)

# Twin rear horizontal brushed-brass stabilizer rails
REAR_RAIL_Y = 0.122
REAR_RAIL_Z_LOW = 0.142
REAR_RAIL_Z_HIGH = 0.258
REAR_RAIL_RADIUS = 0.0048

# Sculpted walnut end cheek panel height range (tailored slightly above rear brass arches)
CHEEK_Z0 = 0.022
CHEEK_FRONT_Z = 0.172
CHEEK_REAR_Z = 0.314


def slot_center_x(slot: int) -> float:
    return SLOT_X0 + slot * SLOT_PITCH_X


def groove_x_at_y(slot: int, y: float) -> float:
    return (slot_center_x(slot) + DISC_BOT_DX) + (y - DISC_BOT_DY) * COT_YAW


def divider_center_x(k: int) -> float:
    return DIVIDER_X0 + k * SLOT_PITCH_X


# ---------------------------------------------------------------------------
# Pole-safe revolved-surface helper (shared pole vertices, watertight rings)
# ---------------------------------------------------------------------------
def lathe_mesh(profile, segments: int = 36, close_profile: bool = False, cap_bottom: bool = False, cap_top: bool = False):
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


def get_collection(name: str, parent=None):
    col = bpy.data.collections.new(name)
    if parent is None:
        bpy.context.scene.collection.children.link(col)
    else:
        parent.children.link(col)
    return col


def link_object(obj: bpy.types.Object, col: bpy.types.Collection):
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    col.objects.link(obj)


def make_empty(name: str, location=(0.0, 0.0, 0.0), parent=None, col=None):
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "PLAIN_AXES"
    empty.empty_display_size = 0.04
    empty.location = location
    if col is not None:
        link_object(empty, col)
    else:
        bpy.context.scene.collection.objects.link(empty)
    if parent is not None:
        empty.parent = parent
    return empty


def set_smooth(mesh: bpy.types.Mesh, smooth: bool = True):
    if mesh.polygons:
        mesh.polygons.foreach_set("use_smooth", [smooth] * len(mesh.polygons))
    mesh.update()


def set_smart_smooth(mesh: bpy.types.Mesh, flat_axis: str = "z", threshold: float = 0.96):
    """Keep broad planar faces crisp/flat while smoothing bevels and curved transitions."""
    for poly in mesh.polygons:
        n = poly.normal
        is_flat = (
            (flat_axis == "x" and abs(n.x) >= threshold)
            or (flat_axis == "z" and (abs(n.z) >= threshold or abs(n.y) >= threshold or abs(n.x) >= threshold))
        )
        poly.use_smooth = not is_flat
    mesh.update()


def auto_uv_box(mesh: bpy.types.Mesh, scale: float = 2.0, world_offset: Vector | None = None):
    """Tri-planar world-consistent box projection so wood grain flows seamlessly along X across joined parts."""
    offset = Vector((0.0, 0.0, 0.0)) if world_offset is None else world_offset
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv_layer = bm.loops.layers.uv.verify()
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
            loop[uv_layer].uv = (u, v)
    bm.to_mesh(mesh)
    bm.free()


def uv_side_grain(mesh: bpy.types.Mesh, scale: float = 2.2):
    """Project wood grain horizontally along the cheek panel (Y length, Z rings)."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv_layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        n = face.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in face.loops:
            co = loop.vert.co
            if ax >= ay and ax >= az:
                u, v = co.y * scale + 0.5, co.z * scale + 0.5
            elif az >= ay:
                u, v = co.y * scale + 0.5, co.x * scale + 0.5
            else:
                u, v = co.x * scale + 0.5, co.z * scale + 0.5
            loop[uv_layer].uv = (u, v)
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
    uv_scale: float = 2.0,
    role: str = "rack_part",
):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    if uv_mode == "side":
        uv_side_grain(mesh, scale=uv_scale)
    else:
        auto_uv_box(mesh, scale=uv_scale, world_offset=Vector(location))

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
    uv_scale: float = 2.0,
    role: str = "rack_part",
):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    if uv_mode == "side":
        uv_side_grain(mesh, scale=uv_scale)
    else:
        auto_uv_box(mesh, scale=uv_scale, world_offset=Vector(location))

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
            profile=0.5,
            affect="EDGES",
            clamp_overlap=True,
        )
    return bm


def make_extruded_polygon_bm(
    poly_xy: list[tuple[float, float]],
    z0: float,
    z1: float,
    bevel_width: float = 0.0018,
    bevel_segments: int = 2,
    bevel_top_only: bool = False,
) -> bmesh.types.BMesh:
    """Create a clean watertight extruded 2D convex/simple polygon from z0 to z1 with optional bevel."""
    bm = bmesh.new()
    bot_verts = [bm.verts.new((x, y, z0)) for x, y in poly_xy]
    top_verts = [bm.verts.new((x, y, z1)) for x, y in poly_xy]
    n = len(poly_xy)
    bm.faces.new(list(reversed(bot_verts)))
    bm.faces.new(top_verts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot_verts[i], bot_verts[j], top_verts[j], top_verts[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel_width > 0.0:
        if bevel_top_only:
            edges = [e for e in bm.edges if e.verts[0].co.z > (z0 + z1) * 0.5 and e.verts[1].co.z > (z0 + z1) * 0.5]
        else:
            edges = list(bm.edges)
        if edges:
            bmesh.ops.bevel(
                bm,
                geom=edges,
                offset=bevel_width,
                offset_type="OFFSET",
                segments=bevel_segments,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
    return bm


def make_swept_tube_bm(
    points: list[Vector],
    radius_n: float,
    radius_b: float | None = None,
    ring_segs: int = 16,
    cap_ends: bool = True,
    ref_hint: Vector | None = None,
) -> bmesh.types.BMesh:
    """Sweep an elliptical or circular cross-section cleanly along a 3D polyline."""
    rb = radius_n if radius_b is None else radius_b
    # Filter near-duplicate points to avoid zero-length tangents
    cleaned = [points[0]]
    for pt in points[1:]:
        if (pt - cleaned[-1]).length > 1e-5:
            cleaned.append(pt)
    points = cleaned

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
            t0 = (points[i] - points[i - 1]).normalized()
            t1 = (points[i + 1] - points[i]).normalized()
            tangent = (t0 + t1)
            tangent = tangent.normalized() if tangent.length > 1e-6 else t1
        if prev_n is None:
            if ref_hint is not None and abs(tangent.dot(ref_hint.normalized())) < 0.95:
                ref = ref_hint.normalized()
            else:
                ref = Vector((0.0, 0.0, 1.0)) if abs(tangent.z) < 0.9 else Vector((1.0, 0.0, 0.0))
            normal = (ref - tangent * ref.dot(tangent)).normalized()
        else:
            normal = prev_n - tangent * prev_n.dot(tangent)
            if normal.length < 1e-5:
                ref = Vector((1.0, 0.0, 0.0)) if abs(tangent.x) < 0.9 else Vector((0.0, 1.0, 0.0))
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


def fillet_polyline(ctrl: list[Vector], radii: list[float], arc_segs: int = 7) -> list[Vector]:
    """Round interior corners of a 3D polyline with exact circular tangent fillets."""
    n = len(ctrl)
    if n < 3:
        return list(ctrl)
    out = [ctrl[0].copy()]
    for i in range(1, n - 1):
        p_prev, p_cur, p_next = ctrl[i - 1], ctrl[i], ctrl[i + 1]
        v_in = p_prev - p_cur
        v_out = p_next - p_cur
        len_in = v_in.length
        len_out = v_out.length
        r = radii[i - 1]
        if r <= 1e-6 or len_in < 1e-5 or len_out < 1e-5:
            out.append(p_cur.copy())
            continue
        u_in = v_in / len_in
        u_out = v_out / len_out
        cos_a = max(-0.999, min(0.999, u_in.dot(u_out)))
        half_angle = 0.5 * math.acos(cos_a)
        tan_half = math.tan(half_angle)
        if tan_half < 1e-4:
            out.append(p_cur.copy())
            continue
        d = min(r / tan_half, len_in * 0.44, len_out * 0.44)
        eff_r = d * tan_half
        p_start = p_cur + u_in * d
        p_end = p_cur + u_out * d
        bisector = (u_in + u_out)
        if bisector.length < 1e-6:
            out.append(p_cur.copy())
            continue
        bisector.normalize()
        center = p_cur + bisector * (eff_r / math.sin(half_angle))
        va = p_start - center
        vb = p_end - center
        # Spherical interpolation along circular arc from va to vb
        omega = math.acos(max(-1.0, min(1.0, va.normalized().dot(vb.normalized()))))
        if omega < 1e-5:
            out.append(p_start)
            out.append(p_end)
            continue
        sin_o = math.sin(omega)
        for s in range(arc_segs + 1):
            t = s / arc_segs
            pt = center + va * (math.sin((1.0 - t) * omega) / sin_o) + vb * (math.sin(t * omega) / sin_o)
            out.append(pt)
    out.append(ctrl[-1].copy())
    return out


# ---------------------------------------------------------------------------
# Packed procedural PNG textures (256px / 128px, glTF-safe, zero external files)
# ---------------------------------------------------------------------------
def create_packed_image(name: str, rgba: np.ndarray, colorspace: str = "sRGB"):
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


def generate_textures() -> dict[str, bpy.types.Image]:
    rng = np.random.default_rng(SEED)
    sz = 256
    u = np.linspace(0.0, 1.0, sz, endpoint=False, dtype=np.float32)
    v = np.linspace(0.0, 1.0, sz, endpoint=False, dtype=np.float32)
    uu, vv = np.meshgrid(u, v)

    textures: dict[str, bpy.types.Image] = {}

    # 1. Warm American Walnut (rich mid-century caramel-walnut matching cabin chair & turntable)
    n_low = smooth_noise_2d(rng, sz, 6)
    n_mid = smooth_noise_2d(rng, sz, 18)
    n_hi = smooth_noise_2d(rng, sz, 48)
    warp = 0.22 * np.sin(math.tau * uu * 1.0 + 3.2 * n_low) + 0.09 * (n_mid - 0.5)
    cathedral = 0.5 + 0.5 * np.sin(math.tau * (vv * 5.5 + warp))
    grain = np.power(cathedral, 0.72)
    fine_fiber = 0.5 + 0.5 * np.sin(math.tau * (vv * 36.0 + 0.45 * n_mid + 0.12 * n_hi))
    pores = np.where(n_hi > 0.80, (n_hi - 0.80) * 4.0, 0.0)

    walnut = np.ones((sz, sz, 4), dtype=np.float32)
    # Rich oil-rubbed mid-century American walnut (sRGB ~ #56321b to #84512e) — warm contrast against oak desk
    walnut[..., 0] = 0.340 + 0.145 * grain + 0.024 * fine_fiber - 0.042 * pores
    walnut[..., 1] = 0.198 + 0.095 * grain + 0.016 * fine_fiber - 0.028 * pores
    walnut[..., 2] = 0.108 + 0.056 * grain + 0.010 * fine_fiber - 0.018 * pores
    textures["walnut_albedo"] = create_packed_image("Tex_VinylRackWalnut_Albedo", walnut, "sRGB")

    walnut_r = np.ones((sz, sz, 4), dtype=np.float32)
    wr = 0.44 + 0.13 * (1.0 - grain) + 0.08 * pores
    walnut_r[..., 0] = walnut_r[..., 1] = walnut_r[..., 2] = np.clip(wr, 0.40, 0.68)
    textures["walnut_rough"] = create_packed_image("Tex_VinylRackWalnut_Rough", walnut_r, "Non-Color")

    # 2. Roasted Deep Walnut (groove inner walls & shadow undercut trim)
    walnut_dk = np.ones((sz, sz, 4), dtype=np.float32)
    walnut_dk[..., 0] = 0.225 + 0.080 * grain + 0.015 * fine_fiber - 0.026 * pores
    walnut_dk[..., 1] = 0.130 + 0.052 * grain + 0.010 * fine_fiber - 0.018 * pores
    walnut_dk[..., 2] = 0.072 + 0.032 * grain + 0.006 * fine_fiber - 0.012 * pores
    textures["walnut_dark_albedo"] = create_packed_image("Tex_VinylRackWalnutDark_Albedo", walnut_dk, "sRGB")

    # 3. Satin Brushed Vintage Brass (matches cabin lamp, clock & trash-can brass hardware)
    brush_1d = rng.normal(0.0, 0.024, (sz, 1)).astype(np.float32)
    brush_2d = np.repeat(brush_1d, sz, axis=1) + 0.012 * (smooth_noise_2d(rng, sz, 32) - 0.5)
    brass = np.ones((sz, sz, 4), dtype=np.float32)
    brass[..., 0] = 0.855 + 0.022 * brush_2d
    brass[..., 1] = 0.688 + 0.018 * brush_2d
    brass[..., 2] = 0.375 + 0.014 * brush_2d
    textures["brass_albedo"] = create_packed_image("Tex_VinylRackBrass_Albedo", brass, "sRGB")

    brass_r = np.ones((sz, sz, 4), dtype=np.float32)
    br = 0.30 + 0.18 * (brush_2d + 0.04)
    brass_r[..., 0] = brass_r[..., 1] = brass_r[..., 2] = np.clip(br, 0.22, 0.42)
    textures["brass_rough"] = create_packed_image("Tex_VinylRackBrass_Rough", brass_r, "Non-Color")

    # 4. Warm Charcoal Wool Felt (groove cushion liners & non-slip foot pads)
    fsz = 128
    fn1 = smooth_noise_2d(rng, fsz, 32)
    fn2 = smooth_noise_2d(rng, fsz, 64)
    felt_var = 0.5 * fn1 + 0.5 * fn2 - 0.5
    felt = np.ones((fsz, fsz, 4), dtype=np.float32)
    felt[..., 0] = 0.175 + 0.032 * felt_var
    felt[..., 1] = 0.162 + 0.030 * felt_var
    felt[..., 2] = 0.155 + 0.028 * felt_var
    textures["felt_albedo"] = create_packed_image("Tex_VinylRackFelt_Albedo", felt, "sRGB")

    return textures


def make_pbr_material(
    name: str,
    albedo_img: bpy.types.Image | None = None,
    rough_img: bpy.types.Image | None = None,
    base_color=(0.5, 0.35, 0.22, 1.0),
    metallic: float = 0.0,
    roughness: float = 0.55,
    coat_weight: float = 0.0,
    coat_roughness: float = 0.2,
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
        tex_c = nt.nodes.new("ShaderNodeTexImage")
        tex_c.image = albedo_img
        tex_c.location = (-360, 220)
        nt.links.new(tex_c.outputs["Color"], bsdf.inputs["Base Color"])

    if rough_img is not None:
        tex_r = nt.nodes.new("ShaderNodeTexImage")
        tex_r.image = rough_img
        tex_r.location = (-360, -80)
        nt.links.new(tex_r.outputs["Color"], bsdf.inputs["Roughness"])

    return mat


def build_materials(textures: dict[str, bpy.types.Image]) -> dict[str, bpy.types.Material]:
    return {
        "walnut": make_pbr_material(
            "Mat_Rack_Walnut",
            albedo_img=textures["walnut_albedo"],
            rough_img=textures["walnut_rough"],
            metallic=0.0,
            roughness=0.52,
            coat_weight=0.14,
            coat_roughness=0.28,
        ),
        "walnut_dark": make_pbr_material(
            "Mat_Rack_WalnutDark",
            albedo_img=textures["walnut_dark_albedo"],
            rough_img=textures["walnut_rough"],
            metallic=0.0,
            roughness=0.60,
        ),
        "brass": make_pbr_material(
            "Mat_Rack_Brass",
            albedo_img=textures["brass_albedo"],
            rough_img=textures["brass_rough"],
            metallic=0.90,
            roughness=0.30,
        ),
        "felt": make_pbr_material(
            "Mat_Rack_Felt",
            albedo_img=textures["felt_albedo"],
            metallic=0.0,
            roughness=0.94,
        ),
    }


# ---------------------------------------------------------------------------
# Assembly 1: Tapered Walnut & Brass-Ferrule Mid-Century Feet (4x)
# ---------------------------------------------------------------------------
def build_feet(mats, col, parent):
    objs = []
    foot_coords = [
        ("FL", -0.505, -0.098),
        ("FR",  0.505, -0.098),
        ("BL", -0.505,  0.098),
        ("BR",  0.505,  0.098),
    ]
    # Rubber grip pad: Z = 0.000 .. 0.0025
    pad_prof = [
        (0.0, 0.0000),
        (0.0115, 0.0000),
        (0.0124, 0.0008),
        (0.0124, 0.0026),
        (0.0, 0.0026),
    ]
    # Machined satin-brass ferrule cup: Z = 0.0022 .. 0.0096
    ferrule_prof = [
        (0.0, 0.0022),
        (0.0128, 0.0022),
        (0.0136, 0.0032),
        (0.0156, 0.0092),
        (0.0148, 0.0098),
        (0.0, 0.0098),
    ]
    # Tapered walnut leg stub rising solidly into plinth bottom (Z = 0.0088 .. 0.028)
    wood_prof = [
        (0.0, 0.0088),
        (0.0152, 0.0088),
        (0.0195, 0.0220),
        (0.0205, 0.0275),
        (0.0, 0.0275),
    ]

    for tag, fx, fy in foot_coords:
        v, f = lathe_mesh(pad_prof, segments=24)
        objs.append(object_from_pydata(
            f"Rack_FootPad_{tag}", v, f, mats["felt"], col, parent=parent,
            location=(fx, fy, 0.0), uv_scale=4.0, role="foot_pad",
        ))
        v, f = lathe_mesh(ferrule_prof, segments=28)
        objs.append(object_from_pydata(
            f"Rack_FootFerrule_{tag}", v, f, mats["brass"], col, parent=parent,
            location=(fx, fy, 0.0), uv_scale=4.0, role="foot_ferrule",
        ))
        v, f = lathe_mesh(wood_prof, segments=28)
        objs.append(object_from_pydata(
            f"Rack_FootLeg_{tag}", v, f, mats["walnut"], col, parent=parent,
            location=(fx, fy, 0.0), uv_scale=3.0, role="foot_leg",
        ))
    return objs


# ---------------------------------------------------------------------------
# Assembly 2: Sculpted Solid Walnut Slotted Plinth Base + 6 Felt-Lined Grooves
# ---------------------------------------------------------------------------
def build_slotted_plinth(mats, col, parent):
    objs = []

    # 2a. Continuous Lower Walnut Plinth Slab (Z = 0.022 .. 0.052) with mid-century underside bevel
    # Built as a stepped lofted profile for a clean chamfered architectural apron.
    x_in = PLINTH_HALF_X + 0.003   # Tuck 3 mm into cheek inner faces (no hairline seam)
    y_bot = PLINTH_HALF_Y - 0.009  # Sleek 9 mm undercut along bottom front & back
    y_top = PLINTH_HALF_Y
    z_rings = [
        (x_in, y_bot, PLINTH_Z0),
        (x_in, y_bot + 0.002, PLINTH_Z0 + 0.0018),
        (x_in, y_top - 0.0015, PLINTH_Z0 + 0.0115),
        (x_in, y_top, PLINTH_Z0 + 0.0135),
        (x_in, y_top, PLINTH_FLOOR_Z),
    ]
    bm = bmesh.new()
    rings = []
    for rx, ry, rz in z_rings:
        rings.append([
            bm.verts.new((-rx, -ry, rz)),
            bm.verts.new(( rx, -ry, rz)),
            bm.verts.new(( rx,  ry, rz)),
            bm.verts.new((-rx,  ry, rz)),
        ])
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    objs.append(object_from_bmesh(
        "Rack_Base_LowerSlab", bm, mats["walnut"], col, parent=parent,
        smooth=False, uv_scale=1.8, role="base_slab",
    ))

    # 2b. Solid Front Walnut Border Rail (Y = -0.148 .. -0.088, Z = 0.052 .. 0.068 — flush above LowerSlab, zero coplanar overlap)
    front_poly = [
        (-x_in, -PLINTH_HALF_Y),
        ( x_in, -PLINTH_HALF_Y),
        ( x_in, GROOVE_Y0),
        (-x_in, GROOVE_Y0),
    ]
    bm_front = make_extruded_polygon_bm(front_poly, PLINTH_FLOOR_Z, PLINTH_TOP_Z, bevel_width=0.0022, bevel_segments=2, bevel_top_only=True)
    front_obj = object_from_bmesh(
        "Rack_Base_FrontRail", bm_front, mats["walnut"], col, parent=parent,
        smooth=True, uv_scale=1.8, role="base_front_rail",
    )
    set_smart_smooth(front_obj.data, flat_axis="z")
    objs.append(front_obj)

    # 2c. Solid Rear Walnut Border Rail (Y = +0.048 .. +0.148, Z = 0.052 .. 0.068)
    rear_poly = [
        (-x_in, GROOVE_Y1),
        ( x_in, GROOVE_Y1),
        ( x_in, PLINTH_HALF_Y),
        (-x_in, PLINTH_HALF_Y),
    ]
    bm_rear = make_extruded_polygon_bm(rear_poly, PLINTH_FLOOR_Z, PLINTH_TOP_Z, bevel_width=0.0022, bevel_segments=2, bevel_top_only=True)
    rear_obj = object_from_bmesh(
        "Rack_Base_RearRail", bm_rear, mats["walnut"], col, parent=parent,
        smooth=True, uv_scale=1.8, role="base_rear_rail",
    )
    set_smart_smooth(rear_obj.data, flat_axis="z")
    objs.append(rear_obj)

    # 2d. Seven Precision Chamfered Walnut Rib Lands between the 6 diagonal 30-degree grooves
    # Slight Y overlap (+1.0 mm) into Front/Rear rails guarantees zero hairline gaps while staying clear of outer faces.
    y0_ov = GROOVE_Y0 - 0.0010
    y1_ov = GROOVE_Y1 + 0.0010
    for k in range(SLOT_COUNT + 1):
        if k == 0:
            x_l_y0 = -x_in
            x_l_y1 = -x_in
        else:
            x_l_y0 = groove_x_at_y(k - 1, y0_ov) + GROOVE_HALF_X
            x_l_y1 = groove_x_at_y(k - 1, y1_ov) + GROOVE_HALF_X

        if k == SLOT_COUNT:
            x_r_y0 = x_in
            x_r_y1 = x_in
        else:
            x_r_y0 = groove_x_at_y(k, y0_ov) - GROOVE_HALF_X
            x_r_y1 = groove_x_at_y(k, y1_ov) - GROOVE_HALF_X

        rib_poly = [
            (x_l_y0, y0_ov),
            (x_r_y0, y0_ov),
            (x_r_y1, y1_ov),
            (x_l_y1, y1_ov),
        ]
        bm_rib = make_extruded_polygon_bm(
            rib_poly, PLINTH_FLOOR_Z, PLINTH_TOP_Z,
            bevel_width=0.0020, bevel_segments=2, bevel_top_only=True,
        )
        rib_obj = object_from_bmesh(
            f"Rack_Base_RibLand_{k}", bm_rib, mats["walnut"], col, parent=parent,
            smooth=True, uv_scale=1.8, role="groove_rib",
        )
        set_smart_smooth(rib_obj.data, flat_axis="z")
        objs.append(rib_obj)

    # 2e. Six Dark Roasted-Walnut Groove End Caps & Charcoal Wool-Felt Floor Cushion Strips
    for s in range(SLOT_COUNT):
        cx0 = groove_x_at_y(s, GROOVE_Y0)
        cx1 = groove_x_at_y(s, GROOVE_Y1)
        # Felt liner spans inside the groove floor (inset 0.8 mm from sidewalls)
        f_half = GROOVE_HALF_X - 0.0012
        felt_poly = [
            (cx0 - f_half, GROOVE_Y0 + 0.001),
            (cx0 + f_half, GROOVE_Y0 + 0.001),
            (cx1 + f_half, GROOVE_Y1 - 0.001),
            (cx1 - f_half, GROOVE_Y1 - 0.001),
        ]
        bm_felt = make_extruded_polygon_bm(felt_poly, FELT_Z0, FELT_Z1, bevel_width=0.0005, bevel_segments=1, bevel_top_only=True)
        objs.append(object_from_bmesh(
            f"Rack_Groove_Felt_{s}", bm_felt, mats["felt"], col, parent=parent,
            smooth=True, uv_scale=6.0, role="groove_felt",
        ))

        # Subtle darker walnut shadow trim strip along both inner groove sidewalls for crisp readability
        for side_idx, sign in enumerate((-1.0, 1.0)):
            wx0 = cx0 + sign * (GROOVE_HALF_X - 0.0012)
            wx1 = cx1 + sign * (GROOVE_HALF_X - 0.0012)
            # Thin 1.6 mm liner pressed cleanly against the walnut rib inner edge
            in_off = -sign * 0.0014
            wall_poly = [
                (wx0, GROOVE_Y0 + 0.001),
                (wx0 + in_off, GROOVE_Y0 + 0.001),
                (wx1 + in_off, GROOVE_Y1 - 0.001),
                (wx1, GROOVE_Y1 - 0.001),
            ]
            if sign < 0:
                wall_poly.reverse()
            bm_wall = make_extruded_polygon_bm(wall_poly, FELT_Z0 + 0.001, PLINTH_TOP_Z - 0.0028, bevel_width=0.0)
            objs.append(object_from_bmesh(
                f"Rack_Groove_Liner_{s}_{side_idx}", bm_wall, mats["walnut_dark"], col, parent=parent,
                smooth=False, uv_scale=2.5, role="groove_liner",
            ))

    # 2f. Front Recessed Satin-Brass Horizontal Accent Inlay Strip & Center Emblem Plaque
    strip_z = 0.0485
    strip_h = 0.0046
    strip_d = 0.0048
    badge_half_w = 0.050
    for tag, x0, x1 in (("L", -PLINTH_HALF_X + 0.016, -badge_half_w - 0.008), ("R", badge_half_w + 0.008, PLINTH_HALF_X - 0.016)):
        bm_strip = make_rounded_box_bm(x1 - x0, strip_d, strip_h, bevel_width=0.0009, segments=2)
        objs.append(object_from_bmesh(
            f"Rack_Front_BrassTrim_{tag}", bm_strip, mats["brass"], col, parent=parent,
            location=((x0 + x1) * 0.5, -PLINTH_HALF_Y - 0.0014, strip_z),
            uv_scale=4.0, role="front_trim",
        ))

    # Center brass emblem plate + 3 fine decorative groove ribs + 2 tiny brass rivets
    bm_badge = make_rounded_box_bm(badge_half_w * 2.0, 0.0060, 0.0175, bevel_width=0.0014, segments=2)
    objs.append(object_from_bmesh(
        "Rack_Front_BadgePlate", bm_badge, mats["brass"], col, parent=parent,
        location=(0.0, -PLINTH_HALF_Y - 0.0018, strip_z),
        uv_scale=5.0, role="front_badge",
    ))
    for i, dz in enumerate((-0.0038, 0.0, 0.0038)):
        bm_bar = make_rounded_box_bm(0.058, 0.0024, 0.0015, bevel_width=0.0003, segments=1)
        objs.append(object_from_bmesh(
            f"Rack_Front_BadgeGroove_{i}", bm_bar, mats["walnut_dark"], col, parent=parent,
            location=(0.0, -PLINTH_HALF_Y - 0.0042, strip_z + dz),
            uv_scale=5.0, role="front_badge_detail",
        ))
    rivet_prof = [(0.0, 0.0), (0.0021, 0.0), (0.0021, 0.0015), (0.0012, 0.0023), (0.0, 0.0025)]
    for tag, rx in (("L", -0.039), ("R", 0.039)):
        v, f = lathe_mesh(rivet_prof, segments=16)
        objs.append(object_from_pydata(
            f"Rack_Front_BadgeRivet_{tag}", v, f, mats["brass"], col, parent=parent,
            location=(rx, -PLINTH_HALF_Y - 0.0040, strip_z),
            rotation=(math.pi * 0.5, 0.0, 0.0), uv_scale=6.0, role="front_badge_rivet",
        ))

    return objs


# ---------------------------------------------------------------------------
# Assembly 3: Sculpted Mid-Century Walnut Side Cheek Panels (Left & Right)
# Built with clean manifold bridged-ring topology around the oval handle cutout (zero booleans!).
# ---------------------------------------------------------------------------
def cheek_outer_contour(n_samples: int = 44) -> list[tuple[float, float]]:
    """Return CCW 2D (y, z) outer silhouette of the sculpted mid-century walnut side cheek."""
    # Control polyline in (Y_bl, Z_bl) with generous furniture-grade corner fillets
    pts_3d = [
        Vector((-PLINTH_HALF_Y, CHEEK_Z0, 0.0)),           # Front-bottom
        Vector(( PLINTH_HALF_Y, CHEEK_Z0, 0.0)),           # Rear-bottom
        Vector(( PLINTH_HALF_Y, CHEEK_REAR_Z, 0.0)),       # Rear-top crest
        Vector(( 0.068,         CHEEK_REAR_Z - 0.012, 0.0)),  # Soft upper shoulder
        Vector((-0.072,         0.214, 0.0)),              # Mid-front diagonal slope
        Vector((-PLINTH_HALF_Y, CHEEK_FRONT_Z, 0.0)),      # Front-top lip
    ]
    # Close loop for filleting by wrapping start/end
    closed = [pts_3d[-1]] + pts_3d + [pts_3d[0]]
    radii = [0.010, 0.010, 0.028, 0.055, 0.045, 0.024]
    filleted = fillet_polyline(closed, radii, arc_segs=6)
    # Remove duplicate wrap-around endpoints and resample cleanly at uniform arc-length steps
    ring = filleted[1:-1]
    # Build cumulative arc length around closed loop
    pts2 = [(p.x, p.y) for p in ring]
    seg_lens = []
    total = 0.0
    for i in range(len(pts2)):
        a = pts2[i]
        b = pts2[(i + 1) % len(pts2)]
        l = math.hypot(b[0] - a[0], b[1] - a[1])
        seg_lens.append(l)
        total += l

    resampled = []
    for k in range(n_samples):
        target = (k / n_samples) * total
        acc = 0.0
        for i, l in enumerate(seg_lens):
            if acc + l >= target or i == len(seg_lens) - 1:
                t = 0.0 if l < 1e-8 else max(0.0, min(1.0, (target - acc) / l))
                a = pts2[i]
                b = pts2[(i + 1) % len(pts2)]
                resampled.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
                break
            acc += l
    return resampled


def cheek_cutout_contour(n_samples: int = 44) -> list[tuple[float, float]]:
    """Return CCW 2D (y, z) pill-shaped handle cutout synchronized in angle with the outer contour."""
    # Center of cutout sits harmoniously in the upper-middle cheek body
    cy = 0.018
    cz = 0.168
    tilt = 0.36  # ~20.6 deg upward toward rear, echoing the sweeping top silhouette
    ct, st = math.cos(tilt), math.sin(tilt)
    half_straight = 0.032
    r_pill = 0.0155

    # Match angular parametrization around (cy, cz) to outer contour so bridge quads stay clean and untwisted
    outer = cheek_outer_contour(n_samples)
    inner = []
    for oy, oz in outer:
        ang = math.atan2(oz - cz, oy - cy)
        # Ray direction in cutout local tilted frame
        dy = math.cos(ang)
        dz = math.sin(ang)
        ly = dy * ct + dz * st
        lz = -dy * st + dz * ct
        # Exact ray-stadium intersection (from center 0,0 in direction (ly, lz))
        # Solve distance along ray to boundary of capsule [-half_straight, +half_straight] x radius r_pill
        best_t = r_pill
        if abs(lz) > 1e-6:
            t_flat = r_pill / abs(lz)
            if abs(t_flat * ly) <= half_straight + 1e-6:
                best_t = t_flat
            else:
                # Intersect end semicircle centered at (sign(ly)*half_straight, 0)
                sx = half_straight if ly >= 0.0 else -half_straight
                # (t*ly - sx)^2 + (t*lz)^2 = r^2  ->  t^2 - 2*sx*ly*t + (sx^2 - r^2) = 0
                disc = max(0.0, (sx * ly) ** 2 - (sx * sx - r_pill * r_pill))
                best_t = sx * ly + math.sqrt(disc)
        else:
            best_t = half_straight + r_pill
        py_loc = best_t * ly
        pz_loc = best_t * lz
        wy = cy + py_loc * ct - pz_loc * st
        wz = cz + py_loc * st + pz_loc * ct
        inner.append((wy, wz))
    return inner


def build_cheek_panel_bm(x_min: float, x_max: float, n_samples: int = 44) -> bmesh.types.BMesh:
    """Build a watertight sculpted walnut side cheek with a through-cut handle slot and chamfered bevels."""
    outer = cheek_outer_contour(n_samples)
    inner = cheek_cutout_contour(n_samples)

    bm = bmesh.new()
    bev = 0.0032
    in_bev = 0.0024

    # Six loops around the topology:
    # 0: outer-left face lip, 1: outer-left shoulder, 2: outer-right shoulder, 3: outer-right face lip
    # plus inner cutout ring on left and right, bridged cleanly with pure quads!
    # Build 4 concentric X-rings for outer perimeter and 4 for inner cutout for clean smooth bevels without bmesh bevel failures.
    x_l = x_min
    x_r = x_max

    def shrink_toward(pt, ref, dist):
        vy = ref[0] - pt[0]
        vz = ref[1] - pt[1]
        l = math.hypot(vy, vz)
        if l < 1e-6:
            return pt
        return (pt[0] + vy * (dist / l), pt[1] + vz * (dist / l))

    # Outer face inset ring & bevel rings
    cy_ref, cz_ref = 0.018, 0.168
    o_edge_l = [bm.verts.new((x_l + bev, y, z)) for y, z in outer]
    o_edge_r = [bm.verts.new((x_r - bev, y, z)) for y, z in outer]
    o_face_l = [bm.verts.new((x_l, *shrink_toward((y, z), (cy_ref, cz_ref), bev))) for y, z in outer]
    o_face_r = [bm.verts.new((x_r, *shrink_toward((y, z), (cy_ref, cz_ref), bev))) for y, z in outer]

    i_edge_l = [bm.verts.new((x_l + in_bev, y, z)) for y, z in inner]
    i_edge_r = [bm.verts.new((x_r - in_bev, y, z)) for y, z in inner]
    i_face_l = [bm.verts.new((x_l, *shrink_toward((y, z), (cy_ref, cz_ref), -in_bev))) for y, z in inner]
    i_face_r = [bm.verts.new((x_r, *shrink_toward((y, z), (cy_ref, cz_ref), -in_bev))) for y, z in inner]

    def bridge(r0, r1, flip=False):
        n = len(r0)
        for k in range(n):
            kn = (k + 1) % n
            if flip:
                bm.faces.new((r0[k], r1[k], r1[kn], r0[kn]))
            else:
                bm.faces.new((r0[k], r0[kn], r1[kn], r1[k]))

    # Closed torus-like quad surface:
    # Outer edge wall -> Right outer bevel -> Right flat face -> Right inner bevel -> Inner tunnel -> Left inner bevel -> Left flat face -> Left outer bevel -> Outer edge wall
    bridge(o_edge_l, o_edge_r, flip=False)
    bridge(o_edge_r, o_face_r, flip=False)
    bridge(o_face_r, i_face_r, flip=False)
    bridge(i_face_r, i_edge_r, flip=False)
    bridge(i_edge_r, i_edge_l, flip=False)
    bridge(i_edge_l, i_face_l, flip=False)
    bridge(i_face_l, o_face_l, flip=False)
    bridge(o_face_l, o_edge_l, flip=False)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_cheek_bezel_bm(x_min: float, x_max: float, n_samples: int = 44) -> bmesh.types.BMesh:
    """Build a crisp satin-brass oval bezel liner ring framing the cheek handle cutout."""
    inner = cheek_cutout_contour(n_samples)
    cy_ref, cz_ref = 0.018, 0.168
    bm = bmesh.new()
    thick = 0.0022
    protrude = 0.0014

    def push_in(pt, dist):
        vy = cy_ref - pt[0]
        vz = cz_ref - pt[1]
        l = math.hypot(vy, vz)
        if l < 1e-6:
            return pt
        return (pt[0] + vy * (dist / l), pt[1] + vz * (dist / l))

    # Closed 4-ring rectangular-section tubular collar lining the hole
    r_out_l = [bm.verts.new((x_min - protrude, *push_in(p, -0.0018))) for p in inner]
    r_out_r = [bm.verts.new((x_max + protrude, *push_in(p, -0.0018))) for p in inner]
    r_in_r = [bm.verts.new((x_max + protrude, *push_in(p, thick))) for p in inner]
    r_in_l = [bm.verts.new((x_min - protrude, *push_in(p, thick))) for p in inner]

    def bridge(a, b):
        n = len(a)
        for k in range(n):
            kn = (k + 1) % n
            bm.faces.new((a[k], a[kn], b[kn], b[k]))

    bridge(r_out_l, r_out_r)
    bridge(r_out_r, r_in_r)
    bridge(r_in_r, r_in_l)
    bridge(r_in_l, r_out_l)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_cheeks(mats, col, parent):
    objs = []
    cap_prof = [
        (0.0, 0.0),
        (0.0095, 0.0),
        (0.0095, 0.0022),
        (0.0072, 0.0038),
        (0.0056, 0.0052),
        (0.0030, 0.0060),
        (0.0, 0.0062),
    ]
    for tag, sign in (("Left", -1.0), ("Right", 1.0)):
        x0 = sign * PLINTH_HALF_X if sign > 0 else -(PLINTH_HALF_X + CHEEK_THICK)
        x1 = (PLINTH_HALF_X + CHEEK_THICK) if sign > 0 else -PLINTH_HALF_X
        bm_cheek = build_cheek_panel_bm(x0, x1, n_samples=48)
        cheek_obj = object_from_bmesh(
            f"Rack_Cheek_{tag}", bm_cheek, mats["walnut"], col, parent=parent,
            smooth=True, uv_mode="side", uv_scale=2.2, role=f"cheek_{tag.lower()}",
        )
        set_smart_smooth(cheek_obj.data, flat_axis="x")
        objs.append(cheek_obj)
        bm_bezel = build_cheek_bezel_bm(x0, x1, n_samples=48)
        objs.append(object_from_bmesh(
            f"Rack_CheekBezel_{tag}", bm_bezel, mats["brass"], col, parent=parent,
            smooth=True, uv_scale=5.0, role="cheek_bezel",
        ))
        # Outer turned brass cap-nuts aligning coaxially with the twin rear horizontal brass rails
        outer_x = sign * OUTER_HALF_X
        rot_y = math.pi * 0.5 if sign > 0 else -math.pi * 0.5
        for level, rz in (("Low", REAR_RAIL_Z_LOW), ("High", REAR_RAIL_Z_HIGH)):
            v, f = lathe_mesh(cap_prof, segments=24)
            objs.append(object_from_pydata(
                f"Rack_CheekBolt_{tag}_{level}", v, f, mats["brass"], col, parent=parent,
                location=(outer_x - sign * 0.0005, REAR_RAIL_Y, rz),
                rotation=(0.0, rot_y, 0.0), uv_scale=6.0, role="cheek_bolt",
            ))
    return objs


# ---------------------------------------------------------------------------
# Assembly 4: 7 Swept Brushed-Brass Wire Dividers, Collet Ferrules & Twin Rear Tie-Rails
# ---------------------------------------------------------------------------
def build_brass_dividers_and_rails(mats, col, parent):
    objs = []

    # Twin horizontal satin-brass rear stabilizer rails spanning cleanly into both walnut cheeks
    for level, rz in (("Low", REAR_RAIL_Z_LOW), ("High", REAR_RAIL_Z_HIGH)):
        rail_pts = [
            Vector((-PLINTH_HALF_X - 0.008, REAR_RAIL_Y, rz)),
            Vector(( PLINTH_HALF_X + 0.008, REAR_RAIL_Y, rz)),
        ]
        bm_rail = make_swept_tube_bm(
            rail_pts, radius_n=REAR_RAIL_RADIUS, ring_segs=18, cap_ends=True,
            ref_hint=Vector((0.0, 0.0, 1.0)),
        )
        objs.append(object_from_bmesh(
            f"Rack_RearBrassRail_{level}", bm_rail, mats["brass"], col, parent=parent,
            smooth=True, uv_scale=4.0, role="rear_rail",
        ))

    # Turned stepped brass collet ferrule profile (anchors each wire leg neatly into the walnut plinth)
    collet_prof = [
        (0.0, -0.0020),
        (0.0076, -0.0020),
        (0.0076,  0.0022),
        (0.0064,  0.0040),
        (0.0056,  0.0076),
        (0.0046,  0.0088),
        (0.0,     0.0088),
    ]
    # Machined brass tie-collar where each rear vertical divider leg meets the twin rear horizontal rails
    collar_prof = [
        (0.0, -0.0068),
        (0.0060, -0.0068),
        (0.0072, -0.0050),
        (0.0072,  0.0050),
        (0.0060,  0.0068),
        (0.0,     0.0068),
    ]

    for k in range(SLOT_COUNT + 1):
        origin = Vector((divider_center_x(k) + DISC_BOT_DX, DISC_BOT_DY, PLINTH_TOP_Z))

        def in_plane(u: float, h: float) -> Vector:
            return origin + SLOT_AXIS_X * u + SLOT_AXIS_UP * h

        # Scooped mid-century brass wire divider silhouette:
        # - Front anchor seated solidly into front walnut rail at u = -0.146 (Y ~ -0.094, Z = 0.068)
        # - Rises cleanly along the -8 deg lean plane to Z ~ 0.168 (below center label!)
        # - Low graceful front saddle leaves every colorful vinyl center label 100% open
        # - Sweeps gracefully up along the rear upper vinyl contour to Z ~ 0.292
        # - Curves smoothly back in 3D onto the twin rear brass rails (Y = +0.122) and drops into rear walnut ferrule
        p0 = in_plane(-0.146, -0.005)
        p1 = in_plane(-0.146,  0.078)   # Front shoulder (Z ~ 0.145)
        p2 = in_plane(-0.016,  0.084)   # Low open front saddle (Z ~ 0.151 — sits cleanly below every colored center label!)
        p3 = in_plane( 0.092,  0.222)   # Tall rear crest (Z ~ 0.288 — cradles upper vinyl!)
        p4 = in_plane( 0.132,  0.224)   # Rear corner knee (x_knee = x_div + 0.111, y_knee ~ +0.072)

        x_rear = p4.x
        p5 = Vector((x_rear, REAR_RAIL_Y, p4.z - 0.004))
        p6 = Vector((x_rear, REAR_RAIL_Y, PLINTH_TOP_Z - 0.005))

        ctrl = [p0, p1, p2, p3, p4, p5, p6]
        radii = [0.022, 0.042, 0.036, 0.018, 0.020]
        wire_pts = fillet_polyline(ctrl, radii, arc_segs=8)

        bm_wire = make_swept_tube_bm(
            wire_pts, radius_n=DIVIDER_RADIUS, ring_segs=16, cap_ends=True,
            ref_hint=SLOT_AXIS_NORM,
        )
        objs.append(object_from_bmesh(
            f"Rack_BrassDivider_{k}", bm_wire, mats["brass"], col, parent=parent,
            smooth=True, uv_scale=4.0, role="brass_divider",
        ))

        # Front stepped brass ferrule (aligned with front wire stem at plinth top)
        front_pos = in_plane(-0.146, 0.0)
        v, f = lathe_mesh(collet_prof, segments=20)
        objs.append(object_from_pydata(
            f"Rack_FrontFerrule_{k}", v, f, mats["brass"], col, parent=parent,
            location=(front_pos.x, front_pos.y, PLINTH_TOP_Z),
            uv_scale=6.0, role="wire_ferrule",
        ))

        # Rear stepped brass ferrule (vertical at Y = REAR_RAIL_Y)
        v, f = lathe_mesh(collet_prof, segments=20)
        objs.append(object_from_pydata(
            f"Rack_RearFerrule_{k}", v, f, mats["brass"], col, parent=parent,
            location=(x_rear, REAR_RAIL_Y, PLINTH_TOP_Z),
            uv_scale=6.0, role="wire_ferrule",
        ))

        # Twin brass clamp collars joining each rear wire upright solidly onto both rear horizontal rails
        for level, rz in (("Low", REAR_RAIL_Z_LOW), ("High", REAR_RAIL_Z_HIGH)):
            v, f = lathe_mesh(collar_prof, segments=18)
            objs.append(object_from_pydata(
                f"Rack_RailCollar_{k}_{level}", v, f, mats["brass"], col, parent=parent,
                location=(x_rear, REAR_RAIL_Y, rz),
                uv_scale=6.0, role="rail_collar",
            ))

    return objs


def build_vinyl_rack(blend_path: Path, glb_path: Path | None):
    clear_scene()

    col_root = get_collection("01 • Tabletop Vinyl Record Rack")
    root = make_empty("VinylRack_Root", (0.0, 0.0, 0.0), col=col_root)

    textures = generate_textures()
    mats = build_materials(textures)

    build_feet(mats, col_root, root)
    build_slotted_plinth(mats, col_root, root)
    build_cheeks(mats, col_root, root)
    build_brass_dividers_and_rails(mats, col_root, root)

    bpy.context.view_layer.update()
    bpy.ops.file.pack_all()

    deps = bpy.context.evaluated_depsgraph_get()
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    total_tris = 0
    mesh_count = 0
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        mesh_count += 1
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
        f"VinylRack evaluated: meshes={mesh_count}, tris={total_tris:,}, "
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
    parser = argparse.ArgumentParser(description="Build PocketWorld tabletop vinyl record rack.")
    root = Path(__file__).resolve().parents[1]
    parser.add_argument(
        "--blend",
        type=Path,
        default=root / "assets/models/furniture/vinyl-rack.blend",
        help="Output .blend path",
    )
    parser.add_argument(
        "--glb",
        type=Path,
        default=root / "assets/public/models/furniture/vinyl-rack.glb",
        help="Output .glb path (pass 'none' to skip GLB export)",
    )
    args = parser.parse_args(argv)
    if str(args.glb).lower() == "none":
        args.glb = None
    return args


if __name__ == "__main__":
    opts = parse_args()
    build_vinyl_rack(opts.blend, opts.glb)
