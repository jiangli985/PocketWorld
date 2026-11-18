"""Build editable Luna book-pickup actions in Blender, then export the active armature
and the closed-book animation in the runtime rig's original glTF axes."""

import argparse
import json
from math import acos, atan2, pi, sin, sqrt
from pathlib import Path
import struct
import subprocess
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets/public/models/resident"
SOURCE = ASSETS / "luna-walk-room.glb"
SCALE = 1.43
STAND = 0.58
FPS = 30
LAST = 144
GRAB = 36
CLEAR = 72
# Author frames 0..36 map to export 0..72; later export = author + 36.
# Reach 0..72, extraction 72..108, carry 108..180 at 30 fps.
REACH_SCALE = 2
EXPORT_LAST = LAST + 36
# Keep the existing timing, adding subframes only to the rotating support transfer.
EXPORT_FRAMES = tuple(range(132)) + tuple(i/4 for i in range(132*4, EXPORT_LAST*4+1))
ROWS = (0.7775, 1.0675, 1.3575)
CONVERSION = Matrix.Rotation(pi / 2, 4, "X")
ACTOR = Matrix.Translation((0, -STAND, 0)) @ Matrix.Rotation(pi, 4, "Z") @ Matrix.Scale(SCALE, 4)
TO_RIG = ACTOR.inverted()
SHELF_ROT = Matrix(((0, -1, 0), (0, 0, 1), (-1, 0, 0))).to_quaternion()
READ_ROT = (Matrix.Rotation(.08, 3, "X") @ Matrix.Rotation(pi, 3, "Y")).to_quaternion()
V = Vector
Q = Quaternion


def transform(position, rotation):
    return Matrix.LocRotScale(position, rotation, None)


def world_point(x, y, z):
    return CONVERSION @ V((x, y, z))


def smooth(x):
    x = min(1, max(0, x))
    return x * x * (3 - 2 * x)


def fade(frame, start, end):
    return smooth((frame - start) / (end - start))


def timeline(frame):
    return frame * REACH_SCALE if frame <= GRAB else frame + 36


def authored_frame(frame):
    return frame / REACH_SCALE if frame <= timeline(GRAB) else frame - 36


def axis_angle(axis, angle):
    return Q(V(axis), angle)


def joint(name):
    return "mixamorig" + name


def matrix_from_array(values):
    return Matrix([values[i:i+4] for i in range(0, 16, 4)]).transposed()


def read_binding():
    raw = SOURCE.read_bytes()
    size = struct.unpack_from("<I", raw, 12)[0]
    document = json.loads(raw[20:20+size])
    nodes = document["nodes"]
    parents = {child: i for i, node in enumerate(nodes) for child in node.get("children", [])}
    world = {}

    def bind(i):
        if i not in world:
            node = nodes[i]
            x, y, z, w = node.get("rotation", (0, 0, 0, 1))
            local = Matrix.LocRotScale(
                V(node.get("translation", (0, 0, 0))), Q((w, x, y, z)),
                V(node.get("scale", (1, 1, 1))),
            )
            world[i] = bind(parents[i]) @ local if i in parents else local
        return world[i]

    return {node["name"].replace(":", ""): bind(i) for i, node in enumerate(nodes)}


class Pose:
    def __init__(self, bones, neutral):
        self.bones = bones
        self.neutral = neutral
        self.parents = {name: bone.parent.name.replace(":", "") if bone.parent else None
                        for name, bone in bones.items()}
        self.locations = {}
        self.rotations = {}
        for name, matrix in neutral.items():
            parent = self.parents[name]
            local = neutral[parent].inverted() @ matrix if parent else matrix
            self.locations[name] = local.translation
            self.rotations[name] = local.to_quaternion()
        self.reset()

    def reset(self):
        self.positions = {name: v.copy() for name, v in self.locations.items()}
        self.orientations = {name: q.copy() for name, q in self.rotations.items()}
        self.world = {}

    def matrix(self, name):
        if name not in self.world:
            local = transform(self.positions[name], self.orientations[name])
            parent = self.parents[name]
            self.world[name] = self.matrix(parent) @ local if parent else local
        return self.world[name]

    def point(self, name):
        return self.matrix(name).translation

    def rotation(self, name):
        return self.matrix(name).to_quaternion()

    def set_rotation(self, name, rotation):
        parent = self.parents[name]
        self.orientations[name] = self.rotation(parent).inverted() @ rotation if parent else rotation
        self.world.clear()

    def turn(self, name, axis, angle):
        self.set_rotation(name, axis_angle(axis, angle) @ self.rotation(name))

    def place_hip(self, delta):
        self.positions[joint("Hips")] += V(delta) / SCALE
        self.world.clear()

    def aim(self, name, child, target):
        origin = self.point(name)
        direction = self.point(child) - origin
        delta = direction.rotation_difference(target - origin)
        self.set_rotation(name, delta @ self.rotation(name))

    def limb(self, upper, lower, end, goal, pole, keep_bend_plane=False, neutral_frame=False):
        start, mid, tip = self.point(upper), self.point(lower), self.point(end)
        a, b = (mid-start).length, (tip-mid).length
        ray = goal - start
        distance = min(a+b-.0002, max(abs(a-b)+.0002, ray.length))
        ray.normalize()
        pole = (pole - ray * ray.dot(pole)).normalized()
        along = (a*a - b*b + distance*distance) / (2*distance)
        bend = sqrt(max(0, a*a-along*along))
        knee = start + ray*along + pole*bend
        ankle = start + ray*distance
        if keep_bend_plane:
            ref_start, ref_mid, ref_tip = (self.neutral[name].translation for name in (upper, lower, end)) if neutral_frame else (start, mid, tip)
            original_normal = (ref_mid-ref_start).cross(ref_tip-ref_mid)
            normal = pole.cross(ray)
            upper_rotation = basis(knee-start, normal) @ basis(ref_mid-ref_start, original_normal).inverted()
            lower_rotation = basis(ankle-knee, normal) @ basis(ref_tip-ref_mid, original_normal).inverted()
            upper_rotation @= self.neutral[upper].to_quaternion() if neutral_frame else self.rotation(upper)
            lower_rotation @= self.neutral[lower].to_quaternion() if neutral_frame else self.rotation(lower)
            self.set_rotation(upper, upper_rotation)
            self.set_rotation(lower, lower_rotation)
        else:
            self.aim(upper, lower, knee)
            self.aim(lower, end, ankle)

    def plant(self, side, step, lift):
        thigh, shin, foot = (joint(side+s) for s in ("UpLeg", "Leg", "Foot"))
        upper, mid, ankle = [self.neutral[name].translation for name in (thigh, shin, foot)]
        ray = (ankle-upper).normalized()
        bend = mid-upper-ray*ray.dot(mid-upper)
        pole = bend.normalized().lerp(V((.16 if side == "Left" else -.16, -1, 0)), step*.35)
        point = ankle + V((0, .30*step, lift)) / SCALE
        self.limb(thigh, shin, foot, point, pole)
        self.set_rotation(foot, axis_angle((1, 0, 0), -lift*1.4) @ self.neutral[foot].to_quaternion())

    def fit_hip_to_feet(self, feet):
        excess = 0
        for side, step, lift in feet:
            thigh, shin, foot = (joint(side+s) for s in ("UpLeg", "Leg", "Foot"))
            hip, knee, ankle = [self.point(name) for name in (thigh, shin, foot)]
            reach = (knee-hip).length + (ankle-knee).length - .0003
            target = self.neutral[foot].translation + V((0, .30*step, lift))/SCALE
            direction = hip-target
            vertical = sqrt(max(0, reach*reach-direction.x**2-direction.y**2))
            excess = max(excess, direction.z-vertical)
        if excess:
            self.place_hip((0, 0, -excess*SCALE))

    def key(self, frame):
        for name, bone in self.bones.items():
            goal = self.matrix(name)
            parent = self.parents[name]
            if parent:
                bone.matrix_basis = bone.bone.convert_local_to_pose(
                    goal, bone.bone.matrix_local,
                    parent_matrix=self.matrix(parent), parent_matrix_local=bone.parent.bone.matrix_local,
                    invert=True,
                )
            else:
                bone.matrix_basis = bone.bone.convert_local_to_pose(goal, bone.bone.matrix_local, invert=True)
            previous = self.key_quaternions.get(name)
            if previous is not None and bone.rotation_quaternion.dot(previous) < 0:
                bone.rotation_quaternion.negate()
            self.key_quaternions[name] = bone.rotation_quaternion.copy()
            bone.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=bone.name)
            if parent is None or frame == 0:
                bone.keyframe_insert(data_path="location", frame=frame, group=bone.name)


