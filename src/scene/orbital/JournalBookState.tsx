import React, { createContext, useContext, useEffect, useRef } from 'react';
import { createBookControl, type BoundBookControl } from './book-study/control';

export type JournalBookState = BoundBookControl;
const JournalContext = createContext<React.MutableRefObject<JournalBookState> | null>(null);
const ReaderContext = createContext<React.MutableRefObject<BoundBookControl & { turn?: (direction: number) => void }> | null>(null);
export function JournalBookProvider({ children }: { children: React.ReactNode }) {
  const state = useRef<JournalBookState>(createBookControl());
  const reader = useRef<BoundBookControl & { turn?: (direction: number) => void }>(createBookControl());
  useEffect(() => () => {
    state.current.textures.forEach(texture => texture.dispose());
    reader.current.textures.forEach(texture => texture.dispose());
  }, []);
  return <JournalContext.Provider value={state}><ReaderContext.Provider value={reader}>{children}</ReaderContext.Provider></JournalContext.Provider>;
}
export const useJournalBook = () => useContext(JournalContext)!;
export const useReadingBook = () => useContext(ReaderContext)!;
