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

当 AI Agent 或组员在 `src/games/mario/` 或 `src/games/shooter/` 下开发游戏时，必须遵守以下 **6 条铁律**：

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
6. **内容自主设计，整站保持轻量**：
   - 已确认的玩法、页面流程与验收边界以 `spec.md` 第 3 节为准；队员可自主设计关卡主题、敌人、道具、美术和数值，但不得省略明确要求。
   - 游戏必须可独立按需加载，由队长维护外层选择界面与动态导入；不另引入大型游戏引擎或后端，新增依赖与大体积资源须先与队长协调。
   - 子弹、敌人、掉落物、粒子与历史记录须有数量或寿命上限，避免无尽模式持续积累；资源尽量压缩复用，交付时检查包体、长时间运行与反复进入退出的开销。详细要求见 `spec.md` 第 3.4 节。

---

## 5. 3D 场景与可交互物品扩展规范

1. **交互解耦**：
   - 3D 场景中的所有可交互物品（电脑、音乐播放器及后续新增物品）统一通过 `InteractableItemConfig`（见 `src/types/interactable.ts`）注册，禁止在 3D 模型渲染组件中硬编码复杂的业务弹窗逻辑。
2. **模型与资源规范**：
   - 导出至 `public/models/` 的模型统一使用 `.glb`（glTF 2.0 二进制）格式，可交互物体节点命名采用 `Interactable_<Name>`（如 `Interactable_Computer`、`Interactable_MusicPlayer`）。
   - 单个 `.glb` 模型文件建议控制在 `10MB` 以内，贴图分辨率不超过 `2048 × 2048`，确保网页首屏加载流畅。

---

## 6. Git 分支与提交流程

- **强制通过 PR 交付**：
  - 队员所有代码与资源修改必须通过 Pull Request（PR）提交，目标分支为 `main`；禁止直接向 `main` 推送、在 `main` 上提交开发内容，或自行合并 PR。
  - 开始任务前同步最新 `main`，为当前任务创建独立功能分支，只修改第 3 节授权的目录。公共类型、依赖、锁文件、构建配置和全局样式由队长统一维护；确需修改时先在 PR 中说明需求，不擅自越界。
  - 功能分支推送后尽早创建 Draft PR，写清目标、当前进度、剩余工作与未验证项；后续修改继续推送到同一分支、更新同一 PR，避免为同一任务重复开 PR。
  - 完成自查与验证后将 PR 标记为 Ready for review，请队长审查；按意见在原分支补充提交。仅由队长在审查通过、冲突解决且必需检查通过后合并，队员不得开启自动合并或绕过审查。
  - 不得强制推送、改写已共享提交历史，或覆盖其他成员的修改；出现跨模块冲突应与队长协调。合并前保留分支与 PR 供审阅。
- **分支命名**：
  - 队长场景与主框架：`feat/room-scene`、`feat/music-player`
  - 组员 A（马里奥）：`feat/game-mario`
  - 组员 B（打飞机）：`feat/game-shooter`
- **提交规范**：
  - 仅暂存（`git add`）自己负责目录下的具体文件路径，严禁使用 `git add -A` 或提交 `node_modules/`、`.DS_Store`、构建产物。
  - 提交前审阅暂存差异，不提交密钥、令牌、`.env`、本地数据库或日志；提交作者邮箱使用 GitHub noreply 地址。
  - Commit Message 格式：`type(scope): 中文简述`（例如 `feat(mario): 实现角色跳跃物理与砖块碰撞`、`feat(shooter): 添加敌机波次生成与弹幕系统`）。
  - 代码修改合并回 `main` 前必须通过 TypeScript 类型检查（`tsc --noEmit`）与本地构建验证（`npm run build`），并完成与改动相关的玩法、暂停恢复、退出清理等验证。纯文档修改检查差异与格式即可；环境尚不支持的检查须明确标记未验证，不能写成已通过。
- **PR 内容要求**：
  - 使用仓库 PR 模板，说明目标、最终行为、验证方法与结果、未完成或未验证内容；有界面或玩法变化时附截图或短录屏，涉及资源或依赖时说明包体影响。
  - 提交审查前确认仅包含本任务修改、未越过目录边界，且与 `spec.md` 及轻量化要求一致；PR 讨论中的问题解决后再请求重新审查。
- **GitHub 服务端保护**：
  - 本文与 PR 模板是协作约定，不能从技术上拦截直接推送。仓库管理员应为 `main` 配置分支保护或 Ruleset：要求通过 PR 合并、至少 1 个审批、推送新提交后撤销旧审批、解决全部审查讨论，并禁止强推和删除受保护分支；必需状态检查在真实 CI 建立后再绑定。
  - 队员不得拥有绕过上述规则的权限，合并操作由队长统一执行。服务端规则是否生效需在 GitHub 单独核实，不能因文档已写入就视为保护已启用。