def basis(fingers, index):
    fingers = fingers.normalized()
    index = (index - fingers * fingers.dot(index)).normalized()
    normal = fingers.cross(index).normalized()
    return Matrix((fingers, index, normal)).transposed().to_quaternion()


class Hand:
    def __init__(self, pose, side):
        self.pose, self.side = pose, side
        self.upper = joint(side+"Arm")
        self.lower = joint(side+"ForeArm")
        self.wrist = joint(side+"Hand")
        self.middle = joint(side+"HandMiddle1")
        self.tip = joint(side+"HandMiddle4")
        self.thumb = joint(side+"HandThumb4")
        self.sign = -1 if side == "Right" else 1
        hand = pose.neutral[self.wrist]
        self.neutral = hand.to_quaternion()
        to_hand = self.neutral.inverted()
        fingers = to_hand @ (pose.neutral[self.middle].translation-hand.translation)
        across = to_hand @ (pose.neutral[joint(side+"HandIndex1")].translation
                            - pose.neutral[joint(side+"HandPinky1")].translation)
        self.basis = basis(fingers, across)
        self.curl_axis = self.basis @ V((0, -self.sign, 0))
        # Same contact as residentRig.ts: base of the middle finger plus skin depth.
        self.palm_shape = fingers * .55 + (self.basis @ V((0, 0, self.sign))) * (.018 / SCALE)

    def reset(self):
        self.previous_target = None
        self.previous_turn = 0
        self.previous_request = 0
        self.previous_pole = None
        self.handoff_turns = {}
        self.approach_turns = {}

    def desired(self, fingers, index):
        return basis(TO_RIG.to_3x3() @ fingers, TO_RIG.to_3x3() @ index) @ self.basis.inverted()

    def curl(self, amount, thumb=None):
        for digit in ("Index", "Middle", "Ring", "Pinky"):
            for segment, factor in enumerate((.62, 1, .52), start=1):
                name = joint(f"{self.side}Hand{digit}{segment}")
                axis = self.pose.rotation(self.wrist) @ self.curl_axis
                self.pose.turn(name, axis, amount * factor)
        for segment, factor in enumerate((.65, .9), start=1):
            name = joint(f"{self.side}HandThumb{segment}")
            axis = self.pose.rotation(self.wrist) @ (self.basis @ V((.85*self.sign, -.5*self.sign, 0))).normalized()
            self.pose.turn(name, axis, (amount*.6 if thumb is None else thumb) * factor)

    def reach(self, point, target, weight, curl, pole, contact, align_fingers=0, thumb=None):
        if weight <= 0:
            return
        self.curl(curl, thumb)
        p = self.pose
        entry = {name: p.matrix(name).copy() for name in (self.upper, self.lower, self.wrist)}
        rest_position = p.point(self.wrist)
        rest_rotation = p.rotation(self.wrist)
        if self.previous_target is None:
            self.previous_target = rest_rotation
        # Limit the palm turn during a transfer before solving the wrist position.
        target = rest_rotation.slerp(target, weight)
        shape = rest_rotation.inverted() @ (p.point(self.middle) - rest_position)
        if contact == "tip":
            shape = rest_rotation.inverted() @ (p.point(self.tip) - rest_position)
        elif contact == "palm":
            shape = self.palm_shape.copy()
        elif isinstance(contact, float):
            tip = rest_rotation.inverted() @ (p.point(self.tip) - rest_position)
            shape = tip.lerp(self.palm_shape, contact)
        if align_fingers > 0 and weight >= 1:
            # Keep the palm on the contact plane while its fingers follow the
            # forearm. A fixed shelf frame folded the wrist back during lowering.
            normal = target @ (self.basis @ V((0, 0, self.sign)))
            for _ in range(3):
                trial = TO_RIG @ point - target @ shape
                p.limb(self.upper, self.lower, self.wrist, trial, pole, keep_bend_plane=True, neutral_frame=True)
                forward = p.point(self.wrist)-p.point(self.lower)
                forward -= normal * forward.dot(normal)
                if forward.length > .001:
                    aligned = basis(forward, normal.cross(forward)*self.sign) @ self.basis.inverted()
                    target = target.slerp(aligned, align_fingers)
        angle = 2*acos(min(1, abs(self.previous_target.dot(target))))
        if angle > .18:
            target = self.previous_target.slerp(target, .18/angle)
        self.previous_target = target.copy()
        wrist = rest_position.lerp(TO_RIG @ point - target @ shape, weight)
        # Lead the wrist forward before lifting: a straight path passes too
        # close to the shoulder and reverses the elbow plane during the reach.
        wrist += V((0, -.12 / SCALE, 0)) * sin(pi*weight)
        ray = (wrist-p.point(self.upper)).normalized()
        preferred = pole.copy()
        preferred -= ray*ray.dot(preferred)
        if self.previous_pole is None and weight < 1:
            # Enter from the actual relaxed elbow plane, rather than snapping
            # straight to the preferred IK pole on the first nonzero sample.
            rest_bend = entry[self.lower].translation-entry[self.upper].translation
            self.previous_pole = (rest_bend-ray*ray.dot(rest_bend)).normalized()
        if self.previous_pole is not None:
            previous = (self.previous_pole-ray*ray.dot(self.previous_pole)).normalized()
            if preferred.length < .08:
                preferred = previous
            else:
                preferred.normalize()
                angle = atan2(ray.dot(previous.cross(preferred)), previous.dot(preferred))
                preferred = Q(ray, max(-.12, min(.12, angle))) @ previous
        preferred.normalize()
        p.limb(self.upper, self.lower, self.wrist, wrist, preferred, keep_bend_plane=True, neutral_frame=True)
        self.previous_pole = preferred.copy()
        forearm_axis = (p.point(self.wrist)-p.point(self.lower)).normalized()
        # Before touching the book, the wrist follows the actually solved arm.
        # Full-target alignment plus a second arm blend folded the hand back
        # during both reach and its reversed empty-hand withdrawal. The free
        # approach needs no contact-offset iteration (which can oscillate).
        if weight < 1:
            forward = target @ (self.basis @ V((1, 0, 0)))
            angle = forward.angle(forearm_axis)
            limit = .87
            if angle > limit:
                correction = forward.rotation_difference(forearm_axis)
                target = Q((1, 0, 0, 0)).slerp(correction, (angle-limit)/angle) @ target
        if weight < 1:
            # Blend axial roll only. Local arm-quaternion interpolation would
            # move the solved wrist again and invalidate the palm/forearm cone.
            goals = {}
            for name, child in ((self.upper, self.lower), (self.lower, self.wrist)):
                axis = (p.point(child)-p.point(name)).normalized()
                old_axis = entry[child].translation-entry[name].translation
                aligned = old_axis.rotation_difference(axis) @ entry[name].to_quaternion()
                delta = p.rotation(name) @ aligned.inverted()
                angle = 2*atan2(V((delta.x, delta.y, delta.z)).dot(axis), delta.w)
                previous = self.approach_turns.get(name, 0)
                while angle-previous > pi:
                    angle -= 2*pi
                while angle-previous < -pi:
                    angle += 2*pi
                self.approach_turns[name] = angle
                goals[name] = Q(axis, angle*weight) @ aligned
            for name, goal in goals.items():
                p.set_rotation(name, goal)
        # Decompose the requested rotation after approach roll is finalized.
        # The old bounded sine share tends back to zero near a half turn, leaving
        # almost the whole pronation in the wrist despite a forward finger axis.
        delta = target @ p.rotation(self.wrist).inverted()
        dot = V((delta.x, delta.y, delta.z)).dot(forearm_axis)
        request = 2*atan2(dot, delta.w)
        while request-self.previous_request > pi:
            request -= 2*pi
        while request-self.previous_request < -pi:
            request += 2*pi
        self.previous_request = request
        turn = max(-1.75, min(1.75, request))
        turn = max(self.previous_turn-.10, min(self.previous_turn+.10, turn))
        self.previous_turn = turn
        p.turn(self.lower, forearm_axis, turn)
        p.set_rotation(self.wrist, target)


