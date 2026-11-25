"""Fit the room performances to the delivered Luna ribbon-jacket glTF bind skeleton."""
import argparse
import copy
import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image

SCALE = 1.43
TYPES = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


class Glb:
    def __init__(self, path):
        raw = path.read_bytes()
        size = struct.unpack_from('<I', raw, 12)[0]
        self.doc = json.loads(raw[20:20 + size])
        self.binary = raw[28 + size:]
        self.accessors = {}

    def array(self, index):
        a = self.doc['accessors'][index]
        view = self.doc['bufferViews'][a['bufferView']]
        dtype = np.dtype(TYPES[a['componentType']])
        width = WIDTH[a['type']]
        return np.ndarray((a['count'], width), dtype, self.binary,
                          view.get('byteOffset', 0) + a.get('byteOffset', 0),
                          (view.get('byteStride', width * dtype.itemsize), dtype.itemsize))

    def view(self, data):
        self.binary.extend(bytes(-len(self.binary) % 4))
        views = self.doc['bufferViews']
        views.append({'buffer': 0, 'byteOffset': len(self.binary), 'byteLength': len(data)})
        self.binary.extend(data)
        return len(views) - 1

    def add(self, values):
        data = np.ascontiguousarray(values, dtype='<f4')
        key = (data.shape[1], data.tobytes())
        if key in self.accessors:
            return self.accessors[key]
        index = len(self.doc['accessors'])
        self.doc['accessors'].append({'bufferView': self.view(key[1]), 'componentType': 5126,
            'count': len(data), 'type': {1: 'SCALAR', 3: 'VEC3', 4: 'VEC4'}[key[0]],
            'min': data.min(axis=0).tolist(), 'max': data.max(axis=0).tolist()})
        self.accessors[key] = index
        return index

    def save(self, path):
        self.binary.extend(bytes(-len(self.binary) % 4))
        self.doc['buffers'] = [{'byteLength': len(self.binary)}]
        header = json.dumps(self.doc, separators=(',', ':')).encode()
        header += b' ' * (-len(header) % 4)
        path.write_bytes(struct.pack('<4sIIII', b'glTF', 2, 28 + len(header) + len(self.binary),
                                     len(header), 0x4e4f534a) + header
                         + struct.pack('<II', len(self.binary), 0x004e4942) + self.binary)


def resample(times, values, at):
    return np.column_stack([np.interp(at, times, axis) for axis in values.T])


def rotation(q):
    x, y, z, w = (q / np.linalg.norm(q, axis=-1, keepdims=True)).T
    return np.stack([1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w),
                     2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w),
                     2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)], axis=-1).reshape(-1, 3, 3)


