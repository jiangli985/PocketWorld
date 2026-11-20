"""Build editable Luna left/right corrective shapes and pack them into the room GLB."""
import argparse
import json
import struct
import subprocess
import sys
from array import array
from math import exp, pi
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "assets/public/models/resident/luna-walk-room.glb"
SOURCE = ROOT / "assets/models/resident/Luna-ArmContact.blend"
NAMES = ("LeftArmContact", "RightArmContact")


def smooth(value, low, high):
    u = min(1, max(0, (value - low) / (high - low)))
    return u * u * (3 - 2 * u)


def sculpt(surface):
    surface.shape_key_add(name="Basis")
    groups = [group.name.removeprefix("mixamorig:") for group in surface.vertex_groups]
    keys = [surface.shape_key_add(name=name) for name in NAMES]
    for key, side in zip(keys, (1, -1)):
        for vertex in surface.data.vertices:
            x, depth, height = vertex.co
            lateral = x * side
            if lateral < .054 or not .375 < height < .72:
                continue
            cloth_support = sum(group.weight for group in vertex.groups if groups[group.group].startswith(
                ("Dress_", "Hips", "Spine")))
            skin_support = sum(group.weight for group in vertex.groups if groups[group.group].startswith(
                ("LeftArm", "RightArm", "LeftShoulder", "RightShoulder")))
            if not cloth_support:
                continue

            # The arm compresses the waist and upper side of the skirt. Fade
            # toward the bow, the back, and the free-hanging ruffled hem.
            side_mask = smooth(lateral, .055, .091) * (1 - smooth(abs(depth), .053, .105))
            fabric = smooth(height, .378, .455) * (1 - smooth(height, .635, .702))
            crease = exp(-((height - .548 + depth * .21) / .030) ** 2)
            tuck = (.015 + .006 * crease) * side_mask * fabric * cloth_support ** 2
            # Preserve the arm volume and soften the narrow armpit transition.
            armpit = (smooth(height, .632, .670) * (1 - smooth(height, .685, .725))
                      * (1 - smooth(lateral, .100, .142)) * side_mask * cloth_support * skin_support)
            key.data[vertex.index].co.x -= side * (tuck + .014 * armpit)
            key.data[vertex.index].co.z += .0038 * crease * side_mask * fabric * cloth_support ** 2
    return keys


def matrix(values):
    return Matrix([values[i:i + 4] for i in range(0, 16, 4)]).transposed()


def glb_parts(path):
    raw = path.read_bytes()
    size = struct.unpack_from("<I", raw, 12)[0]
    return json.loads(raw[20:20 + size]), raw[28 + size:]


def set_preview_pose(base, surface, keys):
    """Show the browser's resting-arm pose when the source opens in Blender."""
    args = ["node", str(ROOT / "scripts/luna-library-neutral.mjs"), "--arm-contact"]
    standing = json.loads(subprocess.check_output(args, cwd=ROOT))
    doc, binary = glb_parts(base)
    skin = doc["skins"][0]
    accessor = doc["accessors"][skin["inverseBindMatrices"]]
    view = doc["bufferViews"][accessor["bufferView"]]
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    to_blender = Matrix.Rotation(pi / 2, 4, "X")
    to_gltf = to_blender.inverted()
    unscale = Matrix.Scale(1 / standing["scale"], 4)
    inverse_bind = {}
    for index, node in enumerate(skin["joints"]):
        name = doc["nodes"][node]["name"].replace(":", "")
        inverse_bind[name] = matrix(struct.unpack_from("<16f", binary, offset + 64 * index))
    armature = surface.find_armature()
    posed = {}
    for bone in armature.pose.bones:
        name = bone.name.replace(":", "")
        posed[bone.name] = (to_blender @ unscale @ matrix(standing["pose"][name])
                            @ inverse_bind[name] @ to_gltf @ bone.bone.matrix_local)
    for bone in armature.pose.bones:
        options = ({"parent_matrix": posed[bone.parent.name],
                    "parent_matrix_local": bone.parent.bone.matrix_local} if bone.parent else {})
        bone.matrix_basis = bone.bone.convert_local_to_pose(
            posed[bone.name], bone.bone.matrix_local, invert=True, **options)
    for key, value in zip(keys, standing["influences"]):
        key.value = value
    bpy.context.view_layer.update()


