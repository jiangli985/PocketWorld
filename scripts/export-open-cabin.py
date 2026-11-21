"""Export the two deck sets and the observatory shell from open-cabin.blend."""
from pathlib import Path

import bmesh
import bpy


ROOT = Path(__file__).resolve().parents[1]
DIVIDER_X = -1.86  # Keep aligned with cabinLayout.ts.
WINDOW_CUT_X = -2.61  # The leftmost panorama trim is at -2.55 m.
CABIN_LEFT = -6.57
CABIN_RIGHT = 4.24

collections = {collection.name[:2]: list(collection.objects) for collection in bpy.context.scene.collection.children}
depsgraph = bpy.context.evaluated_depsgraph_get()


def copy_mesh(source):
    # Evaluate the authored bevels and bake transforms before cutting in cabin coordinates.
    mesh = bpy.data.meshes.new_from_object(source.evaluated_get(depsgraph), depsgraph=depsgraph)
    mesh.transform(source.matrix_world)
    copy = bpy.data.objects.new(source.name + " deck section", mesh)
    bpy.context.scene.collection.objects.link(copy)
    return copy


def cut_x(obj, x, keep_left, cap=True):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(
        bm,
        geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        dist=0.000001,
        plane_co=(x, 0, 0),
        plane_no=(1, 0, 0),
        clear_inner=not keep_left,
        clear_outer=keep_left,
    )
    bmesh.ops.dissolve_degenerate(bm, dist=0.000002, edges=list(bm.edges))
    if cap:
        cut_edges = [edge for edge in bm.edges if edge.is_boundary
                     and all(abs(vertex.co.x - x) < .00001 for vertex in edge.verts)]
        if cut_edges:
            faces = bmesh.ops.holes_fill(bm, edges=cut_edges)["faces"]
            bmesh.ops.recalc_face_normals(bm, faces=faces)
    if not bm.faces:
        bm.free()
        bpy.data.objects.remove(obj, do_unlink=True)
        return None
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def remap_x(obj, left, right, new_left, new_right):
    scale = (new_right - new_left) / (right - left)
    for vertex in obj.data.vertices:
        vertex.co.x = new_left + (vertex.co.x - left) * scale
    obj.data.update()


def join_as(name, objects):
    objects = [obj for obj in objects if obj is not None]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.convert(target="MESH")
    if len(objects) > 1:
        bpy.ops.object.join()
    bpy.context.object.name = name


lower_shell = []
upper_shell = []
for source in collections["01"]:
    name = source.name
    if name.startswith("Aft wall"):
        # The old aperture straddles the furniture division. Preserve its complete outline
        # on the desk level, and reuse only the solid port wall behind the bedroom.
        lower = cut_x(copy_mesh(source), WINDOW_CUT_X, False)
        remap_x(lower, WINDOW_CUT_X, CABIN_RIGHT, DIVIDER_X, CABIN_RIGHT)
        lower_shell.append(lower)
        upper = cut_x(copy_mesh(source), WINDOW_CUT_X, True)
        remap_x(upper, CABIN_LEFT, WINDOW_CUT_X, CABIN_LEFT, DIVIDER_X)
        upper_shell.append(upper)
    elif name.startswith("Panorama"):
        lower = copy_mesh(source)
        remap_x(lower, WINDOW_CUT_X, CABIN_RIGHT, DIVIDER_X, CABIN_RIGHT)
        lower_shell.append(lower)
    elif name.startswith("Port cut edge"):
        lower = copy_mesh(source)
        lower.location.x = DIVIDER_X - CABIN_LEFT
        lower_shell.append(lower)
        upper_shell.append(copy_mesh(source))
    else:
        lower_shell.append(cut_x(copy_mesh(source), DIVIDER_X, False))
        if name.startswith(("Aft cap", "Aft skirting", "Parquet substrate", "Rounded porcelain")):
            upper_shell.append(cut_x(copy_mesh(source), DIVIDER_X, True))

parquet = collections["02"][0]
upper_parquet = cut_x(copy_mesh(parquet), DIVIDER_X, True, cap=False)
lower_parquet = cut_x(copy_mesh(parquet), DIVIDER_X, False, cap=False)
bpy.data.objects.remove(parquet, do_unlink=True)
rugs = collections["06"]
lower_rugs = [obj for obj in rugs if obj.location.x >= DIVIDER_X]
upper_rugs = [obj for obj in rugs if obj.location.x < DIVIDER_X]

join_as("Shell", collections["01"])
join_as("Duplex_LowerShell", lower_shell)
join_as("Duplex_UpperShell", upper_shell)
join_as("Floor_Parquet", [lower_parquet])
join_as("Floor_Parquet_Upper", [upper_parquet])
join_as("Wardrobe_Nightstand", collections["03"])
join_as("Stationery", collections["04"])
join_as("Shelf_Gallery", collections["05"])
join_as("Rugs", lower_rugs)
join_as("Rugs_Upper", upper_rugs)

bpy.ops.export_scene.gltf(
    filepath=str(ROOT / "assets/public/models/cabin/open-cabin.glb"),
    export_format="GLB",
    export_yup=True,
    export_animations=False,
    export_vertex_color="ACTIVE",
)
