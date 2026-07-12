import React from "react";
import {
  AbsoluteFill, Img, OffthreadVideo, Sequence, Series, interpolate, spring,
  staticFile, useCurrentFrame, useVideoConfig, Easing,
} from "remotion";

// ---------- tokens ----------
const RED = "#E4002B";
const RED_DARK = "#7A0013";
const INK = "#0E1116";
const GOLD = "#F2A900";
const GREEN = "#3FB68B";
const SANS = "'Segoe UI', Arial, sans-serif";
const HEAVY: React.CSSProperties = { fontFamily: SANS, fontWeight: 900, letterSpacing: "-0.02em" };
const FPS = 30;
const s = (sec: number) => Math.round(sec * FPS);

// Recording marks (seconds, measured while recording on production):
// kiosk-journey: attract 0 · ordertype 3.54 · menu 5.75 · mealsize 10.29 · addon 15.52
//                accept1 19.72 · accept2 21.23 · review 22.73 · added 25.23 · cart 27.25
//                swap 31.26 · payment 34.49 · paying 37 · confirm 40.5 · end 44
// ops-view:      idle 0 · session 4.85 · inject 15.46 · browse 24.47 · xmas 31.72 · end 38.73

const DUR = { open: 150, goal: 270, trigger: 330, journey: s(35.5), xmas: 240, roi: 270 };
export const REAL_DURATION = Object.values(DUR).reduce((a, b) => a + b, 0);

// ---------- helpers ----------
const useIn = (delay = 0) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 200 } });
};

const FadeSlide: React.FC<{ delay?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ delay = 0, children, style }) => {
  const p = useIn(delay);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 34}px)`, ...style }}>{children}</div>;
};

const Kicker: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = GOLD }) => (
  <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 28, letterSpacing: ".22em", color, textTransform: "uppercase" }}>{children}</div>
);

const bucketStripes: React.CSSProperties = {
  position: "absolute", top: 0, bottom: 0, left: 0, width: 26,
  background: `repeating-linear-gradient(180deg, ${RED} 0 90px, #fff 90px 180px)`,
};

// lower-third caption bar for full-bleed footage
const Lower: React.FC<{ kicker: string; text: string; color?: string; delay?: number }> = ({ kicker, text, color, delay = 0 }) => (
  <FadeSlide delay={delay} style={{ position: "absolute", left: 90, bottom: 70, maxWidth: 1150 }}>
    <div style={{ background: "rgba(10,12,16,.88)", border: "1px solid rgba(255,255,255,.14)", borderLeft: `6px solid ${color ?? GOLD}`, borderRadius: 16, padding: "24px 34px" }}>
      <Kicker color={color}>{kicker}</Kicker>
      <div style={{ fontFamily: SANS, fontSize: 33, color: "#fff", fontWeight: 700, lineHeight: 1.35, marginTop: 8 }}>{text}</div>
    </div>
  </FadeSlide>
);

// ---------- scenes ----------
const Open: React.FC = () => {
  const logo = useIn(0);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1300px 800px at 50% 20%, #FF2E4E 0%, ${RED} 45%, ${RED_DARK} 100%)`, alignItems: "center", justifyContent: "center", gap: 34 }}>
      <Img src={staticFile("kfc-logo-white.png")} style={{ width: 330, opacity: logo, transform: `scale(${0.85 + logo * 0.15})`, filter: "drop-shadow(0 16px 46px rgba(0,0,0,.5))" }} />
      <FadeSlide delay={8}>
        <div style={{ ...HEAVY, fontSize: 78, color: "#fff", textAlign: "center", textShadow: "0 8px 36px rgba(0,0,0,.45)" }}>A kiosk with a salesperson&rsquo;s brain</div>
      </FadeSlide>
      <FadeSlide delay={18}>
        <div style={{ fontFamily: SANS, fontSize: 30, fontWeight: 800, color: "rgba(255,255,255,.95)", background: "rgba(0,0,0,.3)", padding: "10px 30px", borderRadius: 999 }}>
          🔴 recorded live on production · Team Sanhvo · AABW 2026
        </div>
      </FadeSlide>
    </AbsoluteFill>
  );
};

