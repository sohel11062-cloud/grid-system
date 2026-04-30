"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type SceneMode = "full" | "lite";

function setMaterialOpacity(object: THREE.Object3D, opacity: number) {
  object.traverse((child) => {
    if (!("material" in child) || !child.material) {
      return;
    }

    const material = child.material;

    if (Array.isArray(material)) {
      material.forEach((item) => {
        const resolved = item as THREE.Material;
        resolved.transparent = true;
        resolved.opacity = opacity;
      });
      return;
    }

    const resolved = material as THREE.Material;
    resolved.transparent = true;
    resolved.opacity = opacity;
  });
}

export function HologramScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sceneMode, setSceneMode] = useState<SceneMode>("lite");

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobileQuery = window.matchMedia("(max-width: 820px)");

    const updateSceneMode = () => {
      setSceneMode(motionQuery.matches || mobileQuery.matches ? "lite" : "full");
    };

    updateSceneMode();
    motionQuery.addEventListener("change", updateSceneMode);
    mobileQuery.addEventListener("change", updateSceneMode);

    return () => {
      motionQuery.removeEventListener("change", updateSceneMode);
      mobileQuery.removeEventListener("change", updateSceneMode);
    };
  }, []);

  useEffect(() => {
    if (sceneMode !== "full") {
      return;
    }

    const container = containerRef.current;

    if (!container) {
      return;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog("#04060d", 8, 24);

    const camera = new THREE.PerspectiveCamera(46, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0.4, 8.2);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor("#04060d", 0);
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight("#dbeafe", 0.9);
    scene.add(ambientLight);

    const cyanLight = new THREE.PointLight("#4df7ff", 42, 26);
    cyanLight.position.set(4.2, 4.8, 4.2);
    scene.add(cyanLight);

    const magentaLight = new THREE.PointLight("#ff4fd8", 28, 18);
    magentaLight.position.set(-3.4, -2.5, 3);
    scene.add(magentaLight);

    const farBlueLight = new THREE.PointLight("#2c8bff", 18, 28);
    farBlueLight.position.set(0, 6, -4);
    scene.add(farBlueLight);

    const particleCount = 1150;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let index = 0; index < particleCount; index += 1) {
      const stride = index * 3;
      const radius = 5 + Math.random() * 7;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      particlePositions[stride] = radius * Math.sin(phi) * Math.cos(theta);
      particlePositions[stride + 1] = radius * Math.cos(phi) * 0.75;
      particlePositions[stride + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));

    const cyanParticles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: "#4df7ff",
        size: 0.034,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    scene.add(cyanParticles);

    const orbitFieldGeometry = new THREE.BufferGeometry();
    const orbitFieldPositions = new Float32Array(320 * 3);
    for (let index = 0; index < 320; index += 1) {
      const stride = index * 3;
      const angle = (index / 320) * Math.PI * 2;
      const radius = 2.8 + Math.sin(index * 0.37) * 0.22;
      orbitFieldPositions[stride] = Math.cos(angle) * radius;
      orbitFieldPositions[stride + 1] = Math.sin(index * 0.31) * 0.2;
      orbitFieldPositions[stride + 2] = Math.sin(angle) * radius;
    }
    orbitFieldGeometry.setAttribute("position", new THREE.BufferAttribute(orbitFieldPositions, 3));

    const magentaParticles = new THREE.Points(
      orbitFieldGeometry,
      new THREE.PointsMaterial({
        color: "#ff4fd8",
        size: 0.05,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    scene.add(magentaParticles);

    const gridPrimary = new THREE.GridHelper(34, 30, "#2c8bff", "#102538");
    gridPrimary.position.set(0, -3.1, 0);
    setMaterialOpacity(gridPrimary, 0.24);
    scene.add(gridPrimary);

    const gridSecondary = new THREE.GridHelper(18, 16, "#4df7ff", "#0d1a2c");
    gridSecondary.position.set(0, -1.6, -2.5);
    gridSecondary.rotation.x = Math.PI / 2.9;
    setMaterialOpacity(gridSecondary, 0.08);
    scene.add(gridSecondary);

    const coreGroup = new THREE.Group();

    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.55, 2),
      new THREE.MeshBasicMaterial({
        color: "#4df7ff",
        wireframe: true,
        transparent: true,
        opacity: 0.2
      })
    );
    coreGroup.add(shell);

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.22, 26, 26),
      new THREE.MeshBasicMaterial({
        color: "#7dd3fc",
        wireframe: true,
        transparent: true,
        opacity: 0.18
      })
    );
    sphere.rotation.x = Math.PI / 5;
    coreGroup.add(sphere);

    const innerHalo = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.55, 80),
      new THREE.MeshBasicMaterial({
        color: "#4df7ff",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.12
      })
    );
    innerHalo.rotation.x = Math.PI / 2;
    coreGroup.add(innerHalo);

    const orbitA = new THREE.Mesh(
      new THREE.TorusGeometry(2.0, 0.026, 16, 140),
      new THREE.MeshBasicMaterial({
        color: "#ff4fd8",
        transparent: true,
        opacity: 0.85
      })
    );
    orbitA.rotation.x = Math.PI / 2;
    coreGroup.add(orbitA);

    const orbitB = new THREE.Mesh(
      new THREE.TorusGeometry(2.45, 0.012, 16, 140),
      new THREE.MeshBasicMaterial({
        color: "#2c8bff",
        transparent: true,
        opacity: 0.72
      })
    );
    orbitB.rotation.z = Math.PI / 2;
    coreGroup.add(orbitB);

    const dataFrame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.OctahedronGeometry(2.6, 0)),
      new THREE.LineBasicMaterial({
        color: "#8b5cf6",
        transparent: true,
        opacity: 0.18
      })
    );
    coreGroup.add(dataFrame);

    scene.add(coreGroup);

    const clock = new THREE.Clock();
    let frameId = 0;

    const onResize = () => {
      if (!container) {
        return;
      }

      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
    };

    const render = () => {
      const elapsed = clock.getElapsedTime();
      coreGroup.rotation.y = elapsed * 0.18;
      coreGroup.rotation.z = Math.sin(elapsed * 0.18) * 0.08;
      coreGroup.position.y = Math.sin(elapsed * 0.55) * 0.16;
      shell.rotation.x = elapsed * 0.09;
      sphere.rotation.y = -elapsed * 0.24;
      orbitA.rotation.z = elapsed * 0.3;
      orbitB.rotation.x = elapsed * 0.22;
      dataFrame.rotation.y = -elapsed * 0.16;
      cyanParticles.rotation.y = -elapsed * 0.03;
      cyanParticles.rotation.x = Math.sin(elapsed * 0.14) * 0.07;
      magentaParticles.rotation.y = elapsed * 0.11;
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(render);
    };

    window.addEventListener("resize", onResize);
    render();

    return () => {
      window.removeEventListener("resize", onResize);
      window.cancelAnimationFrame(frameId);
      particleGeometry.dispose();
      orbitFieldGeometry.dispose();
      (cyanParticles.material as THREE.Material).dispose();
      (magentaParticles.material as THREE.Material).dispose();
      shell.geometry.dispose();
      (shell.material as THREE.Material).dispose();
      sphere.geometry.dispose();
      (sphere.material as THREE.Material).dispose();
      innerHalo.geometry.dispose();
      (innerHalo.material as THREE.Material).dispose();
      orbitA.geometry.dispose();
      (orbitA.material as THREE.Material).dispose();
      orbitB.geometry.dispose();
      (orbitB.material as THREE.Material).dispose();
      dataFrame.geometry.dispose();
      (dataFrame.material as THREE.Material).dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [sceneMode]);

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <div
        ref={containerRef}
        className={`absolute inset-0 transition-opacity duration-500 ${
          sceneMode === "full" ? "opacity-100" : "opacity-0"
        }`}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(77,247,255,0.14),_transparent_28%),radial-gradient(circle_at_75%_18%,_rgba(255,79,216,0.12),_transparent_22%),radial-gradient(circle_at_50%_110%,_rgba(44,139,255,0.16),_transparent_34%)]" />
      <div className="grid-scanlines absolute inset-0 opacity-30" />
      <div className="grid-noise absolute inset-0 opacity-25" />
      <div className="absolute left-1/2 top-[16%] h-72 w-72 -translate-x-1/2 rounded-full bg-grid-cyan/10 blur-3xl" />
      <div className="absolute left-[18%] top-[24%] h-56 w-56 rounded-full bg-grid-magenta/10 blur-3xl" />
      <div className="absolute bottom-[12%] right-[10%] h-64 w-64 rounded-full bg-grid-blue/10 blur-3xl" />
      {sceneMode === "lite" ? (
        <div className="absolute inset-x-0 bottom-0 h-[42vh] bg-[linear-gradient(180deg,rgba(4,6,13,0)_0%,rgba(4,6,13,0.38)_32%,rgba(4,6,13,0.86)_100%)]" />
      ) : null}
    </div>
  );
}
