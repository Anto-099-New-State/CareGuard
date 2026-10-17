import type { CSSProperties, ReactNode } from "react";

/**
 * Isometric 3D scene, pure CSS: the patient (left) funds a contract vault on Arc (middle), and approved charges flow to
 * the hospital (right) while the AI agent checks each one. Decorative: the page text says the same thing.
 */

type BoxProps = {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  tone: "card" | "strong" | "ink";
  top?: ReactNode;
  front?: ReactNode;
  side?: ReactNode;
  className?: string;
};

/** A box standing on the floor: x/y on the floor, w×d footprint, h tall. Only the three faces the viewer sees. */
function Box({ x, y, w, d, h, tone, top, front, side, className = "" }: BoxProps) {
  const style = { left: x, top: y, width: w, height: d, "--h": `${h}px` } as CSSProperties;
  return (
    <div className={`scene-box tone-${tone} ${className}`} style={style}>
      <div className="face top">{top}</div>
      <div className="face front">{front}</div>
      <div className="face side">{side}</div>
    </div>
  );
}

/** A label that faces the viewer, floating above a point on the floor. */
function Tag({ x, y, z, children, className = "" }: { x: number; y: number; z: number; children: ReactNode; className?: string }) {
  return (
    <div className="scene-tag-anchor" style={{ left: x, top: y, "--z": `${z}px` } as CSSProperties}>
      <div className={`scene-tag ${className}`}>{children}</div>
    </div>
  );
}

const Windows = ({ n }: { n: number }) => (
  <div className="windows">
    {Array.from({ length: n }, (_, i) => (
      <span key={i} />
    ))}
  </div>
);

export function HeroScene() {
  return (
    <div className="scene" aria-hidden="true">
      <div className="scene-stage">
        <div className="scene-floor" />

        {/* Paths on the floor: patient → vault, vault → hospital. */}
        <div className="scene-path" style={{ left: 120, top: 222, width: 140 }} />
        <div className="scene-path path-out" style={{ left: 336, top: 222, width: 116 }} />

        {/* Coins: the patient's currency in, USDC out to the hospital. */}
        {["€", "$", "¥"].map((c, i) => (
          <div key={`in-${i}`} className="scene-coin coin-in" style={{ left: 118, top: 208, animationDelay: `${i * 1.1}s` }}>
            {c}
          </div>
        ))}
        {[0, 1].map((i) => (
          <div key={`out-${i}`} className="scene-coin coin-out" style={{ left: 334, top: 208, animationDelay: `${0.6 + i * 1.6}s` }}>
            $
          </div>
        ))}

        {/* Patient: a phone standing up, screen towards the viewer. */}
        <Box
          x={30}
          y={186}
          w={92}
          d={20}
          h={156}
          tone="ink"
          className="phone"
          front={
            <div className="screen">
              <span className="who">Maria L.</span>
              <span className="amt">360.00</span>
              <span className="btn-pill">Fund my share</span>
            </div>
          }
        />

        {/* Contract vault on Arc. */}
        <Box
          x={258}
          y={176}
          w={86}
          d={86}
          h={86}
          tone="strong"
          className="vault"
          top={
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          }
          front={<span className="vault-label">USDC</span>}
        />

        {/* Hospital: a building with windows, a door and a cross sign. */}
        <Box
          x={452}
          y={150}
          w={118}
          d={100}
          h={124}
          tone="card"
          className="hospital"
          top={<span className="helipad">H</span>}
          front={
            <>
              <span className="sign" />
              <Windows n={6} />
              <span className="door" />
            </>
          }
          side={<Windows n={4} />}
        />

        {/* Labels facing the viewer. */}
        <Tag x={76} y={196} z={196}>
          <strong>Patient</strong>
          <span>pays from their wallet</span>
        </Tag>
        <Tag x={300} y={210} z={176} className="tag-strong">
          <strong>CareGuard contract</strong>
          <span>holds the money on Arc</span>
        </Tag>
        <Tag x={548} y={168} z={196}>
          <strong>Hospital</strong>
          <span>paid per approved charge</span>
        </Tag>
        <Tag x={430} y={368} z={4} className="tag-agent">
          <span className="dot" /> AI agent approved charge #3
        </Tag>
      </div>
    </div>
  );
}