def book_pose(row, frame):
    slot = V((.035, ROWS[row], .20))
    clear = slot + V((0, 0, .326))
    held = V((.11, .84, STAND+.30-.32))
    if frame <= CLEAR:
        return slot.lerp(clear, fade(frame, GRAB, CLEAR)), SHELF_ROT
    # Clear the entire shelf before any turn. Keep the book upright for the
    # second hand to catch the bottom, and lower high books before tipping them.
    upright = V((.065, 1.025, .65))
    turn_start = 96
    position = clear.lerp(upright, fade(frame, CLEAR, turn_start))
    position = position.lerp(held, fade(frame, turn_start, turn_start+32))
    position.z -= .02*sin(pi*fade(frame, turn_start, turn_start+40))
    position.y += .006*sin(pi*fade(frame, turn_start, turn_start+32))
    return position, SHELF_ROT.slerp(READ_ROT, fade(frame, turn_start, turn_start+32))


# Book-local skin contact correction while the leading hand changes grip.
# Four samples per authored frame 96..144 keep the support on the rounded cover
# through the turn, including between the original 30 Hz rotation keys.
SUPPORT_SKIN_OFFSETS = (
    (0.0000000, 0.0000000), (-0.0002864, 0.0012133), (-0.0002858, 0.0012108), (-0.0002814, 0.0011920),  # author 96
    (-0.0002731, 0.0011568), (-0.0002675, 0.0011329), (-0.0002579, 0.0010927), (-0.0002446, 0.0010361),  # author 97
    (-0.0002274, 0.0009631), (-0.0001221, 0.0008797), (0.0000000, 0.0008621), (-0.0000000, 0.0008277),  # author 98
    (-0.0001439, 0.0006096), (-0.0000870, 0.0003684), (0.0000000, 0.0000000), (0.0000000, 0.0000000),  # author 99
    (0.0000000, 0.0000000), (0.0000000, 0.0000000), (0.0000000, 0.0000000), (0.0005597, 0.0007765),  # author 100
    (0.0016990, 0.0012534), (0.0006303, 0.0026700), (0.0022981, 0.0031884), (0.0032163, 0.0044624),  # author 101
    (0.0000000, 0.0054761), (0.0000000, 0.0054851), (-0.0000000, 0.0054574), (-0.0000000, 0.0053939),  # author 102
    (-0.0000000, 0.0052949), (-0.0000000, 0.0052917), (0.0000000, 0.0052483), (0.0000000, 0.0051654),  # author 103
    (-0.0031511, 0.0018537), (-0.0004296, 0.0005960), (0.0000000, 0.0000000), (0.0000000, 0.0000000),  # author 104
    (0.0000000, 0.0000000), (0.0006357, 0.0026929), (0.0023640, 0.0032798), (0.0024919, 0.0050359),  # author 105
    (0.0048174, 0.0056717), (0.0067348, 0.0057402), (0.0084472, 0.0060884), (0.0100528, 0.0065600),  # author 106
    (0.0119649, 0.0065829), (0.0091695, 0.0102527), (0.0094574, 0.0097703), (0.0097164, 0.0093026),  # author 107
    (0.0099470, 0.0088500), (0.0100869, 0.0072702), (0.0099427, 0.0060593), (0.0101822, 0.0043039),  # author 108
    (0.0057421, 0.0079668), (0.0055591, 0.0058833), (0.0054331, 0.0039160), (0.0052881, 0.0019436),  # author 109
    (0.0051008, 0.0008760), (0.0025525, 0.0035414), (0.0014092, 0.0018975), (0.0008642, 0.0002844),  # author 110
    (0.0006739, -0.0000000), (0.0011925, 0.0000000), (0.0010970, 0.0007906), (0.0006886, 0.0004963),  # author 111
    (0.0000000, 0.0000000), (0.0008482, 0.0000000), (0.0013351, -0.0000000), (0.0017143, 0.0000000),  # author 112
    (0.0019948, 0.0000000), (0.0025816, 0.0000000), (0.0024795, 0.0005853), (0.0026883, 0.0005862),  # author 113
    (0.0031280, 0.0000000), (0.0037172, 0.0000000), (0.0043060, 0.0000000), (0.0048979, 0.0000000),  # author 114
    (0.0054963, 0.0000000), (0.0059834, 0.0000000), (0.0065546, 0.0000000), (0.0072117, -0.0000000),  # author 115
    (0.0079559, -0.0000000), (0.0085646, 0.0000000), (0.0091041, -0.0000000), (0.0096000, -0.0000000),  # author 116
    (0.0100541, 0.0000000), (0.0106991, 0.0000000), (0.0112358, 0.0000000), (0.0115884, -0.0000000),  # author 117
    (0.0118485, 0.0000000), (0.0123477, 0.0000000), (0.0127594, -0.0000000), (0.0130844, 0.0000000),  # author 118
    (0.0133239, 0.0000000), (0.0137543, 0.0000000), (0.0141156, -0.0000000), (0.0144092, 0.0000000),  # author 119
    (0.0146359, 0.0000000), (0.0149916, -0.0000000), (0.0152941, 0.0000000), (0.0155446, 0.0000000),  # author 120
    (0.0157446, 0.0000000), (0.0160299, 0.0000000), (0.0162702, 0.0000000), (0.0164667, 0.0000000),  # author 121
    (0.0166208, 0.0000000), (0.0168436, 0.0007691), (0.0170245, 0.0016389), (0.0171646, 0.0025198),  # author 122
    (0.0172651, 0.0034110), (0.0177224, -0.0000000), (0.0177022, -0.0000000), (0.0176322, 0.0000000),  # author 123
    (0.0175135, -0.0000000), (0.0175156, -0.0000000), (0.0174523, 0.0000000), (0.0173243, 0.0000000),  # author 124
    (0.0171324, 0.0000000), (0.0171258, 0.0000000), (0.0170307, 0.0000000), (0.0168476, 0.0000000),  # author 125
    (0.0165768, -0.0000000), (0.0165769, -0.0000000), (0.0164594, -0.0000000), (0.0162244, 0.0000000),  # author 126
    (0.0158717, 0.0000000), (0.0158863, 0.0000000), (0.0157529, 0.0000000), (0.0154710, 0.0000000),  # author 127
    (0.0150400, 0.0000000), (0.0150717, 0.0000000), (0.0149352, 0.0000000), (0.0146297, 0.0000000),  # author 128
    (0.0141541, 0.0000000), (0.0142157, 0.0000000), (0.0140929, 0.0000000), (0.0137844, 0.0000000),  # author 129
    (0.0132893, 0.0000000), (0.0133914, 0.0000000), (0.0132881, 0.0000000), (0.0129780, 0.0000000),  # author 130
    (0.0124597, 0.0000000), (0.0125532, 0.0000000), (0.0121018, 0.0000000), (0.0113820, 0.0000000),  # author 131
    (0.0103983, 0.0000000), (0.0102925, 0.0000000), (0.0099105, 0.0000000), (0.0092480, 0.0000000),  # author 132
    (0.0083010, 0.0000000), (0.0082765, 0.0000000), (0.0079687, 0.0000000), (0.0073717, 0.0000000),  # author 133
    (0.0064797, 0.0000000), (0.0065154, 0.0000000), (0.0062743, 0.0000000), (0.0057488, 0.0000000),  # author 134
    (0.0049317, 0.0000000), (0.0050035, 0.0000000), (0.0048182, 0.0000000), (0.0043674, 0.0000000),  # author 135
    (0.0036429, 0.0000000), (0.0037290, 0.0000000), (0.0035887, 0.0000000), (0.0032135, 0.0000000),  # author 136
    (0.0025947, 0.0000000), (0.0026778, 0.0000000), (0.0025722, 0.0000000), (0.0022697, 0.0000000),  # author 137
    (0.0017628, 0.0000000), (0.0018310, 0.0000000), (0.0017509, 0.0000000), (0.0015165, 0.0000000),  # author 138
    (0.0011214, 0.0000000), (0.0011677, 0.0000000), (0.0011065, 0.0000000), (0.0009333, 0.0000000),  # author 139
    (0.0006437, 0.0000000), (0.0006666, 0.0000000), (0.0006193, 0.0000000), (0.0004990, 0.0000000),  # author 140
    (0.0000000, 0.0000000), (0.0000000, 0.0000000), (0.0000000, 0.0000000), (0.0000000, 0.0000000),  # author 141
    (0.0000000, 0.0000000), (0.0000000, 0.0000000), (0.0000000, 0.0000000), (0.0000000, 0.0000000),  # author 142
    (0.0000000, 0.0000000), (0.0000000, 0.0000000), (0.0000000, 0.0000000), (0.0000000, 0.0000000),  # author 143
    (0.0000000, 0.0000000),  # author 144
)


