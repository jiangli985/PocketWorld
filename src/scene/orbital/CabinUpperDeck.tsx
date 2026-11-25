import React, { createContext, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { UPPER_DECK_OFFSET } from './cabinLayout';
import { createCabinGroupFade, type CabinOpacity } from './cabinCutaway';

export const CabinOpacityContext = createContext<React.MutableRefObject<CabinOpacity> | null>(null);

export function CabinFadeGroup({ part, name, position, children }: React.PropsWithChildren<{
  part: keyof CabinOpacity;
  name?: string;
  position?: [number, number, number];
}>) {
  const cutaway = useContext(CabinOpacityContext);
  const group = useRef<Group>(null);
  const applied = useRef<number>();
  const fade = useMemo(createCabinGroupFade, []);
  const opacity = () => {
    const state = cutaway?.current;
    return state ? state.interior * (part === 'interior' ? 1 : state[part]) : 1;
  };
  useLayoutEffect(() => fade.restore, [fade]);
  useFrame(() => {
    const amount = opacity();
    if (!group.current || (amount === applied.current && (amount === 0 || amount === 1))) return;
    fade.set(group.current, amount);
    applied.current = amount;
  });
  return <group ref={group} name={name} position={position} visible={opacity() > 0}>
    {children}
  </group>;
}

export function CabinUpperDeck({ children }: React.PropsWithChildren) {
  return <CabinFadeGroup part="upper" name="Cabin_UpperDeck" position={UPPER_DECK_OFFSET}>{children}</CabinFadeGroup>;
}
