# Luna 动画制作源

## 转椅坐姿

`Luna-Sit-ContactFixed.blend` 基于用户提供的接触修正版，调整了落座深度与小腿轨迹，保留 115 骨骼、坐下动作、真实转椅和接触修形修改器。源文件 SHA-256：`a9b60ea23722f85dcf3d9bdb419eca4ed7bbafb8028778442f85e0aaf09af3ab`。角色与 Mixamo 行走素材沿用既有项目输入，未收到独立许可声明；不将其标记为 CC0。

### 运行资源

- `assets/public/models/resident/luna-walk-room.glb`：保留 `Walk_Grounded_Loop`，加入 `ChairSit_Contact`（第 1–68 帧，30 fps，时间归零后 67/30 秒）。31,140 个三角形，10,267,804 bytes。
- 同目录 `luna-seat-contact.bin`：68 帧、2,716 个局部顶点的蒙皮前修形，1,108,148 bytes。不能只替换 GLB 而遗漏该文件；普通 glTF 查看器只显示骨骼动作，不会自动应用此缓存。
- 相对原运行模型合计增加 3,097,320 bytes；源 `.blend` 不在 `assets/public/`，不进入网页构建。

原始 4096 × 4096 底色 JPEG 来自用户提供的 Tripo GLB，在 Git 提交 `2e1ff72` 的 `art/resident/animated-transfer/walk-repair/luna-walk-repaired.glb` 中也有相同副本。法线与粗糙度／金属度图保留 2048 × 2048。当前材质将法线强度设为 0.18、金属系数设为 0，并复用底色作为 0.55 强度的自发光，用来减轻室内近景的发际线和眼周暗块。

### 复建

使用 Blender 5.2.3 与 Python 3。所有中间文件必须输出到仓库外。以下路径为示例，`<外部目录>` 替换为实际绝对路径：

```text
blender --background --python scripts/bake-luna-chair.py -- --output <外部目录>
python scripts/pack-luna-chair.py --output <外部目录>
```

第二步默认从 Git 基线 `6f6df88` 读取原 Walk 与压缩贴图，也可通过 `--original <原始GLB>` 指定输入。动画重建后，把输出 `luna-room-contact.glb` 与 `luna-seat-contact.bin` 作为运行资源。打包脚本沿用 2K 基线材质，发布前需按上段的来源与参数恢复 4K 底色和当前材质。

制作脚本仅细化裙摆接触区，先限制为四骨骼权重，再从 Blender 评估网格反解蒙皮前位移；保留原平滑法线。转椅按场景尺寸归一化并降低 0.25 m，人物比例 1.43。升降通过人物与座椅共同平移实现，不伸长腿骨。

缓存为小端：20 bytes 头（`PWSC`、uint32 版本 1、uint32 帧数、uint32 顶点数、float32 量化步长），随后为帧优先的 int16 XYZ 位移。GLB 的 `_CONTACT_ID` 对应缓存行，-1 表示不修形；轴采用 glTF 的 X/Y/Z。量化分量误差小于 1.2 微米（世界坐标）。骨骼采样时间与缓存第零帧必须对齐。

### 验证边界

制作脚本检查原生 68 帧的接触面；运行时单测检查时间原点、绑定、独立实例、恢复、骨长与有限坐标。网页动作和导出后网格还需单独验收，不能用原生检查替代浏览器检查。验证结果及截图放在任务 PR，临时模型、报告和录屏不提交。

## 上床三版

`luna-bed-v3.blend` 是可编辑的 24 fps、0–222 帧动作；运行时使用 [独立动画库](../../public/models/resident/luna-bed-v3.glb)，复用既有 Luna 网格、115 骨骼、贴图与 Walk。制作源包含真实床接触尺寸、角色、关键帧、相机和灯光，不进入网页构建。

### 动作与坐标

- 0–48：从运行时中立站姿直接手撑落座，无独立弯腰探床阶段。
- 48 对齐二版 113；61 对齐二版 126；95 起保持二版 160 以后的转髋、抬腿、脚跟落床与 Mixamo 搭腹收尾。
- 右小腿保持踝位置，按左侧健康解剖朝向修正轴向扭转；右踝、脚趾在坐姿提前放松，抬腿前短促转动做局部四元数平滑。未把脚锁平。
- Blender 米制 Z 向上；角色缩放 1.43，床按运行时 contact-fit 1.72 × 1.40 × 2.60。运行时入口为 `[-1.48, 0, 0.73]`、朝向 `Math.PI / 2`。外层位置固定，全部上床根运动由 Hips 通道负责。
- 最后睡姿保持；醒来或取消逆向采样当前动作，返回精确站姿后恢复行走。未新增闭眼或循环睡眠动作。

