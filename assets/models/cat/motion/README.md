# 团子动画源文件

此目录的动画改编自 David-Alfter 的 [Animal Animator 0.1.0](https://extensions.blender.org/add-ons/animal-animator/)，沿用 GPL-3.0-or-later，完整许可见 [COPYING](COPYING)。采用 `stretch_long`、`lie_down`、`sleep_curl` 、`get_up` 和 `walk`，按团子的轴向和腿长重定向，对齐坐垫上的爪子接触，并将侧蜷睡改成能衔接趴下和起身的俯卧呼吸。许可适用于本目录的动画和导出的动画 GLB。猫网格和贴图见[模型来源](../README.md)。

[tuanzi-motion.blend](tuanzi-motion.blend) 含独立的 FK 骨架和五个可编辑 Action，打开或导出无需额外安装扩展。Blender 5.2 中选择 `TuanziRig`，在 Action Editor 中选择任一 `Tuanzi_*` 动作预览或编辑。导出 glTF Binary，勾选 Selected Objects，动画模式选 NLA Tracks，关闭 Limit to Playback Range，开启 Slide to Zero 和逐帧采样。五个 Action 通过已保存的 NLA 条带随骨架导出。动作按骨名绑定到场景里的猫模型。

`Tuanzi_Walk` 来自共享四足动作的 `Walk (4-beat)`。用团子的前腿、后腿及腕跗关节映射源姿势，将摆幅调至原始预设的 65%，逐帧校正低于站姿的爪点。循环为 40 帧（30 fps），末帧与首帧相同，根节点留在原地，由场景按移动距离采样。
