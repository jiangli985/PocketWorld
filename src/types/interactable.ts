/**
 * 房间内可交互物品的统一注册契约
 * 新增任何房间可交互物（如电脑、唱片机、书架、床铺、灯光开关、宠物等）只需在此注册配置与对应交互视图。
 */
export type InteractableId =
  | 'computer'
  | 'music-player'
  | 'bed'
  | 'bookcase'
  | 'light-switch'
  | 'bedside-lamp'
  | 'string-lights'
  | 'window'
  | 'pet'
  | 'chair'
  | 'plant'
  | 'trash-bin'
  | 'wall-art'
  | string;

export interface CameraPose {
  /** 摄像机目标机位坐标 [x, y, z] */
  position: [number, number, number];
  /** 摄像机注视焦点坐标 [x, y, z] */
  lookAt: [number, number, number];
  /** 正交相机缩放倍率或透视相机 FOV */
  zoom?: number;
}

export type InteractionMode = 'focus-panel' | 'instant-toggle' | 'character-action';

export interface InteractableItemConfig {
  id: InteractableId;
  /** 对应 3D 模型（glTF/GLB 或场景节点）中的节点名称，如 "Interactable_Computer" */
  meshName: string;
  /** 鼠标悬停时显示的物品名称 */
  label: string;
  /** 鼠标悬停提示文案 */
  hint?: string;
  /** 点击后镜头推进的特写机位 */
  focusCameraPose: CameraPose;
  /** 悬停高亮发光颜色 */
  highlightColor?: string;
  /** 物体在房间中的交互锚点坐标（用于主角靠近检测与气泡定位） */
  anchorPosition?: [number, number, number];
  /** 主角靠近可触发 E 键交互的半径 */
  interactRadius?: number;
  /** 交互模式：推镜打开详情面板 / 即时切换状态（如开关灯）/ 角色动作（如躺床、坐椅、撸猫） */
  interactionMode?: InteractionMode;
}

/**
 * 房间灯光与环境氛围状态
 */
export interface RoomLightingState {
  /** 房间主顶灯开关 */
  mainLightOn: boolean;
  /** 床头暖光台灯开关 */
  bedsideLampOn: boolean;
  /** 墙面装饰串灯开关 */
  stringLightsOn: boolean;
  /** 窗户昼夜模式：day = 午后暖阳体积光，night = 静谧月夜蓝调 */
  timeOfDay: 'day' | 'night';
}

/**
 * 主角人物状态与姿势
 */
export type CharacterPosture = 'standing' | 'walking' | 'sleeping' | 'sitting' | 'petting';

export interface CharacterState {
  position: [number, number, number];
  rotationY: number;
  posture: CharacterPosture;
  nearbyInteractableId: InteractableId | null;
  statusBubble?: string | null;
}

/**
 * 音乐播放器光盘数据结构（支持内置曲目与用户本地导入音频转化光盘）
 */
export interface MusicDisc {
  id: string;
  title: string;
  artist: string;
  /** 音频资源地址（内置合成标识或 URL.createObjectURL 生成的本地句柄） */
  audioUrl: string;
  /** 光盘封面主色调（本地导入时可根据文件名自动生成渐变盘面） */
  discThemeColor: [string, string];
  /** 是否为用户本地上传生成的光盘 */
  isUserUploaded?: boolean;
  duration?: number;
  /** 内置程序化曲目风格标识 */
  synthPreset?: 'lofi-sunset' | 'midnight-rain' | 'warm-vinyl' | 'starlight-dream';
}
