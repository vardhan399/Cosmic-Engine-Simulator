import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * useThreeScene — mounts a Three.js scene into a container ref.
 * The setup callback receives ({ scene, camera, renderer, controls }) and returns
 * an optional { update(dt, t), dispose() } handle.
 *
 * A minimal custom orbit controller (mouse + wheel) is provided because
 * OrbitControls in three r160 requires addon import; we keep it dependency-free.
 */
export function useThreeScene(containerRef, setup, deps = []) {
  const handleRef = useRef(null);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const width = host.clientWidth;
    const height = host.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 10000);
    camera.position.set(0, 8, 18);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x02030a, 1);
    host.appendChild(renderer.domElement);

    // Lightweight orbit controller
    const controls = createOrbitController(camera, renderer.domElement);

    const clock = new THREE.Clock();
    const handle = setup({ scene, camera, renderer, controls }) || {};

    let running = true;
    const animate = () => {
      if (!running) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.getElapsedTime();
      controls.update();
      if (handle.update) handle.update(dt, t);
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      running = false;
      window.removeEventListener('resize', onResize);
      controls.dispose();
      if (handle.dispose) handle.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return handleRef;
}

function createOrbitController(camera, el) {
  let phi = Math.PI / 2.5, theta = 0, radius = 20;
  const target = new THREE.Vector3(0, 0, 0);
  let dragging = false, lastX = 0, lastY = 0;

  const update = () => {
    const x = target.x + radius * Math.sin(phi) * Math.cos(theta);
    const y = target.y + radius * Math.cos(phi);
    const z = target.z + radius * Math.sin(phi) * Math.sin(theta);
    camera.position.set(x, y, z);
    camera.lookAt(target);
  };
  update();

  const onDown = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
  const onUp = () => { dragging = false; };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    theta -= dx * 0.005;
    phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi - dy * 0.005));
  };
  const onWheel = (e) => {
    e.preventDefault();
    radius *= 1 + Math.sign(e.deltaY) * 0.08;
    radius = Math.max(2, Math.min(500, radius));
  };
  const onTouchStart = (e) => {
    if (e.touches.length === 1) { dragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }
  };
  const onTouchMove = (e) => {
    if (!dragging || e.touches.length !== 1) return;
    onMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
  };

  el.addEventListener('mousedown', onDown);
  el.addEventListener('mouseup', onUp);
  el.addEventListener('mouseleave', onUp);
  el.addEventListener('mousemove', onMove);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('touchstart', onTouchStart);
  el.addEventListener('touchend', onUp);
  el.addEventListener('touchmove', onTouchMove);

  return {
    update,
    setTarget(v) { target.copy(v); },
    setRadius(r) { radius = r; },
    dispose() {
      el.removeEventListener('mousedown', onDown);
      el.removeEventListener('mouseup', onUp);
      el.removeEventListener('mouseleave', onUp);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onUp);
      el.removeEventListener('touchmove', onTouchMove);
    },
  };
}
