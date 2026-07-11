import React from "react";
import {
  AbsoluteFill, Img, Series, interpolate, spring,
  staticFile, useCurrentFrame, useVideoConfig, Easing,
} from "remotion";

// ---------- design tokens (mirror the app) ----------
const RED = "#E4002B";
const RED_DARK = "#7A0013";
const INK = "#0E1116";
const GOLD = "#F2A900";
const GREEN = "#3FB68B";
const SANS = "'Segoe UI', Arial, sans-serif";
const HEAVY: React.CSSProperties = { fontFamily: SANS, fontWeight: 900, letterSpacing: "-0.02em" };

const DUR = { title: 135, problem: 195, kiosk: 240, profiler: 270, psy: 540, kind: 240, xmas: 240, money: 300, close: 300 };
export const DEMO_DURATION = Object.values(DUR).reduce((a, b) => a + b, 0); // 2460f = 82s

// ---------- helpers ----------
const useIn = (delay = 0) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 200 } });
};

const FadeSlide: React.FC<{ delay?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ delay = 0, children, style }) => {
  const p = useIn(delay);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 40}px)`, ...style }}>{children}</div>;
};

// screenshot with a slow Ken Burns drift inside a device-like frame
const Shot: React.FC<{ src: string; dur: number; delay?: number; maxH?: number }> = ({ src, dur, delay = 0, maxH = 900 }) => {
  const frame = useCurrentFrame();
  const p = useIn(delay);
  const zoom = interpolate(frame, [0, dur], [1, 1.05], { extrapolateRight: "clamp" });
  return (
    <div style={{
      opacity: p, transform: `translateY(${(1 - p) * 60}px)`,
      borderRadius: 24, overflow: "hidden", boxShadow: "0 40px 120px rgba(0,0,0,.55)",
      border: "1px solid rgba(255,255,255,.14)", maxHeight: maxH, display: "flex",
    }}>
      <Img src={staticFile(src)} style={{ maxHeight: maxH, width: "auto", transform: `scale(${zoom})` }} />
    </div>
  );
};

const Kicker: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = GOLD }) => (
  <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 30, letterSpacing: ".22em", color, textTransform: "uppercase" }}>{children}</div>
);

const bucketStripes: React.CSSProperties = {
  position: "absolute", top: 0, bottom: 0, left: 0, width: 28,
  background: `repeating-linear-gradient(180deg, ${RED} 0 90px, #fff 90px 180px)`,
};

// left text / right screenshot scene
const Split: React.FC<{ kicker: string; title: string; lines: string[]; src: string; dur: number; kickerColor?: string }> =
  ({ kicker, title, lines, src, dur, kickerColor }) => (
    <AbsoluteFill style={{ background: INK, flexDirection: "row", alignItems: "center", padding: "0 90px 0 118px", gap: 70 }}>
      <div style={bucketStripes} />
      <div style={{ flex: 1.1, display: "flex", flexDirection: "column", gap: 34 }}>
        <FadeSlide><Kicker color={kickerColor}>{kicker}</Kicker></FadeSlide>
        <FadeSlide delay={5}><div style={{ ...HEAVY, fontSize: 74, color: "#fff", lineHeight: 1.05 }}>{title}</div></FadeSlide>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {lines.map((l, i) => (
            <FadeSlide key={i} delay={16 + i * 9}>
              <div style={{ fontFamily: SANS, fontSize: 33, color: "#C7CBD4", lineHeight: 1.4 }}>{l}</div>
            </FadeSlide>
          ))}
        </div>
      </div>
      <div style={{ flex: 0.9, display: "flex", justifyContent: "center" }}>
        <Shot src={src} dur={dur} delay={8} />
      </div>
    </AbsoluteFill>
  );

