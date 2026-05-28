"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import * as THREE from "three";

export function HologramScene() {

  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  const rafRef =
    useRef<number>(0);

  const [isMounted, setIsMounted] =
    useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {

    if (!isMounted) return;

    if (
      typeof window === "undefined"
    ) {
      return;
    }

    /* DEVICE DETECTION - EARLY RETURN */
    const isSmallViewport =
      window.innerWidth < 1024;

    const prefersReduced =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

    if (
      isSmallViewport ||
      prefersReduced
    ) {
      return;
    }

    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    /* RENDERER - OPTIMIZED SETTINGS */
    const renderer =
      new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference:
          "high-performance",
        precision: "mediump",
      });

    /* PIXEL RATIO - CAPPED */
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
      1.0;

    /* SCENE */
    const scene =
      new THREE.Scene();

    scene.fog =
      new THREE.FogExp2(
        0x0f0f0f,
        0.028,
      );

    /* CAMERA */
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

    /* LIGHTING - REDUCED */
    const cyanLight =
      new THREE.PointLight(
        0x5a7a6f,
        2.0,
        40,
      );

    cyanLight.position.set(0, 0, 0);

    const violetLight =
      new THREE.PointLight(
        0x7f6b8f,
        1.4,
        35,
      );

    violetLight.position.set(6, 3, 5);

    const amberLight =
      new THREE.PointLight(
        0xc9a961,
        1.2,
        30,
      );

    amberLight.position.set(
      -6,
      -2,
      5,
    );

    scene.add(cyanLight);
    scene.add(violetLight);
    scene.add(amberLight);

    /* STARFIELD */
    const starGeo =
      new THREE.BufferGeometry();

    const starCount = 4000; /* REDUCED */

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
          color: 0x5a7a6f,
          size: 0.10,
          transparent: true,
          opacity: 0.4,
        }),
      );

    scene.add(stars);

    /* CORE GROUP */
    const coreGroup =
      new THREE.Group();

    /* WIREFRAME CORE */
    const core =
      new THREE.Mesh(
        new THREE.IcosahedronGeometry(
          1.5,
          1,
        ),
        new THREE.MeshBasicMaterial({
          color: 0x5a7a6f,
          wireframe: true,
          transparent: true,
          opacity: 0.25,
        }),
      );

    coreGroup.add(core);

    /* INNER GLOW */
    const innerGlow =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          0.90,
          24,
          24,
        ),
        new THREE.MeshBasicMaterial({
          color: 0x3b82f6,
          transparent: true,
          opacity: 0.08,
        }),
      );

    coreGroup.add(innerGlow);

    /* OUTER SHELL */
    const shell =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          2.2,
          24,
          24,
        ),
        new THREE.MeshBasicMaterial({
          color: 0x5a7a6f,
          wireframe: true,
          transparent: true,
          opacity: 0.04,
        }),
      );

    coreGroup.add(shell);

    /* HALO RING */
    const halo =
      new THREE.Mesh(
        new THREE.TorusGeometry(
          3.0,
          0.025,
          12,
          180,
        ),
        new THREE.MeshBasicMaterial({
          color: 0x7f6b8f,
          transparent: true,
          opacity: 0.15,
        }),
      );

    halo.rotation.x = Math.PI / 2;

    coreGroup.add(halo);

    scene.add(coreGroup);

    /* ORBITAL RINGS - REDUCED */
    const rings: THREE.Mesh[] = [];

    [
      0x5a7a6f,
      0x7f6b8f,
      0xc9a961,
      0x3b82f6,
    ].forEach((color, i) => {

      const ring =
        new THREE.Mesh(
          new THREE.TorusGeometry(
            2.8 + i * 0.7,
            0.015,
            6,
            160,
          ),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity:
              0.16 - i * 0.03,
          }),
        );

      ring.rotation.x = i * 0.5;
      ring.rotation.y = i * 0.35;

      rings.push(ring);
      scene.add(ring);
    });

    /* ENERGY PARTICLES - REDUCED */
    const particleGroup =
      new THREE.Group();

    for (let i = 0; i < 100; i++) {

      const particle =
        new THREE.Mesh(
          new THREE.SphereGeometry(
            Math.random() * 0.025 +
              0.01,
            4,
            4,
          ),
          new THREE.MeshBasicMaterial({
            color:
              i % 2 === 0
                ? 0x5a7a6f
                : 0x7f6b8f,
            transparent: true,
            opacity: 0.6,
          }),
        );

      const radius =
        3.5 +
        Math.random() * 5;

      particle.position.set(
        (Math.random() - 0.5) *
          radius,
        (Math.random() - 0.5) *
          radius,
        (Math.random() - 0.5) *
          radius,
      );

      particleGroup.add(particle);
    }

    scene.add(particleGroup);

    /* GRID FLOOR */
    const grid =
      new THREE.GridHelper(
        100,
        60,
        0x5a7a6f,
        0x5a7a6f,
      );

    const gridMat =
      grid.material as
        THREE.Material;

    gridMat.transparent =
      true;

    gridMat.opacity = 0.05;

    grid.position.y = -5;

    scene.add(grid);

    /* SCANNING RINGS - REDUCED */
    const scanRings: THREE.Mesh[] = [];

    for (let i = 0; i < 3; i++) {

      const ring =
        new THREE.Mesh(
          new THREE.RingGeometry(
            2.2 + i,
            2.26 + i,
            96,
          ),
          new THREE.MeshBasicMaterial({
            color: 0x5a7a6f,
            side:
              THREE.DoubleSide,
            transparent: true,
            opacity: 0.02,
          }),
        );

      ring.rotation.x = Math.PI / 2;

      ring.position.y =
        -4.8 + i * 0.08;

      scanRings.push(ring);

      scene.add(ring);
    }

    /* MOUSE PARALLAX */
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
      { passive: true },
    );

    /* RESIZE */
    const onResize = () => {

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

    /* ANIMATION LOOP */
    let t = 0;

    const animate = () => {

      rafRef.current =
        requestAnimationFrame(
          animate,
        );

      t += 0.003; /* SLIGHTLY FASTER */

      /* CORE ROTATION */
      core.rotation.x +=
        0.0015;

      core.rotation.y +=
        0.0025;

      shell.rotation.y -=
        0.0012;

      halo.rotation.z +=
        0.0015;

      /* ORBITAL RINGS */
      rings.forEach((ring, i) => {

        ring.rotation.z +=
          0.0008 +
          i * 0.0006;

        ring.rotation.x +=
          0.0004;
      });

      /* PARTICLES */
      particleGroup.rotation.y +=
        0.0006;

      particleGroup.rotation.x +=
        0.0002;

      particleGroup.children.forEach(
        (p, i) => {

          p.position.y +=
            Math.sin(t + i) *
            0.0012;
        },
      );

      /* STARFIELD */
      stars.rotation.y +=
        0.00010;

      /* SCAN RINGS */
      scanRings.forEach(
        (ring, i) => {

          const mat =
            ring.material as
              THREE.MeshBasicMaterial;

          mat.opacity =
            0.01 +
            Math.sin(t * 2 + i) *
              0.015;

          ring.scale.x =
            1 +
            Math.sin(t + i) *
              0.006;

          ring.scale.y =
            1 +
            Math.sin(t + i) *
              0.006;
        },
      );

      /* CORE FLOAT */
      coreGroup.position.y =
        Math.sin(t * 1.6) *
        0.14;

      /* LIGHT PULSE */
      cyanLight.intensity =
        1.8 +
        Math.sin(t * 3) * 0.4;

      violetLight.intensity =
        1.2 +
        Math.sin(t * 2) * 0.25;

      /* CAMERA PARALLAX */
      camera.position.x +=
        (mx * 2.0 -
          camera.position.x) *
        0.025;

      camera.position.y +=
        (-my * 1.2 + 1.5 -
          camera.position.y) *
        0.025;

      camera.lookAt(0, 0, 0);

      renderer.render(
        scene,
        camera,
      );
    };

    animate();

    /* CLEANUP */
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

      /* PROPER CLEANUP */
      starGeo.dispose();
      core.geometry.dispose();
      (core.material as THREE.Material).dispose();
      innerGlow.geometry.dispose();
      (innerGlow.material as THREE.Material).dispose();
      shell.geometry.dispose();
      (shell.material as THREE.Material).dispose();
      halo.geometry.dispose();
      (halo.material as THREE.Material).dispose();

      rings.forEach((ring) => {
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
      });

      particleGroup.children.forEach((particle) => {
        const mesh = particle as THREE.Mesh;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });

      gridMat.dispose();

      scanRings.forEach((ring) => {
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
      });

      renderer.dispose();
    };

  }, [isMounted]);

  return (
    <canvas
      ref={canvasRef}
      className="
        pointer-events-none
        fixed
        inset-0
        z-[-1]
        h-full
        w-full
        opacity-40
      "
      aria-hidden="true"
    />
  );
}