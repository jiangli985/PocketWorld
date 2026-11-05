# PocketWorld — 浏览器里的 3D 微缩数字空间

一个等轴测（Isometric Diorama）非像素风 3D 交互房间项目。访客可以在精致的微缩房间内自由观察、点击物品触发丝滑的镜头推进过渡，在房间的复古电脑里体验内置街机小游戏（马里奥闯关、雷电打飞机），或将自己的本地音频文件转化为实体音乐光盘放入唱片机播放。

## 一、技术栈与整体架构

- **框架与构建**：`React + TypeScript + Vite`（支持一键导出纯静态产物部署至 Qoder Sites）
- **3D 场景与相机动画**：`Three.js` + `@react-three/fiber` + `@react-three/drei` + `GSAP`（负责等轴测箱庭房间渲染、光线氛围与点击物品时的平滑推镜过渡）
- **电脑内置小游戏**：基于 HTML5 `Canvas 2D` 实现高帧率独立卡带组件，通过标准接口 `GameCartridgeProps` 嵌入电脑屏幕内
- **音频与光盘系统**：基于 `Web Audio API` + `File API`（支持预置曲目与本地音频拖入自动生成光盘动画及频谱律动）

## 二、目录结构与多人分工边界

为避免多人协作产生 Git 冲突，项目按模块严格隔离职责目录：

```text
PocketWorld/
├── public/
│   ├── models/                # [任务一：队长] 3D 房间与家具模型 (.glb / .gltf)
│   └── audio/                 # [任务一：队长] 预置音乐与系统交互音效
├── src/
│   ├── scene/                 # [任务一：队长] 3D 等轴测房间、光照、相机推镜与交互物品锚点
│   ├── components/
│   │   └── music-player/      # [任务一：队长] 音乐播放器、本地音频转光盘动画与播放控制
│   ├── games/
│   │   ├── mario/             # [任务二：组员 A] 马里奥横版闯关小游戏（独立目录）
│   │   └── shooter/           # [任务三：组员 B] 打飞机太空射击小游戏（独立目录）
│   └── types/
│       ├── game.ts            # 小游戏卡带统一接口契约 (GameCartridgeProps)
│       └── interactable.ts    # 房间可交互物品注册与音乐光盘数据结构
└── README.md
```

## 三、多人协作与接口约定

1. **目录隔离**：
   - 负责**马里奥小游戏**的成员仅在 `src/games/mario/` 下开发；
   - 负责**打飞机小游戏**的成员仅在 `src/games/shooter/` 下开发；
   - 严禁直接污染全局样式或未清理的 `window` 键盘监听（组件卸载时必须移除所有 `keydown/keyup` 监听与 `requestAnimationFrame` 循环）。
2. **统一卡带接口**：
   两个游戏入口组件均接收 `src/types/game.ts` 中定义的 `GameCartridgeProps`，默认逻辑画布尺寸为 `800 × 600`（外层电脑显示器容器会自动等比缩放并加上复古屏幕滤镜）。
3. **分支规范**：
   每人基于 `main` 创建独立功能分支（如 `feat/game-mario`、`feat/game-shooter`、`feat/room-scene`），通过 Pull Request 合并。
