# 任务三：打飞机太空射击小游戏 (`src/games/shooter/`)

## 模块职责
实现可嵌入房间电脑屏幕内的纵版/太空街机打飞机（Shoot 'em up）小游戏，对外默认导出符合 `GameCartridgeProps`（见 `src/types/game.ts`）的 `ShooterGame` 组件。

## 核心验收要求
1. **画布与生命周期隔离**：使用 `Canvas 2D`（建议逻辑分辨率 `800 × 600`），组件卸载（`unmount`）或 `isActive === false` 时必须清理 `requestAnimationFrame` 与键盘/鼠标事件监听。
2. **核心玩法**：支持战机平滑移动、自动/按键发射弹幕、多波次敌机生成与移动轨迹、掉落物道具（双发/散弹/护盾/回血）、爆炸粒子特效与 Boss 战或无尽波次计分。
3. **状态联动**：通过 `onScoreChange` 上报实时分数与最高分，通过 `onGameOver` 上报结算状态，点击返回按钮调用 `onExit()` 返回电脑桌面。