def support_skin_offset(frame):
    t = min(192, max(0, (frame-96)*4))
    i = min(191, int(t))
    a, b = SUPPORT_SKIN_OFFSETS[i:i+2]
    return V((0, a[0]+(b[0]-a[0])*(t-i), a[1]+(b[1]-a[1])*(t-i)))


def correct_support_skin(scene, rig, marker, bones):
    # Snapshot first so inserted correction keys cannot change later baselines.
    baseline = []
    for quarter in range(132*4, EXPORT_LAST*4+1):
        frame = quarter/4
        scene.frame_set(int(frame), subframe=frame % 1)
        baseline.append((frame, {name: bone.matrix.copy() for name, bone in bones.items()},
                         marker.matrix_world.to_3x3().copy()))
    scene.frame_set(132)
    previous = {name: bone.rotation_quaternion.copy() for name, bone in bones.items()}
    for frame, matrices, book_rotation in baseline:
        pose = Pose(bones, matrices)
        pose.key_quaternions = previous
        upper, lower, wrist = (joint('Left'+part) for part in ('Arm', 'ForeArm', 'Hand'))
        start, mid, end = (pose.point(name) for name in (upper, lower, wrist))
        ray = (end-start).normalized()
        pole = (mid-start-ray*ray.dot(mid-start)).normalized()
        rotation = pose.rotation(wrist)
        delta = TO_RIG.to_3x3() @ book_rotation @ support_skin_offset(authored_frame(frame))
        # Preserve the existing elbow plane and all wrist/finger rotations. Only
        # the supporting wrist position and its two arm segments are re-solved.
        pose.limb(upper, lower, wrist, end+delta, pole, keep_bend_plane=True)
        pose.set_rotation(wrist, rotation)
        pose.key(frame)
    style_linear(rig)


