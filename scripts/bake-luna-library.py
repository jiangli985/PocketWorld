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
# Give the pre-contact reach 2.4 seconds while retaining the contact/transfer beats.
REACH_SCALE = 2
EXPORT_LAST = LAST + 36
ROWS = (0.7775, 1.0675, 1.3575)
CONVERSION = Matrix.Rotation(pi / 2, 4, "X")
ACTOR = Matrix.Translation((0, -STAND, 0)) @ Matrix.Rotation(pi, 4, "Z") @ Matrix.Scale(SCALE, 4)
TO_RIG = ACTOR.inverted()
SHELF_ROT = Matrix(((0, -1, 0), (0, 0, 1), (-1, 0, 0))).to_quaternion()
READ_ROT = (Matrix.Rotation(-.32, 3, "X") @ Matrix.Rotation(pi, 3, "Y")).to_quaternion()
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
        self.previous_pole = None

    def desired(self, fingers, index):
        return basis(TO_RIG.to_3x3() @ fingers, TO_RIG.to_3x3() @ index) @ self.basis.inverted()

    def curl(self, amount):
        for digit in ("Index", "Middle", "Ring", "Pinky"):
            for segment, factor in enumerate((.62, 1, .52), start=1):
                name = joint(f"{self.side}Hand{digit}{segment}")
                axis = self.pose.rotation(self.wrist) @ self.curl_axis
                self.pose.turn(name, axis, amount * factor)
        for segment, factor in enumerate((.46, .56), start=1):
            name = joint(f"{self.side}HandThumb{segment}")
            axis = self.pose.rotation(self.wrist) @ (self.basis @ V((0, 0, -self.sign)))
            self.pose.turn(name, axis, amount * factor)

    def reach(self, point, target, weight, curl, pole, contact):
        if weight <= 0:
            return
        self.curl(curl)
        p = self.pose
        entry = {name: p.orientations[name].copy() for name in (self.upper, self.lower, self.wrist)}
        rest_position = p.point(self.wrist)
        rest_rotation = p.rotation(self.wrist)
        if self.previous_target is None:
            self.previous_target = rest_rotation
        # Limit the palm turn during a transfer before solving the wrist position.
        target = rest_rotation.slerp(target, weight)
        angle = 2*acos(min(1, abs(self.previous_target.dot(target))))
        if angle > .18:
            target = self.previous_target.slerp(target, .18/angle)
        self.previous_target = target.copy()
        shape = rest_rotation.inverted() @ (p.point(self.middle) - rest_position)
        if contact == "tip":
            shape = rest_rotation.inverted() @ (p.point(self.tip) - rest_position)
        elif contact == "palm":
            shape = self.palm_shape.copy()
        elif isinstance(contact, float):
            tip = rest_rotation.inverted() @ (p.point(self.tip) - rest_position)
            shape = tip.lerp(self.palm_shape, contact)
        wrist = rest_position.lerp(TO_RIG @ point - target @ shape, weight)
        # Lead the wrist forward before lifting: a straight path passes too
        # close to the shoulder and reverses the elbow plane during the reach.
        wrist += V((0, -.12 / SCALE, 0)) * sin(pi*weight)
        ray = (wrist-p.point(self.upper)).normalized()
        preferred = pole.copy()
        preferred -= ray*ray.dot(preferred)
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
        delta = target @ p.rotation(self.wrist).inverted()
        dot = V((delta.x, delta.y, delta.z)).dot(forearm_axis)
        # Same signed, bounded forearm share as the runtime. Iteratively changing
        # the palm cone after solving the wrist lost contact near a straight arm.
        turn = 1.75 * (2*dot*delta.w) / (dot*dot+delta.w*delta.w+.16)
        turn = max(self.previous_turn-.10, min(self.previous_turn+.10, turn))
        self.previous_turn = turn
        p.turn(self.lower, forearm_axis, turn)
        p.set_rotation(self.wrist, target)
        if weight < 1:
            for name, rotation in entry.items():
                p.orientations[name] = rotation.slerp(p.orientations[name], weight)
            p.world.clear()
            p.set_rotation(self.wrist, rest_rotation.slerp(target, weight))



def book_pose(row, frame):
    slot = V((.035, ROWS[row], .20))
    clear = slot + V((0, 0, .326))
    held = V((.11, .93, STAND+.30-.285))
    if frame <= CLEAR:
        return slot.lerp(clear, fade(frame, GRAB, CLEAR)), SHELF_ROT
    # Clear the entire shelf before any turn. Keep the book upright for the
    # second hand to catch the bottom, and lower high books before tipping them.
    upright = V((.065, max(.94, min(ROWS[row], 1.025)), .61))
    turn_start = 104 if row == 2 else 96
    position = clear.lerp(upright, fade(frame, CLEAR, turn_start))
    position = position.lerp(held, fade(frame, turn_start, turn_start+32))
    return position, SHELF_ROT.slerp(READ_ROT, fade(frame, turn_start, turn_start+32))


