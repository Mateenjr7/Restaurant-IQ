/** Shared, mutable state read by the WebGL backdrop every frame (no React re-renders). */
export const sceneState = {
  scroll: 0, // 0..1 page progress
  vel: 0, // smoothed scroll velocity (0..~1)
  mouseX: 0.5,
  mouseY: 0.5,
  boost: 0, // temporary energy burst (e.g. on CTA hover)
};
