import argparse
import copy
import json
import struct
import sys
import tempfile
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
ASSETS = (
    ("luna-walk-room.glb", "Luna-ArmContact.blend"),
    ("luna-ribbon.glb", "Luna-Ribbon.blend"),
    ("luna-cardigan.glb", "Luna-Cardigan.blend"),
)
LIMIT = 2048


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


def resize_runtime(path, scratch):
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
        if shrink(texture):
            texture.filepath_raw = str(extracted)
            texture.file_format = "JPEG" if suffix == ".jpg" else "PNG"
            texture.save(quality=95)
            replacements[image["bufferView"]] = extracted.read_bytes()
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


def resize_source(path):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    changed = []
    for image in bpy.data.images:
        if image.type == "IMAGE" and shrink(image):
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
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    reports = []
    with tempfile.TemporaryDirectory(prefix="luna-2k-", dir=args.report.parent if args.report else None) as temporary:
        for runtime, source in ASSETS:
            report = resize_runtime(args.root / "assets/public/models/resident" / runtime, Path(temporary))
            report["source_images"] = resize_source(args.root / "assets/models/resident" / source)
            reports.append(report)
    if args.report:
        args.report.write_text(json.dumps(reports, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(reports, ensure_ascii=False))
    return reports


if __name__ == "__main__":
    main()
