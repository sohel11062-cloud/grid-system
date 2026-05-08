"use client";

import { useEffect, useRef } from "react";

export function HologramScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.innerWidth < 768) return; // mobile: CSS-only background

    const canvas = canvasRef.current;
    if (!canvas) return;

    let cleanup: (() => void) | undefined;

    import("three").then((THREE) => {
      const W = window.innerWidth;
      const H = window.innerHeight;

      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 600);
      camera.position.set(0, 1.5, 9);

      // ── Stars ────────────────────────────────────────────────────────────
      const starPos = new Float32Array(2600 * 3);
      for (let i = 0; i < starPos.length; i++) starPos[i] = (Math.random() - 0.5) * 300;
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
      scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
        color: 0x4df7ff, size: 0.18, transparent: true, opacity: 0.55,
      })));

      // ── Central icosahedron ───────────────────────────────────────────────
      const ico = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.4, 1),
        new THREE.MeshBasicMaterial({ color: 0x4df7ff, wireframe: true, transparent: true, opacity: 0.22 })
      );
      scene.add(ico);

      // ── Inner glow ────────────────────────────────────────────────────────
      scene.add(new THREE.Mesh(
        new THREE.SphereGeometry(0.85, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.07 })
      ));

      // ── Orbital rings ─────────────────────────────────────────────────────
      const ringColors = [0x4df7ff, 0xa78bfa, 0xe879f9];
      const rings: THREE.Mesh[] = [];
      ringColors.forEach((color, i) => {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(2.0 + i * 0.7, 0.018, 6, 72),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28 - i * 0.06 })
        );
        ring.rotation.x = 0.4 + i * 0.55;
        ring.rotation.z = i * 0.35;
        rings.push(ring);
        scene.add(ring);
      });

      // ── Neural nodes (40 nodes, connected within distance) ────────────────
      const nodeGroup = new THREE.Group();
      const nodePositions: THREE.Vector3[] = [];
      const nodeGeo = new THREE.SphereGeometry(0.07, 4, 4);
      const nodeMat = new THREE.MeshBasicMaterial({ color: 0x4df7ff, transparent: true, opacity: 0.5 });

      for (let i = 0; i < 40; i++) {
        const r     = 3.5 + Math.random() * 2.5;
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.random() * Math.PI;
        const pos   = new THREE.Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta),
          r * Math.cos(phi)
        );
        nodePositions.push(pos);
        const node = new THREE.Mesh(nodeGeo, nodeMat);
        node.position.copy(pos);
        nodeGroup.add(node);
      }

      const lineMat = new THREE.LineBasicMaterial({ color: 0x4df7ff, transparent: true, opacity: 0.07 });
      for (let i = 0; i < nodePositions.length; i++) {
        for (let j = i + 1; j < nodePositions.length; j++) {
          if (nodePositions[i].distanceTo(nodePositions[j]) < 3.2) {
            nodeGroup.add(new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([nodePositions[i], nodePositions[j]]),
              lineMat
            ));
          }
        }
      }
      scene.add(nodeGroup);

      // ── Grid floor ────────────────────────────────────────────────────────
      const grid = new THREE.GridHelper(40, 22, 0x4df7ff, 0x4df7ff);
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = 0.04;
      grid.position.y = -4;
      scene.add(grid);

      // ── Mouse parallax ────────────────────────────────────────────────────
      let mx = 0, my = 0;
      const onMouse = (e: MouseEvent) => {
        mx = (e.clientX / window.innerWidth  - 0.5) * 2;
        my = (e.clientY / window.innerHeight - 0.5) * 2;
      };
      window.addEventListener("mousemove", onMouse);

      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener("resize", onResize);

      // ── Animation ─────────────────────────────────────────────────────────
      let t = 0;
      const animate = () => {
        rafRef.current = requestAnimationFrame(animate);
        t += 0.004;

        ico.rotation.x = t * 0.28;
        ico.rotation.y = t * 0.44;
        nodeGroup.rotation.y = t * 0.09;
        rings.forEach((r, i) => { r.rotation.z = t * (0.14 + i * 0.07); });

        camera.position.x += (mx * 1.8 - camera.position.x) * 0.035;
        camera.position.y += (-my * 1.2 + 1.5 - camera.position.y) * 0.035;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
      };
      animate();

      cleanup = () => {
        cancelAnimationFrame(rafRef.current);
        window.removeEventListener("mousemove", onMouse);
        window.removeEventListener("resize", onResize);
        renderer.dispose();
      };
    });

    return () => { cleanup?.(); cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0 h-full w-full" aria-hidden />
      {/* CSS fallback gradient — always visible, provides base aesthetic */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 20% 40%, rgba(77,247,255,0.04) 0%, transparent 70%)," +
            "radial-gradient(ellipse 50% 40% at 80% 30%, rgba(167,139,250,0.04) 0%, transparent 70%)," +
            "radial-gradient(ellipse 40% 60% at 60% 80%, rgba(232,121,249,0.03) 0%, transparent 60%)," +
            "linear-gradient(180deg,#04050a 0%,#060712 100%)",
        }}
      />
    </>
  );
}
