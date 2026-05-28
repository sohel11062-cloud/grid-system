"use client";

const isMobile =
  typeof window !== "undefined" &&
  window.innerWidth < 768;

import { useEffect, useRef } from "react";
import * as THREE from "three";

export function HologramScene() {

  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  const rafRef =
    useRef<number>(0);

  useEffect(() => {

    if (
      typeof window ===
      "undefined"
    ) {
      return;
    }

    // PERFORMANCE SAFE GUARDS

    if (
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches
    ) {
      return;
    }

    // DISABLE ON SMALL DEVICES

    if (
      window.innerWidth < 768
    ) {
      return;
    }

    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    // ───────────────────────────────────────────────────────────────────────
    // RENDERER
    // ───────────────────────────────────────────────────────────────────────

    const renderer =
      new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference:
          "high-performance",
      });

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        1.5,
      ),
    );

    renderer.setSize(
      window.innerWidth,
      window.innerHeight,
    );

    renderer.outputColorSpace =
      THREE.SRGBColorSpace;

    renderer.toneMapping =
      THREE.ACESFilmicToneMapping;

    renderer.toneMappingExposure =
      1.1;

    // ───────────────────────────────────────────────────────────────────────
    // SCENE
    // ───────────────────────────────────────────────────────────────────────

    const scene =
      new THREE.Scene();

    scene.fog =
      new THREE.FogExp2(
        0x02030a,
        0.028,
      );

    // ───────────────────────────────────────────────────────────────────────
    // CAMERA
    // ───────────────────────────────────────────────────────────────────────

    const camera =
      new THREE.PerspectiveCamera(
        55,
        window.innerWidth /
          window.innerHeight,
        0.1,
        1000,
      );

    camera.position.set(
      0,
      1.5,
      11,
    );

    // ───────────────────────────────────────────────────────────────────────
    // LIGHTING
    // ───────────────────────────────────────────────────────────────────────

    const cyanLight =
      new THREE.PointLight(
        0x4df7ff,
        3,
        45,
      );

    cyanLight.position.set(
      0,
      0,
      0,
    );

    const violetLight =
      new THREE.PointLight(
        0xa78bfa,
        2.4,
        40,
      );

    violetLight.position.set(
      6,
      3,
      5,
    );

    const magentaLight =
      new THREE.PointLight(
        0xe879f9,
        2,
        35,
      );

    magentaLight.position.set(
      -6,
      -2,
      5,
    );

    scene.add(
      cyanLight,
    );

    scene.add(
      violetLight,
    );

    scene.add(
      magentaLight,
    );

    // ───────────────────────────────────────────────────────────────────────
    // STARFIELD
    // ───────────────────────────────────────────────────────────────────────

    const starGeo =
      new THREE.BufferGeometry();

    const starCount = 9000;

    const starPos =
      new Float32Array(
        starCount * 3,
      );

    for (
      let i = 0;
      i < starPos.length;
      i++
    ) {

      starPos[i] =
        (Math.random() - 0.5) *
        600;
    }

    starGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(
        starPos,
        3,
      ),
    );

    const stars =
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({
          color: 0x8cfbff,
          size: 0.12,
          transparent: true,
          opacity: 0.5,
        }),
      );

    scene.add(stars);

    // ───────────────────────────────────────────────────────────────────────
    // CORE GROUP
    // ───────────────────────────────────────────────────────────────────────

    const coreGroup =
      new THREE.Group();

    // MAIN WIREFRAME CORE

    const core =
      new THREE.Mesh(
        new THREE.IcosahedronGeometry(
          1.7,
          1,
        ),
        new THREE.MeshBasicMaterial({
          color: 0x4df7ff,
          wireframe: true,
          transparent: true,
          opacity: 0.35,
        }),
      );

    coreGroup.add(core);

    // INNER ENERGY SPHERE

    const innerGlow =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          0.95,
          32,
          32,
        ),
        new THREE.MeshBasicMaterial({
          color: 0x3b82f6,
          transparent: true,
          opacity: 0.12,
        }),
      );

    coreGroup.add(
      innerGlow,
    );

    // OUTER ENERGY SHELL

    const shell =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          2.5,
          32,
          32,
        ),
        new THREE.MeshBasicMaterial({
          color: 0x4df7ff,
          wireframe: true,
          transparent: true,
          opacity: 0.05,
        }),
      );

    coreGroup.add(shell);

    // EXTRA CORE RING

    const halo =
      new THREE.Mesh(
        new THREE.TorusGeometry(
          3.2,
          0.03,
          16,
          220,
        ),
        new THREE.MeshBasicMaterial({
          color: 0xa78bfa,
          transparent: true,
          opacity: 0.2,
        }),
      );

    halo.rotation.x =
      Math.PI / 2;

    coreGroup.add(halo);

    scene.add(coreGroup);

    // ───────────────────────────────────────────────────────────────────────
    // ORBITAL RINGS
    // ───────────────────────────────────────────────────────────────────────

    const rings:
      THREE.Mesh[] = [];

    [
      0x4df7ff,
      0xa78bfa,
      0xe879f9,
      0x3b82f6,
    ].forEach(
      (color, i) => {

        const ring =
          new THREE.Mesh(
            new THREE.TorusGeometry(
              3 +
                i * 0.8,
              0.02,
              8,
              220,
            ),
            new THREE.MeshBasicMaterial({
              color,
              transparent: true,
              opacity:
                0.22 -
                i * 0.03,
            }),
          );

        ring.rotation.x =
          i * 0.55;

        ring.rotation.y =
          i * 0.4;

        rings.push(ring);

        scene.add(ring);
      },
    );

    // ───────────────────────────────────────────────────────────────────────
    // ENERGY PARTICLES
    // ───────────────────────────────────────────────────────────────────────

    const particleGroup =
      new THREE.Group();

    for (
      let i = 0;
      i < 180;
      i++
    ) {

      const particle =
        new THREE.Mesh(
          new THREE.SphereGeometry(
            Math.random() *
              0.03 +
              0.015,
            6,
            6,
          ),
          new THREE.MeshBasicMaterial({
            color:
              i % 2 === 0
                ? 0x4df7ff
                : 0xa78bfa,
            transparent: true,
            opacity: 0.8,
          }),
        );

      const radius =
        4 +
        Math.random() * 6;

      particle.position.set(
        (Math.random() - 0.5) *
          radius,
        (Math.random() - 0.5) *
          radius,
        (Math.random() - 0.5) *
          radius,
      );

      particleGroup.add(
        particle,
      );
    }

    scene.add(
      particleGroup,
    );

    // ───────────────────────────────────────────────────────────────────────
    // GRID FLOOR
    // ───────────────────────────────────────────────────────────────────────

    const grid =
      new THREE.GridHelper(
        120,
        70,
        0x4df7ff,
        0x4df7ff,
      );

    const gridMat =
      grid.material as
        THREE.Material;

    gridMat.transparent =
      true;

    gridMat.opacity = 0.08;

    grid.position.y = -5;

    scene.add(grid);

    // ───────────────────────────────────────────────────────────────────────
    // SCANNING RINGS
    // ───────────────────────────────────────────────────────────────────────

    const scanRings:
      THREE.Mesh[] = [];

    for (
      let i = 0;
      i < 5;
      i++
    ) {

      const ring =
        new THREE.Mesh(
          new THREE.RingGeometry(
            2.5 + i,
            2.56 + i,
            128,
          ),
          new THREE.MeshBasicMaterial({
            color: 0x4df7ff,
            side:
              THREE.DoubleSide,
            transparent: true,
            opacity: 0.04,
          }),
        );

      ring.rotation.x =
        Math.PI / 2;

      ring.position.y =
        -4.8 +
        i * 0.08;

      scanRings.push(ring);

      scene.add(ring);
    }

    // ───────────────────────────────────────────────────────────────────────
    // MOUSE PARALLAX
    // ───────────────────────────────────────────────────────────────────────

    let mx = 0;
    let my = 0;

    const onMouse = (
      e: MouseEvent,
    ) => {

      mx =
        (e.clientX /
          window.innerWidth -
          0.5) *
        2;

      my =
        (e.clientY /
          window.innerHeight -
          0.5) *
        2;
    };

    window.addEventListener(
      "mousemove",
      onMouse,
    );

    // ───────────────────────────────────────────────────────────────────────
    // RESIZE
    // ───────────────────────────────────────────────────────────────────────

    const onResize =
      () => {

        camera.aspect =
          window.innerWidth /
          window.innerHeight;

        camera.updateProjectionMatrix();

        renderer.setSize(
          window.innerWidth,
          window.innerHeight,
        );
      };

    window.addEventListener(
      "resize",
      onResize,
    );

    // ───────────────────────────────────────────────────────────────────────
    // ANIMATION LOOP
    // ───────────────────────────────────────────────────────────────────────

    let t = 0;

    const animate = () => {

      rafRef.current =
        requestAnimationFrame(
          animate,
        );

      t += 0.0035;

      // CORE ROTATION

      core.rotation.x +=
        0.002;

      core.rotation.y +=
        0.003;

      shell.rotation.y -=
        0.0015;

      halo.rotation.z +=
        0.0018;

      // ORBITAL RINGS

      rings.forEach(
        (ring, i) => {

          ring.rotation.z +=
            0.001 +
            i * 0.0008;

          ring.rotation.x +=
            0.0005;
        },
      );

      // PARTICLES

      particleGroup.rotation.y +=
        0.0008;

      particleGroup.rotation.x +=
        0.0003;

      particleGroup.children.forEach(
        (p, i) => {

          p.position.y +=
            Math.sin(
              t + i,
            ) * 0.0015;
        },
      );

      // STARFIELD

      stars.rotation.y +=
        0.00012;

      // SCAN RINGS

      scanRings.forEach(
        (ring, i) => {

          const mat =
            ring.material as
              THREE.MeshBasicMaterial;

          mat.opacity =
            0.02 +
            Math.sin(
              t * 2 +
                i,
            ) *
              0.02;

          ring.scale.x =
            1 +
            Math.sin(
              t + i,
            ) *
              0.008;

          ring.scale.y =
            1 +
            Math.sin(
              t + i,
            ) *
              0.008;
        },
      );

      // CORE FLOAT

      coreGroup.position.y =
        Math.sin(t * 1.8) *
        0.18;

      // LIGHT PULSE

      cyanLight.intensity =
        2.8 +
        Math.sin(t * 3) *
          0.5;

      violetLight.intensity =
        2 +
        Math.sin(t * 2) *
          0.3;

      // CAMERA PARALLAX

      camera.position.x +=
        (mx * 2.5 -
          camera.position.x) *
        0.03;

      camera.position.y +=
        (-my * 1.5 +
          1.5 -
          camera.position.y) *
        0.03;

      camera.lookAt(
        0,
        0,
        0,
      );

      renderer.render(
        scene,
        camera,
      );
    };

    animate();

    // ───────────────────────────────────────────────────────────────────────
    // CLEANUP
    // ───────────────────────────────────────────────────────────────────────

    return () => {

      cancelAnimationFrame(
        rafRef.current,
      );

      window.removeEventListener(
        "mousemove",
        onMouse,
      );

      window.removeEventListener(
        "resize",
        onResize,
      );

      renderer.dispose();

      starGeo.dispose();
    };

  }, []);

  if (isMobile) {
  return null;
}

