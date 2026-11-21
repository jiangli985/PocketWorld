import type { FurnitureVector } from './FurnitureParts';

// The open journal must fit cleanly between the vinyl rack, turntable, and front-left desk edges.
export const JOURNAL_POSITION: FurnitureVector = [-1.34, 1.121, -2.14];
export const JOURNAL_SCALE = 0.165;
export const JOURNAL_YAW = -0.04;

export const JOURNAL_PAGE_POSITION: FurnitureVector = [
  JOURNAL_POSITION[0],
  JOURNAL_POSITION[1] + 0.043,
  JOURNAL_POSITION[2],
];
