/**
 * 房间内可交互物品的统一注册契约
 * 新增任何房间可交互物（如电脑、唱片机、书架、鱼缸等）只需在此注册配置与对应交互视图。
 */
export type InteractableId = 'computer' | 'music-player' | string;

export interface CameraPose {
  /** 摄像机目标机位坐标 [x, y, z] */
  position: [number, number, number];
  /** 摄像机注视焦点坐标 [x, y, z] */
  lookAt: [number, number, number];
  /** 正交相机缩放倍率或透视相机 FOV */
  zoom?: number;
}

export interface InteractableItemConfig {
  id: InteractableId;
  /** 对应 3D 模型（glTF/GLB）中的节点名称，如 "Interactable_Computer" */
  meshName: string;
  /** 鼠标悬停时显示的物品名称 */
  label: string;
  /** 鼠标悬停提示文案 */
  hint?: string;
  /** 点击后镜头推进的特写机位 */
  focusCameraPose: CameraPose;
  /** 悬停高亮发光颜色 */
  highlightColor?: string;
}

/**
 * 音乐播放器光盘数据结构（支持内置曲目与用户本地导入音频转化光盘）
 */
export interface MusicDisc {
  id: string;
  title: string;
  artist: string;
  /** 音频资源地址（内置音频路径或 URL.createObjectURL 生成的本地句柄） */
  audioUrl: string;
  /** 光盘封面主色调（本地导入时可根据文件名自动生成渐变盘面） */
  discThemeColor: [string, string];
  /** 是否为用户本地上传生成的光盘 */
  isUserUploaded?: boolean;
  duration?: number;
}
