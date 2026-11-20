"""Build three PocketWorld retro-cozy sitting plush dolls in Blender 5.2+ and export GLBs.

Durable procedural generator for three distinct handcrafted short-pile plush toys
matching the warm sunlit palette of `assets/models/cabin/open-cabin.blend`:
  1. `plush-bunny`   — Ivory-cream floppy-ear bunny with sage ribbed knit scarf & pink paw pads
  2. `plush-bear`    — Honey-caramel heirloom teddy bear with oatmeal belly patch & rose ribbon bow
  3. `plush-penguin` — Dusty sky-blue chubby penguin with striped knit pom-pom beanie & apricot beak

Coordinate convention:
  - Blender Z-up metres, grounded firmly on Z = 0.000.
  - Front faces -Y in Blender (maps to +Z in glTF / Three.js).

Usage:
  blender --background --factory-startup --python scripts/build-plush-dolls.py
  blender --background --factory-startup --python scripts/build-plush-dolls.py -- --only bunny
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
from mathutils.bvhtree import BVHTree

SEED = 20261121


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
    empty.empty_display_size = 0.06
    link_object(empty, col or bpy.context.scene.collection)
    if parent is not None:
        empty.parent = parent
    return empty


def set_smooth(mesh: bpy.types.Mesh, smooth: bool = True):
    if len(mesh.polygons) > 0:
        mesh.polygons.foreach_set("use_smooth", [smooth] * len(mesh.polygons))


def auto_uv_box(mesh: bpy.types.Mesh, scale: float = 5.5):
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
                u, v = co.x * scale + 0.5, co.z * scale + 0.5
            else:
                u, v = co.y * scale + 0.5, co.z * scale + 0.5
            loop[uv_layer].uv = (u, v)
    bm.to_mesh(mesh)
    bm.free()


def object_from_bmesh(
    name: str,
    bm: bmesh.types.BMesh,
    material,
    col,
    parent=None,
    smooth: bool = True,
    uv_scale: float = 5.5,
    uv_custom=None,
    role: str = "plush_part",
    weld: bool = False,
):
    if weld:
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    if uv_custom is not None:
        uv_custom(mesh)
    else:
        auto_uv_box(mesh, scale=uv_scale)

    set_smooth(mesh, smooth)
    if material is not None:
        mesh.materials.append(material)

    obj = bpy.data.objects.new(name, mesh)
    obj["bas_role"] = role
    link_object(obj, col)
    if parent is not None:
        obj.parent = parent
    return obj


def signed_pow(v: float, p: float) -> float:
    return math.copysign(abs(v) ** p, v)


def smoothstep(e0: float, e1: float, x: float) -> float:
    if e1 == e0:
        return 0.0
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


# ---------------------------------------------------------------------------
# Pole-safe organic plush geometry builders
# ---------------------------------------------------------------------------
def make_sculpted_blob_bm(
    center: tuple[float, float, float],
    radii: tuple[float, float, float],
    rot_euler: tuple[float, float, float] = (0.0, 0.0, 0.0),
    power: float = 2.0,
    pear: float = 0.0,
    flat_bottom: float = 0.0,
    cheek_puff: float = 0.0,
    belly_puff: float = 0.0,
    waist_pinch: float = 0.0,
    waist_z_norm: float = 0.25,
    segments: int = 44,
    rings: int = 28,
    deform_fn=None,
) -> bmesh.types.BMesh:
    """Create a watertight pole-safe sculpted plush form (head, torso, snout, tail).

    Local front is -Y, up is +Z. Uses single shared south/north pole vertices so
    zero-length edges never occur.
    """
    c = Vector(center)
    rx, ry, rz = radii
    rot = Euler(rot_euler, "XYZ").to_matrix()
    exp = 2.0 / power

    def eval_pt(lat: float, phi: float) -> Vector:
        sl = math.sin(lat)
        cl = math.cos(lat)
        z_n = signed_pow(sl, exp)
        r_h = cl ** exp

        x_n = r_h * signed_pow(math.sin(phi), exp)
        y_n = -r_h * signed_pow(math.cos(phi), exp)  # phi=0 -> front (-Y)

        # Pear widening toward bottom and tapering softly toward shoulders
        pear_scale = 1.0 - pear * z_n
        x_n *= pear_scale
        y_n *= 1.0 - pear * 0.72 * z_n

        # Soft waist indentation (e.g., penguin head-to-body transition)
        if waist_pinch != 0.0:
            w = math.exp(-((z_n - waist_z_norm) / 0.28) ** 2)
            pinch = 1.0 - waist_pinch * w
            x_n *= pinch
            y_n *= pinch

        # Plush lower-cheek fullness on front sides (-Y)
        if cheek_puff != 0.0:
            front_w = max(0.0, -y_n)
            cheek_band = math.exp(-((z_n + 0.16) / 0.34) ** 2)
            side_w = abs(x_n) ** 1.15
            puff = 1.0 + cheek_puff * cheek_band * (0.55 * side_w + 0.45 * front_w)
            x_n *= puff
            if y_n < 0.0:
                y_n *= 1.0 + cheek_puff * 0.55 * cheek_band * front_w

        # Soft forward belly fullness on lower front torso (-Y)
        if belly_puff != 0.0 and y_n < 0.0:
            belly_band = math.exp(-((z_n + 0.22) / 0.45) ** 2)
            y_n *= 1.0 + belly_puff * belly_band * (-y_n)

        # Soft weighted sitting base flattening (compresses bottom like cotton stuffing)
        if flat_bottom > 0.0 and z_n < -0.30:
            t = smoothstep(-0.30, -1.0, z_n)
            target_z = -1.0 + flat_bottom
            z_n = z_n + (target_z - z_n) * (t * 0.76)
            squish = 1.0 + flat_bottom * 0.34 * t * (1.0 - 0.48 * t)
            x_n *= squish
            y_n *= squish

        local = Vector((x_n * rx, y_n * ry, z_n * rz))
        if deform_fn is not None:
            local = deform_fn(local, x_n, y_n, z_n, phi)
        return c + rot @ local

    bm = bmesh.new()
    v_south = bm.verts.new(eval_pt(-math.pi * 0.5, 0.0))
    ring_verts = []
    for r in range(1, rings):
        lat = -math.pi * 0.5 + math.pi * (r / rings)
        ring = []
        for s in range(segments):
            phi = math.tau * (s / segments)
            ring.append(bm.verts.new(eval_pt(lat, phi)))
        ring_verts.append(ring)
    v_north = bm.verts.new(eval_pt(math.pi * 0.5, 0.0))

    first = ring_verts[0]
    for s in range(segments):
        ns = (s + 1) % segments
        bm.faces.new((v_south, first[ns], first[s]))

    for r in range(len(ring_verts) - 1):
        lo = ring_verts[r]
        hi = ring_verts[r + 1]
        for s in range(segments):
            ns = (s + 1) % segments
            bm.faces.new((lo[s], lo[ns], hi[ns], hi[s]))

    last = ring_verts[-1]
    for s in range(segments):
        ns = (s + 1) % segments
        bm.faces.new((last[s], last[ns], v_north))

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return bm


def sample_polyline(points: list[Vector], samples: int) -> list[Vector]:
    """Smooth Catmull-Rom interpolation through control points."""
    if len(points) < 2:
        return list(points)
    pts = [Vector(p) for p in points]
    ext = [pts[0] + (pts[0] - pts[1])] + pts + [pts[-1] + (pts[-1] - pts[-2])]
    n_seg = len(pts) - 1
    out = []
    for i in range(samples + 1):
        u = (i / samples) * n_seg
        seg = min(int(u), n_seg - 1)
        t = u - seg
        p0, p1, p2, p3 = ext[seg], ext[seg + 1], ext[seg + 2], ext[seg + 3]
        t2 = t * t
        t3 = t2 * t
        val = 0.5 * (
            (2.0 * p1)
            + (-p0 + p2) * t
            + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
            + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
        )
        out.append(val)
    return out


def compute_frames(points: list[Vector], ref_hint: Vector) -> list[tuple[Vector, Vector, Vector]]:
    """Parallel-transport (tangent, normal, binormal) frames along a polyline."""
    frames = []
    n_pts = len(points)
    prev_n = None
    for i in range(n_pts):
        if i == 0:
            t = (points[1] - points[0]).normalized()
        elif i == n_pts - 1:
            t = (points[-1] - points[-2]).normalized()
        else:
            t = ((points[i] - points[i - 1]).normalized() + (points[i + 1] - points[i]).normalized())
            t = t.normalized() if t.length > 1e-7 else (points[i + 1] - points[i]).normalized()
        if prev_n is None:
            ref = ref_hint.normalized()
            if abs(t.dot(ref)) > 0.94:
                ref = Vector((0.0, 0.0, 1.0)) if abs(t.z) < 0.9 else Vector((1.0, 0.0, 0.0))
            n = (ref - t * ref.dot(t)).normalized()
        else:
            n = prev_n - t * prev_n.dot(t)
            if n.length < 1e-6:
                ref = Vector((1.0, 0.0, 0.0)) if abs(t.x) < 0.9 else Vector((0.0, 0.0, 1.0))
                n = (ref - t * ref.dot(t)).normalized()
            else:
                n.normalize()
        b = t.cross(n).normalized()
        prev_n = n
        frames.append((t, n, b))
    return frames


def make_swept_capsule_bm(
    points: list[Vector],
    radii_n: list[float],
    radii_b: list[float],
    ref_hint: Vector = Vector((1.0, 0.0, 0.0)),
    ring_segs: int = 24,
    cap_rings: int = 4,
    cap_len_start: float | None = None,
    cap_len_end: float | None = None,
    twist_fn=None,
) -> bmesh.types.BMesh:
    """Sweep an elliptical cross-section along points with smooth dome caps (watertight, pole-safe)."""
    frames = compute_frames(points, ref_hint)
    bm = bmesh.new()

    def build_ring(center_pt: Vector, n_vec: Vector, b_vec: Vector, rn: float, rb: float, twist: float = 0.0):
        ct, st = math.cos(twist), math.sin(twist)
        na = n_vec * ct + b_vec * st
        ba = -n_vec * st + b_vec * ct
        ring = []
        for s in range(ring_segs):
            ang = math.tau * (s / ring_segs)
            offset = na * (math.cos(ang) * rn) + ba * (math.sin(ang) * rb)
            ring.append(bm.verts.new(center_pt + offset))
        return ring

    t0, n0, b0 = frames[0]
    rn0, rb0 = radii_n[0], radii_b[0]
    tw0 = twist_fn(0.0) if twist_fn else 0.0
    cs_len = cap_len_start if cap_len_start is not None else min(rn0, rb0) * 0.85
    v_start = bm.verts.new(points[0] - t0 * cs_len)

    all_rings = []
    for k in range(1, cap_rings):
        ang = (k / cap_rings) * (math.pi * 0.5)
        scale = math.sin(ang)
        back = math.cos(ang) * cs_len
        all_rings.append(build_ring(points[0] - t0 * back, n0, b0, rn0 * scale, rb0 * scale, tw0))

    n_pts = len(points)
    for i, (pt, (t, n, b), rn, rb) in enumerate(zip(points, frames, radii_n, radii_b)):
        u = i / max(1, n_pts - 1)
        tw = twist_fn(u) if twist_fn else 0.0
        all_rings.append(build_ring(pt, n, b, rn, rb, tw))

    t1, n1, b1 = frames[-1]
    rn1, rb1 = radii_n[-1], radii_b[-1]
    tw1 = twist_fn(1.0) if twist_fn else 0.0
    ce_len = cap_len_end if cap_len_end is not None else min(rn1, rb1) * 0.85
    for k in range(1, cap_rings):
        ang = (k / cap_rings) * (math.pi * 0.5)
        scale = math.cos(ang)
        fwd = math.sin(ang) * ce_len
        all_rings.append(build_ring(points[-1] + t1 * fwd, n1, b1, rn1 * scale, rb1 * scale, tw1))

    v_end = bm.verts.new(points[-1] + t1 * ce_len)

    first = all_rings[0]
    for s in range(ring_segs):
        ns = (s + 1) % ring_segs
        bm.faces.new((v_start, first[ns], first[s]))

    for r in range(len(all_rings) - 1):
        lo = all_rings[r]
        hi = all_rings[r + 1]
        for s in range(ring_segs):
            ns = (s + 1) % ring_segs
            bm.faces.new((lo[s], lo[ns], hi[ns], hi[s]))

    last = all_rings[-1]
    for s in range(ring_segs):
        ns = (s + 1) % ring_segs
        bm.faces.new((last[s], last[ns], v_end))

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return bm


def make_closed_ring_tube_bm(
    points: list[Vector],
    radii_n: list[float],
    radii_b: list[float],
    ref_hint: Vector = Vector((0.0, 0.0, 1.0)),
    ring_segs: int = 20,
    rib_count: int = 0,
    rib_depth: float = 0.0,
) -> bmesh.types.BMesh:
    """Sweep a closed toroidal tube (knitted scarf collar, neckband, beanie cuff)."""
    n_pts = len(points)
    bm = bmesh.new()
    rings = []
    for i in range(n_pts):
        p_prev = points[(i - 1) % n_pts]
        p_curr = points[i]
        p_next = points[(i + 1) % n_pts]
        t = ((p_curr - p_prev).normalized() + (p_next - p_curr).normalized()).normalized()
        ref = ref_hint.normalized()
        if abs(t.dot(ref)) > 0.94:
            ref = Vector((1.0, 0.0, 0.0))
        n = (ref - t * ref.dot(t)).normalized()
        b = t.cross(n).normalized()

        rib_mul = 1.0
        if rib_count > 0 and rib_depth > 0.0:
            rib_mul = 1.0 + rib_depth * math.cos(math.tau * rib_count * (i / n_pts))

        rn = radii_n[i] * rib_mul
        rb = radii_b[i] * rib_mul
        ring = []
        for s in range(ring_segs):
            ang = math.tau * (s / ring_segs)
            pt = p_curr + n * (math.cos(ang) * rn) + b * (math.sin(ang) * rb)
            ring.append(bm.verts.new(pt))
        rings.append(ring)

    for i in range(n_pts):
        lo = rings[i]
        hi = rings[(i + 1) % n_pts]
        for s in range(ring_segs):
            ns = (s + 1) % ring_segs
            bm.faces.new((lo[s], lo[ns], hi[ns], hi[s]))

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return bm


def project_to_bvh(bvh: BVHTree, point: Vector, fallback_normal: Vector) -> tuple[Vector, Vector]:
    loc, normal, _idx, _dist = bvh.find_nearest(point)
    if loc is None:
        return point, fallback_normal.normalized()
    if normal.length < 1e-6:
        normal = fallback_normal.normalized()
    return loc, normal.normalized()


def make_conformed_patch_bm(
    bvh: BVHTree,
    center: Vector,
    u_axis: Vector,
    v_axis: Vector,
    out_hint: Vector,
    rad_u: float,
    rad_v: float,
    thickness: float = 0.0024,
    sink: float = 0.0022,
    segments: int = 32,
    rings: int = 6,
    outline_fn=None,
    host_center: Vector | None = None,
) -> bmesh.types.BMesh:
    """Create a strictly manifold watertight cushioned plush patch conformed to a host mesh.

    Uses injective directional/radial raycasting rather than nearest-point snapping so
    neighboring rings never collapse onto the same silhouette vertex.
    """
    ua = u_axis.normalized()
    va = v_axis.normalized()
    oh = out_hint.normalized()
    # Anchor inside the host mesh for radial fallback rays on strongly curved patches
    inner_anchor = host_center if host_center is not None else (center - oh * 0.12)

    def sample_surface(u: float, v: float) -> tuple[Vector, Vector]:
        target_pt = center + ua * u + va * v
        # Primary: parallel ray along -out_hint from well outside the host surface
        ray_origin = target_pt + oh * 0.22
        hit, hn, _idx, _dist = bvh.ray_cast(ray_origin, -oh, 0.50)
        if hit is not None and hn.dot(oh) > 0.05:
            return hit, hn.normalized()
        # Fallback: radial ray toward the interior anchor (guaranteed unique on curved blobs)
        radial_dir = (inner_anchor - target_pt)
        if radial_dir.length > 1e-5:
            radial_dir.normalize()
            hit2, hn2, _i2, _d2 = bvh.ray_cast(target_pt - radial_dir * 0.20, radial_dir, 0.50)
            if hit2 is not None:
                return hit2, hn2.normalized()
        return project_to_bvh(bvh, target_pt + oh * 0.04, oh)

    bm = bmesh.new()
    c_loc, c_n = sample_surface(0.0, 0.0)
    v_front_c = bm.verts.new(c_loc + c_n * thickness)
    v_back_c = bm.verts.new(c_loc - c_n * sink)

    front_rings = []
    back_rings = []
    for r in range(1, rings + 1):
        frac = r / rings
        dome = math.cos(frac * math.pi * 0.48) ** 0.72
        f_off = thickness * dome + 0.00065 * (1.0 - dome)
        b_off = -sink * (0.45 + 0.55 * (1.0 - frac * 0.55))
        f_ring = []
        b_ring = []
        for s in range(segments):
            ang = math.tau * (s / segments)
            scale = outline_fn(ang) if outline_fn is not None else 1.0
            u = math.cos(ang) * rad_u * frac * scale
            v = math.sin(ang) * rad_v * frac * scale
            loc, n = sample_surface(u, v)
            f_ring.append(bm.verts.new(loc + n * f_off))
            b_ring.append(bm.verts.new(loc + n * b_off))
        front_rings.append(f_ring)
        back_rings.append(b_ring)

    for s in range(segments):
        ns = (s + 1) % segments
        bm.faces.new((v_front_c, front_rings[0][s], front_rings[0][ns]))
    for r in range(rings - 1):
        lo, hi = front_rings[r], front_rings[r + 1]
        for s in range(segments):
            ns = (s + 1) % segments
            bm.faces.new((lo[s], hi[s], hi[ns], lo[ns]))

    for s in range(segments):
        ns = (s + 1) % segments
        bm.faces.new((v_back_c, back_rings[0][ns], back_rings[0][s]))
    for r in range(rings - 1):
        lo, hi = back_rings[r], back_rings[r + 1]
        for s in range(segments):
            ns = (s + 1) % segments
            bm.faces.new((lo[ns], hi[ns], hi[s], lo[s]))

    f_out, b_out = front_rings[-1], back_rings[-1]
    for s in range(segments):
        ns = (s + 1) % segments
        bm.faces.new((f_out[s], b_out[s], b_out[ns], f_out[ns]))

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return bm


def make_conformed_tube_bm(
    bvh: BVHTree,
    guide_points: list[Vector],
    radius: float,
    lift: float = 0.0009,
    ring_segs: int = 12,
    samples: int | None = None,
    out_hint: Vector = Vector((0.0, -1.0, 0.0)),
) -> bmesh.types.BMesh:
    """Conform a stitched embroidery thread or plush piping seam cleanly to a host surface."""
    pts = sample_polyline(guide_points, samples) if samples else [Vector(p) for p in guide_points]
    projected = []
    for p in pts:
        loc, n = project_to_bvh(bvh, p, out_hint)
        projected.append(loc + n * lift)
    radii = [radius] * len(projected)
    return make_swept_capsule_bm(
        projected, radii, radii, ref_hint=out_hint, ring_segs=ring_segs, cap_rings=3
    )


def add_button_eye(
    name_prefix: str,
    bvh: BVHTree,
    probe: Vector,
    out_hint: Vector,
    radius: float,
    eye_mat,
    glint_mat,
    col,
    parent,
    squash_z: float = 1.08,
):
    """Add a glossy seated plush safety button eye + dual cream catchlight domes."""
    oh = out_hint.normalized()
    hit, hn, _i, _d = bvh.ray_cast(probe + oh * 0.16, -oh, 0.40)
    if hit is not None and hn.dot(oh) > 0.05:
        loc, n = hit, hn.normalized()
    else:
        loc, n = project_to_bvh(bvh, probe, oh)

    up_ref = Vector((0.0, 0.0, 1.0))
    right = up_ref.cross(n)
    if right.length < 1e-5:
        right = Vector((1.0, 0.0, 0.0))
    else:
        right.normalize()
    up = n.cross(right).normalized()

    eye_center = loc - n * (radius * 0.24)
    rot_mat = Matrix((right, -n, up)).transposed()
    rot_eul = rot_mat.to_euler("XYZ")
    bm_eye = make_sculpted_blob_bm(
        tuple(eye_center),
        (radius, radius * 0.72, radius * squash_z),
        rot_euler=tuple(rot_eul),
        power=2.05,
        segments=24,
        rings=14,
    )
    eye_obj = object_from_bmesh(f"{name_prefix}_Eye", bm_eye, eye_mat, col, parent=parent, uv_scale=8.0, role="eye")

    g1_pos = eye_center + n * (radius * 0.67) - right * (radius * 0.26) + up * (radius * 0.28)
    bm_g1 = make_sculpted_blob_bm(
        tuple(g1_pos),
        (radius * 0.28, radius * 0.14, radius * 0.30),
        rot_euler=tuple(rot_eul),
        segments=14,
        rings=8,
    )
    g1_obj = object_from_bmesh(
        f"{name_prefix}_GlintPrimary", bm_g1, glint_mat, col, parent=parent, uv_scale=12.0, role="eye_highlight"
    )

    g2_pos = eye_center + n * (radius * 0.63) + right * (radius * 0.24) - up * (radius * 0.24)
    bm_g2 = make_sculpted_blob_bm(
        tuple(g2_pos),
        (radius * 0.14, radius * 0.09, radius * 0.15),
        rot_euler=tuple(rot_eul),
        segments=12,
        rings=8,
    )
    g2_obj = object_from_bmesh(
        f"{name_prefix}_GlintSecondary", bm_g2, glint_mat, col, parent=parent, uv_scale=12.0, role="eye_highlight"
    )
    return eye_obj, g1_obj, g2_obj


def add_cloth_tag(name: str, bvh: BVHTree, probe: Vector, out_dir: Vector, mat, col, parent):
    """Tuck a tiny folded woven cotton brand tag cleanly into the plushie's lower hip seam."""
    loc, n = project_to_bvh(bvh, probe, out_dir)
    out = (out_dir.normalized() * 0.65 + n * 0.35).normalized()
    up = Vector((0.0, 0.0, 1.0))
    side = out.cross(up)
    if side.length < 1e-5:
        side = Vector((0.0, 1.0, 0.0))
    else:
        side.normalize()
    up = side.cross(out).normalized()

    pts = [
        loc - out * 0.005 + up * 0.004,
        loc + out * 0.009 + up * 0.006,
        loc + out * 0.021 + up * 0.002,
        loc + out * 0.022 - up * 0.004,
        loc + out * 0.009 - up * 0.007,
        loc - out * 0.005 - up * 0.005,
    ]
    pts = sample_polyline(pts, 14)
    r_n = [0.0072] * len(pts)
    r_b = [0.0014] * len(pts)
    bm = make_swept_capsule_bm(pts, r_n, r_b, ref_hint=side, ring_segs=12, cap_rings=2, cap_len_start=0.001, cap_len_end=0.001)
    return object_from_bmesh(name, bm, mat, col, parent=parent, uv_scale=12.0, role="fabric_tag")


