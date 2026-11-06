import { InteractableId, InteractableItemConfig } from '../types/interactable';

/**
 * 房间全景默认正交相机机位（标准等轴测 45° 水平角）
 */
export const DEFAULT_ROOM_CAMERA_POSE = {
  position: [11.5, 9.8, 11.5] as [number, number, number],
  lookAt: [0, 1.15, 0] as [number, number, number],
  zoom: 58,
};

/**
 * 房间内所有可交互物品注册表
 */
export const INTERACTABLE_ITEMS: InteractableItemConfig[] = [
  {
    id: 'computer',
    meshName: 'Interactable_Computer',
    label: '复古工作站电脑 (PocketOS)',
    hint: '点击或靠近按 [E] 进入电脑系统与街机小游戏',
    focusCameraPose: {
      position: [1.15, 2.35, 0.55],
      lookAt: [0.85, 1.52, -2.75],
      zoom: 145,
    },
    highlightColor: '#60a5fa',
    anchorPosition: [0.85, 1.45, -2.55],
    interactRadius: 1.85,
    interactionMode: 'focus-panel',
  },
  {
    id: 'music-player',
    meshName: 'Interactable_MusicPlayer',
    label: 'Hi-Fi 黑胶与光盘唱机',
    hint: '点击或靠近按 [E] 播放音乐 / 导入本地音频压制光盘',
    focusCameraPose: {
      position: [-0.15, 2.35, 0.35],
      lookAt: [-0.68, 1.25, -2.68],
      zoom: 150,
    },
    highlightColor: '#f59e0b',
    anchorPosition: [-0.68, 1.2, -2.55],
    interactRadius: 1.85,
    interactionMode: 'focus-panel',
  },
  {
    id: 'bed',
    meshName: 'Interactable_Bed',
    label: '原木暖绒单人床',
    hint: '点击或靠近按 [E] 让主角躺下小憩 / 起床',
    focusCameraPose: {
      position: [3.2, 4.2, 4.5],
      lookAt: [-2.0, 0.85, 1.75],
      zoom: 95,
    },
    highlightColor: '#f472b6',
    anchorPosition: [-1.85, 0.85, 1.75],
    interactRadius: 2.1,
    interactionMode: 'character-action',
  },
  {
    id: 'bookcase',
    meshName: 'Interactable_Bookcase',
    label: '原木藏书柜与手账台',
    hint: '点击或靠近按 [E] 翻阅书架藏书与房间日志',
    focusCameraPose: {
      position: [0.6, 2.8, 0.6],
      lookAt: [-3.15, 1.35, -2.05],
      zoom: 125,
    },
    highlightColor: '#34d399',
    anchorPosition: [-2.85, 1.35, -2.05],
    interactRadius: 1.9,
    interactionMode: 'focus-panel',
  },
  {
    id: 'light-switch',
    meshName: 'Interactable_LightSwitch',
    label: '墙壁主灯开关',
    hint: '点击或靠近按 [E] 切换房间主照明开关',
    focusCameraPose: DEFAULT_ROOM_CAMERA_POSE,
    highlightColor: '#fbbf24',
    anchorPosition: [-3.65, 1.45, 3.45],
    interactRadius: 1.75,
    interactionMode: 'instant-toggle',
  },
  {
    id: 'bedside-lamp',
    meshName: 'Interactable_BedsideLamp',
    label: '床头暖光台灯',
    hint: '点击或靠近按 [E] 开关床头阅读暖灯',
    focusCameraPose: DEFAULT_ROOM_CAMERA_POSE,
    highlightColor: '#fde047',
    anchorPosition: [-3.2, 1.25, -0.15],
    interactRadius: 1.75,
    interactionMode: 'instant-toggle',
  },
  {
    id: 'string-lights',
    meshName: 'Interactable_StringLights',
    label: '吊柜暖黄氛围串灯',
    hint: '点击或靠近按 [E] 切换墙面串灯开关',
    focusCameraPose: DEFAULT_ROOM_CAMERA_POSE,
    highlightColor: '#facc15',
    anchorPosition: [-3.45, 2.15, 1.65],
    interactRadius: 2.1,
    interactionMode: 'instant-toggle',
  },
  {
    id: 'window',
    meshName: 'Interactable_Window',
    label: '格栅采光窗（昼夜切换）',
    hint: '点击或靠近按 [E] 切换「午后暖阳」与「静谧月夜」',
    focusCameraPose: DEFAULT_ROOM_CAMERA_POSE,
    highlightColor: '#38bdf8',
    anchorPosition: [-1.55, 2.2, -3.65],
    interactRadius: 2.2,
    interactionMode: 'instant-toggle',
  },
  {
    id: 'pet',
    meshName: 'Interactable_Pet',
    label: '橘猫「团子」',
    hint: '点击或靠近按 [E] 抚摸猫咪互动',
    focusCameraPose: DEFAULT_ROOM_CAMERA_POSE,
    highlightColor: '#fb923c',
    anchorPosition: [0.55, 0.45, 1.75],
    interactRadius: 1.55,
    interactionMode: 'character-action',
  },
  {
    id: 'chair',
    meshName: 'Interactable_Chair',
    label: '人体工学旋转椅',
    hint: '点击或靠近按 [E] 入座 / 旋转座椅',
    focusCameraPose: DEFAULT_ROOM_CAMERA_POSE,
    highlightColor: '#a78bfa',
    anchorPosition: [0.45, 0.85, -1.42],
    interactRadius: 1.45,
    interactionMode: 'character-action',
  },
  {
    id: 'plant',
    meshName: 'Interactable_Plant',
    label: '琴叶榕绿植花箱',
    hint: '点击或靠近按 [E] 给绿植浇水护理',
    focusCameraPose: DEFAULT_ROOM_CAMERA_POSE,
    highlightColor: '#4ade80',
    anchorPosition: [2.55, 0.75, -0.75],
    interactRadius: 1.6,
    interactionMode: 'instant-toggle',
  },
  {
    id: 'trash-bin',
    meshName: 'Interactable_TrashBin',
    label: '书桌废纸篓',
    hint: '点击或靠近按 [E] 投掷灵感废纸团',
    focusCameraPose: DEFAULT_ROOM_CAMERA_POSE,
    highlightColor: '#94a3b8',
    anchorPosition: [2.25, 0.55, -2.35],
    interactRadius: 1.5,
    interactionMode: 'instant-toggle',
  },
  {
    id: 'wall-art',
    meshName: 'Interactable_WallArt',
    label: '墙面风景装饰画组',
    hint: '点击或靠近按 [E] 查看画作详情',
    focusCameraPose: {
      position: [2.35, 2.75, 0.35],
      lookAt: [2.15, 2.25, -3.75],
      zoom: 135,
    },
    highlightColor: '#f9a8d4',
    anchorPosition: [2.15, 2.1, -3.65],
    interactRadius: 2.1,
    interactionMode: 'focus-panel',
  },
];