### 来源

沿用用户提供的二版 Luna 上床试片。二版前身为用户提供的 Plask XBot 动作，后半段重定向并按真实床适配；Mixamo「Laying Sleeping」只提供最后上身微动与搭腹手势，不包含落腿动作。Luna 与床来自项目既有 Tripo 模型。本次不新增外部模型或纹理，不把来源不明的素材声明为 CC0。运行时登记见 [来源清单](../../models.sources.json)。

### 复建与验证

使用 Blender 5.2.3：

```powershell
blender --background --python scripts/export-luna-bed.py
npm test
```

导出脚本从此制作源和既有 `luna-walk-room.glb` 的绑定矩阵重建动画库，避免 Blender 骨骼坐标轴与 glTF 的差异。不需要临时试片目录。GLB 仅有 115 节点、230 通道，799,688 bytes，无网格、蒙皮或图片。

床专项测试覆盖中立首帧、单层根运动、恢复 Walk、暂坐足轴、全段半帧右踝连续性、30/60/120 Hz、后台时间截断、反向取消与减少动态效果。视觉与接触证据存放在仓库外并在 PR 交付；不是通用布料或连续碰撞验证。继承的裙摆/发束局部交叠与二版臀部约 6 mm 接触压入仍有待后续处理。

## 站立伸懒腰

用户提供的 Mixamo `Yawn.fbx` 为 30 FPS、1–251 帧骨骼动作。`scripts/export-luna-yawn.py` 将上身世界旋转相对绑定姿态的变化转换到 Luna 的绑定坐标，导出 `luna-yawn.glb`，232,092 bytes、54 条旋转轨道、8.33 秒。骨盆、腿和脚沿用运行时中立站姿。首次普通待机时加载，运行时淡入淡出整段动作。

复建命令为 `blender --background --python scripts/export-luna-yawn.py -- <Yawn.fbx路径>`。输入由用户下载提供，许可见来源清单中的 Adobe Mixamo FAQ。普通待机复用现有骨骼，加入小幅胸腔呼吸、上身侧摆、转头及肩臂放松。9 秒普通待机采样中，头部移动范围约 1.7 cm，双手约 6.7–7.5 cm，脚部位置固定。


## 站立环顾

Mixamo 页面按描述 `Idle Stand Looking Around` 确认的 `Looking Around`，使用 X Bot 空手站姿，完整 1–191 帧。下载设为 FBX Binary / Without Skin / 30 FPS / Keyframe Reduction none；Body Type 0、Surprise Level 50、Overdrive 50、Arm-Space 50、Trim 0–100%、Mirror 关闭。不是同名持火把动作，也不是 `Look Around — Looking Around The Body`。

复用 `scripts/export-luna-yawn.py` 的绑定姿态与肩臂方向修正：`blender --background --python scripts/export-luna-yawn.py -- "<Looking Around.fbx路径>" looking-around`。生成 `luna-looking-around.glb`：180,012 bytes，54 条上身旋转轨道，6.33 秒；无网格、纹理和根位移。骨盆、腿及脚由原中立姿态负责，环顾期间保持原地。源 FBX 留在仓库外，SHA-256 与许可入口见来源清单。

两种偶发动作独立按需加载；某一资源失败不阻塞另一动作或普通待机。时序与打断由 `standingIdle.ts` 统一管理，数值参数及产品行为见 SPEC.md。

## 书柜取书与归还

用 Blender 5.2.3 在 Luna 原骨架上制作底、中、顶三条取书动作。导出为 0–180 帧、30 fps：第 60 帧前主手已接触书脊，第 72 帧后才移动书，第 108 帧完成直线抽出，第 132 帧支撑手接住书底，随后降低并倾转；顶层先降低到安全高度，再从第 140 帧开始倾转。顶层第一步退让提前到第 81–102 帧，同时身体向远离主手的一侧多让 6 cm，使仍固定抓脊的手掌与拇指离开侧发束；额外侧让在第 114–132 帧收回，早于第 156 帧开始的闭合持书交接，避免上臂轴向最短插值在半圈处换支。抓脊点、手形与书本轨迹不变。底层随起身竖直抬至腰间，避免手臂伸不到仍留在底层的书。主手在支撑接稳后才移向封面，末帧来自网页真实的闭合持书姿态。归还倒播对应阶段。骨骼与书本标记在同一 GLB 中，场景按书位平移，两者按同一时刻采样。

