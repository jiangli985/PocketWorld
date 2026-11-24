"""Build the cabin's fixed four-legged chair in metre units. The front faces Blender -Y."""
from math import cos, copysign, sin, tau
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/models/furniture/fixed-desk-chair.blend"
RUNTIME = ROOT / "assets/public/models/furniture/fixed-desk-chair.glb"
ARM_TOP = 0.786


def material(name, hex_color, roughness):
    def linear(byte):
        value = int(byte, 16) / 255
        return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4

    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*[linear(hex_color[i:i + 2]) for i in (0, 2, 4)], 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = mat.diffuse_color
    shader.inputs["Roughness"].default_value = roughness
    return mat


def finish(obj, name, mat):
    obj.name = name
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def bevel(obj, width):
    edge = obj.modifiers.new("Rounded edges", "BEVEL")
    edge.width = width
    edge.segments = 4
    edge.harden_normals = True
    normals = obj.modifiers.new("Weighted face normals", "WEIGHTED_NORMAL")
    normals.keep_sharp = True


def box(name, loc, size, radius, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = finish(bpy.context.object, name, mat)
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel(obj, radius)
    return obj


def beam(name, start, end, width, depth, radius, mat):
    a, b = Vector(start), Vector(end)
    axis = b - a
    obj = box(name, (a + b) / 2, (width, depth, axis.length), radius, mat)
    obj.rotation_euler = axis.to_track_quat("Z", "Y").to_euler()
    return obj


def arm_profile(obj):
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    for vertex in obj.data.vertices:
        y = obj.location.y + vertex.co.y
        front = max(0, (-y - .208) / .070)
        vertex.co.z -= .022 * front ** 1.25


def leg(name, foot, joint, mat):
    # Horizontal cross sections leave the four feet flush with the cabin floor.
    sections = [(foot[0], foot[1], 0, .052, .058),
                (joint[0], joint[1], .427, .090, .097)]
    vertices = [(x + sx * width / 2, y + sy * depth / 2, z)
                for x, y, z, width, depth in sections
                for sx, sy in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]
    faces = [(3, 2, 1, 0), (4, 5, 6, 7)]
    faces.extend((i, (i + 1) % 4, (i + 1) % 4 + 4, i + 4) for i in range(4))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj, name, mat)
    bevel(obj, .013)


def seat_cushion(mat, welt):
    # Rounded rectangular rings with a shaped crown at the two hip load areas.
    count = 64
    rings = [(.14, .000), (.40, .000), (.69, .001), (.84, .004), (.93, .011),
             (.98, .024), (1, .042), (1, .058), (.965, .083), (.958, .087), (.87, .106), (.55, .110)]
    vertices = [(0, -.061, .530)]
    for index, (scale, drop) in enumerate(rings):
        for i in range(count):
            theta = tau * i / count
            cx, cy = cos(theta), sin(theta)
            x = copysign(abs(cx) ** .62, cx) * .326 * scale
            y = -.061 + copysign(abs(cy) ** .62, cy) * .307 * scale
            lip = max(0, (-y - .305) / .063)
            shoulder = max(0, (abs(x) - .255) / .071)
            crown = .531 - .16 * (y + .12) ** 2 - .029 * lip ** 1.35 - .028 * shoulder ** 1.4
            z = crown - drop if index < 8 else .532 - drop
            vertices.append((x, y, z))
    vertices.append((0, -.061, .422))
    faces = [(0, i + 1, (i + 1) % count + 1) for i in range(count)]
    for j in range(len(rings) - 1):
        a = 1 + j * count
        b = a + count
        faces.extend((a + i, b + i, b + (i + 1) % count, a + (i + 1) % count) for i in range(count))
    first = len(vertices) - count - 1
    faces.extend((len(vertices) - 1, first + (i + 1) % count, first + i) for i in range(count))
    mesh = bpy.data.meshes.new("Upholstered seat surface")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Seat cushion", mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj, obj.name, mat)
    obj.data.materials.append(welt)
    seam = count * 9
    for polygon in obj.data.polygons[seam:seam + count]:
        polygon.material_index = 1


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    frame = material("Walnut frame", "5E3E2E", .42)
    walnut = material("Walnut edge", "78513C", .40)
    oatmeal = material("Oatmeal upholstery", "7B9479", .90)
    welt = material("Oatmeal welt", "B8C7B2", .86)

    box("Front apron", (0, -.247, .389), (.563, .071, .074), .020, frame)
    box("Rear apron", (0, .167, .389), (.547, .074, .074), .020, frame)
    box("Walnut seat pan", (0, -.062, .423), (.679, .616, .062), .030, walnut)
    seat_cushion(oatmeal, welt)

    for side, label in ((-1, "Left"), (1, "Right")):
        leg(f"{label} front leg", (side * .345, -.310), (side * .278, -.241), frame)
        leg(f"{label} rear leg", (side * .333, .255), (side * .263, .159), frame)
        box(f"{label} side apron", (side * .281, -.043, .389),
            (.068, .456, .074), .020, frame)
        beam(f"{label} back upright", (side * .225, .171, .406),
             (side * .245, .362, .947), .055, .068, .021, frame)
        beam(f"{label} arm support", (side * .292, .145, .412),
             (side * .394, .137, .746), .055, .062, .021, frame)
        rail = box(f"{label} walnut arm rail", (side * .383, -.065, ARM_TOP - .047),
                   (.114, .447, .058), .024, walnut)
        pad = box(f"{label} arm padding", (side * .389, -.057, ARM_TOP - .012),
                  (.102, .442, .024), .009, oatmeal)
        arm_profile(rail)
        arm_profile(pad)

    back = box("Walnut back shell", (0, .345, .885), (.656, .092, .507), .045, walnut)
    back.rotation_euler.x = -.292
    pad = box("Back cushion", (0, .307, .901), (.590, .092, .443), .045, oatmeal)
    pad.rotation_euler.x = back.rotation_euler.x
    trim = box("Back cushion welt", (0, .321, .900), (.607, .052, .458), .025, welt)
    trim.rotation_euler.x = back.rotation_euler.x

    # Keep the legs, joinery and upholstery independently editable in the source.
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), compress=True)

    # Join parts by primary material while preserving the cushion welt faces.
    for mat in (frame, walnut, oatmeal, welt):
        bpy.ops.object.select_all(action="DESELECT")
        parts = [obj for obj in bpy.context.scene.objects if obj.active_material == mat]
        for obj in parts:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        bpy.ops.object.convert(target="MESH")
        if len(parts) > 1:
            bpy.ops.object.join()
        bpy.context.object.name = mat.name

    bpy.ops.export_scene.gltf(filepath=str(RUNTIME), export_format="GLB", export_animations=False)


if __name__ == "__main__":
    build()
