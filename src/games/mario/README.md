# 任务二：马里奥横版闯关小游戏 (`src/games/mario/`)

## 模块职责
实现可嵌入房间电脑屏幕内的横版平台跳跃闯关小游戏，对外默认导出符合 `GameCartridgeProps`（见 `src/types/game.ts`）的 `MarioGame` 组件。

## 核心验收要求
1. **画布与生命周期隔离**：使用 `Canvas 2D`（建议逻辑分辨率 `800 × 600`），组件卸载（`unmount`）或 `isActive === false` 时必须清理 `requestAnimationFrame` 定时器与 `window` 键盘事件，避免影响 3D 房间视角控制。
2. **核心玩法**：支持左右移动、跳跃、重力与平台碰撞检测、顶砖块/金币收集、基础敌人（如蘑菇怪踩踏与受伤判定）、终点旗杆通关结算。
3. **状态联动**：通过 `onScoreChange` 实时上报得分，通过 `onGameOver` 上报通关/失败结果，点击返回或按退出键调用 `onExit()` 返回电脑桌面。