```powershell
blender --background --factory-startup --python-exit-code 1 --python scripts/bake-luna-library.py
blender --background --factory-startup --python-exit-code 1 --python scripts/bake-luna-library.py -- --row 2 --blend "<仓库外目录>/Luna-书柜.blend"
```

脚本需要项目的 Node.js 依赖，用来读取运行时同款中立站姿。可选的 `--row` 为 0（底层）、1（中层）或 2（顶层），用于选择 Blender 文件中默认显示的书层。文件内保留三层的动作、书本标记、书柜尺寸参考和独立相机；在 Blender 修改关键帧后可用 `--from-blend` 从已编辑文件重新导出。运行时 `luna-library.glb` 仅包含动作、骨架和书本标记，大小 748,056 bytes，首次书柜互动时按需加载。`luna-library-neutral.mjs --handoff` 采样真实程序 IK 的闭合托书、封面抓握与全身姿态；烘焙末段保留手书接触，在世界坐标中衔接臂段轴向旋转，避免局部四元数混合把肘部带到另一侧。伸手使用向前绕开的腕部路径和稳定弯曲平面，前臂旋前分担与网页使用相同的带符号有界公式。普通模式取书片段为 6 秒，开合封面各 1.35 秒，开书前 20% 完成烘焙到程序姿态的交接。打开、阅读和翻页由 `src/scene/orbital/library/` 的程序姿态与下述 Blender 翻页控制曲线共同驱动：展开时从闭合交接姿态连续降低、收近并调整书面倾角；封面、浅 V 纸页与手部接触点共用变换。正向翻页为左手托书、右手带页，反向交换分工。

### 翻页曲线制作与运行时对照

`scripts/bake-luna-page-turn.py` 创建 `PageTurnControls` 和可编辑的 `Luna_PageTurn_Controls` 动作，将纸页进度的 Bezier 控制柄、松手时点、起手与回托距离和时序、抬手高度、卷曲宽度、肘部方向与视线参数导出到 `src/scene/orbital/library/pageTurnFrames.ts`。运行时直接计算这些控制柄，纸页以从自由边向书脊传播的弯曲波替代整页刚性旋转；指尖 IK 使用当前弯曲中指的真实骨链偏移。制作时间线为 0–100 帧、100/3 fps，与网页普通模式的 3 秒翻页对应。

以下 PowerShell 命令在已激活项目 Node.js 依赖的工作区执行；`$reviewDir` 必须指向仓库外的临时目录。

```powershell
$reviewDir = $env:PI_SCRATCH_DIR
blender --background --factory-startup --python-exit-code 1 --python scripts/bake-luna-page-turn.py -- --blend "$reviewDir/Luna-PageTurn.blend"
node scripts/sample-luna-page-turn.mjs --output "$reviewDir/runtime-page-turn.json"
blender --background --factory-startup --python-exit-code 1 --python scripts/bake-luna-page-turn.py -- --runtime "$reviewDir/runtime-page-turn.json" --blend "$reviewDir/Luna-PageTurn.blend"
```

可编辑 Blender 控制器后用 `--from-blend "$reviewDir/Luna-PageTurn.blend"` 重新导出曲线，再重新采样实际运行时姿态。`--runtime` 导入正反两套 101 帧的真实蒙皮骨骼、书本变换与纸页顶点，供多视角对照；查看动作时须同时选择对应的 `Luna_PageTurn_*`、`Book_PageTurn_*`、`Sheet_PageTurn_*`，相机为 `Front`、`Left`、`Right`、`Top`、`ThreeQuarter`。这些骨骼动作是运行时的审查快照；直接改快照骨骼不会自动修改网页动作，网页使用的源仍是控制曲线与 IK 实现。

重建时先导出控制曲线，再采样网页，最后导入新采样；修改过控制器的场景在最后一步加 `--from-blend`，避免默认参数覆盖编辑值。截图、采样 JSON 与检查用 Blender 文件留在仓库外，不进入静态发布包。已有取书 GLB 不受翻页曲线导出影响。