def choreograph(pose, hands, row, frame):
    pose.reset()
    lean = fade(frame, 1, 30) * (1-fade(frame, 60, 112))
    # Retreat before the high book reaches the side hair, with the spine grip locked.
    right_step = fade(frame, 45, 66) if row == 2 else fade(frame, 45, 72)
    left_step = fade(frame, 79, 102)
    travel = .15*(right_step+left_step)
    load_left = fade(frame, 29, 41)*(1-fade(frame, 51, 61))
    load_right = fade(frame, 49, 63)*(1-fade(frame, 77, 89))
    clear_face = fade(frame, 39, 60)*(1-fade(frame, 87, 112))
    drop = (.284, .058, .008)[row]
    stepping = right_step-left_step
    extra_clearance = clear_face
    # Another 6 cm of top-row lateral yield clears palm/thumb skin from the hair.
    # Release this extra yield by authored frame 96 (export 132), before the
    # closed-pose handoff: a late release flips the upper-arm shortest-roll branch.
    pose.place_hip((-.018*lean+.041*load_left-.045*load_right+.12*extra_clearance
                    +(.06*fade(frame, 39, 60)*(1-fade(frame, 78, 96)) if row == 2 else 0),
                    travel-.012*lean+.065*clear_face, -drop*lean-.078*stepping))
    for name, share in (("Hips", .26), ("Spine", .34), ("Spine1", .26), ("Spine2", .14)):
        # Tilt from the pelvis, then distribute a small turn towards the leading hand.
        # Legs get replanted after the pelvis rotation so its tilt can't drag the soles.
        pose.turn(joint(name), (1, 0, 0), (.22, .15, .20)[row]*share*lean)
        pose.turn(joint(name), (0, 0, 1), -.13*share*lean)
        pose.turn(joint(name), (0, 1, 0), .18*share*extra_clearance)
    feet = (("Right", right_step, .048*sin(pi*right_step)), ("Left", left_step, .041*sin(pi*left_step)))
    pose.fit_hip_to_feet(feet)
    for step in feet:
        pose.plant(*step)
    pose.turn(joint("Neck"), (1, 0, 0),
              (.10, .035, -.13)[row]*lean+.11*fade(frame, 96, 132)-.08*clear_face)
    pose.turn(joint("Head"), (1, 0, 0), (.11, .02, -.10)[row]*lean+.16*fade(frame, 96, 132))
    pose.turn(joint("Head"), (0, 0, 1), .07*lean)
    pose.turn(joint("Neck"), (0, 1, 0), (.23, .11, .11)[row]*clear_face)
    pose.turn(joint("RightShoulder"), (0, 0, 1), .23*lean)

    pos, rot = book_pose(row, frame)
    book_blender = CONVERSION @ transform(pos, rot)
    fingers = book_blender.to_3x3() @ V((.40, .40, .82))
    across = book_blender.to_3x3() @ V((.92, -.20, -.40))
    right, left = hands
    grab = book_blender @ V((-.014, -.036, -.095+.115*fade(frame, 72, 96) if row == 2 else (.042, .020)[row]))
    approach = 1-fade(frame, 19, 30)
    grab += V((.014, -.085, -.014))*approach
    # The leading fingertips stay on the spine through extraction and the
    # upright catch. Only after the left palm carries the book do they move
    # around the free edge to the front cover, ready for the runtime open pose.
    shift = fade(frame, 96, 140)
    cover = book_blender @ V((.045, .0765, -.088))
    spine_out = book_blender @ V((-.08, -.036, .025))
    above_spine = book_blender @ V((-.08, .09, .09))
    if shift < .4:
        grab = grab.lerp(spine_out, smooth(shift/.4))
    elif shift < .7:
        grab = spine_out.lerp(above_spine, smooth((shift-.4)/.3))
    else:
        grab = above_spine.lerp(cover, smooth((shift-.7)/.3))
    flat = fade(frame, 96, 128)
    cover_fingers = book_blender.to_3x3() @ V((1, 0, 0)).lerp(V((.36, 0, .92)), flat)
    cover_normal = book_blender.to_3x3() @ V((0, -1, 0))
    cover_across = cover_fingers.cross(cover_normal)
    right_rotation = right.desired(fingers, across).slerp(right.desired(cover_fingers, cover_across), shift)
    right.reach(grab, right_rotation, fade(frame, 1, 30),
                .07+.35*fade(frame, 28, GRAB)-.42*shift,
                V((-.35, .35, -1)), float(shift), 1-shift, thumb=-.4)

    # Acquire the supporting palm by export124 (author88), before the leading
    # spine grip is allowed to transfer at132. A nearly-complete free reach still
    # blends wrist position and constrains palm orientation, losing real contact.
    catch = fade(frame, 48, 88)
    lay_flat = fade(frame, 96, 120)
    # Travel around the bottom-cover corner; a diagonal crosses the page block.
    left_local = V((.035+.155*smooth((lay_flat-.5)/.5),
                    .052-.0785*smooth(lay_flat/.45)-.009*sin(pi*fade(frame, 96, LAST)),
                    -.134+.094*smooth((lay_flat-.45)/.55)))
    left_local.z -= .07*sin(pi*fade(frame, 108, LAST))
    left_position = book_blender @ left_local
    left_position += (book_blender.to_3x3() @ V((-.025, -.08, -.055))) * (1-catch)
    support_fingers = V((.36, .93, 0))
    support_normal = V((0, 0, 1))
    support_across = support_normal.cross(support_fingers)
    # Bring the catch elbow slightly inward while the palm stays on the book.
    # This removes the last axial wrist excess without changing either contact.
    catch_yield = (.22 if row == 0 else .10)*fade(frame, 72, 96)*(1-fade(frame, 108, 120))
    # Early load acquisition needs its own elbow clearance while the book is
    # still higher. Fade it out before the existing tilt/support calibration.
    acquire_yield = .35*fade(frame, 72, 88)*(1-fade(frame, 88, 96))
    support_pole = V((.72-catch_yield-acquire_yield, .12, -.82))
    left.reach(left_position, left.desired(support_fingers, support_across),
               catch, .04*catch, support_pole.lerp(V((.20, .12, -1.4)), fade(frame, 96, 108)*(1-fade(frame, 128, LAST))), "palm", thumb=.024-.5*sin(pi*fade(frame, 96, LAST)))
    # Use the actual runtime closed-cover pose as the endpoint, including its
    # palm/forearm basis, so switching ownership cannot resurrect a released arm.
    handoff = fade(frame, 120, LAST)
    hand_rotations = [pose.rotation(hand.wrist) for hand in hands]
    arm_joints = {name for hand in hands for name in (hand.upper, hand.lower, hand.wrist)}
    for name in pose.bones:
        if name not in arm_joints:
            pose.orientations[name] = pose.orientations[name].slerp(pose.handoff.orientations[name], handoff)
            pose.positions[name] = pose.positions[name].lerp(pose.handoff.positions[name], handoff)
    pose.world.clear()
    if handoff > 0:
        for hand, rotation, contact in zip(hands, hand_rotations, (grab, left_position)):
            rotation = rotation.slerp(pose.handoff.rotation(hand.wrist), handoff)
            shape = hand.palm_shape
            if hand is right:
                current = pose.rotation(hand.wrist)
                tip = current.inverted() @ (pose.point(hand.tip)-pose.point(hand.wrist))
                shape = tip.lerp(hand.palm_shape, shift)
            wrist = TO_RIG @ contact - rotation @ shape
            start, mid, end = (pose.point(name) for name in (hand.upper, hand.lower, hand.wrist))
            ray = (end-start).normalized()
            pole = (mid-start-ray*ray.dot(mid-start)).normalized()
            pole = pole.lerp(V((-.72 if hand is right else .72, .12, -.82)), handoff)
            pose.limb(hand.upper, hand.lower, hand.wrist, wrist, pole, keep_bend_plane=True, neutral_frame=True)
            forearm_axis = (pose.point(hand.wrist)-pose.point(hand.lower)).normalized()
            pose.turn(hand.lower, forearm_axis, hand.previous_turn)
            # Blend axial roll in world space while keeping the solved segment
            # directions. Local quaternion blending can swing an elbow through
            # the opposite half-plane even when both endpoint contacts agree.
            # Unwrap the axial angle during this offline bake: shortest slerp
            # alone switches half-turn branches when its endpoint dot crosses zero.
            goals = {}
            for name, child in ((hand.upper, hand.lower), (hand.lower, hand.wrist)):
                direction = pose.point(child)-pose.point(name)
                final_direction = pose.handoff.point(child)-pose.handoff.point(name)
                aligned = final_direction.rotation_difference(direction) @ pose.handoff.rotation(name)
                current = pose.rotation(name)
                axis = direction.normalized()
                delta = aligned @ current.inverted()
                angle = 2*atan2(V((delta.x, delta.y, delta.z)).dot(axis), delta.w)
                previous = hand.handoff_turns.get(name, 0)
                while angle-previous > pi:
                    angle -= 2*pi
                while angle-previous < -pi:
                    angle += 2*pi
                hand.handoff_turns[name] = angle
                goals[name] = Q(axis, angle*handoff) @ current
            for name, goal in goals.items():
                pose.set_rotation(name, goal)
            pose.set_rotation(hand.wrist, rotation)
    return pos, rot


