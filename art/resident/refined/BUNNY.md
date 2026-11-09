# 独立白兔玩偶

按用户提供的《白兔玩偶角色设定参考表》五视角重新建模。此交付只包含独立兔子资产；人物重新绑定骨骼后再接入交互，当前人物、动作和游戏加载路径保持原状。

## 文件与外观

- `luna-bunny-refined.blend`：可编辑源文件，头、身体、耳朵、手脚、圆尾和配饰分别命名；参考图打包在隐藏的 Reference 集合中。
- [`luna-bunny-refined.glb`](../../../public/models/resident/luna-bunny-refined.glb)：独立静态模型，贴图内嵌，无人物网格、骨架或动画。
- [`bunny-views.jpg`](bunny-views.jpg)：正面、前侧、侧面、后侧和背面预览。
- `bunny-manifest.json`、`bunny-validation.json` 和 `bunny-gltf-validation.json`：文件哈希、制作配置和结构验收结果。

模型包含白色绒布表面、粉色耳内与脚掌、棕色眼罩及完整绑带、奶油色四芒星、六瓣黄色领饰和圆尾。约高 0.290 米，原点位于脚底；Blender 朝向 -Y、Z 向上，GLB 朝向 +Z、Y 向上。运行时 1 个网格、9 个材质批次、59,672 个三角形，文件 1,949,264 bytes（约 1.86 MiB）。无需额外解码器。

`Grip_Right`、`Grip_Left` 和 `Support` 是不渲染的空节点，供后续绑定使用，不包含动作逻辑。Blender 坐标分别为 `(-0.052, 0, 0.075)`、`(0.052, 0, 0.075)` 和 `(0, 0, 0.004)` 米。

## 验收与编辑

已查看五视角预览。GLB 重新导入 Blender 后，焊接 UV 接缝的开放边、非流形边、退化面均为零，接触标记位置与源文件一致。glTF Validator 检查为 0 错误、4 条运行时生成切线的警告，以及未使用 UV 的信息提示。Python 语法检查、TypeScript 检查和静态构建通过。此资产未包含新的人物绑定或动作验收。

使用 Blender 5.2.3 LTS。直接在 `.blend` 中精修，再导出到新的 GLB 路径；导出脚本拒绝覆盖已有文件。重建脚本只写入空目录，不覆盖交付源文件。命令从仓库根目录运行，`blender` 替换为本机可执行文件路径。

```sh
blender --background --python scripts/blender/build_bunny.py -- --reference /path/to/reference.png --output /path/to/empty-directory --render
blender --background art/resident/refined/luna-bunny-refined.blend --python scripts/blender/export_bunny.py -- --output /path/to/new-bunny.glb
blender --background art/resident/refined/luna-bunny-refined.blend --python scripts/blender/validate_bunny.py -- --runtime public/models/resident/luna-bunny-refined.glb --report /path/to/validation.json
```
