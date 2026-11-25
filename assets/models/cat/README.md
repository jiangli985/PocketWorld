# 团子模型源素材

项目成员提供的 `cartoon cat 3d model.glb` 是当前团子的原始素材。文件的 glTF 生成器字段为 `Tripo`，未附来源链接或许可声明。原文件 SHA-256：`6f06acd8ae56a8917a06e870aa4c583df81c780c3610be53a40bb5108342f6e8`。

- [tuanzi-cartoon.blend](tuanzi-cartoon.blend)：用 Blender 5.2.3 的 Rigify Animals > Cat 模板按新网格重新定位骨骼、绑定权重并打包贴图。打开后用 Pose Mode 的 `hand_ik.L/R` 和 `foot_ik.L/R` 分别抬前爪和后爪，用 `head` 转头、`tail.001`–`tail.004` 摆尾。需要修改骨骼静止位置时，可在 Outliner 显示隐藏的 Cat Metarig。模型的五官和脚趾细节画在网格贴图上，头和每只爪可整体变形。
- [cat.glb](../../public/models/cat/cat.glb)：运行时模型，4,445,308 字节。保留 36,640 个三角形和三张内嵌的 2048 × 2048 贴图，使用一个含 32 个关节的蒙皮。网页骨架和制作源沿用同一组关节位置和权重；尾链从 `Cat_TailBase` 到 `Cat_TailTip` 按根到尖连接。站立时的转头与摇尾由场景驱动。
- [tuanzi-motion.glb](../../public/models/cat/tuanzi-motion.glb)：230,336 字节，仅含伸懒腰、趴下、睡眠呼吸、起身和四拍慢走的骨骼动画。动作来源、授权和导出方法见 [动画制作源](motion/README.md)。
