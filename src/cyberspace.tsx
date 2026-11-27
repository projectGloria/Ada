// Ported from Brain's animated background for Ada's Gloria theme.
import { useEffect, useRef } from "react";

interface NodePoint {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  bright: boolean;
  phase: number;
}

interface PacketPulse {
  from: number;
  to: number;
  t: number;
  speed: number;
  bright: boolean;
}

export function CyberspaceBg() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const mouse = { x: width * 0.5, y: height * 0.42, active: false };

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    };

    const handleMouseLeave = () => {
      mouse.active = false;
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);

    const NODE_COUNT = 42;
    const nodes: NodePoint[] = Array.from({ length: NODE_COUNT }, (_, i) => ({
      x: Math.random() * width,
      y: Math.random() * (height * 0.78),
      vx: (Math.random() - 0.5) * 0.34,
      vy: (Math.random() - 0.5) * 0.28,
      radius: 1.3 + Math.random() * 1.8,
      bright: i % 4 === 0,
      phase: Math.random() * Math.PI * 2,
    }));

    const packets: PacketPulse[] = [];
    let gridOffset = 0;
    let rafId = 0;
    let lastTime = performance.now();

    const drawFrame = (now: number) => {
      const dt = Math.min((now - lastTime) / 16.6667, 2.5);
      lastTime = now;

      ctx.clearRect(0, 0, width, height);

      // Subtle monochrome atmospheric horizon glow over pure black
      const horizonY = height * 0.54;
      const horizonGlow = ctx.createRadialGradient(
        width * 0.5 + (mouse.active ? (mouse.x - width * 0.5) * 0.06 : 0),
        horizonY,
        20,
        width * 0.5,
        horizonY,
        Math.max(width, height) * 0.62
      );
      horizonGlow.addColorStop(0, "rgba(255, 255, 255, 0.075)");
      horizonGlow.addColorStop(0.42, "rgba(255, 255, 255, 0.028)");
      horizonGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = horizonGlow;
      ctx.fillRect(0, 0, width, height);

      // 3D Perspective Cyberspace Grid (lower half)
      if (!prefersReducedMotion) {
        gridOffset = (gridOffset + 0.012 * dt) % 1;
      }

      const vanishX =
        width * 0.5 + (mouse.active ? (mouse.x - width * 0.5) * 0.035 : 0);
      const gridTop = horizonY;
      const gridBottom = height + 40;
      const gridH = gridBottom - gridTop;

      // Horizon energy line
      const hLineGrad = ctx.createLinearGradient(0, gridTop, width, gridTop);
      hLineGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
      hLineGrad.addColorStop(0.25, "rgba(255, 255, 255, 0.2)");
      hLineGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.42)");
      hLineGrad.addColorStop(0.75, "rgba(255, 255, 255, 0.2)");
      hLineGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.strokeStyle = hLineGrad;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, gridTop);
      ctx.lineTo(width, gridTop);
      ctx.stroke();

      // Perspective vertical rays
      const rayCount = 22;
      for (let i = -rayCount; i <= rayCount; i++) {
        const spread = i / rayCount;
        const bottomX = vanishX + spread * width * 1.45;
        const isMajorRay = i % 4 === 0;
        ctx.strokeStyle = isMajorRay
          ? "rgba(255, 255, 255, 0.13)"
          : "rgba(255, 255, 255, 0.065)";
        ctx.lineWidth = isMajorRay ? 1.1 : 0.8;
        ctx.beginPath();
        ctx.moveTo(vanishX + spread * 48, gridTop);
        ctx.lineTo(bottomX, gridBottom);
        ctx.stroke();
      }

      // Scrolling horizontal depth lines (exponential perspective spacing)
      const hSlices = 14;
      for (let i = 0; i < hSlices; i++) {
        const rawT = (i + gridOffset) / hSlices;
        const easedT = Math.pow(rawT, 2.35);
        const y = gridTop + easedT * gridH;
        const alpha = 0.025 + easedT * 0.135;
        ctx.strokeStyle =
          i % 3 === 0
            ? `rgba(255, 255, 255, ${alpha * 1.15})`
            : `rgba(212, 212, 216, ${alpha * 0.85})`;
        ctx.lineWidth = 0.8 + easedT * 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Neural Constellation Network
      const linkDist = 175;
      const mouseRadius = 150;

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (!prefersReducedMotion) {
          n.x += n.vx * dt;
          n.y += n.vy * dt;
          n.phase += 0.03 * dt;

          if (mouse.active) {
            const dx = n.x - mouse.x;
            const dy = n.y - mouse.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > 4 && distSq < mouseRadius * mouseRadius) {
              const dist = Math.sqrt(distSq);
              const force = ((mouseRadius - dist) / mouseRadius) * 0.18 * dt;
              n.x += (dx / dist) * force * 2.2;
              n.y += (dy / dist) * force * 2.2;
            }
          }

          if (n.x < -20) n.x = width + 20;
          if (n.x > width + 20) n.x = -20;
          if (n.y < -20) n.y = height * 0.78;
          if (n.y > height * 0.8) n.y = -20;
        }
      }

      // Draw proximity filaments
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist < linkDist) {
            const strength = 1 - dist / linkDist;
            const isBright = a.bright || b.bright;
            ctx.strokeStyle = isBright
              ? `rgba(255, 255, 255, ${strength * 0.22})`
              : `rgba(212, 212, 216, ${strength * 0.14})`;
            ctx.lineWidth = 0.85;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();

            if (
              !prefersReducedMotion &&
              packets.length < 10 &&
              strength > 0.45 &&
              Math.random() < 0.0028
            ) {
              packets.push({
                from: i,
                to: j,
                t: 0,
                speed: 0.018 + Math.random() * 0.022,
                bright: isBright,
              });
            }
          }
        }
      }

      // Draw pointer neural tether lines near cursor
      if (mouse.active) {
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const dist = Math.hypot(n.x - mouse.x, n.y - mouse.y);
          if (dist < 165) {
            const strength = 1 - dist / 165;
            ctx.strokeStyle = `rgba(255, 255, 255, ${strength * 0.26})`;
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(mouse.x, mouse.y);
            ctx.lineTo(n.x, n.y);
            ctx.stroke();
          }
        }
      }

      // Traveling data pulse packets along edges
      for (let pIdx = packets.length - 1; pIdx >= 0; pIdx--) {
        const p = packets[pIdx];
        p.t += p.speed * dt;
        if (p.t >= 1) {
          packets.splice(pIdx, 1);
          continue;
        }
        const a = nodes[p.from];
        const b = nodes[p.to];
        const px = a.x + (b.x - a.x) * p.t;
        const py = a.y + (b.y - a.y) * p.t;

        ctx.fillStyle = p.bright
          ? "rgba(255, 255, 255, 0.95)"
          : "rgba(220, 220, 228, 0.85)";
        ctx.beginPath();
        ctx.arc(px, py, 2.0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw glowing constellation nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const pulse = 0.65 + 0.35 * Math.sin(n.phase);
        const haloRadius = n.radius * 4.2;
        const grad = ctx.createRadialGradient(
          n.x,
          n.y,
          0,
          n.x,
          n.y,
          haloRadius
        );
        grad.addColorStop(
          0,
          n.bright
            ? `rgba(255, 255, 255, ${0.58 * pulse})`
            : `rgba(220, 220, 228, ${0.42 * pulse})`
        );
        grad.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(n.x, n.y, haloRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = n.bright
          ? "rgba(255, 255, 255, 0.95)"
          : "rgba(224, 224, 230, 0.85)";
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * 0.72, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!prefersReducedMotion && !document.hidden) {
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    // Stop drawing while Ada is minimized or hidden so focus sessions stay cheap.
    const handleVisibility = () => {
      window.cancelAnimationFrame(rafId);
      if (document.hidden) return;
      lastTime = performance.now();
      if (prefersReducedMotion) drawFrame(lastTime);
      else rafId = window.requestAnimationFrame(drawFrame);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    const handleRedraw = () => { if (prefersReducedMotion) drawFrame(performance.now()); };
    window.addEventListener("resize", handleRedraw);

    if (prefersReducedMotion) {
      drawFrame(performance.now());
    } else {
      rafId = window.requestAnimationFrame(drawFrame);
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("resize", handleRedraw);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  return (
    <div className="cyberspace-bg" aria-hidden="true">
      <canvas ref={canvasRef} className="cyberspace-canvas" />
      <div className="cyberspace-scanlines" />
      <div className="cyberspace-vignette" />
    </div>
  );
}

// Gloria's figure from Brain's sidebar: floats in place, turns toward the mouse, and sits
// inside a slowly spinning reticle. Decorative only, so it's hidden from screen readers.
export function GloriaFigure() {
  const rig = useRef<HTMLDivElement | null>(null);
  const figure = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const rigEl = rig.current;
    const figureEl = figure.current;
    if (!rigEl || !figureEl) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const clamp = (value: number) => Math.max(-1, Math.min(1, value));
    const target = { nx: 0, ny: 0 };
    const current = { nx: 0, ny: 0 };
    let frame = 0;

    const onMove = (e: MouseEvent) => {
      const rect = rigEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      target.nx = clamp((e.clientX - (rect.left + rect.width * 0.5)) / Math.max(window.innerWidth * 0.42, 260));
      target.ny = clamp((e.clientY - (rect.top + rect.height * 0.42)) / Math.max(window.innerHeight * 0.42, 220));
    };
    const resetGaze = () => { target.nx = 0; target.ny = 0; };

    const tick = () => {
      current.nx += (target.nx - current.nx) * 0.12;
      current.ny += (target.ny - current.ny) * 0.12;
      const { nx, ny } = current;
      figureEl.style.transform = `perspective(700px) translate3d(${(nx * 2.5).toFixed(2)}px, ${(ny * 1.8).toFixed(2)}px, 0) ` +
        `rotateY(${(nx * 10).toFixed(2)}deg) rotateX(${(-ny * 6).toFixed(2)}deg) rotateZ(${(nx * 2.5).toFixed(2)}deg)`;
      frame = document.hidden ? 0 : window.requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      if (!document.hidden && !frame) frame = window.requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", resetGaze);
    window.addEventListener("blur", resetGaze);
    document.addEventListener("visibilitychange", onVisibility);
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", resetGaze);
      window.removeEventListener("blur", resetGaze);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <div className="gloria-stage" aria-hidden="true">
    <svg className="gloria-reticle" viewBox="0 0 220 220">
      <circle cx="110" cy="110" r="98" fill="none" stroke="rgba(255, 255, 255, 0.24)" strokeWidth="1" strokeDasharray="14 8 3 8" />
      <circle cx="110" cy="110" r="82" fill="none" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="1.2" strokeDasharray="36 22 6 22" />
      <path d="M 110 6 L 110 18 M 110 202 L 110 214 M 6 110 L 18 110 M 202 110 L 214 110"
        stroke="rgba(255, 255, 255, 0.7)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
    <div className="gloria-rig" ref={rig}>
      <img className="gloria-figure" ref={figure} src="/gloria.png" alt="" draggable={false} />
    </div>
    <div className="gloria-floor" />
  </div>;
}
