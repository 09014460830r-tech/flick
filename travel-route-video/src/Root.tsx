import {Composition} from 'remotion';
import {TravelRoute} from './TravelRoute';
import {TOTAL_FRAMES, FPS} from './timeline';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="TravelRoute"
    component={TravelRoute}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