// full-bleed ops footage with captions
const OpsScene: React.FC<{ from: number; caps: { at: number; kicker: string; text: string; color?: string }[] }> = ({ from, caps }) => (
  <AbsoluteFill style={{ background: INK }}>
    <OffthreadVideo src={staticFile("ops-view.webm")} startFrom={s(from)} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
    {caps.map((c, i) => {
      const until = caps[i + 1]?.at;
      return (
        <Sequence key={i} from={s(c.at)} durationInFrames={until ? s(until - c.at) : undefined} layout="none">
          <Lower kicker={c.kicker} text={c.text} color={c.color} />
        </Sequence>
      );
    })}
  </AbsoluteFill>
);

// kiosk footage in a device frame + timed side captions
const JOURNEY_START = 8.5; // seconds into kiosk-journey.webm
const jAt = (markSec: number) => s(markSec - JOURNEY_START); // comp frame within journey scene

const JourneyScene: React.FC = () => {
  const caps: { at: number; kicker: string; lines: string[]; color?: string }[] = [
    { at: 10.4, kicker: "The agent plans", color: GREEN, lines: ["Customer picks 1 Miếng Gà Rán.", "The combo option is flagged honestly — “most picked”, or the real saving when there is one. Never a fake discount.", "They choose MÓN LẺ. Watch what the agent does about that."] },
    { at: 15.6, kicker: "The agent acts · cross-subsidy", color: GREEN, lines: ["ADD ON was computed BEFORE this screen opened — zero wait.", "Chicken with no drink → a drink leads (drinks run 90%+ margin).", "“Gà nóng cần ngụm mát lạnh…” — sensory copy, honest attach rates."] },
    { at: 19.8, kicker: "The customer says yes — twice", lines: ["Two suggestions accepted with two taps.", "Every impression and accept is logged for an honest AOV counterfactual."] },
    { at: 27.4, kicker: "The agent decides · kindness first", color: GREEN, lines: ["Separate items match a combo →", "it offers the CHEAPER swap: −12.000₫ OFF the bill.", "Trust is the strategy. Upsell is the side effect."] },
    { at: 34.6, kicker: "Outcome", lines: ["Order placed — a drink and a side they wanted,", "money saved on the combo, the exact journey they already knew."] },
  ];
  return (
    <AbsoluteFill style={{ background: INK, flexDirection: "row", alignItems: "center", padding: "0 80px 0 116px", gap: 60 }}>
      <div style={bucketStripes} />
      <div style={{ flex: 1.05, position: "relative", height: "100%" }}>
        {caps.map((c, i) => {
          const until = caps[i + 1]?.at;
          return (
            <Sequence key={i} from={jAt(c.at)} durationInFrames={until ? jAt(until) - jAt(c.at) : undefined} layout="none">
              <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 22, maxWidth: 860 }}>
                <FadeSlide><Kicker color={c.color}>{c.kicker}</Kicker></FadeSlide>
                {c.lines.map((l, j) => (
                  <FadeSlide key={j} delay={6 + j * 7}>
                    <div style={{ fontFamily: SANS, fontSize: 36, color: j === 0 ? "#fff" : "#C7CBD4", fontWeight: j === 0 ? 800 : 500, lineHeight: 1.4 }}>{l}</div>
                  </FadeSlide>
                ))}
              </div>
            </Sequence>
          );
        })}
      </div>
      <div style={{ flex: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ borderRadius: 34, overflow: "hidden", border: "10px solid #1B2130", boxShadow: "0 40px 120px rgba(0,0,0,.6)", width: 545, height: 969 }}>
          <OffthreadVideo src={staticFile("kiosk-journey.webm")} startFrom={s(JOURNEY_START)} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Roi: React.FC = () => {
  const frame = useCurrentFrame();
  const roi = Math.round(interpolate(frame, [8, 70], [0, 2200], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }));
  const cost = interpolate(frame, [8, 70], [0, 13], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ background: INK, alignItems: "center", justifyContent: "center", gap: 34 }}>
      <div style={bucketStripes} />
      <FadeSlide><Kicker>The business case — measured on production</Kicker></FadeSlide>
      <FadeSlide delay={6}>
        <div style={{ ...HEAVY, fontSize: 116, color: "#fff", textAlign: "center", lineHeight: 1.1 }}>
          <span style={{ color: GOLD }}>+15% AOV</span> · <span style={{ color: GREEN }}>{cost.toFixed(0)}₫</span>/session
        </div>
      </FadeSlide>
      <FadeSlide delay={14}>
        <div style={{ fontFamily: SANS, fontSize: 34, color: "#C7CBD4", textAlign: "center" }}>+28.000₫ per order · 35% suggestion acceptance · Cloudflare list prices, itemized live</div>
      </FadeSlide>
      <FadeSlide delay={22}>
        <div style={{ ...HEAVY, fontSize: 56, color: GOLD, border: `2px solid ${GOLD}`, borderRadius: 999, padding: "16px 56px", background: "rgba(242,169,0,.1)" }}>
          ≈ {roi.toLocaleString("en-US")}× return per customer
        </div>
      </FadeSlide>
      <FadeSlide delay={32}>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 34, color: "#fff" }}>kfc-kiosk-agent.gentle-sky-3b0e.workers.dev — touch it yourself</div>
      </FadeSlide>
      <FadeSlide delay={40}>
        <div style={{ fontFamily: SANS, fontSize: 24, color: "#8B93A3" }}>TinyFish · OpenAI gpt-oss-120b on Cloudflare Workers AI · D1 · Gemini · 70 tests green</div>
      </FadeSlide>
    </AbsoluteFill>
  );
};

