import * as THREE from 'three';

export function addDragRotation(element, object, camera, canAnimate, invalidate) {
  let pointer = null;
  let previous = new THREE.Vector3();
  let lastMove = 0;
  let speed = 0;
  let invitation = 0.65;
  const axis = new THREE.Vector3(0, 1, 0);
  const rotation = new THREE.Quaternion();

  function project(event) {
    const bounds = element.getBoundingClientRect();
    const x = (event.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2);
    const y = -(event.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2);
    return new THREE.Vector3(x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y))).normalize();
  }

  element.addEventListener('pointerdown', (event) => {
    if (pointer !== null || event.button !== 0) return;
    pointer = event.pointerId;
    invitation = 0;
    previous = project(event);
    lastMove = performance.now();
    speed = 0;
    element.setPointerCapture(pointer);
    element.dataset.dragging = 'true';
    element.focus({ preventScroll: true });
    event.preventDefault();
  });
  element.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointer) return;
    const current = project(event);
    rotation.setFromUnitVectors(previous, current);
    const angle = 2 * Math.acos(THREE.MathUtils.clamp(rotation.w, -1, 1));
    if (angle > 0.00001) {
      axis.set(rotation.x, rotation.y, rotation.z).normalize().applyQuaternion(camera.quaternion);
      object.quaternion.premultiply(rotation.setFromAxisAngle(axis, angle));
      const now = performance.now();
      speed = Math.min(angle / Math.max((now - lastMove) / 1000, 0.008), 5);
      lastMove = now;
      invalidate();
    }
    previous = current;
  });
  function release(event) {
    if (event.pointerId !== pointer) return;
    if (event.type !== 'pointerup' || performance.now() - lastMove > 100 || !canAnimate()) speed = 0;
    pointer = null;
    delete element.dataset.dragging;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    invalidate();
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(name, release);
  element.addEventListener('keydown', (event) => {
    const directions = { ArrowLeft: [0, -1, 0], ArrowRight: [0, 1, 0], ArrowUp: [-1, 0, 0], ArrowDown: [1, 0, 0] };
    if (!directions[event.key]) return;
    invitation = 0;
    event.preventDefault();
    axis.set(...directions[event.key]).applyQuaternion(camera.quaternion);
    object.quaternion.premultiply(rotation.setFromAxisAngle(axis, 0.12));
    speed = 0;
    invalidate();
  });

  return {
    update(dt) {
      if (!canAnimate()) { speed = 0; return; }
      if (pointer !== null) return;
      if (speed > 0.001) {
        object.quaternion.premultiply(rotation.setFromAxisAngle(axis, speed * dt));
        speed *= Math.exp(-3.5 * dt);
      }
      // A small opening turn settles into the slow idle spin. Grabbing takes over immediately.
      object.rotateY(dt * (0.045 + invitation));
      object.rotateX(dt * invitation * 0.2);
      invitation *= Math.exp(-dt * 0.85);
    },
  };
}