def choreograph(pose, hands, row, frame):
    pose.reset()
    lean = fade(frame, 1, 30) * (1-fade(frame, 60, 112))
    # Retreat before the high book reaches the side hair, with the spine grip locked.
    right_step = fade(frame, 45, 66) if row == 2 else fade(frame, 45, 72)
    left_step = fade(frame, 91, 112) if row == 2 else fade(frame, 79, 102)
    travel = .15*(right_step+left_step)
    load_left = fade(frame, 29, 41)*(1-fade(frame, 51, 61))
    load_right = fade(frame, 49, 63)*(1-fade(frame, 77, 89))
    clear_face = fade(frame, 39, 60)*(1-fade(frame, 87, 112))
    drop = (.284, .058, .008)[row]
    stepping = right_step-left_step
    extra_clearance = clear_face if row else 0
    # Another 6 cm of top-row lateral yield clears palm/thumb skin from the hair.
    # Release this extra yield by authored frame 96 (export 132), before the
    # closed-pose handoff: a late release flips the upper-arm shortest-roll branch.
    pose.place_hip((-.018*lean+.041*load_left-.045*load_right+.032*extra_clearance
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
    grab = book_blender @ V((.006, (-.001, -.011, -.004)[row], (.042, .020, -.095)[row]))
    approach = 1-fade(frame, 19, 30)
    grab += V((.014, -.085, -.014))*approach
    # The leading fingertips stay on the spine through extraction and the
    # upright catch. Only after the left palm carries the book do they move
    # around the free edge to the front cover, ready for the runtime open pose.
    shift = fade(frame, 108, 132)
    cover = book_blender @ V((.18, .054, -.088))
    grab = grab.lerp(cover, shift)
    grab += (book_blender.to_3x3() @ V((.025, -.035, -.015))) * sin(pi*shift)
    cover_fingers = book_blender.to_3x3() @ V((.85, .22, -.40))
    cover_normal = book_blender.to_3x3() @ V((0, 1, 0))
    cover_across = cover_fingers.cross(cover_normal)
    right_rotation = right.desired(fingers, across).slerp(right.desired(cover_fingers, cover_across), shift)
    right.reach(grab, right_rotation, fade(frame, 6, 30),
                .07+.35*fade(frame, 28, GRAB)-.20*shift,
                V((-.78, .17, -.63)).lerp(V((-.78, -.50, -.35)), fade(frame, 24, 40)*(1-fade(frame, 96, 120))) if row == 2 else V((-.78, .17, -.63)), float(shift))

    catch = fade(frame, 60, 96)
    lay_flat = fade(frame, 104 if row == 2 else 96, 128 if row == 2 else 120)
    left_local = V((.08, .026, -.118)).lerp(V((.12, -.009, -.072)), lay_flat)
    left_position = book_blender @ left_local
    left_position += (book_blender.to_3x3() @ V((-.025, -.08, -.055))) * (1-catch)
    upright_fingers = V((1, 0, .10))
    flat_fingers = V((-.75, .20, .55))
    support_fingers = book_blender.to_3x3() @ upright_fingers.lerp(flat_fingers, lay_flat)
    support_normal = book_blender.to_3x3() @ V((0, 0, 1)).lerp(V((.10, .995, 0)), lay_flat)
    support_across = support_normal.cross(support_fingers)
    left.reach(left_position, left.desired(support_fingers, support_across),
               catch, .14*catch, V((.72, .12, -.82)), "palm")
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
            goals = {}
            for name, child in ((hand.upper, hand.lower), (hand.lower, hand.wrist)):
                direction = pose.point(child)-pose.point(name)
                final_direction = pose.handoff.point(child)-pose.handoff.point(name)
                aligned = final_direction.rotation_difference(direction) @ pose.handoff.rotation(name)
                goals[name] = pose.rotation(name).slerp(aligned, handoff)
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

    times = add([i/FPS for i in range(EXPORT_LAST+1)], "SCALAR")
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

    for frame in range(EXPORT_LAST+1):
        scene.frame_set(frame)
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
                            ("Supporting hand", 96), ("Lower and tilt", 112), ("Cover grip ready", LAST)):
            scene.timeline_markers.new(name, frame=round(timeline(frame)))
        scene.frame_set(0)
        bpy.ops.file.pack_all()
        args.blend.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(args.blend))


if __name__ == "__main__":
    from bpy_extras import anim_utils as bpy_extras_anim
    main()