# ---------------------------------------------------------------------------
# Procedural tactile short-pile minky plush & knit PBR textures (compact packed PNGs)
# ---------------------------------------------------------------------------
def _blur2d(arr: np.ndarray, passes: int = 1) -> np.ndarray:
    out = arr.copy()
    for _ in range(passes):
        out = (
            out * 4.0
            + np.roll(out, 1, 0)
            + np.roll(out, -1, 0)
            + np.roll(out, 1, 1)
            + np.roll(out, -1, 1)
            + 0.5 * (
                np.roll(np.roll(out, 1, 0), 1, 1)
                + np.roll(np.roll(out, 1, 0), -1, 1)
                + np.roll(np.roll(out, -1, 0), 1, 1)
                + np.roll(np.roll(out, -1, 0), -1, 1)
            )
        ) / 10.0
    return out


def _image_from_rgba(name: str, rgba: np.ndarray, colorspace: str = "sRGB") -> bpy.types.Image:
    h, w, _ = rgba.shape
    img = bpy.data.images.new(name, width=w, height=h, alpha=False)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.clip(rgba, 0.0, 1.0).astype(np.float32).ravel())
    img.pack()
    return img


def make_plush_textures(seed_offset: int = 0) -> dict[str, object]:
    """Generate velvety short-pile minky plush normal/roughness & ribbed knit normal maps."""
    rng = np.random.default_rng(SEED + seed_offset)
    n_size = 192
    a_size = 128

    # 1. Velvety short-pile plush height field (fine soft brushed minky grain, NOT coarse stucco)
    fine = _blur2d(rng.normal(0.0, 1.0, (n_size, n_size)), 1)
    med = _blur2d(rng.normal(0.0, 1.0, (n_size, n_size)), 4)
    coarse = _blur2d(rng.normal(0.0, 1.0, (n_size, n_size)), 12)

    fine_brush = 0.62 * fine + 0.38 * np.roll(fine, 1, 0)
    height = 0.58 * fine_brush + 0.30 * med * 2.0 + 0.12 * coarse * 3.2
    height = (height - height.mean()) / (height.std() + 1e-6)

    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.26
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 0.26
    n_vec = np.stack((-dx, -dy, np.ones_like(height)), axis=-1)
    n_vec /= np.linalg.norm(n_vec, axis=-1, keepdims=True)
    plush_n = np.ones((n_size, n_size, 4), dtype=np.float32)
    plush_n[:, :, :3] = n_vec * 0.5 + 0.5

    # Compact 128px albedo mottling field
    afine = _blur2d(rng.normal(0.0, 1.0, (a_size, a_size)), 1)
    amed = _blur2d(rng.normal(0.0, 1.0, (a_size, a_size)), 5)
    a_field = 0.55 * afine + 0.45 * amed * 2.2
    a_field = (a_field - a_field.mean()) / (a_field.std() + 1e-6)

    # 2. Ribbed knit yarn normal map (stockinette rib V-stitches)
    yy, xx = np.mgrid[0:n_size, 0:n_size]
    u = xx / n_size
    v = yy / n_size
    ribs = np.cos(u * math.tau * 20.0) * 0.48
    stitch_phase = v * math.tau * 30.0 + np.abs(((u * 20.0) % 1.0) - 0.5) * math.tau * 1.4
    knit_h = ribs + 0.28 * np.cos(stitch_phase) + 0.12 * _blur2d(rng.normal(0.0, 1.0, (n_size, n_size)), 1)
    kdx = (np.roll(knit_h, -1, 1) - np.roll(knit_h, 1, 1)) * 0.46
    kdy = (np.roll(knit_h, -1, 0) - np.roll(knit_h, 1, 0)) * 0.38
    kn = np.stack((-kdx, -kdy, np.ones_like(knit_h)), axis=-1)
    kn /= np.linalg.norm(kn, axis=-1, keepdims=True)
    knit_n = np.ones((n_size, n_size, 4), dtype=np.float32)
    knit_n[:, :, :3] = kn * 0.5 + 0.5

    return {
        "plush_normal": _image_from_rgba("Plush_ShortPile_Normal", plush_n, "Non-Color"),
        "knit_normal": _image_from_rgba("Knit_Rib_Normal", knit_n, "Non-Color"),
        "fleece_field": a_field,
    }


