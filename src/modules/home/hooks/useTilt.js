import { useRef, useCallback } from 'react';
import { useMotionValue, useSpring, useTransform } from 'framer-motion';

/**
 * useTilt — returns motion handlers + transformed style for a card that tilts
 * in 3D following the cursor.
 *
 * Usage:
 *   const { ref, onMouseMove, onMouseLeave, style } = useTilt({ max: 8 });
 *   <motion.div ref={ref} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave} style={style}>...
 *
 * Spring config keeps motion buttery without feeling laggy.
 */
export default function useTilt({ max = 10, scale = 1.02, speed = 250 } = {}) {
  const ref = useRef(null);

  // 0..1 normalized cursor offset from card center
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Springs for smooth motion
  const sx = useSpring(x, { stiffness: speed, damping: 22, mass: 0.4 });
  const sy = useSpring(y, { stiffness: speed, damping: 22, mass: 0.4 });

  // Map -1..1 → -max..max degrees. y inverts because pointer down = tilt forward.
  const rotateY = useTransform(sx, [-1, 1], [-max, max]);
  const rotateX = useTransform(sy, [-1, 1], [max, -max]);

  const onMouseMove = useCallback((e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    x.set(px * 2 - 1);
    y.set(py * 2 - 1);
  }, [x, y]);

  const onMouseLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return {
    ref,
    onMouseMove,
    onMouseLeave,
    style: {
      rotateX,
      rotateY,
      transformStyle: 'preserve-3d',
      transformPerspective: 1000,
    },
    // glare offsets, useful for inner elements
    glareX: useTransform(sx, [-1, 1], ['0%', '100%']),
    glareY: useTransform(sy, [-1, 1], ['0%', '100%']),
  };
}
