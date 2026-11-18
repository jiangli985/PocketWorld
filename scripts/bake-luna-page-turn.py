"""Author Luna's page-turn controls in Blender and export the curves used by the web rig.
Run with Blender --python scripts/bake-luna-page-turn.py -- --blend <outside-repo.blend>.
After editing the controls, use --from-blend <file> to export the edited action.
--runtime <json> imports exact evaluated runtime skin poses for editable mesh review.
"""
import argparse
import json
import sys
from pathlib import Path
import bpy
from mathutils import Matrix, Quaternion, Vector
from math import pi

ROOT = Path(__file__).resolve().parents[1]
FPS = 100
LAST = 100
DEFAULTS = {
    'BookNear': .04,
    'OpenStackThickness': .011,
    'ReachHeight': .12,
    'CrossArc': .025,
    'CurlWaveWidth': .44,
    'GazeFollow': .46,
    'ElbowHeight': .25,
    'ElbowForward': .45,
    'ContactEnd': .54,
    'SupportFront': .045,
    'OutsideRadius': .255,
    'ReturnHeight': .16,
    'DepartRadius': .23,
    'LowerStart': .78,
    'SupportReturn': .86,
    'SweepPalmTilt': .6,
    'SweepFingerAcross': .75,
    'SweepFingerForward': .65,
}
PAGE_KEYS = ((0, 0), (30, 0), (43, .20), (52, .50), (62, .83), (76, .97), (90, 1), (100, 1))


def curves(owner):
    from bpy_extras import anim_utils
    return anim_utils.action_get_channelbag_for_slot(owner.animation_data.action, owner.animation_data.action_slot).fcurves


def author():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for action in list(bpy.data.actions):
        if action.name.startswith(('Luna_PageTurn_', 'Book_PageTurn_', 'Sheet_PageTurn_')):
            bpy.data.actions.remove(action)
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.render.fps_base = 3
    scene.frame_start, scene.frame_end = 0, LAST
    control = bpy.data.objects.new('PageTurnControls', None)
    scene.collection.objects.link(control)
    control.empty_display_type = 'PLAIN_AXES'
    control['description'] = 'Book local metres; PageRatio drives shared curled sheet and fingertip. Forward uses right hand, reverse mirrors the sheet.'
    for name, value in DEFAULTS.items():
        control[name] = value
    control['PageRatio'] = 0.
    for frame, value in PAGE_KEYS:
        control['PageRatio'] = value
        control.keyframe_insert(data_path='["PageRatio"]', frame=frame)
    control.animation_data.action.name = 'Luna_PageTurn_Controls'
    for curve in curves(control):
        for key in curve.keyframe_points:
            key.interpolation = 'BEZIER'
            key.handle_left_type = key.handle_right_type = 'AUTO_CLAMPED'
    for name, frame in (('Rest', 0), ('Lift and cross', 16), ('Opposite corner contact', 30),
                        ('Low curling sweep', 52), ('Release beyond spine', 54), ('Palm returns below cover', 86), ('Supported', 100)):
        scene.timeline_markers.new(name, frame=frame)
    return control


def export_controls(control, output):
    bpy.context.scene.frame_set(0)
    data = {name: control[name] for name in DEFAULTS}
    curve = next(c for c in curves(control) if c.data_path == '["PageRatio"]')
    data['page'] = [[round(v, 8) for v in (key.co.x / LAST, key.co.y, key.handle_left.x / LAST,
                    key.handle_left.y, key.handle_right.x / LAST, key.handle_right.y)] for key in curve.keyframe_points]
    output.write_text('// Generated from Blender PageTurnControls by scripts/bake-luna-page-turn.py.\n'
                      '// Edit the Blender controls or the reproducible authoring script, then export again.\n'
                      'export const PAGE_TURN_AUTHORED = ' + json.dumps(data, indent=2) + ' as const;\n', encoding='utf-8')