def make_mottled_albedo(name: str, rgb_srgb: tuple[float, float, float], field: np.ndarray, strength: float = 0.032) -> bpy.types.Image:
    size = field.shape[0]
    base = np.array(rgb_srgb, dtype=np.float32).reshape(1, 1, 3)
    warm_shift = np.array([1.0, 0.96, 0.91], dtype=np.float32).reshape(1, 1, 3)
    mod = 1.0 + np.clip(field, -2.2, 2.2)[:, :, None] * strength * warm_shift
    rgb = np.clip(base * mod, 0.0, 1.0)
    rgba = np.ones((size, size, 4), dtype=np.float32)
    rgba[:, :, :3] = rgb
    return _image_from_rgba(name, rgba, "sRGB")


def make_striped_knit_albedo(
    name: str,
    color_a: tuple[float, float, float],
    color_b: tuple[float, float, float],
    field: np.ndarray,
    stripes: int = 3,
) -> bpy.types.Image:
    size = field.shape[0]
    yy, xx = np.mgrid[0:size, 0:size]
    v = yy / size
    u = xx / size
    zigzag = 0.008 * np.cos(u * math.tau * 20.0)
    band = ((v + zigzag) * stripes) % 1.0
    mask = (band < 0.52).astype(np.float32)[:, :, None]
    mask[:, :, 0] = _blur2d(mask[:, :, 0], 1)
    ca = np.array(color_a, dtype=np.float32).reshape(1, 1, 3)
    cb = np.array(color_b, dtype=np.float32).reshape(1, 1, 3)
    yarn = 1.0 + 0.026 * np.cos(u * math.tau * 20.0)[:, :, None] + 0.022 * np.clip(field, -2, 2)[:, :, None]
    rgb = np.clip((ca * mask + cb * (1.0 - mask)) * yarn, 0.0, 1.0)
    rgba = np.ones((size, size, 4), dtype=np.float32)
    rgba[:, :, :3] = rgb
    return _image_from_rgba(name, rgba, "sRGB")


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def make_pbr_material(
    name: str,
    color_srgb: tuple[float, float, float],
    roughness: float = 0.90,
    albedo_img: bpy.types.Image | None = None,
    normal_img: bpy.types.Image | None = None,
    normal_strength: float = 0.26,
    sheen: float = 0.48,
    specular: float = 0.20,
    metallic: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    lin = tuple(srgb_to_linear(c) for c in color_srgb)
    mat.diffuse_color = (*lin, 1.0)
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*lin, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = specular
    if "Sheen Weight" in bsdf.inputs:
        bsdf.inputs["Sheen Weight"].default_value = sheen
    if "Sheen Roughness" in bsdf.inputs:
        bsdf.inputs["Sheen Roughness"].default_value = 0.78

    if albedo_img is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = albedo_img
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

    if normal_img is not None:
        ntex = nt.nodes.new("ShaderNodeTexImage")
        ntex.image = normal_img
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal_strength
        nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


# ---------------------------------------------------------------------------
# Save, report & GLB export helper
# ---------------------------------------------------------------------------
def finalize_and_export(label: str, blend_path: Path, glb_path: Path | None):
    bpy.context.view_layer.update()

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

    root = next((o for o in bpy.context.scene.objects if o.type == "EMPTY" and o.parent is None), None)
    if root is not None and abs(mins.z) > 1e-5:
        root.location.z -= mins.z
        bpy.context.view_layer.update()
        maxs.z -= mins.z
        mins.z = 0.0

    bpy.ops.file.pack_all()
    dims = maxs - mins
    print(
        f"{label} evaluated: tris={total_tris:,}, "
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


# ===========================================================================
# DOLL 1: Cream Floppy-Ear Bunny Plush (奶油垂耳兔玩偶) — height ~0.58 m
# ===========================================================================
def build_plush_bunny(blend_path: Path, glb_path: Path | None):
    clear_scene()
    col = get_collection("01 • Cream Bunny Plush")
    root = make_empty("PlushBunny_Root", (0.0, 0.0, 0.0), col=col)

    tex = make_plush_textures(seed_offset=11)
    field = tex["fleece_field"]

    ivory_img = make_mottled_albedo("Bunny_Ivory_Albedo", (0.948, 0.908, 0.855), field, 0.030)
    rose_img = make_mottled_albedo("Bunny_Rose_Albedo", (0.875, 0.605, 0.625), field, 0.028)
    blush_img = make_mottled_albedo("Bunny_Blush_Albedo", (0.935, 0.615, 0.620), field, 0.022)
    sage_img = make_striped_knit_albedo(
        "Bunny_SageScarf_Albedo", (0.430, 0.565, 0.455), (0.940, 0.895, 0.810), field, stripes=2
    )
    sage_solid_img = make_mottled_albedo("Bunny_SageSolid_Albedo", (0.430, 0.565, 0.455), field, 0.036)

    m_ivory = make_pbr_material("Plush_IvoryCream", (0.948, 0.908, 0.855), 0.90, ivory_img, tex["plush_normal"], 0.26, 0.52)
    m_rose = make_pbr_material("Plush_DustyRoseVelour", (0.875, 0.605, 0.625), 0.89, rose_img, tex["plush_normal"], 0.22, 0.42)
    m_blush = make_pbr_material("Plush_SoftBlush", (0.935, 0.615, 0.620), 0.91, blush_img, tex["plush_normal"], 0.16, 0.35)
    m_scarf = make_pbr_material("Knit_SageScarf", (0.430, 0.565, 0.455), 0.92, sage_solid_img, tex["knit_normal"], 0.44, 0.38)
    m_scarf_stripe = make_pbr_material("Knit_SageCreamStripe", (0.940, 0.895, 0.810), 0.92, sage_img, tex["knit_normal"], 0.42, 0.38)
    m_eye = make_pbr_material("SafetyEye_Espresso", (0.060, 0.038, 0.034), 0.16, sheen=0.0, specular=0.65)
    m_glint = make_pbr_material("SafetyEye_Catchlight", (0.99, 0.96, 0.92), 0.25, sheen=0.0, specular=0.45)
    m_thread = make_pbr_material("Embroidery_Cocoa", (0.20, 0.130, 0.112), 0.82, sheen=0.15)
    m_nose = make_pbr_material("Embroidery_RoseNose", (0.845, 0.475, 0.510), 0.78, sheen=0.25)
    m_tag = make_pbr_material("Fabric_CottonTag", (0.96, 0.925, 0.865), 0.92, sheen=0.15)

    # 1. Plump pear-shaped sitting body — base sits flush on Z = 0.000!
    body_center = Vector((0.0, 0.012, 0.114))
    bm_body = make_sculpted_blob_bm(
        center=tuple(body_center),
        radii=(0.125, 0.114, 0.136),
        power=2.12,
        pear=0.22,
        flat_bottom=0.28,
        belly_puff=0.14,
        segments=42,
        rings=26,
    )
    bvh_body = BVHTree.FromBMesh(bm_body)
    object_from_bmesh("Bunny_Body", bm_body, m_ivory, col, parent=root, uv_scale=5.8, role="body")

    # 2. Adorable plump rounded head with warm subtle tilt
    head_center = Vector((0.0, -0.008, 0.324))
    head_rot = (0.04, 0.055, 0.0)
    bm_head = make_sculpted_blob_bm(
        center=tuple(head_center),
        radii=(0.142, 0.120, 0.116),
        rot_euler=head_rot,
        power=2.16,
        cheek_puff=0.16,
        segments=46,
        rings=28,
    )
    bvh_head = BVHTree.FromBMesh(bm_head)
    object_from_bmesh("Bunny_Head", bm_head, m_ivory, col, parent=root, uv_scale=6.0, role="head")

    # Subtle vertical plush cheek sewing seams
    for sgn, side in ((-1.0, "R"), (1.0, "L")):
        seam_pts = [
            head_center + Vector((sgn * 0.132, -0.025, z_off))
            for z_off in (-0.068, -0.032, 0.005, 0.042, 0.072)
        ]
        bm_s = make_conformed_tube_bm(
            bvh_head, seam_pts, radius=0.0014, lift=0.0004, ring_segs=8, samples=12, out_hint=Vector((sgn, -0.2, 0.0))
        )
        object_from_bmesh(f"Bunny_HeadSeam_{side}", bm_s, m_ivory, col, parent=root, role="seam")

    # 3. Asymmetrical Long Plush Ears (Right perked upward; Left gracefully bent/flopped!)
    ear_r_ctrl = [
        Vector((-0.060, 0.006, 0.414)),
        Vector((-0.082, 0.008, 0.474)),
        Vector((-0.102, 0.000, 0.530)),
        Vector((-0.113, -0.015, 0.558)),
    ]
    ear_r_pts = sample_polyline(ear_r_ctrl, 16)
    rn_r = [0.024 + 0.020 * math.sin(math.pi * (i / 16) ** 0.78) for i in range(17)]
    rb_r = [0.014 + 0.008 * math.sin(math.pi * (i / 16) ** 0.82) for i in range(17)]
    bm_ear_r = make_swept_capsule_bm(
        ear_r_pts, rn_r, rb_r, ref_hint=Vector((1.0, 0.15, 0.0)), ring_segs=22, cap_rings=4,
        cap_len_start=0.018, cap_len_end=0.019,
    )
    bvh_ear_r = BVHTree.FromBMesh(bm_ear_r)
    object_from_bmesh("Bunny_Ear_R", bm_ear_r, m_ivory, col, parent=root, uv_scale=6.2, role="ear")

    frames_r = compute_frames(ear_r_pts, Vector((1.0, 0.15, 0.0)))
    inner_r_pts, irn_r, irb_r = [], [], []
    for i in range(3, 15):
        u = (i - 3) / 11.0
        pt = ear_r_pts[i]
        _t, _n, b = frames_r[i]
        front_dir = b if b.y < 0 else -b
        loc, fn = project_to_bvh(bvh_ear_r, pt + front_dir * 0.035, front_dir)
        inner_r_pts.append(loc - fn * 0.0012)
        env = math.sin(math.pi * (0.12 + 0.76 * u))
        irn_r.append(0.0235 * env)
        irb_r.append(0.0042 * (0.65 + 0.35 * env))
    bm_inear_r = make_swept_capsule_bm(
        inner_r_pts, irn_r, irb_r, ref_hint=Vector((1.0, 0.15, 0.0)), ring_segs=16, cap_rings=3,
        cap_len_start=0.006, cap_len_end=0.008,
    )
    object_from_bmesh("Bunny_InnerEar_R", bm_inear_r, m_rose, col, parent=root, uv_scale=6.5, role="inner_ear")

    ear_l_ctrl = [
        Vector((0.068, 0.004, 0.407)),
        Vector((0.105, 0.002, 0.465)),
        Vector((0.152, -0.014, 0.478)),
        Vector((0.174, -0.042, 0.434)),
        Vector((0.172, -0.062, 0.384)),
    ]
    ear_l_pts = sample_polyline(ear_l_ctrl, 22)
    rn_l = [0.024 + 0.021 * math.sin(math.pi * (i / 22) ** 0.78) for i in range(23)]
    rb_l = [0.014 + 0.0085 * math.sin(math.pi * (i / 22) ** 0.80) for i in range(23)]
    bm_ear_l = make_swept_capsule_bm(
        ear_l_pts, rn_l, rb_l, ref_hint=Vector((0.3, -0.95, 0.0)), ring_segs=22, cap_rings=4,
        cap_len_start=0.018, cap_len_end=0.020,
    )
    bvh_ear_l = BVHTree.FromBMesh(bm_ear_l)
    object_from_bmesh("Bunny_Ear_L", bm_ear_l, m_ivory, col, parent=root, uv_scale=6.2, role="ear")

    inner_l_pts, irn_l, irb_l = [], [], []
    for i in range(4, 19):
        u = (i - 4) / 14.0
        pt = ear_l_pts[i]
        hint = Vector((-0.55, -0.65, -0.50)).normalized()
        loc, fn = project_to_bvh(bvh_ear_l, pt + hint * 0.04, hint)
        inner_l_pts.append(loc - fn * 0.0012)
        env = math.sin(math.pi * (0.12 + 0.76 * u))
        irn_l.append(0.022 * env)
        irb_l.append(0.0040 * (0.65 + 0.35 * env))
    bm_inear_l = make_swept_capsule_bm(
        inner_l_pts, irn_l, irb_l, ref_hint=Vector((0.3, -0.95, 0.0)), ring_segs=16, cap_rings=3,
        cap_len_start=0.006, cap_len_end=0.008,
    )
    object_from_bmesh("Bunny_InnerEar_L", bm_inear_l, m_rose, col, parent=root, uv_scale=6.5, role="inner_ear")

    # 4. Expressive Bunny Face
    for sgn, side in ((-1.0, "R"), (1.0, "L")):
        eye_probe = head_center + Vector((sgn * 0.056, -0.140, 0.008 - sgn * 0.003))
        add_button_eye(
            f"Bunny_{side}", bvh_head, eye_probe, Vector((sgn * 0.25, -1.0, 0.02)),
            radius=0.0155, eye_mat=m_eye, glint_mat=m_glint, col=col, parent=root, squash_z=1.10,
        )

        blush_c = head_center + Vector((sgn * 0.080, -0.110, -0.024 - sgn * 0.003))
        out_b = Vector((sgn * 0.42, -0.90, -0.08)).normalized()
        u_b = Vector((0.0, 0.0, 1.0)).cross(out_b).normalized()
        v_b = out_b.cross(u_b).normalized()
        bm_bl = make_conformed_patch_bm(
            bvh_head, blush_c, u_b, v_b, out_b, rad_u=0.025, rad_v=0.0155,
            thickness=0.0024, sink=0.0018, segments=22, rings=4, host_center=head_center,
        )
        object_from_bmesh(f"Bunny_Blush_{side}", bm_bl, m_blush, col, parent=root, role="blush")

    nose_c = head_center + Vector((0.0, -0.120, -0.012))
    bm_nose = make_conformed_patch_bm(
        bvh_head, nose_c, Vector((1.0, 0.0, 0.0)), Vector((0.0, 0.0, 1.0)), Vector((0.0, -1.0, 0.0)),
        rad_u=0.0138, rad_v=0.0098, thickness=0.0044, sink=0.0024, segments=22, rings=4,
        outline_fn=lambda a: 1.0 - 0.18 * math.sin(a) + 0.08 * math.cos(2.0 * a),
        host_center=head_center,
    )
    object_from_bmesh("Bunny_Nose", bm_nose, m_nose, col, parent=root, role="nose")

    mouth_stem = [head_center + Vector((0.0, -0.126, -0.019)), head_center + Vector((0.0, -0.126, -0.033))]
    bm_ms = make_conformed_tube_bm(bvh_head, mouth_stem, radius=0.0023, lift=0.0011, samples=6)
    object_from_bmesh("Bunny_MouthStem", bm_ms, m_thread, col, parent=root, role="mouth")

    for sgn, side in ((-1.0, "R"), (1.0, "L")):
        arc = [
            head_center + Vector((0.0, -0.128, -0.033)),
            head_center + Vector((sgn * 0.010, -0.128, -0.041)),
            head_center + Vector((sgn * 0.022, -0.125, -0.039)),
            head_center + Vector((sgn * 0.030, -0.120, -0.031)),
        ]
        bm_ma = make_conformed_tube_bm(bvh_head, arc, radius=0.0022, lift=0.0011, samples=12)
        object_from_bmesh(f"Bunny_MouthArc_{side}", bm_ma, m_thread, col, parent=root, role="mouth")

    # 5. Chubby Plush Arms
    for sgn, side in ((-1.0, "R"), (1.0, "L")):
        arm_ctrl = [
            Vector((sgn * 0.088, 0.005, 0.190)),
            Vector((sgn * 0.132, -0.018, 0.160)),
            Vector((sgn * 0.146, -0.056, 0.130)),
            Vector((sgn * 0.126, -0.082, 0.114)),
        ]
        arm_pts = sample_polyline(arm_ctrl, 12)
        rn_a = [0.032 + 0.005 * math.sin(math.pi * (i / 12)) for i in range(13)]
        rb_a = [0.028 + 0.005 * math.sin(math.pi * (i / 12)) for i in range(13)]
        bm_arm = make_swept_capsule_bm(
            arm_pts, rn_a, rb_a, ref_hint=Vector((0.0, 0.0, 1.0)), ring_segs=20, cap_rings=4,
            cap_len_start=0.022, cap_len_end=0.026,
        )
        object_from_bmesh(f"Bunny_Arm_{side}", bm_arm, m_ivory, col, parent=root, uv_scale=6.0, role="arm")

    # 6. Plump Seated Legs aligned flush with torso sitting base at Z = 0.000!
    for sgn, side in ((-1.0, "R"), (1.0, "L")):
        leg_ctrl = [
            Vector((sgn * 0.068, -0.010, 0.058)),
            Vector((sgn * 0.092, -0.068, 0.055)),
            Vector((sgn * 0.106, -0.120, 0.054)),
        ]
        leg_pts = sample_polyline(leg_ctrl, 12)
        rn_lg = [0.044 + 0.008 * (i / 12) for i in range(13)]
        rb_lg = [0.042 + 0.007 * (i / 12) for i in range(13)]
        bm_leg = make_swept_capsule_bm(
            leg_pts, rn_lg, rb_lg, ref_hint=Vector((0.0, 0.0, 1.0)), ring_segs=22, cap_rings=4,
            cap_len_start=0.028, cap_len_end=0.030,
        )
        bvh_leg = BVHTree.FromBMesh(bm_leg)
        leg_anchor = Vector((sgn * 0.096, -0.092, 0.054))
        object_from_bmesh(f"Bunny_Leg_{side}", bm_leg, m_ivory, col, parent=root, uv_scale=5.8, role="leg")

        foot_dir = Vector((sgn * 0.24, -0.97, 0.0)).normalized()
        foot_u = Vector((0.0, 0.0, 1.0)).cross(foot_dir).normalized()
        foot_v = foot_dir.cross(foot_u).normalized()
        sole_c = Vector((sgn * 0.112, -0.146, 0.050))

        bm_pad = make_conformed_patch_bm(
            bvh_leg, sole_c - foot_v * 0.009, foot_u, foot_v, foot_dir,
            rad_u=0.021, rad_v=0.017, thickness=0.0024, sink=0.0020, segments=20, rings=4, host_center=leg_anchor,
        )
        object_from_bmesh(f"Bunny_PawPad_{side}", bm_pad, m_rose, col, parent=root, role="paw_pad")

        for ti, (du, dv) in enumerate(((-0.018, 0.016), (0.0, 0.022), (0.018, 0.016))):
            bm_toe = make_conformed_patch_bm(
                bvh_leg, sole_c + foot_u * du + foot_v * dv, foot_u, foot_v, foot_dir,
                rad_u=0.0078, rad_v=0.0088, thickness=0.0022, sink=0.0018, segments=14, rings=3, host_center=leg_anchor,
            )
            object_from_bmesh(f"Bunny_ToePad_{side}_{ti + 1}", bm_toe, m_rose, col, parent=root, role="toe_pad")

    # 7. Fluffy cotton-puff tail touching cozy at rear
    bm_tail = make_sculpted_blob_bm(
        center=(0.0, 0.128, 0.056),
        radii=(0.052, 0.050, 0.050),
        power=2.0,
        segments=26,
        rings=16,
    )
    object_from_bmesh("Bunny_Tail", bm_tail, m_ivory, col, parent=root, uv_scale=6.5, role="tail")

    # 8. Cozy Sage Ribbed Knit Scarf
    collar_pts = []
    n_col = 44
    for i in range(n_col):
        ang = math.tau * (i / n_col)
        rx_c = 0.092 + 0.005 * math.cos(2.0 * ang)
        ry_c = 0.084
        z_c = 0.220 - 0.010 * math.cos(ang)
        collar_pts.append(Vector((math.sin(ang) * rx_c, -math.cos(ang) * ry_c, z_c)))
    bm_collar = make_closed_ring_tube_bm(
        collar_pts, [0.025] * n_col, [0.022] * n_col,
        ref_hint=Vector((0.0, 0.0, 1.0)), ring_segs=18, rib_count=26, rib_depth=0.042,
    )
    object_from_bmesh("Bunny_ScarfCollar", bm_collar, m_scarf, col, parent=root, uv_scale=7.0, role="scarf")

    tail_a_ctrl = [
        Vector((0.042, -0.092, 0.212)),
        Vector((0.055, -0.118, 0.174)),
        Vector((0.058, -0.130, 0.128)),
        Vector((0.050, -0.134, 0.090)),
    ]
    tail_a_pts = sample_polyline(tail_a_ctrl, 12)
    bm_ta = make_swept_capsule_bm(
        tail_a_pts, [0.028] * 13, [0.0085] * 13,
        ref_hint=Vector((0.92, 0.39, 0.0)), ring_segs=16, cap_rings=3, cap_len_start=0.008, cap_len_end=0.006,
    )
    object_from_bmesh("Bunny_ScarfTail_Long", bm_ta, m_scarf_stripe, col, parent=root, uv_scale=6.5, role="scarf")

    tail_b_ctrl = [
        Vector((0.016, -0.098, 0.206)),
        Vector((0.014, -0.126, 0.170)),
        Vector((0.004, -0.136, 0.132)),
    ]
    tail_b_pts = sample_polyline(tail_b_ctrl, 10)
    bm_tb = make_swept_capsule_bm(
        tail_b_pts, [0.024] * 11, [0.0075] * 11,
        ref_hint=Vector((0.98, -0.18, 0.0)), ring_segs=16, cap_rings=3, cap_len_start=0.007, cap_len_end=0.005,
    )
    object_from_bmesh("Bunny_ScarfTail_Short", bm_tb, m_scarf, col, parent=root, uv_scale=6.5, role="scarf")

    for fi in range(5):
        offset_x = (fi - 2) * 0.0105
        f_pts = [
            Vector((0.050 + offset_x, -0.134, 0.088)),
            Vector((0.050 + offset_x * 1.1, -0.136, 0.068)),
        ]
        bm_f = make_swept_capsule_bm(f_pts, [0.0032, 0.0028], [0.0032, 0.0028], ring_segs=10, cap_rings=2)
        object_from_bmesh(f"Bunny_ScarfFringe_{fi + 1}", bm_f, m_tag, col, parent=root, role="scarf_fringe")

    # 9. Signature woven cloth hip tag
    add_cloth_tag("Bunny_ClothTag", bvh_body, Vector((0.125, 0.025, 0.048)), Vector((1.0, 0.2, 0.0)), m_tag, col, root)

    finalize_and_export("PlushBunny", blend_path, glb_path)


# ===========================================================================
# DOLL 2: Honey-Caramel Teddy Bear Plush (焦糖泰迪熊玩偶) — height ~0.56 m
# ===========================================================================
def build_plush_bear(blend_path: Path, glb_path: Path | None):
    clear_scene()
    col = get_collection("01 • Caramel Teddy Bear Plush")
    root = make_empty("PlushBear_Root", (0.0, 0.0, 0.0), col=col)

    tex = make_plush_textures(seed_offset=29)
    field = tex["fleece_field"]

    # Rich warm toasted honey-caramel / milk-tea brown plush
    caramel_img = make_mottled_albedo("Bear_Caramel_Albedo", (0.675, 0.435, 0.258), field, 0.038)
    oat_img = make_mottled_albedo("Bear_Oatmeal_Albedo", (0.942, 0.878, 0.775), field, 0.030)
    rose_img = make_mottled_albedo("Bear_RoseBow_Albedo", (0.775, 0.375, 0.380), field, 0.028)
    blush_img = make_mottled_albedo("Bear_WarmBlush_Albedo", (0.880, 0.525, 0.445), field, 0.022)

    m_caramel = make_pbr_material("Plush_HoneyCaramel", (0.675, 0.435, 0.258), 0.90, caramel_img, tex["plush_normal"], 0.28, 0.50)
    m_oat = make_pbr_material("Plush_OatmealCream", (0.942, 0.878, 0.775), 0.89, oat_img, tex["plush_normal"], 0.24, 0.46)
    m_bow = make_pbr_material("Fabric_DustyRoseRibbon", (0.775, 0.375, 0.380), 0.84, rose_img, tex["plush_normal"], 0.18, 0.36)
    m_blush = make_pbr_material("Plush_PeachBlush", (0.880, 0.525, 0.445), 0.91, blush_img, tex["plush_normal"], 0.16, 0.35)
    m_eye = make_pbr_material("SafetyEye_Espresso", (0.052, 0.034, 0.028), 0.16, sheen=0.0, specular=0.65)
    m_glint = make_pbr_material("SafetyEye_Catchlight", (0.99, 0.96, 0.91), 0.25, sheen=0.0, specular=0.45)
    m_nose = make_pbr_material("Embroidery_DarkCocoa", (0.160, 0.100, 0.078), 0.78, sheen=0.18)
    m_stitch = make_pbr_material("Embroidery_TanThread", (0.42, 0.25, 0.15), 0.86, sheen=0.12)
    m_tag = make_pbr_material("Fabric_CottonTag", (0.955, 0.920, 0.855), 0.92, sheen=0.15)

    # 1. Classic chunky sitting bear torso grounded flush at Z = 0.000!
    body_center = Vector((0.0, 0.014, 0.130))
    bm_body = make_sculpted_blob_bm(
        center=tuple(body_center),
        radii=(0.148, 0.132, 0.154),
        power=2.14,
        pear=0.20,
        flat_bottom=0.28,
        belly_puff=0.16,
        segments=44,
        rings=28,
    )
    bvh_body = BVHTree.FromBMesh(bm_body)
    object_from_bmesh("Bear_Body", bm_body, m_caramel, col, parent=root, uv_scale=5.5, role="body")

    # Smooth oatmeal stitched oval belly patch (fold-free via injective raycast!)
    belly_c = Vector((0.0, -0.142, 0.136))
    bm_belly = make_conformed_patch_bm(
        bvh_body, belly_c, Vector((1.0, 0.0, 0.0)), Vector((0.0, 0.0, 1.0)), Vector((0.0, -1.0, 0.0)),
        rad_u=0.076, rad_v=0.064, thickness=0.0036, sink=0.0026, segments=32, rings=6, host_center=body_center,
    )
    object_from_bmesh("Bear_BellyPatch", bm_belly, m_oat, col, parent=root, uv_scale=6.0, role="belly_patch")

    # Crisp embroidered whipstitches cleanly straddling the belly patch perimeter
    n_st = 14
    for si in range(n_st):
        ang = math.tau * (si / n_st)
        ca, sa = math.cos(ang), math.sin(ang)
        p_in = belly_c + Vector((ca * 0.070, 0.0, sa * 0.058))
        p_out = belly_c + Vector((ca * 0.082, 0.0, sa * 0.069))
        bm_dash = make_conformed_tube_bm(bvh_body, [p_in, p_out], radius=0.0021, lift=0.0039, ring_segs=8)
        object_from_bmesh(f"Bear_BellyStitch_{si + 1}", bm_dash, m_stitch, col, parent=root, role="stitch")

    # 2. Big lovable rounded teddy bear head
    head_center = Vector((0.0, -0.006, 0.372))
    bm_head = make_sculpted_blob_bm(
        center=tuple(head_center),
        radii=(0.156, 0.136, 0.136),
        rot_euler=(0.03, -0.035, 0.0),
        power=2.12,
        cheek_puff=0.14,
        segments=46,
        rings=28,
    )
    bvh_head = BVHTree.FromBMesh(bm_head)
    object_from_bmesh("Bear_Head", bm_head, m_caramel, col, parent=root, uv_scale=5.8, role="head")

    crown_seam = [
        head_center + Vector((0.0, -0.145 * math.cos(a), 0.145 * math.sin(a)))
        for a in np.linspace(0.32, 2.75, 14)
    ]
    bm_cs = make_conformed_tube_bm(bvh_head, crown_seam, radius=0.0016, lift=0.0005, ring_segs=8, out_hint=Vector((0.0, 0.0, 1.0)))
    object_from_bmesh("Bear_CrownSeam", bm_cs, m_caramel, col, parent=root, role="seam")

    # 3. Classic Round Cupped Teddy Ears with cleanly centered oatmeal inner cups!
    for sgn, side in ((-1.0, "R"), (1.0, "L")):
        ear_c = head_center + Vector((sgn * 0.118, 0.002, 0.116))
        ear_rot = (0.10, sgn * 0.56, -sgn * 0.12)
        bm_ear = make_sculpted_blob_bm(
            center=tuple(ear_c),
            radii=(0.056, 0.028, 0.055),
            rot_euler=ear_rot,
            power=2.05,
            segments=28,
            rings=16,
        )
        bvh_ear = BVHTree.FromBMesh(bm_ear)
        object_from_bmesh(f"Bear_Ear_{side}", bm_ear, m_caramel, col, parent=root, uv_scale=6.2, role="ear")

        rot_m = Euler(ear_rot, "XYZ").to_matrix()
        ear_front = rot_m @ Vector((0.0, -1.0, 0.0))
        ear_u = rot_m @ Vector((1.0, 0.0, 0.0))
        ear_v = rot_m @ Vector((0.0, 0.0, 1.0))
        bm_in = make_conformed_patch_bm(
            bvh_ear, ear_c + ear_front * 0.026, ear_u, ear_v, ear_front,
            rad_u=0.034, rad_v=0.033, thickness=0.0022, sink=0.0024, segments=22, rings=4, host_center=ear_c,
        )
        object_from_bmesh(f"Bear_InnerEar_{side}", bm_in, m_oat, col, parent=root, uv_scale=6.5, role="inner_ear")

    # 4. Sculpted Protruding Oatmeal Snout Muzzle + Dark Stitched Nose & Smile
    snout_center = head_center + Vector((0.0, -0.112, -0.024))
    bm_snout = make_sculpted_blob_bm(
        center=tuple(snout_center),
        radii=(0.068, 0.052, 0.050),
        rot_euler=(0.06, 0.0, 0.0),
        power=2.12,
        segments=32,
        rings=20,
    )
    bvh_snout = BVHTree.FromBMesh(bm_snout)
    object_from_bmesh("Bear_Snout", bm_snout, m_oat, col, parent=root, uv_scale=6.5, role="snout")

    nose_c = snout_center + Vector((0.0, -0.052, 0.015))
    bm_nose = make_conformed_patch_bm(
        bvh_snout, nose_c, Vector((1.0, 0.0, 0.0)), Vector((0.0, 0.0, 1.0)), Vector((0.0, -1.0, 0.25)).normalized(),
        rad_u=0.022, rad_v=0.014, thickness=0.0062, sink=0.0032, segments=24, rings=4,
        outline_fn=lambda a: 1.0 - 0.22 * math.sin(a) + 0.09 * math.cos(2.0 * a),
        host_center=snout_center,
    )
    object_from_bmesh("Bear_Nose", bm_nose, m_nose, col, parent=root, role="nose")

    philtrum = [snout_center + Vector((0.0, -0.058, 0.006)), snout_center + Vector((0.0, -0.058, -0.015))]
    bm_ph = make_conformed_tube_bm(bvh_snout, philtrum, radius=0.0026, lift=0.0012, samples=6)
    object_from_bmesh("Bear_Philtrum", bm_ph, m_nose, col, parent=root, role="mouth")

    for sgn, side in ((-1.0, "R"), (1.0, "L")):
        smile = [
            snout_center + Vector((0.0, -0.058, -0.015)),
            snout_center + Vector((sgn * 0.014, -0.056, -0.022)),
            snout_center + Vector((sgn * 0.028, -0.048, -0.019)),
            snout_center + Vector((sgn * 0.038, -0.036, -0.010)),
        ]
        bm_sm = make_conformed_tube_bm(bvh_snout, smile, radius=0.0025, lift=0.0012, samples=12)
        object_from_bmesh(f"Bear_Smile_{side}", bm_sm, m_nose, col, parent=root, role="mouth")

    for sgn, side in ((-1.0, "R"), (1.0, "L")):
        eye_probe = head_center + Vector((sgn * 0.056, -0.150, 0.020))
        add_button_eye(
            f"Bear_{side}", bvh_head, eye_probe, Vector((sgn * 0.24, -1.0, 0.06)),
            radius=0.0160, eye_mat=m_eye, glint_mat=m_glint, col=col, parent=root, squash_z=1.06,
        )
        blush_c = head_center + Vector((sgn * 0.092, -0.112, -0.016))
        out_b = Vector((sgn * 0.46, -0.88, -0.06)).normalized()
        u_b = Vector((0.0, 0.0, 1.0)).cross(out_b).normalized()
        v_b = out_b.cross(u_b).normalized()
        bm_bl = make_conformed_patch_bm(
            bvh_head, blush_c, u_b, v_b, out_b, rad_u=0.024, rad_v=0.0145,
            thickness=0.0022, sink=0.0018, segments=20, rings=4, host_center=head_center,
        )
        object_from_bmesh(f"Bear_Blush_{side}", bm_bl, m_blush, col, parent=root, role="blush")

    # 5. Chubby Teddy Arms
    for sgn, side in ((-1.0, "R"), (1.0, "L")):
        arm_ctrl = [
            Vector((sgn * 0.110, 0.008, 0.218)),
            Vector((sgn * 0.168, -0.018, 0.184)),
            Vector((sgn * 0.188, -0.058, 0.142)),
            Vector((sgn * 0.170, -0.088, 0.120)),
        ]
        arm_pts = sample_polyline(arm_ctrl, 12)
        rn_a = [0.042 + 0.006 * math.sin(math.pi * (i / 12)) for i in range(13)]
        rb_a = [0.038 + 0.006 * math.sin(math.pi * (i / 12)) for i in range(13)]
        bm_arm = make_swept_capsule_bm(
            arm_pts, rn_a, rb_a, ref_hint=Vector((0.0, 0.0, 1.0)), ring_segs=20, cap_rings=4,
            cap_len_start=0.028, cap_len_end=0.034,
        )
        object_from_bmesh(f"Bear_Arm_{side}", bm_arm, m_caramel, col, parent=root, uv_scale=5.6, role="arm")

    # 6. Chunky Forward-Splayed Teddy Legs aligned flush with torso bottom at Z = 0.000!
    for sgn, side in ((-1.0, "R"), (1.0, "L")):
        leg_ctrl = [
            Vector((sgn * 0.082, -0.012, 0.068)),
            Vector((sgn * 0.118, -0.076, 0.064)),
            Vector((sgn * 0.136, -0.136, 0.063)),
        ]
        leg_pts = sample_polyline(leg_ctrl, 12)
        rn_lg = [0.052 + 0.010 * (i / 12) for i in range(13)]
        rb_lg = [0.050 + 0.010 * (i / 12) for i in range(13)]
        bm_leg = make_swept_capsule_bm(
            leg_pts, rn_lg, rb_lg, ref_hint=Vector((0.0, 0.0, 1.0)), ring_segs=22, cap_rings=4,
            cap_len_start=0.034, cap_len_end=0.036,
        )
        bvh_leg = BVHTree.FromBMesh(bm_leg)
        leg_anchor = Vector((sgn * 0.120, -0.100, 0.064))
        object_from_bmesh(f"Bear_Leg_{side}", bm_leg, m_caramel, col, parent=root, uv_scale=5.6, role="leg")

        foot_dir = Vector((sgn * 0.28, -0.96, 0.0)).normalized()
        foot_u = Vector((0.0, 0.0, 1.0)).cross(foot_dir).normalized()
        foot_v = foot_dir.cross(foot_u).normalized()
        sole_c = Vector((sgn * 0.146, -0.168, 0.060))

        bm_sole = make_conformed_patch_bm(
            bvh_leg, sole_c, foot_u, foot_v, foot_dir,
            rad_u=0.034, rad_v=0.042, thickness=0.0026, sink=0.0024, segments=24, rings=4, host_center=leg_anchor,
        )
        object_from_bmesh(f"Bear_PawSole_{side}", bm_sole, m_oat, col, parent=root, uv_scale=6.5, role="paw_pad")

        bm_center_pad = make_conformed_patch_bm(
            bvh_leg, sole_c - foot_v * 0.010, foot_u, foot_v, foot_dir,
            rad_u=0.016, rad_v=0.013, thickness=0.0044, sink=0.0010, segments=18, rings=3, host_center=leg_anchor,
        )
        object_from_bmesh(f"Bear_PawHeart_{side}", bm_center_pad, m_caramel, col, parent=root, role="paw_detail")

        for ti, (du, dv) in enumerate(((-0.016, 0.018), (0.0, 0.024), (0.016, 0.018))):
            bm_toe = make_conformed_patch_bm(
                bvh_leg, sole_c + foot_u * du + foot_v * dv, foot_u, foot_v, foot_dir,
                rad_u=0.0062, rad_v=0.0072, thickness=0.0042, sink=0.0010, segments=14, rings=3, host_center=leg_anchor,
            )
            object_from_bmesh(f"Bear_PawToe_{side}_{ti + 1}", bm_toe, m_caramel, col, parent=root, role="toe_pad")

    # 7. Round cute caramel teddy tail in back (+Y)
    bm_tail = make_sculpted_blob_bm(
        center=(0.0, 0.144, 0.062),
        radii=(0.042, 0.040, 0.040),
        segments=24,
        rings=16,
    )
    object_from_bmesh("Bear_Tail", bm_tail, m_caramel, col, parent=root, uv_scale=6.5, role="tail")

    # 8. Dusty-Rose Fabric Neck Ribbon & Full Puffed Bow Tie resting snugly against chest
    band_pts = []
    n_band = 42
    for i in range(n_band):
        ang = math.tau * (i / n_band)
        band_pts.append(Vector((math.sin(ang) * 0.106, -math.cos(ang) * 0.098 + 0.004, 0.248 - 0.010 * math.cos(ang))))
    bm_band = make_closed_ring_tube_bm(
        band_pts, [0.0135] * n_band, [0.0070] * n_band, ref_hint=Vector((0.0, 0.0, 1.0)), ring_segs=16
    )
    object_from_bmesh("Bear_NeckRibbon", bm_band, m_bow, col, parent=root, uv_scale=6.5, role="ribbon")

    knot_c = Vector((0.0, -0.106, 0.234))
    bm_knot = make_sculpted_blob_bm(
        center=tuple(knot_c), radii=(0.020, 0.015, 0.018), power=2.3, segments=20, rings=14
    )
    object_from_bmesh("Bear_BowKnot", bm_knot, m_bow, col, parent=root, role="ribbon_bow")

    for sgn, side in ((-1.0, "R"), (1.0, "L")):
        loop_ctrl = [
            knot_c + Vector((sgn * 0.008, 0.002, 0.006)),
            knot_c + Vector((sgn * 0.048, -0.014, 0.025)),
            knot_c + Vector((sgn * 0.072, -0.002, 0.002)),
            knot_c + Vector((sgn * 0.050, -0.006, -0.024)),
            knot_c + Vector((sgn * 0.008, 0.004, -0.006)),
        ]
        loop_pts = sample_polyline(loop_ctrl, 16)
        rn_lp = [0.0115 + 0.0125 * math.sin(math.pi * (i / 16)) for i in range(17)]
        rb_lp = [0.0062 + 0.0042 * math.sin(math.pi * (i / 16)) for i in range(17)]
        bm_lp = make_swept_capsule_bm(
            loop_pts, rn_lp, rb_lp, ref_hint=Vector((0.0, -1.0, 0.0)), ring_segs=16, cap_rings=3,
            cap_len_start=0.005, cap_len_end=0.005,
        )
        object_from_bmesh(f"Bear_BowLoop_{side}", bm_lp, m_bow, col, parent=root, uv_scale=6.5, role="ribbon_bow")

        tail_ctrl = [
            knot_c + Vector((sgn * 0.008, -0.005, -0.008)),
            knot_c + Vector((sgn * 0.025, -0.020, -0.038)),
            knot_c + Vector((sgn * 0.038, -0.024, -0.068)),
        ]
        t_pts = sample_polyline(tail_ctrl, 10)
        rn_t = [0.012 + 0.005 * (i / 10) for i in range(11)]
        rb_t = [0.0040] * 11
        bm_rt = make_swept_capsule_bm(
            t_pts, rn_t, rb_t, ref_hint=Vector((sgn * 0.9, 0.4, 0.0)), ring_segs=14, cap_rings=2,
            cap_len_start=0.004, cap_len_end=0.004,
        )
        object_from_bmesh(f"Bear_BowTail_{side}", bm_rt, m_bow, col, parent=root, uv_scale=6.5, role="ribbon_bow")

    # 9. Signature woven cloth hip tag
    add_cloth_tag("Bear_ClothTag", bvh_body, Vector((0.148, 0.028, 0.056)), Vector((1.0, 0.18, 0.0)), m_tag, col, root)

    finalize_and_export("PlushBear", blend_path, glb_path)


# ===========================================================================
# DOLL 3: Dusty-Blue Chubby Penguin Plush (雾蓝胖企鹅玩偶) — height ~0.48 m
# ===========================================================================
def build_plush_penguin(blend_path: Path, glb_path: Path | None):
    clear_scene()
    col = get_collection("01 • Dusty-Blue Penguin Plush")
    root = make_empty("PlushPenguin_Root", (0.0, 0.0, 0.0), col=col)

    tex = make_plush_textures(seed_offset=53)
    field = tex["fleece_field"]

    sky_img = make_mottled_albedo("Penguin_SkyBlue_Albedo", (0.420, 0.555, 0.688), field, 0.034)
    snow_img = make_mottled_albedo("Penguin_SnowCream_Albedo", (0.962, 0.938, 0.895), field, 0.024)
    apricot_img = make_mottled_albedo("Penguin_Apricot_Albedo", (0.920, 0.605, 0.340), field, 0.028)
    blush_img = make_mottled_albedo("Penguin_Blush_Albedo", (0.935, 0.625, 0.630), field, 0.022)
    beanie_img = make_striped_knit_albedo(
        "Penguin_BeanieStripe_Albedo", (0.785, 0.435, 0.430), (0.948, 0.885, 0.760), field, stripes=3
    )
    cuff_img = make_mottled_albedo("Penguin_BeanieCuff_Albedo", (0.948, 0.898, 0.818), field, 0.028)

    m_sky = make_pbr_material("Plush_DustySkyBlue", (0.420, 0.555, 0.688), 0.90, sky_img, tex["plush_normal"], 0.27, 0.52)
    m_snow = make_pbr_material("Plush_SnowCream", (0.962, 0.938, 0.895), 0.89, snow_img, tex["plush_normal"], 0.22, 0.46)
    m_apricot = make_pbr_material("Plush_ButterApricot", (0.920, 0.605, 0.340), 0.87, apricot_img, tex["plush_normal"], 0.22, 0.40)
    m_blush = make_pbr_material("Plush_RosyBlush", (0.935, 0.625, 0.630), 0.91, blush_img, tex["plush_normal"], 0.16, 0.35)
    m_beanie = make_pbr_material("Knit_RoseCreamBeanie", (0.785, 0.435, 0.430), 0.92, beanie_img, tex["knit_normal"], 0.46, 0.38)
    m_cuff = make_pbr_material("Knit_CreamCuff", (0.948, 0.898, 0.818), 0.92, cuff_img, tex["knit_normal"], 0.44, 0.42)
    m_eye = make_pbr_material("SafetyEye_Espresso", (0.052, 0.036, 0.032), 0.16, sheen=0.0, specular=0.65)
    m_glint = make_pbr_material("SafetyEye_Catchlight", (0.99, 0.97, 0.93), 0.25, sheen=0.0, specular=0.45)
    m_tag = make_pbr_material("Fabric_CottonTag", (0.955, 0.925, 0.865), 0.92, sheen=0.15)

    # 1. Super-round cuddly pear/egg penguin body-and-head sitting firmly on Z = 0.000!
    body_center = Vector((0.0, 0.008, 0.172))
    bm_body = make_sculpted_blob_bm(
        center=tuple(body_center),
        radii=(0.170, 0.158, 0.194),
        power=2.18,
        pear=0.13,
        flat_bottom=0.28,
        belly_puff=0.14,
        waist_pinch=0.038,
        waist_z_norm=0.26,
        segments=50,
        rings=34,
    )
    bvh_body = BVHTree.FromBMesh(bm_body)
    object_from_bmesh("Penguin_Body", bm_body, m_sky, col, parent=root, uv_scale=5.6, role="body")

    # 2. Generous Snow-Cream Heart-Shaped Face Mask & Plump Belly Apron!
    # Wraps cleanly ABOVE and OUTSIDE both eyes with a soft classic widow's peak right on the forehead.
    def penguin_apron_outline(ang: float) -> float:
        s = math.sin(ang)
        c = math.cos(ang)
        # Plump belly below + wide rounded face lobes above + gentle heart widow's peak at very top center
        belly_wide = 1.0 + 0.06 * max(0.0, -s) - 0.04 * max(0.0, s)
        dip = 0.22 * (max(0.0, s) ** 5) * math.exp(-((c / 0.25) ** 2))
        brows = 0.10 * (max(0.0, s) ** 2) * math.exp(-(((abs(c) - 0.50) / 0.28) ** 2))
        return belly_wide - dip + brows

    apron_c = Vector((0.0, -0.155, 0.176))
    bm_apron = make_conformed_patch_bm(
        bvh_body, apron_c, Vector((1.0, 0.0, 0.0)), Vector((0.0, 0.0, 1.0)), Vector((0.0, -1.0, 0.0)),
        rad_u=0.138, rad_v=0.146, thickness=0.0038, sink=0.0028, segments=56, rings=7,
        outline_fn=penguin_apron_outline, host_center=body_center,
    )
    bvh_apron = BVHTree.FromBMesh(bm_apron)
    object_from_bmesh("Penguin_WhiteApron", bm_apron, m_snow, col, parent=root, uv_scale=6.0, role="belly_face")

    # 3. Petite Plump Butter-Apricot Cushion Beak (neatly centered below the eye line!)
    beak_hit, _bn, _bi, _bd = bvh_apron.ray_cast(Vector((0.0, -0.35, 0.222)), Vector((0.0, 1.0, 0.0)), 0.50)
    beak_y = beak_hit.y if beak_hit is not None else -0.145

    bm_beak_u = make_sculpted_blob_bm(
        center=(0.0, beak_y - 0.012, 0.226),
        radii=(0.025, 0.023, 0.0125),
        rot_euler=(0.14, 0.0, 0.0),
        power=2.15,
        segments=26,
        rings=14,
        deform_fn=lambda loc, xn, yn, zn, phi: Vector((
            loc.x * (1.0 + 0.30 * yn),
            loc.y,
            loc.z * (1.0 + 0.18 * yn),
        )),
    )
    object_from_bmesh("Penguin_BeakUpper", bm_beak_u, m_apricot, col, parent=root, uv_scale=7.5, role="beak")

    bm_beak_l = make_sculpted_blob_bm(
        center=(0.0, beak_y - 0.008, 0.216),
        radii=(0.019, 0.017, 0.0088),
        rot_euler=(-0.10, 0.0, 0.0),
        power=2.10,
        segments=22,
        rings=12,
        deform_fn=lambda loc, xn, yn, zn, phi: Vector((
            loc.x * (1.0 + 0.26 * yn),
            loc.y,
            loc.z * (1.0 + 0.15 * yn),
        )),
    )
    object_from_bmesh("Penguin_BeakLower", bm_beak_l, m_apricot, col, parent=root, uv_scale=7.5, role="beak")

    # 4. Expressive Wide-Set Button Eyes + Rosy Plush Blush Ovals well inside the white face!
    for sgn, side in ((-1.0, "R"), (1.0, "L")):
        eye_probe = Vector((sgn * 0.062, -0.160, 0.244))
        add_button_eye(
            f"Penguin_{side}", bvh_apron, eye_probe, Vector((sgn * 0.30, -0.95, 0.06)),
            radius=0.0155, eye_mat=m_eye, glint_mat=m_glint, col=col, parent=root, squash_z=1.08,
        )
        blush_c = Vector((sgn * 0.088, -0.145, 0.214))
        out_b = Vector((sgn * 0.46, -0.88, 0.0)).normalized()
        u_b = Vector((0.0, 0.0, 1.0)).cross(out_b).normalized()
        v_b = out_b.cross(u_b).normalized()
        bm_bl = make_conformed_patch_bm(
            bvh_apron, blush_c, u_b, v_b, out_b, rad_u=0.023, rad_v=0.014,
            thickness=0.0022, sink=0.0018, segments=20, rings=4, host_center=body_center,
        )
        object_from_bmesh(f"Penguin_Blush_{side}", bm_bl, m_blush, col, parent=root, role="blush")

    # 5. Chubby Curved Flipper Wings raised slightly for a warm hug
    for sgn, side in ((-1.0, "R"), (1.0, "L")):
        wing_ctrl = [
            Vector((sgn * 0.136, 0.005, 0.200)),
            Vector((sgn * 0.180, -0.010, 0.178)),
            Vector((sgn * 0.212, -0.026, 0.140)),
            Vector((sgn * 0.214, -0.038, 0.104)),
        ]
        w_pts = sample_polyline(wing_ctrl, 14)
        rn_w = [0.041 + 0.010 * math.sin(math.pi * (i / 14) ** 0.85) - 0.010 * (i / 14) for i in range(15)]
        rb_w = [0.020 + 0.004 * math.sin(math.pi * (i / 14)) - 0.004 * (i / 14) for i in range(15)]
        bm_wing = make_swept_capsule_bm(
            w_pts, rn_w, rb_w, ref_hint=Vector((0.0, 1.0, 0.15)), ring_segs=20, cap_rings=4,
            cap_len_start=0.020, cap_len_end=0.020,
        )
        object_from_bmesh(f"Penguin_Flipper_{side}", bm_wing, m_sky, col, parent=root, uv_scale=5.8, role="flipper")

    # 6. Cute Plump Butter-Apricot Webbed Sitting Feet aligned flush with body bottom at Z = 0.000!
    for sgn, side in ((-1.0, "R"), (1.0, "L")):
        foot_rot = (0.0, 0.0, -sgn * 0.38)
        foot_c = Vector((sgn * 0.072, -0.108, 0.028))
        bm_foot = make_sculpted_blob_bm(
            center=tuple(foot_c),
            radii=(0.046, 0.062, 0.025),
            rot_euler=foot_rot,
            power=2.15,
            flat_bottom=0.34,
            segments=26,
            rings=16,
            deform_fn=lambda loc, xn, yn, zn, phi: Vector((
                loc.x * (1.0 - 0.20 * yn) * (1.0 + 0.055 * max(0.0, -yn) * math.cos(3.0 * phi)),
                loc.y * (1.0 + 0.06 * max(0.0, -yn) * math.cos(3.0 * phi)),
                loc.z,
            )),
        )
        object_from_bmesh(f"Penguin_Foot_{side}", bm_foot, m_apricot, col, parent=root, uv_scale=6.5, role="foot")

    # 7. Stubby Blue Penguin Tail Tuft in back (+Y)
    tail_ctrl = [
        Vector((0.0, 0.128, 0.048)),
        Vector((0.0, 0.168, 0.038)),
        Vector((0.0, 0.188, 0.032)),
    ]
    t_pts = sample_polyline(tail_ctrl, 8)
    bm_tail = make_swept_capsule_bm(
        t_pts, [0.044, 0.040, 0.036, 0.032, 0.028, 0.024, 0.020, 0.017, 0.014],
        [0.030, 0.028, 0.025, 0.022, 0.019, 0.016, 0.014, 0.012, 0.010],
        ref_hint=Vector((1.0, 0.0, 0.0)), ring_segs=18, cap_rings=3,
    )
    object_from_bmesh("Penguin_Tail", bm_tail, m_sky, col, parent=root, uv_scale=6.0, role="tail")

    # 8. Cozy Knitted Striped Winter Pom-Pom Beanie hugging right above the brows (~8 deg jaunty tilt!)
    hat_tilt = Euler((-0.11, -0.14, 0.0), "XYZ").to_matrix()
    hat_origin = Vector((-0.012, 0.010, 0.318))

    n_cuff = 44
    cuff_pts = []
    for i in range(n_cuff):
        ang = math.tau * (i / n_cuff)
        local = Vector((math.sin(ang) * 0.124, -math.cos(ang) * 0.116, 0.0))
        cuff_pts.append(hat_origin + hat_tilt @ local)
    bm_cuff = make_closed_ring_tube_bm(
        cuff_pts,
        radii_n=[0.026] * n_cuff,
        radii_b=[0.021] * n_cuff,
        ref_hint=hat_tilt @ Vector((0.0, 0.0, 1.0)),
        ring_segs=18,
        rib_count=28,
        rib_depth=0.048,
    )
    object_from_bmesh("Penguin_BeanieCuff", bm_cuff, m_cuff, col, parent=root, uv_scale=7.5, role="hat_cuff")

    dome_profile = [
        (0.000, -0.005),
        (0.110, -0.005),
        (0.119, 0.014),
        (0.118, 0.036),
        (0.108, 0.060),
        (0.090, 0.082),
        (0.064, 0.100),
        (0.032, 0.112),
        (0.000, 0.116),
    ]
    bm_dome = bmesh.new()
    segs_d = 42
    v_bot = bm_dome.verts.new(hat_origin + hat_tilt @ Vector((0.0, 0.0, dome_profile[0][1])))
    d_rings = []
    for rad, hz in dome_profile[1:-1]:
        ring = []
        for s in range(segs_d):
            ang = math.tau * (s / segs_d)
            r_mod = rad * (1.0 + 0.012 * math.cos(24.0 * ang))
            local = Vector((math.cos(ang) * r_mod, math.sin(ang) * r_mod * 0.96, hz))
            ring.append(bm_dome.verts.new(hat_origin + hat_tilt @ local))
        d_rings.append(ring)
    v_top = bm_dome.verts.new(hat_origin + hat_tilt @ Vector((0.0, 0.0, dome_profile[-1][1])))

    for s in range(segs_d):
        ns = (s + 1) % segs_d
        bm_dome.faces.new((v_bot, d_rings[0][ns], d_rings[0][s]))
    for r in range(len(d_rings) - 1):
        lo, hi = d_rings[r], d_rings[r + 1]
        for s in range(segs_d):
            ns = (s + 1) % segs_d
            bm_dome.faces.new((lo[s], lo[ns], hi[ns], hi[s]))
    for s in range(segs_d):
        ns = (s + 1) % segs_d
        bm_dome.faces.new((d_rings[-1][s], d_rings[-1][ns], v_top))
    bmesh.ops.recalc_face_normals(bm_dome, faces=list(bm_dome.faces))

    def dome_uv(mesh: bpy.types.Mesh):
        inv_tilt = hat_tilt.inverted()
        bm_u = bmesh.new()
        bm_u.from_mesh(mesh)
        uv_layer = bm_u.loops.layers.uv.verify()
        for face in bm_u.faces:
            angs = []
            locals_ = []
            for loop in face.loops:
                lp = inv_tilt @ (loop.vert.co - hat_origin)
                locals_.append(lp)
                angs.append(math.atan2(lp.y, lp.x))
            wrap = (max(angs) - min(angs)) > math.pi
            for loop, lp, ang in zip(face.loops, locals_, angs):
                if wrap and ang < 0.0:
                    ang += math.tau
                u = ((ang / math.tau) + 0.5) * 1.5
                v = (lp.z + 0.005) / 0.124
                loop[uv_layer].uv = (u, v)
        bm_u.to_mesh(mesh)
        bm_u.free()

    object_from_bmesh("Penguin_BeanieDome", bm_dome, m_beanie, col, parent=root, uv_custom=dome_uv, role="hat_dome")

    pom_center = hat_origin + hat_tilt @ Vector((0.0, 0.0, 0.128))
    bm_pom = make_sculpted_blob_bm(
        center=tuple(pom_center),
        radii=(0.032, 0.032, 0.030),
        segments=26,
        rings=16,
        deform_fn=lambda loc, xn, yn, zn, phi: loc * (
            1.0 + 0.075 * math.sin(9.0 * phi) * math.cos(7.0 * zn * math.pi)
            + 0.045 * math.cos(13.0 * phi + 5.0 * zn)
        ),
    )
    object_from_bmesh("Penguin_BeaniePomPom", bm_pom, m_cuff, col, parent=root, uv_scale=8.0, role="hat_pompom")

    # 9. Signature woven cloth hip tag
    add_cloth_tag("Penguin_ClothTag", bvh_body, Vector((0.162, 0.035, 0.060)), Vector((1.0, 0.22, 0.0)), m_tag, col, root)

    finalize_and_export("PlushPenguin", blend_path, glb_path)


# ---------------------------------------------------------------------------
# CLI Entry
# ---------------------------------------------------------------------------
def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Build PocketWorld cabin sitting plush dolls.")
    root = Path(__file__).resolve().parents[1]
    parser.add_argument(
        "--only",
        choices=("all", "bunny", "bear", "penguin"),
        default="all",
        help="Build all three plush dolls or a single doll.",
    )
    parser.add_argument(
        "--blend-dir",
        type=Path,
        default=root / "assets/models/furniture",
        help="Output directory for editable .blend files.",
    )
    parser.add_argument(
        "--glb-dir",
        type=Path,
        default=root / "assets/public/models/furniture",
        help="Output directory for exported runtime .glb files (pass 'none' to skip).",
    )
    args = parser.parse_args(argv)
    if str(args.glb_dir).lower() == "none":
        args.glb_dir = None
    return args


def main():
    opts = parse_args()
    builders = [
        ("bunny", "plush-bunny", build_plush_bunny),
        ("bear", "plush-bear", build_plush_bear),
        ("penguin", "plush-penguin", build_plush_penguin),
    ]
    for key, stem, fn in builders:
        if opts.only not in ("all", key):
            continue
        blend_path = opts.blend_dir / f"{stem}.blend"
        glb_path = None if opts.glb_dir is None else opts.glb_dir / f"{stem}.glb"
        fn(blend_path, glb_path)


if __name__ == "__main__":
    main()
