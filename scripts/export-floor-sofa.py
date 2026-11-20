"""Export the web mesh from the editable floor-sofa.blend without saving over the source."""
from math import exp
from pathlib import Path

import bpy
from mathutils import Vector

root = Path(__file__).resolve().parents[1]
objects = list(bpy.context.scene.objects)
body = next(obj for obj in objects if obj.name.startswith("01 "))
bpy.ops.object.select_all(action="SELECT")
bpy.context.view_layer.objects.active = body
bpy.ops.object.convert(target="MESH")

# Retain the folds and rounded silhouette. Stitches and tassels require fewer facets.
for obj in objects:
    detail = obj.modifiers.new("Web resolution", "DECIMATE")
    if obj.name.startswith("01 "):
        detail.ratio = .52
    elif obj.name.startswith("05 "):
        detail.ratio = .65
    else:
        detail.ratio = .22
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=detail.name)

bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body.name = "Linen_floor_sofa"
# All upholstery primitives (including piping and throw) yield together. The
# front lip compresses under the thighs, while the base and backrest stay put.
points = [body.matrix_world @ vertex.co for vertex in body.data.vertices]
lo = Vector(tuple(min(point[i] for point in points) for i in range(3)))
hi = Vector(tuple(max(point[i] for point in points) for i in range(3)))
center = (lo + hi) / 2
scale = 1.49 / (hi.x - lo.x)
def ramp(x):
    t = max(0., min(1., x))
    return t*t*(3.-2.*t)

body.shape_key_add(name="Basis")
loaded = body.shape_key_add(name="Seated")
down = body.matrix_world.to_3x3().inverted() @ Vector((0, 0, -.080 / scale))
for vertex, point in zip(loaded.data, points):
    x, z = (point.x-center.x)*scale, (center.y-point.y)*scale
    y = (point.z-lo.z)*scale
    sides = ramp((.54-abs(x+.16))/.19)
    depth = ramp((z+.24)/.25) * ramp((.73-z)/.16)
    # The tuft under the pelvis carries weight earlier than the raised front lip.
    tuft = 1 - .38 * exp(-((x+.18)/.12)**2 - ((z-.255)/.09)**2)
    tuft -= .17 * exp(-((x+.245)/.065)**2 - ((z-.335)/.050)**2)
    vertex.co += down * (sides * depth * tuft * ramp(y/.20))
bpy.ops.export_scene.gltf(
    filepath=str(root / "assets/public/models/furniture/floor-sofa.glb"),
    export_format="GLB",
    export_animations=False,
)
