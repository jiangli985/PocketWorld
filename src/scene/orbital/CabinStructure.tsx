import React, { useContext } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { BEDROOM_WALL_FRONT, CABIN_DIVIDER_X, UPPER_DECK_OFFSET } from './cabinLayout';
import { CABIN_STAIRS, STAIR_LANDING_WALL, STAIR_RISE, STAIR_RUN, STAIR_TREAD_RUN, STAIR_UPPER_PLATFORM_BACK } from './cabinStairs';
import { UpperDeckVisibility } from './CabinUpperDeck';
import { SoftBox } from './Primitives';

const WOOD = '#b27c4e';
const DARK_WOOD = '#75503a';
const BRASS = '#996f47';
const [shift, upperY] = UPPER_DECK_OFFSET;
const GUARD_HEIGHT = .76;
const BEDROOM_RAIL_GAP = .62;

function Guard({ from, to }: { from: [number, number]; to: [number, number] }) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  const spans = Math.ceil(length / .68);
  return <>
    <SoftBox dims={[.064, .055, length + .04]} position={[(from[0] + to[0]) / 2, GUARD_HEIGHT, (from[1] + to[1]) / 2]}
      rotation-y={Math.atan2(dx, dz)} color={DARK_WOOD} radius={.018} />
    {Array.from({ length: spans + 1 }, (_, index) => {
      const t = index / spans;
      return <SoftBox key={index} dims={[.035, GUARD_HEIGHT, .035]} radius={.008} metalness={.55} color={BRASS}
        position={[from[0] + dx * t, GUARD_HEIGHT / 2, from[1] + dz * t]} />;
    })}
  </>;
}

/** The bedroom deck's rail leaves the west landing open for the stairs. */
export function BedroomGuard() {
  const left = CABIN_DIVIDER_X - shift + .035;
  const right = CABIN_DIVIDER_X - .035;
  const front = 3.10;
  const opening = CABIN_STAIRS.width / 2;
  return <group name="Bedroom_Guardrail">
    <Guard from={[left, -3.16]} to={[left, CABIN_STAIRS.upperZ - opening]} />
    <Guard from={[left, CABIN_STAIRS.upperZ + opening]} to={[left, front]} />
    <Guard from={[left, front]} to={[right, front]} />
    <group name="Bedroom_Right_Guardrail">
      <Guard from={[right, front]} to={[right, BEDROOM_WALL_FRONT + BEDROOM_RAIL_GAP]} />
    </group>
  </group>;
}

function StairLandingWall() {
  const visible = useContext(UpperDeckVisibility);
  const { left, right, back, front, height } = STAIR_LANDING_WALL;
  const width = right - left, depth = front - back;
  const ivory = '#e3d3b5', sage = '#879581';
  const dadoBase = .161, dadoTop = 1.115, rows = 7;
  const rowHeight = (dadoTop - dadoBase) / rows;
  return <group name="Stair_Landing_Wall" visible={visible}
    position={[(left + right) / 2, upperY, (back + front) / 2]}
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <SoftBox dims={[width, height - .02, depth]} radius={.012} color="#ebe3cf" roughness={.78}
      position={[0, (height - .02) / 2, 0]} />
    <SoftBox dims={[width + .022, .052, depth + .024]} radius={.014} color={ivory}
      position={[0, height - .026, 0]} />
    <SoftBox dims={[width, .165, .045]} radius={.012} color={ivory} position={[0, .0825, depth / 2 + .014]} />
    <SoftBox dims={[width - .008, dadoTop - dadoBase, .012]} radius={.002} color="#727f6b" roughness={.78}
      position={[0, (dadoBase + dadoTop) / 2, depth / 2 + .003]} />
    {Array.from({ length: rows }, (_, row) => <SoftBox key={row} dims={[width - .008, rowHeight - .004, .026]}
      radius={.003} color={sage} roughness={.78} position={[0, dadoBase + rowHeight * (row + .5), depth / 2 + .009]} />)}
    <SoftBox dims={[width, .036, .041]} radius={.008} color={sage} roughness={.78}
      position={[0, dadoTop + .012, depth / 2 + .010]} />
  </group>;
}

export function CabinStaircase({ onCross }: { onCross: () => void }) {
  const { x, width, lowerZ, upperZ, steps } = CABIN_STAIRS;
  const flightAngle = Math.atan2(upperY, STAIR_RUN);
  const flightLength = Math.hypot(upperY, STAIR_RUN);
  const centerZ = (lowerZ + upperZ) / 2;
  const guardX = x - width / 2 + .045;
  const insideX = x + width / 2 - .045;
  const outerEdge = x - width / 2;
  const platformWidth = CABIN_DIVIDER_X - outerEdge + .08;
  const platformCenter = outerEdge + platformWidth / 2;
  const click = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.delta <= 5) onCross();
  };
  return <>
    <group name="Cabin_Staircase" onClick={click} onPointerDown={event => event.stopPropagation()}>
      <SoftBox name="Stair_Lower_Landing" dims={[platformWidth, .21, width]} color={WOOD} radius={.026}
        position={[platformCenter, -.105, lowerZ]} />
      <SoftBox name="Stair_Upper_Landing" dims={[platformWidth, .23, width]} color={WOOD} radius={.026}
        position={[platformCenter, upperY - .115, STAIR_UPPER_PLATFORM_BACK + width / 2]} />
      <group position-y={upperY}>
        <Guard from={[guardX, upperZ]} to={[guardX, STAIR_LANDING_WALL.front]} />
      </group>
      {[guardX, insideX].map(side => <SoftBox key={side} dims={[.12, .23, flightLength]} radius={.026} color={DARK_WOOD}
        position={[side, upperY / 2 - .15, centerZ]} rotation-x={flightAngle} />)}
      {Array.from({ length: steps }, (_, index) => {
        const y = (index + 1) * STAIR_RISE;
        const z = lowerZ - (index + .5) * STAIR_TREAD_RUN;
        return <group key={index} name={`Stair_Tread_${index + 1}`}>
          <SoftBox dims={[width - .04, .07, STAIR_TREAD_RUN + .024]} radius={.014} color={WOOD} position={[x, y - .035, z]} />
          <SoftBox dims={[width - .11, STAIR_RISE, .044]} radius={.01} color={DARK_WOOD}
            position={[x, y - .07 - STAIR_RISE / 2, z + STAIR_TREAD_RUN / 2 - .035]} />
        </group>;
      })}
      {[guardX, insideX].map(side => {
        // The inside rail stops short at both platforms, leaving the turn into each room open.
        const inset = side === insideX ? .14 : 0;
        return <group key={side}>
          <SoftBox dims={[.065, .052, flightLength * (1 - 2 * inset) + .06]} position={[side, upperY / 2 + GUARD_HEIGHT, centerZ]}
            rotation-x={flightAngle} radius={.018} color={DARK_WOOD} />
          {Array.from({ length: 7 }, (_, index) => {
            const t = inset + index * (1 - 2 * inset) / 6;
            return <SoftBox key={index} dims={[.035, GUARD_HEIGHT, .035]} radius={.008} metalness={.55} color={BRASS}
              position={[side, t * upperY + GUARD_HEIGHT / 2, lowerZ - STAIR_RUN * t]} />;
          })}
        </group>;
      })}
    </group>
    <StairLandingWall />
  </>;
}
