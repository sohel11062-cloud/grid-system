"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export function HologramScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.innerWidth < 768) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();

    scene.fog = new THREE.FogExp2(0x04050a, 0.035);

    const camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );

    camera.position.set(0, 1.5, 10);

    // ─────────────────────────────────────────────────────────────────────────
    // LIGHTING
    // ─────────────────────────────────────────────────────────────────────────

    const cyanLight = new THREE.PointLight(0x4df7ff, 2.4, 40);
    cyanLight.position.set(0, 0, 0);

    const purpleLight = new THREE.PointLight(0xa78bfa, 2, 35);
    purpleLight.position.set(5, 2, 4);

    const magentaLight = new THREE.PointLight(0xe879f9, 1.5, 30);
    magentaLight.position.set(-5, -2, 4);

    scene.add(cyanLight);
    scene.add(purpleLight);
    scene.add(magentaLight);

    // ─────────────────────────────────────────────────────────────────────────
    // STARS
    // ─────────────────────────────────────────────────────────────────────────

    const starGeo = new THREE.BufferGeometry();

    const starCount = 6000;

    const starPos = new Float32Array(starCount * 3);

    for (let i = 0; i < starPos.length; i++) {
      starPos[i] = (Math.random() - 0.5) * 500;
    }

    starGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(starPos, 3),
    );

    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0x4df7ff,
        size: 0.12,
        transparent: true,
        opacity: 0.5,
      }),
    );

    scene.add(stars);

    // ─────────────────────────────────────────────────────────────────────────
    // MAIN CORE
    // ─────────────────────────────────────────────────────────────────────────

    const coreGroup = new THREE.Group();

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.6, 1),
      new THREE.MeshBasicMaterial({
        color: 0x4df7ff,
        wireframe: true,
        transparent: true,
        opacity: 0.35,
      }),
    );

    coreGroup.add(core);

    // INNER GLOW

    const innerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 32, 32),
      new THREE.MeshBasicMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.1,
      }),
    );

    coreGroup.add(innerGlow);

    // ENERGY SHELL

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(2.3, 32, 32),
      new THREE.MeshBasicMaterial({
        color: 0x4df7ff,
        wireframe: true,
        transparent: true,
        opacity: 0.05,
      }),
    );

    coreGroup.add(shell);

    scene.add(coreGroup);

    // ─────────────────────────────────────────────────────────────────────────
    // ORBITAL RINGS
    // ─────────────────────────────────────────────────────────────────────────

    const rings: THREE.Mesh[] = [];

    [0x4df7ff, 0xa78bfa, 0xe879f9, 0x3b82f6].forEach((color, i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.8 + i * 0.7, 0.02, 8, 200),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.22 - i * 0.03,
        }),
      );

      ring.rotation.x = i * 0.6;
      ring.rotation.y = i * 0.4;

      rings.push(ring);

      scene.add(ring);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // ENERGY PARTICLES
    // ─────────────────────────────────────────────────────────────────────────

    const particleGroup = new THREE.Group();

    for (let i = 0; i < 120; i++) {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(Math.random() * 0.03 + 0.015, 6, 6),
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0x4df7ff : 0xa78bfa,
          transparent: true,
          opacity: 0.8,
        }),
      );

      const radius = 4 + Math.random() * 5;

      particle.position.set(
        (Math.random() - 0.5) * radius,
        (Math.random() - 0.5) * radius,
        (Math.random() - 0.5) * radius,
      );

      particleGroup.add(particle);
    }

    scene.add(particleGroup);

    // ─────────────────────────────────────────────────────────────────────────
    // GRID FLOOR
    // ─────────────────────────────────────────────────────────────────────────

    const grid = new THREE.GridHelper(
      100,
      60,
      0x4df7ff,
      0x4df7ff,
    );

    const gridMat = grid.material as THREE.Material;

    gridMat.transparent = true;
    gridMat.opacity = 0.08;

    grid.position.y = -5;

    scene.add(grid);

    // ─────────────────────────────────────────────────────────────────────────
    // SCANNING RINGS
    // ─────────────────────────────────────────────────────────────────────────

    const scanRings: THREE.Mesh[] = [];

    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(2.5 + i, 2.55 + i, 128),
        new THREE.MeshBasicMaterial({
          color: 0x4df7ff,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.04,
        }),
      );

      ring.rotation.x = Math.PI / 2;

      ring.position.y = -4.8 + i * 0.08;

      scanRings.push(ring);

      scene.add(ring);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PARALLAX
    // ─────────────────────────────────────────────────────────────────────────

    let mx = 0;
    let my = 0;

    const onMouse = (e: MouseEvent) => {
      mx = (e.clientX / window.innerWidth - 0.5) * 2;
      my = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    window.addEventListener("mousemove", onMouse);

    // ─────────────────────────────────────────────────────────────────────────
    // RESIZE
    // ─────────────────────────────────────────────────────────────────────────

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;

      camera.updateProjectionMatrix();

      renderer.setSize(
        window.innerWidth,
        window.innerHeight,
      );
    };

    window.addEventListener("resize", onResize);

    // ─────────────────────────────────────────────────────────────────────────
    // ANIMATION LOOP
    // ─────────────────────────────────────────────────────────────────────────

    let t = 0;

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      t += 0.0035;

      // CORE

      core.rotation.x += 0.002;
      core.rotation.y += 0.003;

      shell.rotation.y -= 0.0015;

      // RINGS

      rings.forEach((ring, i) => {
        ring.rotation.z += 0.001 + i * 0.0008;
        ring.rotation.x += 0.0005;
      });

      // PARTICLES

      particleGroup.rotation.y += 0.0008;
      particleGroup.rotation.x += 0.0003;

      particleGroup.children.forEach((p, i) => {
        p.position.y += Math.sin(t + i) * 0.0015;
      });

      // STARS

      stars.rotation.y += 0.00015;

      // SCAN RINGS

scanRings.forEach((ring, i) => {

  const mat =
    ring.material as THREE.MeshBasicMaterial;

  mat.opacity =
    0.02 + Math.sin(t * 2 + i) * 0.02;

});

      // CAMERA PARALLAX

      camera.position.x +=
        (mx * 2.2 - camera.position.x) * 0.03;

      camera.position.y +=
        (-my * 1.3 + 1.5 - camera.position.y) * 0.03;

      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    animate();

    // ─────────────────────────────────────────────────────────────────────────
    // CLEANUP
    // ─────────────────────────────────────────────────────────────────────────

    return () => {
      cancelAnimationFrame(rafRef.current);

      window.removeEventListener("mousemove", onMouse);

      window.removeEventListener("resize", onResize);

      renderer.dispose();
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-0 h-full w-full"
        aria-hidden
      />

      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden
        style={{
          background:
            `
            radial-gradient(circle at 20% 30%, rgba(77,247,255,0.10), transparent 30%),
            radial-gradient(circle at 80% 20%, rgba(167,139,250,0.10), transparent 30%),
            radial-gradient(circle at 50% 80%, rgba(232,121,249,0.08), transparent 35%),
            radial-gradient(circle at center, rgba(59,130,246,0.08), transparent 45%),
            linear-gradient(180deg, #02030a 0%, #050816 100%)
            `,
        }}
      />

      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.03]"
        aria-hidden
        style={{
          backgroundImage:
            "linear-gradient(rgba(77,247,255,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(77,247,255,0.25) 1px, transparent 1px)",
          backgroundSize: "120px 120px",
        }}
      />
    </>
  );
}