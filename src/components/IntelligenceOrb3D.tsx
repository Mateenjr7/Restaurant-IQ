/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface IntelligenceOrbProps {
  interactive?: boolean;
  size?: 'compact' | 'hero' | 'fullscreen';
  className?: string;
  intensity?: number;
}

export const IntelligenceOrb3D: React.FC<IntelligenceOrbProps> = ({
  interactive = true,
  size = 'hero',
  className = '',
  intensity = 1.0,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [webGlSupported, setWebGlSupported] = useState(true);
  const mousePos = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    // Check reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const container = mountRef.current;
    if (!container) return;
    const tokenColor = (name: string) => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      if (!value) throw new Error(`Missing design token ${name}`);
      return new THREE.Color(value);
    };

    // WebGL support verification
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch (e) {
      console.warn('WebGL initialization unsupported, falling back to CSS visual signature', e);
      setWebGlSupported(false);
      return;
    }

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 400;

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 7.5;

    // Lighting
    const ambientLight = new THREE.AmbientLight(tokenColor('--color-paper'), 0.6);
    scene.add(ambientLight);

    const copperPointLight = new THREE.PointLight(tokenColor('--color-cobalt'), 4.0 * intensity, 20);
    copperPointLight.position.set(4, 5, 4);
    scene.add(copperPointLight);

    const ivoryBackLight = new THREE.PointLight(tokenColor('--color-persimmon'), 2.0 * intensity, 15);
    ivoryBackLight.position.set(-4, -3, -2);
    scene.add(ivoryBackLight);

    // Root Group for rotational choreography
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // 1. Central Core Sphere (Obsidian with subtle facet reflections)
    const coreGeo = new THREE.IcosahedronGeometry(1.2, 3);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: tokenColor('--color-charcoal'),
      roughness: 0.2,
      metalness: 0.9,
      reflectivity: 0.8,
      clearcoat: 0.6,
      clearcoatRoughness: 0.1,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    rootGroup.add(coreMesh);

    // 2. Concentric Orbit Rings (Copper Satin Metal)
    const copperMat = new THREE.MeshStandardMaterial({
      color: tokenColor('--color-cobalt'),
      metalness: 0.95,
      roughness: 0.25,
      emissive: tokenColor('--color-cobalt'),
      emissiveIntensity: 0.08,
    });

    const ring1Geo = new THREE.TorusGeometry(1.9, 0.04, 16, 100);
    const ring1 = new THREE.Mesh(ring1Geo, copperMat);
    ring1.rotation.x = Math.PI / 4;
    rootGroup.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(2.4, 0.035, 16, 100);
    const ring2 = new THREE.Mesh(ring2Geo, copperMat);
    ring2.rotation.y = Math.PI / 3;
    rootGroup.add(ring2);

    const ring3Geo = new THREE.TorusGeometry(2.9, 0.025, 16, 100);
    const ring3 = new THREE.Mesh(ring3Geo, copperMat);
    ring3.rotation.z = Math.PI / 6;
    rootGroup.add(ring3);

    // 3. Market Signal Particle Swarm (Copper & Ivory nodes converging)
    const particleCount = 280;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleScales = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const radius = 2.0 + Math.random() * 2.2;

      particlePositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      particlePositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      particlePositions[i * 3 + 2] = radius * Math.cos(phi);
      particleScales[i] = Math.random();
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: tokenColor('--color-cobalt-soft'),
      size: 0.05,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    rootGroup.add(particles);

    // Interaction handler
    const handleMouseMove = (e: MouseEvent) => {
      if (!interactive || prefersReducedMotion) return;
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mousePos.current.targetX = x * 0.45;
      mousePos.current.targetY = y * 0.45;
    };

    if (interactive) {
      window.addEventListener('mousemove', handleMouseMove);
    }

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
      if (prefersReducedMotion) renderer.render(scene, camera);
    };

    window.addEventListener('resize', handleResize);

    // Visibility observer to pause rendering when tab or element is not visible
    let isVisible = true;
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
    });
    observer.observe(container);

    // Animation Loop
    let animationFrameId = 0;
    const t0 = performance.now();

    const animate = () => {
      if (!prefersReducedMotion) animationFrameId = requestAnimationFrame(animate);

      if (!isVisible) return;

      const elapsedTime = ((performance.now() - t0) / 1000);
      const speedFactor = prefersReducedMotion ? 0 : 0.6;

      // Smooth mouse lerping
      mousePos.current.x += (mousePos.current.targetX - mousePos.current.x) * 0.05;
      mousePos.current.y += (mousePos.current.targetY - mousePos.current.y) * 0.05;

      // Group rotation
      rootGroup.rotation.y = elapsedTime * 0.25 * speedFactor + mousePos.current.x;
      rootGroup.rotation.x = Math.sin(elapsedTime * 0.15 * speedFactor) * 0.15 + mousePos.current.y;

      // Ring counter-rotations
      ring1.rotation.z += 0.005 * speedFactor;
      ring2.rotation.x -= 0.004 * speedFactor;
      ring3.rotation.y += 0.003 * speedFactor;

      // Gentle core breathing
      const scale = 1 + (prefersReducedMotion ? 0 : Math.sin(elapsedTime * 1.5) * 0.03);
      coreMesh.scale.set(scale, scale, scale);

      // Particle subtle rotation
      particles.rotation.y -= 0.002 * speedFactor;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      if (interactive) window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      cancelAnimationFrame(animationFrameId);

      // Clean up Three.js resources
      coreGeo.dispose();
      coreMat.dispose();
      ring1Geo.dispose();
      ring2Geo.dispose();
      ring3Geo.dispose();
      copperMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [interactive, size, intensity]);

  if (!webGlSupported) {
    return (
      <div className={`relative flex items-center justify-center ${className}`}>
        <div className="w-56 h-56 rounded-full border border-cobalt/30 flex items-center justify-center">
          <div className="w-40 h-40 rounded-full border border-cobalt/50 flex items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-charcoal border border-porcelain/20 flex items-center justify-center shadow-lg">
              <div className="w-6 h-6 rounded-full bg-cobalt" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      className={`relative w-full h-full min-h-[300px] flex items-center justify-center overflow-hidden ${className}`}
    />
  );
};