def style_linear(owner):
    action = owner.animation_data.action
    channel_bag = bpy_extras_anim.action_get_channelbag_for_slot(action, owner.animation_data.action_slot)
    for curve in channel_bag.fcurves:
        for key in curve.keyframe_points:
            key.interpolation = "LINEAR"


def held_shape(marker, name, dims, center, material):
    obj = box(name, dims, center, material)
    obj.parent = marker
    return obj


def material(name, rgb):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    if m.node_tree:
        m.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (*rgb, 1)
    return m


def box(name, dims, center, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    obj.data.materials.append(mat)
    return obj


def setup_stage(marker, row):
    wood = material("Warm oak", (.28, .15, .087))
    paper = material("Ivory page block", (.83, .70, .46))
    covers = material("Teal cloth covers", (.07, .25, .22))
    floor = material("Slate stage", (.19, .25, .29))
    box("Floor", (200, 200, .12), (0, 0, -.06), floor)
    for z in (.64, .93, 1.22, 1.55):
        box("Shelf plank", (1.18, .52, .055), (0, 0, z), wood)
    for x in (-.55, .55):
        box("Cabinet stile", (.08, .54, 1.48), (x, 0, .81), wood)
    box("Cabinet back", (1.08, .035, 1.42), (0, .255, .83), wood)
    for shelf in ROWS:
        for x in (-.324, -.162, 0, .162, .324):
            if shelf == ROWS[row] and x == 0:
                continue
            box("Adjacent book", (.065, .24, .22), (x, -.08, shelf), covers)
    held_shape(marker, "Book lower cover", (.24, .012, .22), (.12, 0, 0), covers)
    held_shape(marker, "Book paper block", (.226, .041, .209), (.12, .027, 0), paper)
    held_shape(marker, "Book spine", (.011, .065, .22), (0, .026, 0), covers)
    held_shape(marker, "Book upper cover", (.24, .012, .22), (.12, .058, 0), covers)


def cameras(scene):
    scene.world = bpy.data.worlds.new("Review environment")
    scene.world.color = (.15, .15, .15)
    for name, location, aim, length in (
        ("Side", (2.65, -.52, 1.45), (0, -.29, .93), 2.14),
        ("ThreeQuarter", (1.9, -2.32, 1.6), (0, -.27, .96), 2.17),
        ("Hands", (1.66, -.61, 1.59), (0, -.35, 1.10), .87),
    ):
        data = bpy.data.cameras.new(name)
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (V(aim)-obj.location).to_track_quat("-Z", "Y").to_euler()
        data.type = "ORTHO"
        data.ortho_scale = length
        if name == "ThreeQuarter":
            scene.camera = obj
    for name, location, power, size in (
        ("Key", (2, -2, 3), 410, 4.0),
        ("Fill", (-2, -1, 2), 190, 3.0),
        ("Rim", (.5, 2, 2.6), 300, 2.5),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy, data.shape, data.size = power, "DISK", size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (V((0, -.3, .84))-obj.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 600
    scene.render.resolution_y = 600
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"


def pack_gltf(path, pose, rows):
    nodes = [{"name": pose.bones[name].name} for name in pose.bones]
    indices = {name: i for i, name in enumerate(pose.bones)}
    roots = []
    for name, parent in pose.parents.items():
        index = indices[name]
        if parent:
            nodes[indices[parent]].setdefault("children", []).append(index)
        else:
            roots.append(index)
    marker_index = len(nodes)
    nodes.append({"name": "LibraryBook"})
    roots.append(marker_index)
    binary, views, accessors = bytearray(), [], []

    def add(values, kind):
        data = struct.pack(f"<{len(values)}f", *values)
        views.append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(data)})
        binary.extend(data)
        width = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[kind]
        accessor = {"bufferView": len(views)-1, "componentType": 5126,
                    "count": len(values)//width, "type": kind}
        if kind == "SCALAR":
            accessor.update(min=[min(values)], max=[max(values)])
        accessors.append(accessor)
        return len(accessors)-1

    times = add([frame/FPS for frame in EXPORT_FRAMES], "SCALAR")
    static_time = add([0], "SCALAR")
    animations = []
    for row, samples in enumerate(rows):
        channels, samplers = [], []
        for index, properties in enumerate(samples):
            for prop, values in properties.items():
                width = 3 if prop == "translation" else 4
                constant = max(abs(value-values[i % width]) for i, value in enumerate(values)) < 2e-7
                size = "VEC3" if width == 3 else "VEC4"
                sampler = {"input": static_time if constant else times,
                           "output": add(values[:width] if constant else values, size), "interpolation": "LINEAR"}
                channel = {"sampler": len(samplers), "target": {"node": index, "path": prop}}
                samplers.append(sampler)
                channels.append(channel)
        animations.append({"name": f"Library_Pickup_{row}", "samplers": samplers, "channels": channels})
    doc = {"asset": {"version": "2.0", "generator": "PocketWorld Blender library pickup bake"},
           "scene": 0, "scenes": [{"nodes": roots}], "nodes": nodes, "animations": animations,
           "buffers": [{"byteLength": len(binary)}], "bufferViews": views, "accessors": accessors}
    encoded = json.dumps(doc, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(struct.pack("<IIIII", 0x46546c67, 2, 28+len(encoded)+len(binary), len(encoded), 0x4e4f534a)
                     + encoded + struct.pack("<II", len(binary), 0x004e4942) + binary)


def sample_export(scene, rig, marker, pose, bind):
    # Read evaluated Blender actions, including the prop, rather than reusing the author's targets.
    samples = [{"translation": [], "rotation": []} for _ in range(len(pose.bones)+1)]
    convert_back = CONVERSION.inverted()
    correction = {name: bone.bone.matrix_local.inverted() @ CONVERSION @ bind[name]
                  for name, bone in pose.bones.items()}
    previous = {}

    def append(sample, matrix, key):
        rot = matrix.to_quaternion()
        if key in previous and rot.dot(previous[key]) < 0:
            rot.negate()
        previous[key] = rot.copy()
        sample["rotation"].extend((rot.x, rot.y, rot.z, rot.w))
        sample["translation"].extend(matrix.translation)

    for frame in EXPORT_FRAMES:
        scene.frame_set(int(frame), subframe=frame % 1)
        bpy.context.view_layer.update()
        world = {name: convert_back @ bone.matrix @ correction[name]
                 for name, bone in pose.bones.items()}
        for i, (name, matrix) in enumerate(world.items()):
            parent = pose.parents[name]
            append(samples[i], world[parent].inverted() @ matrix if parent else matrix, i)
        append(samples[-1], convert_back @ marker.matrix_world, "book")
    return samples


def main():
    options = argparse.ArgumentParser(description=__doc__)
    options.add_argument("--output", type=Path, default=ASSETS/"luna-library.glb")
    options.add_argument("--blend", type=Path, help="Save an editable review scene showing the chosen shelf.")
    options.add_argument("--from-blend", type=Path, help="Export the actions from an edited review scene.")
    options.add_argument("--row", type=int, choices=range(3), default=1)
    args = options.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    bind = read_binding()
    if args.from_blend:
        bpy.ops.wm.open_mainfile(filepath=str(args.from_blend))
        scene = bpy.context.scene
        rig, marker = (bpy.data.objects[name] for name in ("Luna", "LibraryBook"))
        bones = {bone.name.replace(":", ""): bone for bone in rig.pose.bones}
        pose = Pose(bones, {name: bone.bone.matrix_local for name, bone in bones.items()})
        samples = []
        for row in range(3):
            rig.animation_data.action = bpy.data.actions[f"Library_Pickup_{row}"]
            marker.animation_data.action = bpy.data.actions[f"LibraryBook_{row}"]
            samples.append(sample_export(scene, rig, marker, pose, bind))
        pack_gltf(args.output, pose, samples)
        return
    neutral_world = json.loads(subprocess.check_output(["node", str(ROOT/"scripts/luna-library-neutral.mjs")], cwd=ROOT))
    handoff_world = json.loads(subprocess.check_output(["node", str(ROOT/"scripts/luna-library-neutral.mjs"), "--handoff"], cwd=ROOT))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 0, EXPORT_LAST
    rig = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    rig.name = "Luna"
    rig.animation_data_clear()
    for obj in scene.objects:
        if obj.type == "MESH":
            obj.animation_data_clear()
    rig.matrix_world = ACTOR
    bones = {bone.name.replace(":", ""): bone for bone in rig.pose.bones}
    unscale = Matrix.Scale(1/SCALE, 4)
    neutral = {name: CONVERSION @ unscale @ matrix_from_array(neutral_world[name]) @ bind[name].inverted()
                     @ CONVERSION.inverted() @ bone.bone.matrix_local for name, bone in bones.items()}
    pose = Pose(bones, neutral)
    handoff = {name: CONVERSION @ unscale @ matrix_from_array(handoff_world[name]) @ bind[name].inverted()
                     @ CONVERSION.inverted() @ bone.bone.matrix_local for name, bone in bones.items()}
    pose.handoff = Pose(bones, handoff)
    for bone in bones.values():
        bone.rotation_mode = "QUATERNION"
        bone.scale = (1, 1, 1)
    hands = (Hand(pose, "Right"), Hand(pose, "Left"))
    marker = bpy.data.objects.new("LibraryBook", None)
    marker.rotation_mode = "QUATERNION"
    scene.collection.objects.link(marker)
    marker.empty_display_size = .035
    actions, samples = [], []
    for row in range(3):
        rig.animation_data_clear()
        marker.animation_data_clear()
        pose.key_quaternions = {}
        for hand in hands:
            hand.reset()
        for frame in range(EXPORT_LAST+1):
            position, rotation = choreograph(pose, hands, row, authored_frame(frame))
            pose.key(frame)
            marker.location = CONVERSION @ position
            marker.rotation_quaternion = CONVERSION.to_quaternion() @ rotation
            marker.keyframe_insert(data_path="location", frame=frame)
            marker.keyframe_insert(data_path="rotation_quaternion", frame=frame)
        style_linear(rig)
        style_linear(marker)
        correct_support_skin(scene, rig, marker, bones)
        rig_action, marker_action = rig.animation_data.action, marker.animation_data.action
        rig_action.name, marker_action.name = f"Library_Pickup_{row}", f"LibraryBook_{row}"
        rig_action.use_fake_user = marker_action.use_fake_user = True
        actions.append((rig_action, marker_action))
        samples.append(sample_export(scene, rig, marker, pose, bind))
        print(f"Baked shelf {row}", flush=True)
    pack_gltf(args.output, pose, samples)
    if args.blend:
        rig.animation_data.action, marker.animation_data.action = actions[args.row]
        setup_stage(marker, args.row)
        cameras(scene)
        for name, frame in (("Looking", 6), ("Reach", 19), ("Grip", GRAB), ("Spine clear", CLEAR),
                            ("Load secured", 88), ("Lower and tilt", 112), ("Cover grip ready", LAST)):
            scene.timeline_markers.new(name, frame=round(timeline(frame)))
        scene.frame_set(0)
        bpy.ops.file.pack_all()
        args.blend.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(args.blend))


if __name__ == "__main__":
    from bpy_extras import anim_utils as bpy_extras_anim
    main()