def import_runtime(path):
    data = json.loads(path.read_text(encoding='utf-8'))
    # Rebuild review snapshots without leaving old rigs/actions active when
    # --from-blend preserves edited PageTurnControls. Only the controls are source.
    for obj in list(bpy.data.objects):
        if obj.name != 'PageTurnControls':
            bpy.data.objects.remove(obj, do_unlink=True)
    for action in list(bpy.data.actions):
        if action.name != 'Luna_PageTurn_Controls' and action.name.startswith(
                ('Luna_PageTurn_', 'Book_PageTurn_', 'Sheet_PageTurn_')):
            bpy.data.actions.remove(action)
    source = ROOT / 'assets/public/models/resident/luna-walk-room.glb'
    bpy.ops.import_scene.gltf(filepath=str(source))
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    rig.name = 'Luna'
    rig.animation_data_clear()
    convert = Matrix.Rotation(pi / 2, 4, 'X')
    def mat(values):
        return Matrix([values[i:i+4] for i in range(0,16,4)]).transposed()
    bind = {name: mat(m) for name,m in data['bind'].items()}
    bones = {b.name.replace(':',''): b for b in rig.pose.bones}
    correction = {name: (convert @ bind[name]).inverted() @ b.bone.matrix_local for name,b in bones.items()}
    rig.matrix_world = Matrix.Identity(4)
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            obj.animation_data_clear()
    book = bpy.data.objects.new('RuntimeBook', None)
    bpy.context.scene.collection.objects.link(book)
    verts, faces = [], []
    for row in range(2):
        for i in range(19): verts.append((0,0,0))
    for i in range(18): faces.append((i, i+1, i+20, i+19))
    mesh = bpy.data.meshes.new('Curled sheet geometry')
    mesh.from_pydata(verts, [], faces)
    page = bpy.data.objects.new('RuntimeTurningPage', mesh)
    bpy.context.scene.collection.objects.link(page)
    page.shape_key_add(name='Basis')
    paper = bpy.data.materials.new('Warm paper'); paper.diffuse_color = (.91,.85,.70,1)
    paper.use_nodes = True
    paper.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = paper.diffuse_color
    mesh.materials.append(paper)
    covermat = bpy.data.materials.new('Cloth cover'); covermat.diffuse_color = (.07,.20,.16,1)
    covermat.use_nodes = True
    covermat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = covermat.diffuse_color
    for side in (0,1):
        for kind in ('Cover','Stack'):
            bpy.ops.mesh.primitive_cube_add(size=1)
            obj = bpy.context.object; obj.name = f'Book{kind}_{side}'; obj.parent = book
            obj.data.materials.append(covermat if kind == 'Cover' else paper)
    for direction, samples in data['actions'].items():
        rig.animation_data_clear(); book.animation_data_clear(); page.data.shape_keys.animation_data_clear()
        prev = {}
        for frame, sample in enumerate(samples):
            world = {n: convert @ mat(m) @ correction[n] for n,m in sample['bones'].items()}
            for name,bone in bones.items():
                bone.rotation_mode = 'QUATERNION'
                parent = bone.parent
                bone.matrix_basis = bone.bone.convert_local_to_pose(world[name], bone.bone.matrix_local,
                    parent_matrix=world[parent.name.replace(':','')] if parent else Matrix.Identity(4),
                    parent_matrix_local=parent.bone.matrix_local if parent else Matrix.Identity(4), invert=True)
                if name in prev and bone.rotation_quaternion.dot(prev[name]) < 0: bone.rotation_quaternion.negate()
                prev[name] = bone.rotation_quaternion.copy()
                bone.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=bone.name)
                bone.keyframe_insert(data_path='location', frame=frame, group=bone.name)
                bone.keyframe_insert(data_path='scale', frame=frame, group=bone.name)
            book.matrix_world = convert @ mat(sample['book'])
            book.rotation_mode = 'QUATERNION'
            book.keyframe_insert(data_path='location', frame=frame)
            book.keyframe_insert(data_path='rotation_quaternion', frame=frame)
            key = page.shape_key_add(name=f'{direction}_{frame}')
            for v, position in zip(key.data, sample['page']): v.co = convert @ Vector(position)
            for f,val in ((frame-1,0),(frame,1),(frame+1,0)):
                key.value = val; key.keyframe_insert(data_path='value', frame=f)
        rig.animation_data.action.name = f'Luna_PageTurn_{direction}'
        rig.animation_data.action.use_fake_user = True
        book.animation_data.action.name = f'Book_PageTurn_{direction}'
        book.animation_data.action.use_fake_user = True
        page.data.shape_keys.animation_data.action.name = f'Sheet_PageTurn_{direction}'
        page.data.shape_keys.animation_data.action.use_fake_user = True
    for side in (0,1):
        wing = data['wings'][side]
        rot = Quaternion((wing['quaternion'][3],*wing['quaternion'][:3]))
        for kind in ('Cover','Stack'):
            obj = bpy.data.objects[f'Book{kind}_{side}']
            obj.rotation_mode='QUATERNION'; obj.rotation_quaternion=rot
            pos = Vector(((-1 if side == 0 else 1)*.12, 0 if kind=='Cover' else .012, 0))
            obj.location = rot @ pos
            obj.scale=(.24,.012,.22) if kind=='Cover' else (.226,.011,.209)
    # Each action explicitly clears the other direction's shape keys. Blender
    # otherwise retains unanimated values when switching between actions.
    for direction in data['actions']:
        page.data.shape_keys.animation_data.action=bpy.data.actions['Sheet_PageTurn_'+direction]
        for key in page.data.shape_keys.key_blocks:
            if key.name != 'Basis' and not key.name.startswith(direction+'_'):
                key.value=0
                key.keyframe_insert(data_path='value',frame=0)
    bpy.ops.mesh.primitive_cube_add(size=1)
    spine=bpy.context.object; spine.name='BookSpine'; spine.parent=book
    shrink=(.012+data['wings'][1]['thickness'])/.053
    spine.location=(0,.026*shrink,0); spine.scale=(.011,.065*shrink,.22)
    spine.data.materials.append(covermat)
    rig.animation_data.action=bpy.data.actions['Luna_PageTurn_forward']
    book.animation_data.action=bpy.data.actions['Book_PageTurn_forward']
    page.data.shape_keys.animation_data.action=bpy.data.actions['Sheet_PageTurn_forward']
    bpy.context.scene.frame_set(52)
    aim=Vector((0,.12,1.04))
    for name, pos in (('Front',(0,2.4,1.23)),('Left',(-2.2,.1,1.28)),('Right',(2.2,.1,1.28)),('Top',(0,.1,3)),('ThreeQuarter',(1.6,2,1.45))):
        camera=bpy.data.objects.new(name,bpy.data.cameras.new(name));bpy.context.scene.collection.objects.link(camera)
        camera.location=pos;camera.rotation_euler=(aim-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.type='ORTHO';camera.data.ortho_scale=.94
        if name=='Front':bpy.context.scene.camera=camera
    for name,pos,power in (('Key',(2,3,4),500),('Fill',(-2,2,2),300)):
        light=bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA'));bpy.context.scene.collection.objects.link(light)
        light.location=pos;light.data.energy=power;light.data.size=4
        light.rotation_euler=(aim-light.location).to_track_quat('-Z','Y').to_euler()
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x=600;scene.render.resolution_y=600;scene.render.resolution_percentage=100
    if scene.world is None: scene.world = bpy.data.worlds.new('ReviewWorld')
    scene.world.color=(.25,.25,.25)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--blend',type=Path)
    parser.add_argument('--from-blend',type=Path)
    parser.add_argument('--runtime',type=Path)
    parser.add_argument('--output',type=Path,default=ROOT/'src/scene/orbital/library/pageTurnFrames.ts')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if args.from_blend:
        bpy.ops.wm.open_mainfile(filepath=str(args.from_blend)); control=bpy.data.objects['PageTurnControls']
    else: control=author()
    export_controls(control,args.output)
    if args.runtime: import_runtime(args.runtime)
    if args.blend:
        bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=str(args.blend))
    print('Exported Blender page-turn control curves:',args.output)

if __name__=='__main__':main()
