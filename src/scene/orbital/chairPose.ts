import type { WorldSceneId } from '../../types/world';

export type ChairPose = Readonly<{ x: number; z: number; yaw: number }>;

/** Room-local position and facing shared by the model, navigation and seat animation. */
export const CHAIR_POSES: Readonly<Record<WorldSceneId, ChairPose>> = {
  habitat: { x: 1.45, z: -.55, yaw: Math.PI - .05 },
  observatory: { x: -1.65, z: .75, yaw: Math.PI + .22 },
};

export function chairFront(pose: ChairPose, distance: number): [number, number] {
  return [pose.x + Math.sin(pose.yaw) * distance, pose.z + Math.cos(pose.yaw) * distance];
}