export const RealDemo: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={DUR.open}><Open /></Series.Sequence>
    <Series.Sequence durationInFrames={DUR.goal}>
      {/* ops footage from t=0: idle desktop → customer starts (session mark 4.85s) */}
      <OpsScene from={0} caps={[
        { at: 0.4, kicker: "Business goal · KFC P2", text: "250+ stores, one static menu — 15–20% of order value left on the table. Target: +10–15% AOV, without hurting the experience.", color: GOLD },
        { at: 5.4, kicker: "No prompt. No chat.", text: "A customer walks up and taps start — the session itself wakes the agent. Watch the right side: that’s its brain.", color: GOLD },
      ]} />
    </Series.Sequence>
    <Series.Sequence durationInFrames={DUR.trigger}>
      {/* ops footage from t=13.5: camera frame arrives ~15.5s, hypothesis + dish window fill */}
      <OpsScene from={13.5} caps={[
        { at: 0.5, kicker: "Trigger · one glance", text: "A coarse camera frame — age band, group, never identity — reaches the profiler.", color: GREEN },
        { at: 4.0, kicker: "A living hypothesis", text: "“A mother and her child…” → dessert to complete the meal. And below: the ACTUAL dishes the agent would serve right now, each tagged with its strategy.", color: GREEN },
      ]} />
    </Series.Sequence>
    <Series.Sequence durationInFrames={DUR.journey}><JourneyScene /></Series.Sequence>
    <Series.Sequence durationInFrames={DUR.xmas}>
      {/* ops footage from t=30.6: xmas tap at 31.7 → kiosk re-themes, promo on */}
      <OpsScene from={30.6} caps={[
        { at: 0.5, kicker: "250 stores are not one store", text: "One tap: Christmas Eve. Festive skin, Noel promo live, overstocked desserts pushed — any store, any hour, any inventory reality.", color: GOLD },
      ]} />
    </Series.Sequence>
    <Series.Sequence durationInFrames={DUR.roi}><Roi /></Series.Sequence>
  </Series>
);
