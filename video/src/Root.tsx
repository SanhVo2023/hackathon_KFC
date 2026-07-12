import { Composition } from "remotion";
import { Demo, DEMO_DURATION, Demo60, DEMO60_DURATION } from "./Demo";
import { RealDemo, REAL_DURATION } from "./RealDemo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="kfc-demo"
        component={Demo}
        durationInFrames={DEMO_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      {/* real-footage cut — live screen recordings of the production app */}
      <Composition
        id="kfc-demo-real"
        component={RealDemo}
        durationInFrames={REAL_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      {/* 60s judging cut — Goal → Trigger → Agent Acts → Outcome → Proof */}
      <Composition
        id="kfc-demo-60"
        component={Demo60}
        durationInFrames={DEMO60_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
