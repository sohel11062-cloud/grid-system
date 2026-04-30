"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type SceneMode = "full" | "lite";

function setMaterialOpacity(obj: THREE.Object3D, opacity: number) {
  obj.traverse((child) => {
    if (!("material" in child) || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((m) => { (m as THREE.Material).transparent = true; (m as THREE.Material).opacity = opacity; });
  });
}

export function HologramScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ tx: 0, ty: 0, x: 0, y: 0 });
  const [sceneMode, setSceneMode] = useState<SceneMode>("lite");

  // Global mouse tracking
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current.tx = (e.clientX / window.innerWidth  - 0.5) * 2;
      mouseRef.current.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Mode detection
  useEffect(() => {
    const mq  = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mob = window.matchMedia("(max-width: 820px)");
    const update = () => setSceneMode(mq.matches || mob.matches ? "lite" : "full");
    update();
    mq.addEventListener("change", update);
    mob.addEventListener("change", update);
    return () => { mq.removeEventListener("change", update); mob.removeEventListener("change", update); };
  }, []);

  useEffect(() => {
    if (sceneMode !== "full") return;
    const container = containerRef.current;
    if (!container) return;

    // ── Renderer ────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#04060d", 0.011);

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 300);
    camera.position.set(0, 0.4, 9);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor("#04060d", 0);
    container.appendChild(renderer.domElement);

    // ── Lights ──────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight("#c7e8ff", 0.55));
    const cyanL = new THREE.PointLight("#4df7ff", 65, 32); cyanL.position.set(5, 7, 5); scene.add(cyanL);
    const magL  = new THREE.PointLight("#ff4fd8", 45, 24); magL.position.set(-4, -3, 4); scene.add(magL);
    const bluL  = new THREE.PointLight("#2c8bff", 35, 40); bluL.position.set(0, 10, -6); scene.add(bluL);
    const vioL  = new THREE.PointLight("#8b5cf6", 28, 30); vioL.position.set(-7, 1, 3); scene.add(vioL);

    // ── Starfield ────────────────────────────────────────────────────────
    const mkStars = (count: number, rMin: number, rMax: number, color: string, size: number, opacity: number) => {
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        const r     = rMin + Math.random() * (rMax - rMin);
        pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.cos(phi);
        pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      return new THREE.Points(g, new THREE.PointsMaterial({ color, size, transparent: true, opacity, sizeAttenuation: true, depthWrite: false }));
    };
    scene.add(mkStars(2400, 28, 100, "#ffffff", 0.065, 0.65));
    scene.add(mkStars(700,  14, 45,  "#4df7ff", 0.05,  0.45));
    scene.add(mkStars(400,  18, 55,  "#8b5cf6", 0.055, 0.35));

    // ── Neural network ───────────────────────────────────────────────────
    const NODE_N = 150;
    const nodes: { x: number; y: number; z: number }[] = [];
    const nodePosArr = new Float32Array(NODE_N * 3);
    for (let i = 0; i < NODE_N; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 3.8 + Math.random() * 5.5;
      nodes.push({
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.cos(phi) * 0.6,
        z: r * Math.sin(phi) * Math.sin(theta),
      });
      nodePosArr[i * 3]     = nodes[i].x;
      nodePosArr[i * 3 + 1] = nodes[i].y;
      nodePosArr[i * 3 + 2] = nodes[i].z;
    }
    const nodeGeom = new THREE.BufferGeometry();
    nodeGeom.setAttribute("position", new THREE.BufferAttribute(nodePosArr, 3));
    scene.add(new THREE.Points(nodeGeom, new THREE.PointsMaterial({ color: "#4df7ff", size: 0.065, transparent: true, opacity: 0.85, sizeAttenuation: true, depthWrite: false })));

    // Connections
    const CONN_DIST = 3.2;
    const connArr: number[] = [];
    for (let i = 0; i < NODE_N; i++) {
      for (let j = i + 1; j < NODE_N; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dz = nodes[i].z - nodes[j].z;
        if (dx * dx + dy * dy + dz * dz < CONN_DIST * CONN_DIST) {
          connArr.push(nodes[i].x, nodes[i].y, nodes[i].z, nodes[j].x, nodes[j].y, nodes[j].z);
        }
      }
    }
    const connGeom = new THREE.BufferGeometry();
    connGeom.setAttribute("position", new THREE.Float32BufferAttribute(connArr, 3));
    const neuralLines = new THREE.LineSegments(connGeom, new THREE.LineBasicMaterial({ color: "#2c8bff", transparent: true, opacity: 0.11, depthWrite: false }));
    scene.add(neuralLines);

    // ── Grid floor ───────────────────────────────────────────────────────
    const gFloor = new THREE.GridHelper(50, 36, "#2c8bff", "#0a1828");
    gFloor.position.y = -3.8;
    setMaterialOpacity(gFloor, 0.2);
    scene.add(gFloor);

    // ── Central hologram ─────────────────────────────────────────────────
    const core = new THREE.Group();

    const shellMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.7, 2),
      new THREE.MeshBasicMaterial({ color: "#4df7ff", wireframe: true, transparent: true, opacity: 0.17 })
    );
    core.add(shellMesh);

    const innerSph = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 28, 28),
      new THREE.MeshBasicMaterial({ color: "#7dd3fc", wireframe: true, transparent: true, opacity: 0.13 })
    );
    innerSph.rotation.x = Math.PI / 5;
    core.add(innerSph);

    const octaEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.OctahedronGeometry(2.9, 0)),
      new THREE.LineBasicMaterial({ color: "#8b5cf6", transparent: true, opacity: 0.2 })
    );
    core.add(octaEdge);

    // 3 orbital rings
    const rings: THREE.Mesh[] = [];
    [
      { r: 2.15, color: "#ff4fd8", rx: Math.PI / 2, rz: 0 },
      { r: 2.55, color: "#2c8bff", rx: 0,           rz: Math.PI / 2 },
      { r: 1.9,  color: "#4df7ff", rx: Math.PI / 4, rz: Math.PI / 4 },
    ].forEach(({ r, color, rx, rz }) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.018, 16, 160),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82 })
      );
      ring.rotation.x = rx;
      ring.rotation.z = rz;
      rings.push(ring);
      core.add(ring);
    });

    // Halo disc
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(1.35, 1.72, 80),
      new THREE.MeshBasicMaterial({ color: "#4df7ff", side: THREE.DoubleSide, transparent: true, opacity: 0.09 })
    );
    halo.rotation.x = Math.PI / 2;
    core.add(halo);

    scene.add(core);

    // ── Ambient particle field ───────────────────────────────────────────
    const ambPts = mkStars(1300, 5, 10, "#4df7ff", 0.032, 0.6);
    scene.add(ambPts);

    // ── Render loop ──────────────────────────────────────────────────────
    const clock = new THREE.Clock();
    let raf = 0;

    const render = () => {
      const t = clock.getElapsedTime();

      // Smooth mouse parallax on camera
      const mr = mouseRef.current;
      mr.x += (mr.tx - mr.x) * 0.04;
      mr.y += (mr.ty - mr.y) * 0.04;
      camera.position.x += (mr.x * 0.75 - camera.position.x) * 0.06;
      camera.position.y += (-mr.y * 0.45 + 0.4 - camera.position.y) * 0.06;
      camera.lookAt(0, 0, 0);

      // Core motion
      core.rotation.y = t * 0.15;
      core.rotation.z = Math.sin(t * 0.18) * 0.055;
      core.position.y = Math.sin(t * 0.48) * 0.18;

      shellMesh.rotation.x = t * 0.08;
      innerSph.rotation.y  = -t * 0.22;
      octaEdge.rotation.y  = -t * 0.12;

      rings[0].rotation.z = t * 0.3;
      rings[1].rotation.x = t * 0.21;
      rings[2].rotation.y = t * 0.38;

      // Neural network pulse
      (neuralLines.material as THREE.LineBasicMaterial).opacity = 0.08 + Math.sin(t * 0.7) * 0.05;

      // Ambient particles
      ambPts.rotation.y = -t * 0.022;
      ambPts.rotation.x = Math.sin(t * 0.1) * 0.055;

      // Light pulse
      cyanL.intensity = 60 + Math.sin(t * 1.1) * 12;
      magL.intensity  = 42 + Math.sin(t * 0.85 + 1.2) * 9;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };

    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    };

    window.addEventListener("resize", onResize);
    render();

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [sceneMode]);

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <div
        ref={containerRef}
        className={`absolute inset-0 transition-opacity duration-700 ${sceneMode === "full" ? "opacity-100" : "opacity-0"}`}
      />
      {/* CSS ambient layers */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_18%_12%,rgba(77,247,255,0.1),transparent_28%),radial-gradient(ellipse_at_78%_16%,rgba(255,79,216,0.09),transparent_24%),radial-gradient(ellipse_at_50%_105%,rgba(44,139,255,0.12),transparent_32%),radial-gradient(ellipse_at_8%_75%,rgba(139,92,246,0.07),transparent_22%)]" />
      <div className="grid-scanlines absolute inset-0 opacity-22" />
      <div className="grid-noise absolute inset-0 opacity-18" />
      {/* Glow blobs */}
      <div className="absolute left-1/2 top-[13%] h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-grid-cyan/[0.055] blur-[90px]" />
      <div className="absolute left-[12%] top-[20%] h-72 w-72 rounded-full bg-grid-magenta/[0.055] blur-[70px]" />
      <div className="absolute bottom-[8%] right-[6%] h-80 w-80 rounded-full bg-grid-blue/[0.055] blur-[80px]" />
      <div className="absolute left-[60%] top-[52%] h-56 w-56 rounded-full bg-grid-violet/[0.045] blur-[60px]" />
      {sceneMode === "lite" && (
        <div className="absolute inset-x-0 bottom-0 h-[50vh] bg-[linear-gradient(180deg,rgba(4,6,13,0)_0%,rgba(4,6,13,0.42)_38%,rgba(4,6,13,0.9)_100%)]" />
      )}
    </div>
  );
}
