"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hero scene in WebGL: the patient (left) and the doctor (right) are glossy tokens; money travels between them over an
 * arc, through the CareGuard contract on Arc at the top. Coins leave the patient in their own currency and arrive at the
 * doctor as USDC. Decorative: the page text says the same thing. three.js loads after first paint, client-only.
 */

const PURPLE = "#4F3BD6";
const LAVENDER = "#9C8CFF";
const GREEN = "#13865A";

type Label = { key: string; title: string; text: string; tone?: "strong" | "ok" };
const LABELS: Label[] = [
  { key: "patient", title: "Patient", text: "pays in their own currency" },
  { key: "arc", title: "CareGuard on Arc", text: "holds it in USDC", tone: "strong" },
  { key: "doctor", title: "Doctor", text: "paid per approved charge" },
];

/** Draws an icon onto a round token face. */
function faceTexture(THREE: typeof import("three"), bg: [string, string], draw: (c: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d")!;
  const g = c.createRadialGradient(200, 170, 40, 256, 256, 300);
  g.addColorStop(0, bg[0]);
  g.addColorStop(1, bg[1]);
  c.fillStyle = g;
  c.fillRect(0, 0, 512, 512);
  draw(c);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function person(c: CanvasRenderingContext2D, color: string) {
  c.fillStyle = color;
  c.beginPath();
  c.arc(256, 196, 70, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.moveTo(126, 402);
  c.bezierCurveTo(126, 316, 186, 282, 256, 282);
  c.bezierCurveTo(326, 282, 386, 316, 386, 402);
  c.quadraticCurveTo(386, 414, 374, 414);
  c.lineTo(138, 414);
  c.quadraticCurveTo(126, 414, 126, 402);
  c.fill();
}

function stethoscope(c: CanvasRenderingContext2D) {
  c.strokeStyle = "#fff";
  c.lineWidth = 13;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(212, 292);
  c.quadraticCurveTo(206, 360, 256, 366);
  c.quadraticCurveTo(306, 360, 300, 292);
  c.stroke();
  c.beginPath();
  c.moveTo(256, 366);
  c.lineTo(256, 384);
  c.stroke();
  c.beginPath();
  c.arc(256, 394, 14, 0, Math.PI * 2);
  c.fillStyle = "#fff";
  c.fill();
  // Cross badge.
  c.fillStyle = GREEN;
  c.beginPath();
  c.arc(360, 150, 46, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#fff";
  c.fillRect(352, 122, 16, 56);
  c.fillRect(332, 142, 56, 16);
}

function shield(c: CanvasRenderingContext2D) {
  c.strokeStyle = "#fff";
  c.lineWidth = 26;
  c.lineJoin = "round";
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(256, 106);
  c.lineTo(376, 150);
  c.lineTo(376, 250);
  c.bezierCurveTo(376, 330, 324, 386, 256, 410);
  c.bezierCurveTo(188, 386, 136, 330, 136, 250);
  c.lineTo(136, 150);
  c.closePath();
  c.stroke();
  c.beginPath();
  c.moveTo(200, 258);
  c.lineTo(242, 300);
  c.lineTo(316, 222);
  c.stroke();
}

function symbol(text: string, ink: string) {
  return (c: CanvasRenderingContext2D) => {
    c.fillStyle = ink;
    c.font = "800 250px system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, 256, 272);
  };
}

export function HeroArc() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      if (disposed || !wrap.current || !canvasRef.current) return;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true, alpha: true });
      } catch {
        setFailed(true);
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      const key = new THREE.DirectionalLight("#ffffff", 1.4);
      key.position.set(-4, 6, 8);
      scene.add(key, new THREE.AmbientLight("#ffffff", 0.6));

      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
      const world = new THREE.Group();
      scene.add(world);
      const disposables: { dispose: () => void }[] = [pmrem];
      const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);

      // A coin-shaped token: rounded rim, front face carries the icon.
      const tokenGeometry = (radius: number, depth: number, bevel: number) => {
        const pts: import("three").Vector2[] = [new THREE.Vector2(0, -depth / 2)];
        for (let i = 0; i <= 8; i++) {
          const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2);
          pts.push(new THREE.Vector2(radius - bevel + Math.cos(a) * bevel, -depth / 2 + bevel + Math.sin(a) * bevel));
        }
        for (let i = 0; i <= 8; i++) {
          const a = (i / 8) * (Math.PI / 2);
          pts.push(new THREE.Vector2(radius - bevel + Math.cos(a) * bevel, depth / 2 - bevel + Math.sin(a) * bevel));
        }
        pts.push(new THREE.Vector2(0, depth / 2));
        const g = new THREE.LatheGeometry(pts, 96);
        g.rotateX(Math.PI / 2);
        return track(g);
      };
      const token = (radius: number, depth: number, rim: string, map: import("three").Texture) => {
        const group = new THREE.Group();
        const body = new THREE.Mesh(
          tokenGeometry(radius, depth, depth * 0.45),
          track(new THREE.MeshPhysicalMaterial({ color: rim, roughness: 0.28, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.12 })),
        );
        const face = new THREE.Mesh(
          track(new THREE.CircleGeometry(radius - depth * 0.42, 96)),
          track(new THREE.MeshPhysicalMaterial({ map: track(map), roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 })),
        );
        face.position.z = depth / 2 + 0.002;
        group.add(body, face);
        return group;
      };

      // Soft contact shadow under a token.
      const shadowCanvas = document.createElement("canvas");
      shadowCanvas.width = shadowCanvas.height = 128;
      const sc = shadowCanvas.getContext("2d")!;
      const sg = sc.createRadialGradient(64, 64, 0, 64, 64, 64);
      sg.addColorStop(0, "rgba(30,20,90,0.55)");
      sg.addColorStop(1, "rgba(30,20,90,0)");
      sc.fillStyle = sg;
      sc.fillRect(0, 0, 128, 128);
      const shadowMap = track(new THREE.CanvasTexture(shadowCanvas));
      const shadow = (w: number) => {
        const m = new THREE.Mesh(track(new THREE.PlaneGeometry(w, w * 0.32)), track(new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false })));
        world.add(m);
        return m;
      };

      // The three actors.
      const P = new THREE.Vector3(-3.25, -0.55, 0);
      const D = new THREE.Vector3(3.25, -0.55, 0);
      const curve = new THREE.CubicBezierCurve3(P.clone(), new THREE.Vector3(-2.2, 3.1, 0.4), new THREE.Vector3(2.2, 3.1, 0.4), D.clone());
      const A = curve.getPoint(0.5);

      const patient = token(0.95, 0.34, "#FFFFFF", faceTexture(THREE, ["#FFFFFF", "#E6E1FF"], (c) => person(c, PURPLE)));
      const doctor = token(0.95, 0.34, "#FFFFFF", faceTexture(THREE, ["#FFFFFF", "#DDF3E8"], (c) => (person(c, GREEN), stethoscope(c))));
      const arc = token(1.05, 0.38, "#5B47E0", faceTexture(THREE, ["#8F7DFF", PURPLE], shield));
      patient.position.copy(P);
      doctor.position.copy(D);
      arc.position.copy(A);
      patient.rotation.y = 0.32;
      doctor.rotation.y = -0.32;
      world.add(patient, doctor, arc);
      const shadows = [shadow(2.2), shadow(2.2)];

      // Orbit rings around the Arc token.
      const ringMat = track(new THREE.MeshPhysicalMaterial({ color: LAVENDER, emissive: LAVENDER, emissiveIntensity: 0.35, roughness: 0.2, metalness: 0.3, clearcoat: 1 }));
      const rings = [1.55, 1.85].map((r, i) => {
        const ring = new THREE.Mesh(track(new THREE.TorusGeometry(r, i === 0 ? 0.03 : 0.018, 16, 160)), ringMat);
        ring.position.copy(A);
        ring.rotation.set(1.15 + i * 0.25, i * 0.4, 0);
        world.add(ring);
        return ring;
      });
      // The soft glow behind Arc is CSS (.hero-arc::before), so it blends with the page in both themes.

      // The arc itself: a tube with light pulses flowing from patient to doctor, purple turning green after Arc.
      const tubeMat = track(
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color(LAVENDER) }, uB: { value: new THREE.Color("#3FC48A") } },
          vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
          fragmentShader:
            "uniform float uTime; uniform vec3 uA; uniform vec3 uB; varying vec2 vUv;" +
            "void main(){ vec3 c = mix(uA, uB, smoothstep(0.45, 0.62, vUv.x));" +
            "float p = pow(fract(vUv.x * 4.0 - uTime * 0.5), 10.0);" +
            "float fade = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);" +
            "gl_FragColor = vec4(c + p * 0.7, (0.6 + p * 0.4) * fade); }",
        }),
      );
      world.add(new THREE.Mesh(track(new THREE.TubeGeometry(curve, 240, 0.045, 12, false)), tubeMat));

      // Coins: €, ¥, $ on the way in; USDC on the way out.
      const coinGeo = tokenGeometry(0.3, 0.09, 0.04);
      const coinFace = track(new THREE.CircleGeometry(0.27, 48));
      const coinKinds = [
        { rim: "#F2B53A", tex: faceTexture(THREE, ["#FFE08A", "#F2B53A"], symbol("€", "#7A4A00")) },
        { rim: "#F2B53A", tex: faceTexture(THREE, ["#FFE08A", "#F2B53A"], symbol("¥", "#7A4A00")) },
        { rim: "#F2B53A", tex: faceTexture(THREE, ["#FFE08A", "#F2B53A"], symbol("$", "#7A4A00")) },
      ];
      const usdc = { rim: "#2775CA", tex: faceTexture(THREE, ["#5B9BE6", "#2775CA"], symbol("$", "#FFFFFF")) };
      const coinMesh = (k: { rim: string; tex: import("three").Texture }) => {
        const g = new THREE.Group();
        const body = new THREE.Mesh(coinGeo, track(new THREE.MeshPhysicalMaterial({ color: k.rim, metalness: 0.55, roughness: 0.25, clearcoat: 1 })));
        const front = new THREE.Mesh(coinFace, track(new THREE.MeshPhysicalMaterial({ map: track(k.tex), metalness: 0.3, roughness: 0.3, clearcoat: 1 })));
        const back = front.clone();
        front.position.z = 0.046;
        back.position.z = -0.046;
        back.rotation.y = Math.PI;
        g.add(body, front, back);
        return g;
      };
      const coins = Array.from({ length: 6 }, (_, i) => {
        const inbound = coinMesh(coinKinds[i % 3]);
        const outbound = coinMesh(usdc);
        world.add(inbound, outbound);
        return { inbound, outbound, offset: i / 6 };
      });

      // Sizing: keep the whole scene in frame at any width.
      const fit = () => {
        const el = wrap.current;
        if (!el) return;
        const w = el.clientWidth;
        const h = el.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        const halfW = camera.aspect < 1.3 ? 5.1 : 4.45; // narrow screens: leave room for the labels
        const z = Math.max(10, halfW / (Math.tan((camera.fov * Math.PI) / 360) * camera.aspect));
        camera.position.set(0, 0.8, z);
        camera.lookAt(0, 0.55, 0);
        camera.updateProjectionMatrix();
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(wrap.current);

      const pointer = { x: 0, y: 0 };
      const onMove = (e: PointerEvent) => {
        const r = wrap.current?.getBoundingClientRect();
        if (!r) return;
        pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      };
      window.addEventListener("pointermove", onMove, { passive: true });

      let visible = true;
      const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
      io.observe(wrap.current);
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const v = new THREE.Vector3();
      const placeLabel = (k: string, p: import("three").Vector3) => {
        const el = labelRefs.current[k];
        if (!el || !wrap.current) return;
        v.copy(p).applyMatrix4(world.matrixWorld).project(camera);
        const half = el.offsetWidth / 2 + 4;
        const x = Math.min(wrap.current.clientWidth - half, Math.max(half, ((v.x + 1) / 2) * wrap.current.clientWidth));
        const y = ((1 - v.y) / 2) * wrap.current.clientHeight;
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, 0)`;
        el.style.opacity = "1";
      };

      const clock = new THREE.Clock();
      let raf = 0;
      const frame = () => {
        raf = requestAnimationFrame(frame);
        if (!visible) return;
        const t = still ? 2.2 : clock.getElapsedTime();

        world.rotation.y += (pointer.x * 0.18 - world.rotation.y) * 0.05;
        world.rotation.x += (pointer.y * 0.07 - world.rotation.x) * 0.05;

        const bob = (g: import("three").Object3D, base: import("three").Vector3, phase: number) => {
          g.position.y = base.y + Math.sin(t * 1.1 + phase) * 0.09;
        };
        bob(patient, P, 0);
        bob(doctor, D, 1.7);
        bob(arc, A, 0.8);
        patient.rotation.y = 0.32 + Math.sin(t * 0.6) * 0.08;
        doctor.rotation.y = -0.32 + Math.sin(t * 0.6 + 1.3) * 0.08;
        arc.rotation.y = Math.sin(t * 0.7) * 0.18;
        rings[0].rotation.z = t * 0.35;
        rings[1].rotation.z = -t * 0.25;
        [patient, doctor].forEach((g, i) => {
          const s = shadows[i];
          s.position.set(g.position.x, (i ? D : P).y - 1.18, 0);
          s.rotation.x = -Math.PI / 2;
          (s.material as import("three").MeshBasicMaterial).opacity = 0.75 - (g.position.y - P.y) * 1.2;
        });
        tubeMat.uniforms.uTime.value = t;

        for (const c of coins) {
          const u = (t * 0.11 + c.offset) % 1;
          const pos = curve.getPoint(u);
          // Coins disappear into Arc and come out as USDC.
          const inside = Math.abs(u - 0.5) < 0.06;
          const ends = Math.min(1, u / 0.07, (1 - u) / 0.07);
          c.inbound.visible = u < 0.5 && !inside;
          c.outbound.visible = u >= 0.5 && !inside;
          for (const m of [c.inbound, c.outbound]) {
            m.position.copy(pos);
            m.position.z += 0.25;
            m.scale.setScalar(Math.max(0.001, ends));
            m.rotation.y = t * 2.2 + c.offset * 6;
          }
        }

        placeLabel("patient", new THREE.Vector3(P.x, P.y - 1.4, 0));
        placeLabel("doctor", new THREE.Vector3(D.x, D.y - 1.4, 0));
        placeLabel("arc", new THREE.Vector3(A.x, A.y - 1.95, 0));
        placeLabel("agent", new THREE.Vector3(D.x + 0.15, D.y + 1.95, 0));
        renderer.render(scene, camera);
      };
      frame();

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        window.removeEventListener("pointermove", onMove);
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
      };
    })().catch(() => setFailed(true));

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <div ref={wrap} className="hero-arc" aria-hidden="true">
      {failed ? (
        <div className="flex h-full items-center justify-center gap-3 text-sm font-bold">
          <span className="rounded-full border border-line bg-card px-4 py-2">Patient</span>→
          <span className="rounded-full bg-strong px-4 py-2 text-white">Arc</span>→
          <span className="rounded-full border border-line bg-card px-4 py-2">Doctor</span>
        </div>
      ) : (
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      )}
      {!failed && (
        <>
          {LABELS.map((l) => (
            <div key={l.key} ref={(el) => void (labelRefs.current[l.key] = el)} className={`hero-tag ${l.tone === "strong" ? "hero-tag-strong" : ""}`}>
              <strong>{l.title}</strong>
              <span>{l.text}</span>
            </div>
          ))}
          <div ref={(el) => void (labelRefs.current.agent = el)} className="hero-tag hero-tag-agent">
            <span className="dot" /> AI agent paid charge #3 · 300.00 USDC
          </div>
        </>
      )}
    </div>
  );
}