// ---------- scenes ----------
const Title: React.FC = () => {
  const logo = useIn(0);
  return (
    <AbsoluteFill style={{
      background: `radial-gradient(1300px 800px at 50% 20%, #FF2E4E 0%, ${RED} 45%, ${RED_DARK} 100%)`,
      alignItems: "center", justifyContent: "center", gap: 44,
    }}>
      <Img src={staticFile("kfc-logo-white.png")} style={{
        width: 400, opacity: logo, transform: `scale(${0.8 + logo * 0.2})`,
        filter: "drop-shadow(0 18px 50px rgba(0,0,0,.5))",
      }} />
      <FadeSlide delay={12}>
        <div style={{ ...HEAVY, fontSize: 86, color: "#fff", textAlign: "center", textShadow: "0 8px 40px rgba(0,0,0,.45)" }}>
          A kiosk with a<br />salesperson&rsquo;s brain
        </div>
      </FadeSlide>
      <FadeSlide delay={26}>
        <div style={{ fontFamily: SANS, fontSize: 32, fontWeight: 700, color: "rgba(255,255,255,.92)" }}>
          Agentic AI Build Week 2026 · F&amp;B Track · KFC Vietnam (P2 + P4)
        </div>
      </FadeSlide>
    </AbsoluteFill>
  );
};

const Problem: React.FC = () => (
  <AbsoluteFill style={{ background: INK, alignItems: "center", justifyContent: "center", gap: 44 }}>
    <div style={bucketStripes} />
    <FadeSlide><Kicker>The problem</Kicker></FadeSlide>
    {[
      ["250+ stores.", "One static menu, for everyone."],
      ["“You may also like”", "hand-picked by marketing, once a month."],
      ["15–20% of order value", "left on the table — KFC’s own estimate."],
    ].map(([b, r], i) => (
      <FadeSlide key={i} delay={14 + i * 22}>
        <div style={{ fontFamily: SANS, fontSize: 56, color: "#C7CBD4", textAlign: "center" }}>
          <span style={{ ...HEAVY, color: i === 2 ? GOLD : "#fff" }}>{b}</span> {r}
        </div>
      </FadeSlide>
    ))}
  </AbsoluteFill>
);

const Psychology: React.FC = () => {
  const third = DUR.psy / 3;
  return (
    <Series>
      <Series.Sequence durationInFrames={third}>
        <Split kicker="Buyer psychology · 1 of 3" kickerColor={GREEN}
          title="Loss aversion — pointed at the customer’s wallet"
          lines={["Every combo carries an honest, live-computed “TIẾT KIỆM” flag.", "It shows the saving before asking for anything."]}
          src="asset-mealsize.png" dur={third} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={third}>
        <Split kicker="Buyer psychology · 2 of 3" kickerColor={GREEN}
          title="The decoy tier"
          lines={["Upsize: Vừa +0 · Lớn +10.000₫ · Đại +12.000₫.", "The middle exists to make the jumbo the obviously smart choice —", "asymmetric dominance, the movie-popcorn play."]}
          src="asset-decoy.png" dur={third} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={third}>
        <Split kicker="Buyer psychology · 3 of 3" kickerColor={GREEN}
          title="Cross-subsidy: the drink leads"
          lines={["Chicken with no drink? A drink heads the slate — drinks run 90%+ margin.", "Sensory copy (“giòn rụm”, “mát lạnh”) with honest attach rates,", "computed before the customer even reaches this screen."]}
          src="asset-addon.png" dur={third} />
      </Series.Sequence>
    </Series>
  );
};

const Money: React.FC = () => {
  const frame = useCurrentFrame();
  const count = (to: number) => Math.round(interpolate(frame, [10, 70], [0, to], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }));
  const cost = interpolate(frame, [10, 70], [0, 12.6], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ background: INK, alignItems: "center", justifyContent: "center", gap: 40 }}>
      <div style={bucketStripes} />
      <FadeSlide><Kicker>The economics — measured, not promised</Kicker></FadeSlide>
      <div style={{ display: "flex", gap: 110, alignItems: "center" }}>
        <FadeSlide delay={8}>
          <div style={{ textAlign: "center" }}>
            <div style={{ ...HEAVY, fontSize: 150, color: GREEN }}>{cost.toFixed(1)}₫</div>
            <div style={{ fontFamily: SANS, fontSize: 32, color: "#C7CBD4" }}>infra cost per customer session<br />(Cloudflare list prices, itemized live)</div>
          </div>
        </FadeSlide>
        <FadeSlide delay={16}>
          <div style={{ ...HEAVY, fontSize: 80, color: "#565D6E" }}>vs</div>
        </FadeSlide>
        <FadeSlide delay={22}>
          <div style={{ textAlign: "center" }}>
            <div style={{ ...HEAVY, fontSize: 150, color: GOLD }}>+{count(28)}k₫</div>
            <div style={{ fontFamily: SANS, fontSize: 32, color: "#C7CBD4" }}>AOV lift per order (+15%)<br />35% suggestion acceptance</div>
          </div>
        </FadeSlide>
      </div>
      <FadeSlide delay={40}>
        <div style={{ ...HEAVY, fontSize: 58, color: "#fff", background: "rgba(242,169,0,.12)", border: `2px solid ${GOLD}`, borderRadius: 999, padding: "18px 60px" }}>
          ≈ {count(2200).toLocaleString("en-US")}× return, per customer
        </div>
      </FadeSlide>
    </AbsoluteFill>
  );
};