export const INTERACTABLE_MAP: Record<InteractableId, InteractableItemConfig> = Object.fromEntries(
  INTERACTABLE_ITEMS.map((item) => [item.id, item])
);

/**
 * 房间内家具碰撞包围盒（平面 XZ 矩形 [minX, maxX, minZ, maxZ]），防止主角穿模
 */
export interface ObstacleBox2D {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const ROOM_OBSTACLES: ObstacleBox2D[] = [
  // 木床
  { id: 'bed', minX: -3.85, maxX: -0.35, minZ: 0.55, maxZ: 3.05 },
  // 床头柜
  { id: 'nightstand', minX: -3.85, maxX: -2.75, minZ: -0.65, maxZ: 0.42 },
  // 矮书柜/储物柜
  { id: 'bookcase', minX: -3.85, maxX: -2.42, minZ: -3.35, maxZ: -0.95 },
  // 电脑桌
  { id: 'desk', minX: -1.25, maxX: 1.95, minZ: -3.75, maxZ: -2.05 },
  // 废纸篓
  { id: 'trash', minX: 1.98, maxX: 2.68, minZ: -2.75, maxZ: -1.98 },
  // 绿植花箱
  { id: 'planter', minX: 1.88, maxX: 3.32, minZ: -1.32, maxZ: -0.18 },
  // 落地绿植
  { id: 'floor-plant', minX: 2.94, maxX: 3.56, minZ: -3.56, maxZ: -2.94 },
  // 坐墩
  { id: 'pouf', minX: 1.24, maxX: 1.96, minZ: 2.59, maxZ: 3.31 },
];
