# 团子动画源文件

此目录的动画改编自 David-Alfter 的 [Animal Animator 0.1.0](https://extensions.blender.org/add-ons/animal-animator/)，沿用 GPL-3.0-or-later，完整许可见 [COPYING](COPYING)。采用 `stretch_long`、`lie_down`、`sleep_curl` 和 `get_up`，按团子的轴向和腿长重定向，对齐坐垫上的爪子接触，并将侧蜷睡改成能衔接趴下和起身的俯卧呼吸。许可适用于本目录的动画和导出的动画 GLB。猫网格和贴图见[模型来源](../README.md)。

[tuanzi-motion.blend](tuanzi-motion.blend) 含独立的 FK 骨架和四个可编辑 Action，打开或导出无需额外安装扩展。Blender 5.2 中选择 `TuanziRig`，在 Action Editor 中选择任一 `Tuanzi_*` 动作预览或编辑。导出 glTF Binary，勾选 Selected Objects，动画模式选 Actions，关闭 Limit to Playback Range，开启 Slide to Zero 和逐帧采样。四个 Action 通过已保存的 NLA 条带随骨架导出。动作按骨名绑定到场景里的猫模型。
