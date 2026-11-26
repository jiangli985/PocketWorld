import argparse
import copy
import json
import struct
import sys
import tempfile
import zlib
from pathlib import Path

import bpy
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
ASSETS = (
    ("luna-walk-room.glb", "Luna-ArmContact.blend"),
    ("luna-ribbon.glb", "Luna-Ribbon.blend"),
    ("luna-cardigan.glb", "Luna-Cardigan.blend"),
)
LIMIT = 2048
ROUGHNESS_IMAGES = {"walk_rm", "Luna | Cloth roughness and metal"}


def read_glb(path):
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", raw)
    assert (magic, version, length) == (0x46546C67, 2, len(raw))
    size, kind = struct.unpack_from("<II", raw, 12)
    assert kind == 0x4E4F534A
    doc = json.loads(raw[20:20 + size])
    binary_size, kind = struct.unpack_from("<II", raw, 20 + size)
    assert kind == 0x004E4942
    binary = raw[28 + size:28 + size + binary_size]
    assert len(binary) == binary_size
    return doc, binary


def view_bytes(doc, binary, index):
    view = doc["bufferViews"][index]
    start = view.get("byteOffset", 0)
    return binary[start:start + view["byteLength"]]


def shrink(image):
    width, height = image.size
    if max(width, height) <= LIMIT:
        return False
    factor = LIMIT / max(width, height)
    image.scale(round(width * factor), round(height * factor))
    return True


def optimize_roughness(image):
    image.colorspace_settings.name = "Non-Color"
    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    rgba = pixels.reshape(-1, 4)
    if np.array_equal(rgba[:, 0], rgba[:, 1]) and np.array_equal(rgba[:, 2], rgba[:, 1]):
        return False
    rgba[:, 0] = rgba[:, 1]
    rgba[:, 2] = rgba[:, 1]
    image.pixels.foreach_set(pixels)
    image.update()
    return True


def encode_roughness(image):
    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    width, height = image.size
    # Blender pixels start at the bottom; PNG scanlines start at the top.
    values = np.rint(pixels.reshape(height, width, 4)[::-1, :, 1] * 255).astype(np.uint8)
    previous = np.vstack((np.zeros((1, width), dtype=np.uint8), values[:-1]))
    rows = np.concatenate((np.full((height, 1), 2, dtype=np.uint8), values - previous), axis=1)
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(rows.tobytes(), 9)) + chunk(b"IEND", b""))


def validate_roughness(doc, index):
    users = []
    def check(value, path=()):
        if isinstance(value, dict):
            if "index" in value and path and path[-1].endswith("Texture"):
                if doc["textures"][value["index"]].get("source") == index:
                    users.append(path)
            for key, child in value.items():
                check(child, (*path, key))
        elif isinstance(value, list):
            for child in value:
                check(child, path)
    for material in doc["materials"]:
        check(material)
        pbr = material.get("pbrMetallicRoughness", {})
        texture = pbr.get("metallicRoughnessTexture")
        if texture and doc["textures"][texture["index"]].get("source") == index:
            assert pbr.get("metallicFactor", 1) == 0, "Metallic channel is in use"
    assert users and all(path[-1] == "metallicRoughnessTexture" for path in users), users


def resize_runtime(path, scratch, optimize=False):
    original = path.read_bytes()
    doc, binary = read_glb(path)
    updated = copy.deepcopy(doc)
    replacements = {}
    changes = []
    for index, image in enumerate(doc.get("images", [])):
        suffix = {"image/jpeg": ".jpg", "image/png": ".png"}[image["mimeType"]]
        extracted = scratch / f"{index}{suffix}"
        extracted.write_bytes(view_bytes(doc, binary, image["bufferView"]))
        texture = bpy.data.images.load(str(extracted), check_existing=False)
        before = list(texture.size)
        changed = shrink(texture)
        if optimize and image.get("name") in ROUGHNESS_IMAGES:
            validate_roughness(doc, index)
            assert suffix == ".png", "Data texture must remain lossless"
            optimize_roughness(texture)
            candidate = encode_roughness(texture)
            if len(candidate) < extracted.stat().st_size:
                replacements[image["bufferView"]] = candidate
        elif changed:
            texture.filepath_raw = str(extracted)
            texture.file_format = "JPEG" if suffix == ".jpg" else "PNG"
            texture.save(quality=95)
            replacements[image["bufferView"]] = extracted.read_bytes()
        if image["bufferView"] in replacements:
            changes.append({"name": image.get("name", str(index)), "before": before, "after": list(texture.size)})
        bpy.data.images.remove(texture)
    if not replacements:
        return {"file": path.name, "bytes_before": path.stat().st_size, "bytes_after": path.stat().st_size, "images": []}

    packed = bytearray()
    for index, view in enumerate(updated["bufferViews"]):
        packed.extend(b"\0" * (-len(packed) % 4))
        data = replacements.get(index, view_bytes(doc, binary, index))
        view["byteOffset"], view["byteLength"] = len(packed), len(data)
        packed.extend(data)
    updated["buffers"][0]["byteLength"] = len(packed)
    encoded = json.dumps(updated, ensure_ascii=False, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    packed.extend(b"\0" * (-len(packed) % 4))
    raw = (struct.pack("<III", 0x46546C67, 2, 28 + len(encoded) + len(packed))
           + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
           + struct.pack("<II", len(packed), 0x004E4942) + packed)

    for key in doc.keys() - {"buffers", "bufferViews"}:
        assert updated[key] == doc[key], key
    for index, view in enumerate(doc["bufferViews"]):
        assert {k: v for k, v in view.items() if k not in ("byteOffset", "byteLength")} == {
            k: v for k, v in updated["bufferViews"][index].items() if k not in ("byteOffset", "byteLength")}
        if index not in replacements:
            assert view_bytes(doc, binary, index) == view_bytes(updated, packed, index), index
    before_size = path.stat().st_size
    assert path.read_bytes() == original, "GLB changed during resize"
    path.write_bytes(raw)
    return {"file": path.name, "bytes_before": before_size, "bytes_after": len(raw), "images": changes}


def resize_source(path, optimize=False):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    changed = []
    for image in bpy.data.images:
        if image.type != "IMAGE":
            continue
        resized = shrink(image)
        optimized = optimize and image.name in ROUGHNESS_IMAGES and optimize_roughness(image)
        if resized or optimized:
            image.pack()
            changed.append(image.name)
    if changed:
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(path))
    return changed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--optimize-roughness", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    reports = []
    with tempfile.TemporaryDirectory(prefix="luna-2k-", dir=args.report.parent if args.report else None) as temporary:
        for runtime, source in ASSETS:
            report = resize_runtime(args.root / "assets/public/models/resident" / runtime, Path(temporary), args.optimize_roughness)
            report["source_images"] = resize_source(args.root / "assets/models/resident" / source, args.optimize_roughness)
            reports.append(report)
    if args.report:
        args.report.write_text(json.dumps(reports, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(reports, ensure_ascii=False))
    return reports


if __name__ == "__main__":
    main()
