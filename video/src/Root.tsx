import { Composition } from "remotion";
import { Demo, DEMO_DURATION } from "./Demo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="kfc-demo"
      component={Demo}
      durationInFrames={DEMO_DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
