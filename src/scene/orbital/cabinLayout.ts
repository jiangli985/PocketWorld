// Room-local metres. The starboard side and window stay fixed as the port side widens.
export const CABIN_LEFT = -6.57;
export const CABIN_RIGHT = 4.24;
export const CABIN_CENTER_X = (CABIN_LEFT + CABIN_RIGHT) / 2;

export const BED_POSITION: [number, number, number] = [-4.05, 0, -1.897];
export const BED_ENTRY: [number, number] = [BED_POSITION[0] + 1.12, BED_POSITION[2] - .27];

// The table top is a fixed part of the authored cabin mesh.
export const NIGHTSTAND_X = -2.52;
export const NIGHTSTAND_Z = -2.825;
export const LAMP_POSITION: [number, number, number] = [NIGHTSTAND_X - .31, .829, NIGHTSTAND_Z];
export const PLANT_POSITION: [number, number, number] = [NIGHTSTAND_X + .31, .829, NIGHTSTAND_Z - .09];