return (
  <>

      {/* THREE CANVAS */}

      <canvas
        ref={canvasRef}
        className="
          pointer-events-none
          fixed
          inset-0
          z-0
          h-full
          w-full
          opacity-[0.45]
        "
        aria-hidden
      />

      {/* CINEMATIC GRADIENTS */}

      <div
        className="
          pointer-events-none
          fixed
          inset-0
          z-0
        "
        aria-hidden
        style={{
          background:
            `
            radial-gradient(circle at 20% 30%, rgba(77,247,255,0.05), transparent 30%),
            radial-gradient(circle at 80% 20%, rgba(167,139,250,0.05), transparent 30%),
            radial-gradient(circle at 50% 80%, rgba(232,121,249,0.10), transparent 35%),
            radial-gradient(circle at center, rgba(59,130,246,0.08), transparent 45%),
            linear-gradient(180deg, #02030a 0%, #050816 100%)
            `,
        }}
      />

      {/* CYBER GRID */}

      <div
        className="
          pointer-events-none
          fixed
          inset-0
          z-0
          opacity-[0.015]
        "
        aria-hidden
        style={{
          backgroundImage:
            `
            linear-gradient(rgba(77,247,255,0.25) 1px, transparent 1px),
            linear-gradient(90deg, rgba(77,247,255,0.25) 1px, transparent 1px)
            `,
          backgroundSize:
            "120px 120px",
        }}
      />

      {/* VIGNETTE */}

      <div
        className="
          pointer-events-none
          fixed
          inset-0
          z-0
        "
        style={{
          background:
            `
            radial-gradient(
              circle at center,
              transparent 40%,
              rgba(0,0,0,0.22) 100%
            )
            `,
        }}
      />

    </>
  );
}