class Fitting:
    def __init__(self, body, daily):
        self.body = body
        nodes = body.doc['nodes']
        self.joints = body.doc['skins'][0]['joints']
        self.names = [nodes[i]['name'] for i in self.joints]
        self.parents = {child: i for i, node in enumerate(nodes) for child in node.get('children', [])}
        self.inverse = body.array(body.doc['skins'][0]['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).copy()
        self.lookup = {name.replace(':', ''): i for i, name in zip(self.joints, self.names)}
        old = {n['name']: n for n in daily.doc['nodes']}
        self.offset = {i: np.array(nodes[i]['translation']) - old[nodes[i]['name']]['translation'] for i in self.joints}
        primitive = body.doc['meshes'][0]['primitives'][0]
        attrs = primitive['attributes']
        self.points = body.array(attrs['POSITION']).copy()
        self.weights = body.array(attrs['WEIGHTS_0']).copy()
        self.indices = body.array(attrs['JOINTS_0']).copy()
        self.soles = np.flatnonzero(self.points[:, 1] < .042)
        # A small distributed support polygon keeps the blend-time IK inexpensive.
        support = {}
        for side, sign in [('Left', 1), ('Right', -1)]:
            candidates = self.soles[self.points[self.soles, 0] * sign > 0]
            pts = self.points[candidates]
            cells = np.floor(pts[:, [0, 2]] / .012).astype(int)
            support[side] = [int(candidates[idx[np.argmin(pts[idx, 1])]])
                             for cell in np.unique(cells, axis=0)
                             for idx in [np.flatnonzero((cells == cell).all(axis=1))]]
        primitive['extras'] = {'soleContacts': support}

    def matrices(self, curves, times):
        nodes = self.body.doc['nodes']
        world = {}
        def visit(i):
            if i in world:
                return world[i]
            node = nodes[i]
            def sample(path, default):
                curve = curves.get((i, path))
                return resample(*curve, times) if curve else np.tile(node.get(path, default), (len(times), 1))
            local = np.tile(np.eye(4), (len(times), 1, 1))
            local[:, :3, :3] = rotation(sample('rotation', [0, 0, 0, 1])) * sample('scale', [1, 1, 1])[:, None, :]
            local[:, :3, 3] = sample('translation', [0, 0, 0])
            parent = self.parents.get(i)
            world[i] = visit(parent) @ local if parent in self.joints else local
            return world[i]
        return np.stack([visit(i) for i in self.joints], axis=1) @ self.inverse

    def deformed(self, frame, vertices):
        skin = np.einsum('vk,vkij->vij', self.weights[vertices], frame[self.indices[vertices]])
        point = np.einsum('vij,vj->vi', skin[:, :3, :3], self.points[vertices]) + skin[:, :3, 3]
        return point, skin[:, :3, :3]

    def ground(self, curves, name):
        hip = (self.lookup['mixamorigHips'], 'translation')
        if hip not in curves:
            return
        times, positions = curves[hip]
        # The walk includes both planted and swinging feet. Floor holds may also rest on the shorts.
        is_floor = name in ('floorSit', 'floorStand')
        vertices = np.flatnonzero(self.points[:, 1] < .54) if is_floor else self.soles
        matrices = self.matrices(curves, times)
        for i, frame in enumerate(matrices):
            points, _ = self.deformed(frame, vertices)
            positions[i, 1] += .0008 - points[:, 1].min()

    def chair(self, curves, output):
        hip = (self.lookup['mixamorigHips'], 'translation')
        times, positions = curves[hip]
        frames = self.matrices(curves, times)
        # Use the same room coordinates as build-fixed-desk-chair.py (gltf Y up, +Z forward).
        vertices = np.flatnonzero((self.points[:, 1] > .22) & (self.points[:, 1] < .72))
        deltas = np.zeros((len(times), len(vertices), 3), dtype=np.float32)
        for i, frame in enumerate(frames):
            pts, linear = self.deformed(frame, vertices)
            x, y, z = (pts * SCALE).T
            crown = .531 - .16 * (.12-z)**2 - .029 * np.maximum(0, (z-.305)/.063)**1.35
            crown -= .028 * np.maximum(0, (np.abs(x)-.255)/.071)**1.4
            ellipse = (np.abs(x)/.326)**3.22 + (np.abs(z-.061)/.307)**3.22
            # Fade the correction around the rounded cushion lip and below the seat pan.
            fade = np.clip((1-ellipse)/.22, 0, 1) * np.clip((y-.417)/.041, 0, 1)
            lift = np.maximum(0, crown+.001-y) * fade / SCALE
            correction = np.zeros_like(pts)
            correction[:, 1] = lift
            deltas[i] = np.linalg.solve(linear, correction[..., None])[..., 0]
        used = np.flatnonzero(np.max(abs(deltas), axis=(0, 2)) > .00001)
        if not len(used):
            raise ValueError('No seated cloth touched the cushion')
        packed = deltas[:, used, :]
        quantum = float(np.max(np.abs(packed)) / 32760)
        output.write_bytes(struct.pack('<4sIIIf', b'PWSC', 1, len(times), len(used), quantum)
                           + np.rint(packed/quantum).astype('<i2').tobytes())
        for primitive in self.body.doc['meshes'][0]['primitives']:
            attrs = primitive['attributes']
            count = self.body.doc['accessors'][attrs['POSITION']]['count']
            ids = np.full((count, 1), -1, dtype=np.float32)
            if primitive is self.body.doc['meshes'][0]['primitives'][0]:
                ids[vertices[used], 0] = np.arange(len(used))
            attrs['_CONTACT_ID'] = self.body.add(ids)

    def clips(self, src, dest, output):
        names = {n['name'].replace(':', ''): i for i, n in enumerate(dest.doc['nodes'])}
        for anim in src.doc['animations']:
            curves = {}
            interpolation = {}
            for ch in anim['channels']:
                target = ch['target']
                name = src.doc['nodes'][target['node']]['name'].replace(':', '')
                if name.startswith('Dress_'):
                    continue
                node, path = names[name], target['path']
                sampler = anim['samplers'][ch['sampler']]
                interpolation[(node, path)] = sampler.get('interpolation', 'LINEAR')
                times = src.array(sampler['input'])[:, 0]
                values = src.array(sampler['output']).copy()
                if path == 'translation' and node in self.offset:
                    values += self.offset[node]
                curves[(node, path)] = (times, values)
            title = anim['name']
            if title in ('Walk_Grounded_Loop', 'floorSit', 'floorStand', 'pickUp'):
                self.ground(curves, title)
            if title == 'ChairSit_Contact':
                self.chair(curves, output/'luna-ribbon-seat.bin')
            result = {'name': title, 'samplers': [], 'channels': []}
            for (node, path), (times, values) in curves.items():
                if len(times) > 2 and np.max(np.abs(values - values[:1])) < 1e-6:
                    times, values = times[[0, -1]], values[[0, -1]]
                si = len(result['samplers'])
                result['samplers'].append({'input': dest.add(times[:, None]), 'output': dest.add(values), 'interpolation': interpolation[(node, path)]})
                result['channels'].append({'sampler': si, 'target': {'node': node, 'path': path}})
            dest.doc.setdefault('animations', []).append(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('model', type=Path)
    parser.add_argument('--motions', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    body = Glb(args.model)
    # Repack the original data once, keeping all existing view indices stable.
    views = body.doc['bufferViews']
    original = body.binary
    body.binary = bytearray()
    body.doc['bufferViews'] = []
    albedo = body.doc['images'][0]['bufferView']
    for i, view in enumerate(views):
        start = view.get('byteOffset', 0)
        data = original[start:start+view['byteLength']]
        if i == albedo:
            image = Image.open(io.BytesIO(data))
            image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
            result = io.BytesIO()
            image.save(result, 'JPEG', quality=96, subsampling=0, optimize=True)
            data = result.getvalue()
        body.view(data)
    daily = Glb(args.motions/'luna-walk-room.glb')
    fit = Fitting(body, daily)
    book = {'name': 'LibraryBook'}
    body.doc['scenes'][0]['nodes'].append(len(body.doc['nodes']))
    body.doc['nodes'].append(book)
    for clip in [daily, Glb(args.motions/'luna-library.glb'), Glb(args.motions/'luna-sofa-low-sit.glb')]:
        fit.clips(clip, body, args.output)
    body.save(args.output/'luna-ribbon.glb')
    motion = copy.copy(body)
    motion.doc = {k: copy.deepcopy(body.doc[k]) for k in ('asset','scene','scenes','nodes')}
    motion.doc['nodes'] = [{k:v for k,v in node.items() if k not in ('mesh','skin')} for node in motion.doc['nodes']]
    motion.doc.update(accessors=[], bufferViews=[])
    motion.binary = bytearray()
    motion.accessors = {}
    fit.clips(Glb(args.motions/'luna-cabin-actions-everyday.glb'), motion, args.output)
    motion.save(args.output/'luna-cabin-actions-ribbon.glb')


if __name__ == '__main__':
    main()
