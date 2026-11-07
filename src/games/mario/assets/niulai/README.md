# 黄色牛来伙伴素材

按用户确认的黄色牛来形象，将上游站立与眨眼 PNG 描摹为纯路径 SVG，并制作两种伙伴动作。

| 动作 | 独立动画 | Canvas 序列图 | 伙伴用途 |
| --- | --- | --- | --- |
| 贴地滑行 | niulai-slide.svg | niulai-slide-sheet.svg | 承担企鹅的短时加速与贴地滑行能力 |
| 冲撞奔跑 | niulai-charge.svg | niulai-charge-sheet.svg | 承担雪怪的骑乘与撞开普通圆石能力 |

两种伙伴共用黄色牛来身份，切换时采用对应姿态。伙伴能力、骑乘位置、持续距离和碰撞判定需在游戏逻辑接入时实现。

## 播放方式

独立动画使用 SVG SMIL，直接在浏览器打开，或通过 HTML 的 object 元素加载即可预览。眨眼周期为 3.2 秒，滑行循环为 1 秒，冲撞循环为 0.64 秒。

Canvas 2D 接入时使用两个 sheet 文件和 animations.json。每张序列图横排 8 帧，每帧为 320 × 360，整张为 2560 × 360。加载一次后，按游戏累计运行时间选帧并通过 drawImage 的源矩形裁切绘制。滑行为 8 FPS，冲撞为 12.5 FPS。暂停时冻结累计运行时间，恢复后继续，避免脱离游戏时钟的独立循环。

帧索引可按 floor(elapsedSeconds × fps) % frameCount 计算。源矩形为 frameIndex × 320、0、320、360。groundAnchor 为每帧局部坐标中的雪面参考点 160、340，实际骑乘锚点与判定盒由游戏接入时配置。

独立动画采用 SMIL 的姿态变化与眨眼时钟，序列图采用睁眼表情和八帧姿态变化，方便游戏独立控制表情节奏。

## 来源与改制

上游仓库为 whitefirer/dsh-niulai-pet，本次取用提交为 0f1ffcd0c79ea313812bd2bd9591827f95994ada。上游许可证声明保存在本目录 LICENSE.txt。原素材见下方链接。

- https://github.com/whitefirer/dsh-niulai-pet/blob/0f1ffcd0c79ea313812bd2bd9591827f95994ada/assets/niulai/skins/default/pet.png
- https://github.com/whitefirer/dsh-niulai-pet/blob/0f1ffcd0c79ea313812bd2bd9591827f95994ada/assets/niulai/skins/default/pet_blink.png

原图 Git blob SHA-1 分别为 70b0e031dff3149e49dcaa1e2f651e62c718ef01 和 b4975684c04d787b670b0d96b3b290e9a035ba33。

使用 VTracer 0.6.15 进行彩色分层贝塞尔描摹，参数为 color_precision 5、layer_difference 24、filter_speckle 5、corner_threshold 60、length_threshold 4、max_iterations 10、splice_threshold 45、path_precision 2。描摹会简化原图毛发和明暗层次。新动画通过分区裁切、头部姿态、蹄部摆动、身体起伏和眨眼组合生成。

SVG 背景透明，图形自包含，内部 use 元素只引用当前文件中的路径定义。四份 SVG 合计约 380 KiB，可供游戏模块按需加载。

## 已验证范围

Chrome 中独立 SVG 在不同时间点的截图有变化。两张序列图均可由 Canvas 2D 解码绘制，各自 8 帧均有图像且像素结果互异。已检查 XML 引用完整性、透明背景与文件体积。

当前交付阶段为伙伴动画素材准备，游戏中的骑乘、冲撞、静音、暂停及反复进出待实现后联调。
