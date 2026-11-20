"""Build the cabin's floor-mounted chair in metre units. The front faces Blender -Y."""
from math import cos, copysign, sin, tau
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/models/furniture/fixed-desk-chair.blend"
RUNTIME = ROOT / "assets/public/models/furniture/fixed-desk-chair.glb"
ARM_TOP = 0.786


def material(name, hex_color, roughness, metalness=0):
    def linear(byte):
        value = int(byte, 16) / 255
        return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4

    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*[linear(hex_color[i:i + 2]) for i in (0, 2, 4)], 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = mat.diffuse_color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metalness
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


def round_part(name, loc, radius, depth, mat, vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = finish(bpy.context.object, name, mat)
    bevel(obj, min(depth * .22, radius * .18))
    return obj


def seat_cushion(mat):
    # Rounded rectangular rings with a shaped crown at the two hip load areas.
    count = 64
    rings = [(.14, .000), (.40, .000), (.69, .001), (.84, .004), (.93, .011),
             (.98, .024), (1, .042), (1, .058), (.965, .083), (.87, .106), (.55, .110)]
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


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bronze = material("Powder-coated bronze", "514039", .5, .32)
    brass = material("Satin brass", "B18A58", .31, .65)
    walnut = material("Warm walnut", "80523C", .38)
    sage = material("Sage upholstery", "87978A", .84)
    dark_sage = material("Upholstery welt", "657A6B", .85)
    inset = material("Bolt socket", "433731", .68)

    box("Floor gasket", (0, .047, .011), (.606, .539, .022), .010, inset)
    box("Bolted floor plate", (0, .047, .033), (.596, .529, .034), .016, bronze)
    for x in (-.228, .228):
        for y in (-.139, .233):
            round_part("Flange washer", (x, y, .052), .026, .008, brass)
            round_part("Anchor bolt", (x, y, .061), .017, .014, brass, 6)
            round_part("Dark hex socket", (x, y, .068), .007, .0015, inset, 6)

    box("Pedestal lower collar", (0, .09, .059), (.271, .252, .033), .014, bronze)
    beam("Fixed pedestal", (0, .09, .059), (0, .038, .407), .194, .181, .035, bronze)
    box("Pedestal saddle", (0, .025, .395), (.394, .365, .079), .027, bronze)
    box("Walnut seat pan", (0, -.062, .423), (.679, .616, .062), .030, walnut)
    seat_cushion(sage)

    for side, label in ((-1, "Left"), (1, "Right")):
        beam(f"{label} back upright", (side * .225, .171, .406),
             (side * .245, .362, .947), .055, .068, .021, bronze)
        beam(f"{label} arm support", (side * .292, .145, .412),
             (side * .394, .137, .746), .047, .061, .020, bronze)
        rail = box(f"{label} walnut arm rail", (side * .383, -.065, ARM_TOP - .047),
                   (.114, .447, .058), .024, walnut)
        pad = box(f"{label} arm padding", (side * .389, -.057, ARM_TOP - .012),
                  (.102, .442, .024), .009, dark_sage)
        arm_profile(rail)
        arm_profile(pad)

    back = box("Walnut back shell", (0, .345, .885), (.656, .092, .507), .045, walnut)
    back.rotation_euler.x = -.292
    pad = box("Back cushion", (0, .307, .901), (.590, .092, .443), .045, sage)
    pad.rotation_euler.x = back.rotation_euler.x
    trim = box("Back cushion welt", (0, .321, .900), (.607, .052, .458), .025, dark_sage)
    trim.rotation_euler.x = back.rotation_euler.x
    box("Back shell inlay", (0, .410, .946), (.136, .009, .021), .004, brass).rotation_euler.x = back.rotation_euler.x

    # The source keeps the hardware, pads and supports independently editable.
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), compress=True)

    # One runtime mesh per material. Authoring modifiers are evaluated during conversion.
    for mat in (bronze, brass, walnut, sage, dark_sage, inset):
        bpy.ops.object.select_all(action="DESELECT")
        parts = [obj for obj in bpy.context.scene.objects if obj.active_material == mat]
        for obj in parts:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        bpy.ops.object.convert(target="MESH")
        bpy.ops.object.join()
        bpy.context.object.name = mat.name

    bpy.ops.export_scene.gltf(filepath=str(RUNTIME), export_format="GLB", export_animations=False)


if __name__ == "__main__":
    build()
