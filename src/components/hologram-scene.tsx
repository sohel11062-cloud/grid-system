"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Mode = "full" | "lite";

export function HologramScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef     = useRef({ tx: 0, ty: 0, cx: 0, cy: 0 });
  const [mode, setMode] = useState<Mode>("lite");

  useEffect(() => {
    const mq  = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mob = window.matchMedia("(max-width: 820px)");
    const update = () => setMode(mq.matches || mob.matches ? "lite" : "full");
    update();
    mq.addEventListener("change", update);
    mob.addEventListener("change", update);
    return () => { mq.removeEventListener("change", update); mob.removeEventListener("change", update); };
  }, []);

  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      mouseRef.current.tx = (e.clientX / window.innerWidth  - 0.5) * 2;
      mouseRef.current.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMouse, { passive: true });
    return () => window.removeEventListener("mousemove", onMouse);
  }, []);

  useEffect(() => {
    if (mode !== "full") return;
    const el = containerRef.current;
    if (!el) return;

    // ── Scene ────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#04060d", 0.009);

    const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.1, 300);
    camera.position.set(0, 0.4, 9.2);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor("#04060d", 0);
    el.appendChild(renderer.domElement);

    // ── Lights ───────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight("#c8e8ff", 0.5));
    const cL = new THREE.PointLight("#4df7ff", 70, 34); cL.position.set(5, 7, 5); scene.add(cL);
    const mL = new THREE.PointLight("#ff4fd8", 50, 26); mL.position.set(-4,-3, 4); scene.add(mL);
    const bL = new THREE.PointLight("#2c8bff", 38, 42); bL.position.set(0, 10,-6); scene.add(bL);
    const vL = new THREE.PointLight("#8b5cf6", 30, 32); vL.position.set(-8, 1, 3); scene.add(vL);

    // ── Starfield helper ─────────────────────────────────────────────────
    function mkStars(n: number, rMin: number, rMax: number, color: string, size: number, opacity: number) {
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        const r     = rMin + Math.random() * (rMax - rMin);
        pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
        pos[i*3+1] = r * Math.cos(phi);
        pos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      return new THREE.Points(g, new THREE.PointsMaterial({
        color, size, transparent: true, opacity, sizeAttenuation: true, depthWrite: false,
      }));
    }

    scene.add(mkStars(2600, 30, 110, "#ffffff", 0.065, 0.6));
    scene.add(mkStars(800,  16, 50,  "#4df7ff", 0.05,  0.42));
    scene.add(mkStars(450,  20, 60,  "#8b5cf6", 0.055, 0.32));

    // ── Neural network ───────────────────────────────────────────────────
    const N = 140;
    const nodes: { x: number; y: number; z: number }[] = [];
    const nPos = new Float32Array(N * 3);

    for (let i = 0; i < N; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 4 + Math.random() * 5;
      nodes.push({ x: r*Math.sin(phi)*Math.cos(theta), y: r*Math.cos(phi)*0.55, z: r*Math.sin(phi)*Math.sin(theta) });
      nPos[i*3]=nodes[i].x; nPos[i*3+1]=nodes[i].y; nPos[i*3+2]=nodes[i].z;
    }

    const nodeGeom = new THREE.BufferGeometry();
    nodeGeom.setAttribute("position", new THREE.BufferAttribute(nPos, 3));
    scene.add(new THREE.Points(nodeGeom, new THREE.PointsMaterial({
      color: "#4df7ff", size: 0.065, transparent: true, opacity: 0.8, depthWrite: false,
    })));

    // Connections
    const connArr: number[] = [];
    const D2 = 3.2 * 3.2;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dz = nodes[i].z - nodes[j].z;
        if (dx*dx + dy*dy + dz*dz < D2) {
          connArr.push(nodes[i].x,nodes[i].y,nodes[i].z, nodes[j].x,nodes[j].y,nodes[j].z);
        }
      }
    }
    const connGeom = new THREE.BufferGeometry();
    connGeom.setAttribute("position", new THREE.Float32BufferAttribute(connArr, 3));
    const netLines = new THREE.LineSegments(connGeom, new THREE.LineBasicMaterial({
      color: "#2c8bff", transparent: true, opacity: 0.1, depthWrite: false,
    }));
    scene.add(netLines);

    // ── Grid floor ───────────────────────────────────────────────────────
    const floor = new THREE.GridHelper(52, 38, "#2c8bff", "#0a1828");
    floor.position.y = -4;
    (floor.material as THREE.Material).transparent = true;
    (floor.material as THREE.Material).opacity = 0.18;
    scene.add(floor);

    // ── Central hologram ─────────────────────────────────────────────────
    const core = new THREE.Group();

    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.75, 2),
      new THREE.MeshBasicMaterial({ color: "#4df7ff", wireframe: true, transparent: true, opacity: 0.16 })
    );
    core.add(shell);

    const innerSph = new THREE.Mesh(
      new THREE.SphereGeometry(1.18, 28, 28),
      new THREE.MeshBasicMaterial({ color: "#7dd3fc", wireframe: true, transparent: true, opacity: 0.12 })
    );
    innerSph.rotation.x = Math.PI / 5;
    core.add(innerSph);

    const octaEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.OctahedronGeometry(3, 0)),
      new THREE.LineBasicMaterial({ color: "#8b5cf6", transparent: true, opacity: 0.18 })
    );
    core.add(octaEdge);

    // Rings
    const rings: { mesh: THREE.Mesh; axisX: boolean; speed: number }[] = [
      { mesh: new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.018, 16, 160), new THREE.MeshBasicMaterial({ color: "#ff4fd8", transparent: true, opacity: 0.8 })), axisX: true,  speed: 0.3 },
      { mesh: new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.013, 16, 160), new THREE.MeshBasicMaterial({ color: "#2c8bff", transparent: true, opacity: 0.72 })), axisX: false, speed: 0.22 },
      { mesh: new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.012, 16, 160), new THREE.MeshBasicMaterial({ color: "#4df7ff", transparent: true, opacity: 0.65 })), axisX: true,  speed: -0.38 },
    ];
    rings[0].mesh.rotation.x = Math.PI / 2;
    rings[1].mesh.rotation.z = Math.PI / 2;
    rings[2].mesh.rotation.x = Math.PI / 4;
    rings[2].mesh.rotation.z = Math.PI / 4;
    rings.forEach(({ mesh }) => core.add(mesh));

    scene.add(core);

    // Ambient particles
    const ambPts = mkStars(1200, 5, 11, "#4df7ff", 0.032, 0.55);
    scene.add(ambPts);

    // ── Render loop ──────────────────────────────────────────────────────
    const clock = new THREE.Clock();
    let raf = 0;

    function render() {
      const t = clock.getElapsedTime();
      const mr = mouseRef.current;

      // Mouse parallax — smooth lerp
      mr.cx += (mr.tx - mr.cx) * 0.04;
      mr.cy += (mr.ty - mr.cy) * 0.04;
      camera.position.x += (mr.cx * 0.7 - camera.position.x) * 0.055;
      camera.position.y += (-mr.cy * 0.4 + 0.4 - camera.position.y) * 0.055;
      camera.lookAt(0, 0, 0);

      // Core
      core.rotation.y = t * 0.15;
      core.rotation.z = Math.sin(t * 0.2) * 0.05;
      core.position.y = Math.sin(t * 0.5) * 0.18;
      shell.rotation.x = t * 0.08;
      innerSph.rotation.y = -t * 0.22;
      octaEdge.rotation.y = -t * 0.11;

      rings.forEach(({ mesh, axisX, speed }) => {
        if (axisX) mesh.rotation.z += speed * 0.016;
        else       mesh.rotation.x += speed * 0.016;
      });

      // Net
      (netLines.material as THREE.LineBasicMaterial).opacity = 0.07 + Math.sin(t * 0.7) * 0.045;

      // Ambient pts
      ambPts.rotation.y = -t * 0.02;
      ambPts.rotation.x = Math.sin(t * 0.1) * 0.05;

      // Light pulse
      cL.intensity = 65 + Math.sin(t * 1.1) * 14;
      mL.intensity = 45 + Math.sin(t * 0.85 + 1.1) * 10;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    }

    const onResize = () => {
      if (!el) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };

    window.addEventListener("resize", onResize);
    render();

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [mode]);

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <div
        ref={containerRef}
        className={`absolute inset-0 transition-opacity duration-700 ${mode === "full" ? "opacity-100" : "opacity-0"}`}
      />
      {/* CSS ambiance */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_18%_10%,rgba(77,247,255,0.08),transparent_28%),radial-gradient(ellipse_at_82%_14%,rgba(255,79,216,0.07),transparent_26%),radial-gradient(ellipse_at_50%_104%,rgba(44,139,255,0.1),transparent_32%),radial-gradient(ellipse_at_6%_78%,rgba(139,92,246,0.06),transparent_22%)]" />
      <div className="grid-scanlines absolute inset-0 opacity-20" />
      <div className="grid-noise absolute inset-0 opacity-16" />
      {/* Glow blobs */}
      <div className="absolute left-1/2 top-[12%] h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-grid-cyan/[0.048] blur-[100px]" />
      <div className="absolute left-[10%] top-[22%] h-72 w-72 rounded-full bg-grid-magenta/[0.048] blur-[75px]" />
      <div className="absolute bottom-[7%] right-[5%] h-80 w-80 rounded-full bg-grid-blue/[0.048] blur-[85px]" />
      <div className="absolute left-[62%] top-[55%] h-56 w-56 rounded-full bg-grid-violet/[0.04] blur-[65px]" />
      {mode === "lite" && (
        <div className="absolute inset-x-0 bottom-0 h-[55vh] bg-[linear-gradient(180deg,rgba(4,6,13,0)_0%,rgba(4,6,13,0.45)_38%,rgba(4,6,13,0.92)_100%)]" />
      )}
    </div>
  );
}