def load_source(base, edited, destination):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if edited:
        bpy.ops.wm.open_mainfile(filepath=str(edited))
        surface = bpy.data.objects["Luna_Surface"]
        return surface, [surface.data.shape_keys.key_blocks[name] for name in NAMES]

    bpy.ops.import_scene.gltf(filepath=str(base), merge_vertices=False, import_pack_images=True)
    surface = bpy.data.objects["Luna_Surface"]
    keys = sculpt(surface)
    for action in bpy.data.actions:
        action.use_fake_user = True
    for obj in bpy.context.scene.objects:
        if obj.animation_data:
            obj.animation_data.action = None
            for track in obj.animation_data.nla_tracks:
                track.mute = True
    set_preview_pose(base, surface, keys)
    for area in bpy.context.screen.areas:
        if area.type == "VIEW_3D":
            view = area.spaces.active
            view.region_3d.view_perspective = "ORTHO"
            view.region_3d.view_rotation = Vector((-.18, 1, -.10)).to_track_quat("-Z", "Y")
            view.region_3d.view_distance = 1.5
            view.region_3d.view_location = (0, 0, .52)
            view.overlay.show_overlays = False
            view.shading.type = "MATERIAL"
    bpy.context.view_layer.objects.active = surface
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(destination), compress=True)
    return surface, keys


def pack(base, output, surface, keys):
    doc, base_buffer = glb_parts(base)
    primitive = doc["meshes"][0]["primitives"][0]
    if "targets" in primitive:
        raise ValueError("Use the base GLB from before the arm correctives as --base.")
    binary = bytearray(base_buffer)
    views, accessors = doc["bufferViews"], doc["accessors"]
    positions = accessors[primitive["attributes"]["POSITION"]]
    position_offset = views[positions["bufferView"]].get("byteOffset", 0) + positions.get("byteOffset", 0)
    basis = surface.data.shape_keys.reference_key.data
    if positions["count"] != len(basis) or len(basis) > 65535:
        raise ValueError("The Blender vertices must match the source GLB topology.")
    for i, vertex in enumerate(basis):
        x, y, z = struct.unpack_from("<3f", binary, position_offset + 12 * i)
        if (vertex.co - Vector((x, -z, y))).length > 1e-5:
            raise ValueError(f"Blender vertex {i} no longer matches the GLB position.")

    def append_view(data):
        binary.extend(bytes(-len(binary) % 4))
        offset = len(binary)
        binary.extend(data)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data)})
        return len(views) - 1

    primitive["targets"] = []
    for key in keys:
        indexes, changes = array("H"), array("f")
        for i, vertex in enumerate(key.data):
            delta = vertex.co - basis[i].co
            if delta.length > .00022:
                indexes.append(i)
                changes.extend((delta.x, delta.z, -delta.y))
        if sys.byteorder != "little":
            indexes.byteswap()
            changes.byteswap()
        primitive["targets"].append({"POSITION": len(accessors)})
        accessors.append({
            "componentType": 5126, "count": len(basis), "type": "VEC3",
            "min": [min(0, min(changes[i::3])) for i in range(3)],
            "max": [max(0, max(changes[i::3])) for i in range(3)],
            "sparse": {"count": len(indexes),
                       "indices": {"bufferView": append_view(indexes.tobytes()), "componentType": 5123},
                       "values": {"bufferView": append_view(changes.tobytes())}},
        })
        print(key.name, len(indexes), "vertices")
    mesh = doc["meshes"][0]
    mesh.setdefault("extras", {})["targetNames"] = list(NAMES)
    mesh["weights"] = [0.0, 0.0]
    binary.extend(bytes(-len(binary) % 4))
    doc["buffers"][0]["byteLength"] = len(binary)
    new_json = json.dumps(doc, separators=(",", ":")).encode()
    new_json += b" " * (-len(new_json) % 4)
    output.write_bytes(struct.pack("<4sII", b"glTF", 2, 28 + len(new_json) + len(binary))
                       + struct.pack("<I4s", len(new_json), b"JSON") + new_json
                       + struct.pack("<I4s", len(binary), b"BIN\x00") + binary)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--base", required=True, type=Path)
parser.add_argument("--output", type=Path, default=MODEL)
parser.add_argument("--blend", type=Path, default=SOURCE)
parser.add_argument("--from-blend", type=Path)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
model, shapes = load_source(args.base.resolve(), args.from_blend, args.blend.resolve())
pack(args.base, args.output, model, shapes)
