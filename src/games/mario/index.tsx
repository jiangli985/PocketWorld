import type { GameCartridgeProps } from '../../types/game';
import FishingGame from './FishingGame';

export default function MarioGame(props: GameCartridgeProps) {
  return <FishingGame {...props} />;
}
