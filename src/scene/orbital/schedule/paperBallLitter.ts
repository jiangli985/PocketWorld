import { createContext, useContext } from 'react';
import type { PaperBall } from './schedule';

/** Floor paper balls shared with the resident so they block walking. */
export const PaperBallLitter = createContext<readonly PaperBall[]>([]);
export const usePaperBallLitter = () => useContext(PaperBallLitter);
