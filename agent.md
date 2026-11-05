# PocketWorld 项目协作与 Agent 开发规范 (`agent.md`)

本文档用于规范 **PocketWorld** 项目的整体工程约束、多人分工边界、代码隔离准则以及面向 AI 编程助手（Qoder / Cursor / Claude / Codex 等）的开发要求。所有项目成员及 AI Agent 在编写或修改代码前必须先阅读并严格遵守本文档与 `spec.md`。

---

## 1. 项目定位与目标环境

- **项目形态**：基于浏览器的 **非像素风 3D 等轴测微缩数字空间（Isometric 3D Diorama Room）**。访客在立体小房间内探索，点击电脑进入复古桌面体验内置街机小游戏（马里奥、打飞机），点击音乐播放器将本地音乐转化为实体光盘进行播放。
- **部署目标**：**Qoder Sites**（纯前端静态部署环境）。
- **核心约束**：
  - 最终构建产物必须为纯静态资源（`vite build` 产出的 `dist/`），不依赖自定义长连接后端或服务端数据库。
  - 所有持久化数据（游戏最高分、成就、播放器自定义设置等）统一使用浏览器 `localStorage`，且 Key 必须以 `pocketworld:` 作为命名空间前缀（例如 `pocketworld:mario:highscore`）。
  - 静态资源引用必须使用相对路径或 Vite 标准资源导入方式，严禁硬编码绝对域名或本地机器绝对路径。

---

## 2. 技术栈基线

- **核心框架**：`React 18+` + `TypeScript` + `Vite`
- **3D 渲染与动画**：`Three.js` + `@react-three/fiber` + `@react-three/drei` + `GSAP`（相机推镜缓动与 UI 过渡）
- **内置小游戏渲染**：原生 `HTML5 Canvas 2D`（包裹在 React 组件内部，确保高帧率与零外部引擎冲突）
- **音频处理**：`Web Audio API` + `File API`（支持预置音频、用户本地音频文件拖入生成光盘、8-bit 游戏合成音效及频谱分析）

---

## 3. 多人协作目录所有权（严禁越界修改）

本项目由 **队长（场景与系统集成）** 与 **两名组员（各自负责一款电脑内置小游戏）** 协作完成。为彻底避免 Git 合并冲突，严格执行目录隔离制度：

| 角色 / 任务 | 负责模块 | 允许修改的专属目录 | 严禁擅自修改的区域 |
|---|---|---|---|
| **任务一（队长）** | 3D 等轴测房间建模与布置、相机推镜动画、电脑 OS 外壳、音乐播放器与光盘动效 | `src/scene/`、`src/components/`、`public/models/`、`public/audio/` | 组员负责的具体游戏内部实现（集成联调除外） |
| **任务二（组员 A）** | 马里奥横版闯关小游戏 | `src/games/mario/` | `src/scene/`、`src/components/`、`src/games/shooter/`、全局样式文件 |
| **任务三（组员 B）** | 打飞机太空射击小游戏 | `src/games/shooter/` | `src/scene/`、`src/components/`、`src/games/mario/`、全局样式文件 |
| **公共契约层** | 跨模块 TypeScript 类型与接口定义 | `src/types/game.ts`、`src/types/interactable.ts` | 仅限队长统一维护，组员如需扩展字段须先向队长提出 |

---

## 4. 小游戏模块（卡带）强制开发规范

当 AI Agent 或组员在 `src/games/mario/` 或 `src/games/shooter/` 下开发游戏时，必须遵守以下 **5 条铁律**：

1. **统一组件签名**：
   - 马里奥模块默认导出 `MarioGame`（`src/games/mario/index.tsx`），打飞机模块默认导出 `ShooterGame`（`src/games/shooter/index.tsx`）。
   - 组件 Props 必须严格实现 `src/types/game.ts` 中的 `GameCartridgeProps`。
2. **逻辑分辨率固定，禁止污染全局布局**：
   - 游戏内部 Canvas 逻辑尺寸默认采用 `width = 800`、`height = 600`（`4:3` 复古显示器比例）。
   - **禁止**在游戏组件内修改 `document.body.style`、设置 `100vw / 100vh` 全屏固定定位（`position: fixed`）或引入影响全局标签（`body`, `html`, `canvas`, `*`）的 CSS 样式。画布在电脑屏幕内的等比缩放由外层电脑容器统一处理。
3. **事件与循环的生命周期彻底清理（防内存与按键泄漏）**：
   - 组件卸载（`unmount`）或 `isActive === false` 时，**必须**立即取消 `requestAnimationFrame`、`setInterval`、`setTimeout`，并暂停/关闭游戏自身的 `AudioContext`。
   - 绑定的 `window.addEventListener('keydown' | 'keyup' | ...)` 必须在 cleanup 函数中完整移除。
   - 在游戏处于激活状态且捕获方向键（`ArrowUp/Down/Left/Right`）或空格键（`Space`）时，必须调用 `event.preventDefault()` 和 `event.stopPropagation()`，防止触发外部网页滚动或 3D 场景快捷键。
4. **音频受控与零大文件依赖**：
   - 游戏内音效必须响应 Props 传入的 `isMuted` 状态（当 `isMuted === true` 时立即静音）。
   - 优先使用 `Web Audio API` 振荡器（Oscillator）程序化合成复古街机音效（跳跃、金币、激光、爆炸），避免在仓库中提交体积庞大的未压缩音频资源。
5. **独立调试支持**：
   - 开发阶段可通过 URL 参数 `?dev=mario` 或 `?dev=shooter` 直接进入对应小游戏的独立调试沙盒，无需等待 3D 房间加载。

---

## 5. 3D 场景与可交互物品扩展规范

1. **交互解耦**：
   - 3D 场景中的所有可交互物品（电脑、音乐播放器及后续新增物品）统一通过 `InteractableItemConfig`（见 `src/types/interactable.ts`）注册，禁止在 3D 模型渲染组件中硬编码复杂的业务弹窗逻辑。
2. **模型与资源规范**：
   - 导出至 `public/models/` 的模型统一使用 `.glb`（glTF 2.0 二进制）格式，可交互物体节点命名采用 `Interactable_<Name>`（如 `Interactable_Computer`、`Interactable_MusicPlayer`）。
   - 单个 `.glb` 模型文件建议控制在 `10MB` 以内，贴图分辨率不超过 `2048 × 2048`，确保网页首屏加载流畅。

---

## 6. Git 分支与提交流程

- **分支命名**：
  - 队长场景与主框架：`feat/room-scene`、`feat/music-player`
  - 组员 A（马里奥）：`feat/game-mario`
  - 组员 B（打飞机）：`feat/game-shooter`
- **提交规范**：
  - 仅暂存（`git add`）自己负责目录下的具体文件路径，严禁使用 `git add -A` 或提交 `node_modules/`、`.DS_Store`、构建产物。
  - Commit Message 格式：`type(scope): 中文简述`（例如 `feat(mario): 实现角色跳跃物理与砖块碰撞`、`feat(shooter): 添加敌机波次生成与弹幕系统`）。
  - 合并回 `main` 前必须通过 TypeScript 类型检查（`tsc --noEmit`）与本地构建验证（`npm run build`）。