const Close: React.FC = () => (
  <AbsoluteFill style={{ background: INK, alignItems: "center", justifyContent: "center" }}>
    <Img src={staticFile("desktop-4k.png")} style={{ position: "absolute", width: "100%", opacity: 0.22 }} />
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 36 }}>
      <FadeSlide><Img src={staticFile("kfc-logo-white.png")} style={{ width: 220 }} /></FadeSlide>
      <FadeSlide delay={10}>
        <div style={{ ...HEAVY, fontSize: 66, color: "#fff", textAlign: "center" }}>Live now — touch it yourself</div>
      </FadeSlide>
      <FadeSlide delay={18}>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 40, color: GOLD, background: "rgba(0,0,0,.55)", padding: "16px 44px", borderRadius: 999, border: "1px solid rgba(242,169,0,.4)" }}>
          kfc-kiosk-agent.gentle-sky-3b0e.workers.dev
        </div>
      </FadeSlide>
      <FadeSlide delay={28}>
        <div style={{ fontFamily: SANS, fontSize: 30, color: "#C7CBD4", textAlign: "center", lineHeight: 1.6 }}>
          TinyFish (live menu crawl) · OpenAI gpt-oss-120b on Cloudflare Workers AI · D1 · Gemini imagery<br />
          One Worker · 106 real menu items · 70 automated tests, green on production
        </div>
      </FadeSlide>
    </div>
  </AbsoluteFill>
);

export const Demo: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={DUR.title}><Title /></Series.Sequence>
    <Series.Sequence durationInFrames={DUR.problem}><Problem /></Series.Sequence>
    <Series.Sequence durationInFrames={DUR.kiosk}>
      <Split kicker="The kiosk" title="The journey customers already know"
        lines={["The complete real KFC Vietnam menu — 106 items, crawled live by TinyFish agents.", "Native meal-builder flow. Nothing new to learn, nothing to re-educate."]}
        src="asset-attract.png" dur={DUR.kiosk} />
    </Series.Sequence>
    <Series.Sequence durationInFrames={DUR.profiler}>
      <Split kicker="The invisible profiler" title="Guesses, never assumes"
        lines={["One coarse camera glance — age band, group, never identity —", "plus every tap after it, feeding a living hypothesis with confidence.", "“A mother and her child…” → “a dessert to complete the meal.”", "Invisible to the customer. Visible to operations."]}
        src="asset-hypothesis.png" dur={DUR.profiler} />
    </Series.Sequence>
    <Series.Sequence durationInFrames={DUR.psy}><Psychology /></Series.Sequence>
    <Series.Sequence durationInFrames={DUR.kind}>
      <Split kicker="Kindness first" kickerColor={GREEN} title="It takes money OFF the bill"
        lines={["Separate items that match a combo? It offers the cheaper swap first.", "And once a meal is complete, it stops selling — no bundles on bundles.", "Trust is the strategy. Upsell is the side effect."]}
        src="asset-swap.png" dur={DUR.kind} />
    </Series.Sequence>
    <Series.Sequence durationInFrames={DUR.xmas}>
      <Split kicker="Scenario director" title="One tap: Christmas Eve"
        lines={["Holiday combos live, Noel promo active, festive skin on,", "overstocked desserts pushed before they’re wasted.", "250 stores are not one store — every situation is stageable."]}
        src="asset-xmas.png" dur={DUR.xmas} />
    </Series.Sequence>
    <Series.Sequence durationInFrames={DUR.money}><Money /></Series.Sequence>
    <Series.Sequence durationInFrames={DUR.close}><Close /></Series.Sequence>
  </Series>
);
