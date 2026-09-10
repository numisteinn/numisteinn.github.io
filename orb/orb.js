import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { addDragRotation } from "./drag-rotation.js";
import { createSurface } from "./surface.js";

const figure = document.querySelector(".silver-orb");
if (figure) {
  if (figure.classList.contains("silver-orb-traveler")) {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const headerLayout = matchMedia("(max-width: 760px)");
    function updateTravel() {
      if (headerLayout.matches) {
        figure.style.setProperty("--orb-scale", "1");
        figure.style.setProperty("--orb-inverse-scale", "1");
        figure.style.setProperty("--orb-travel", "0px");
        return;
      }
      const range = Math.max(
        1,
        document.documentElement.scrollHeight - innerHeight,
      );
      const progress = THREE.MathUtils.clamp(scrollY / range, 0, 1);
      const scale = preference.matches
        ? 0.5
        : 1 - 0.5 * (1 - (1 - progress) ** 4);
      const distance = Math.max(
        0,
        innerHeight - figure.offsetHeight * scale - 48,
      );
      figure.style.setProperty("--orb-scale", String(scale));
      figure.style.setProperty("--orb-inverse-scale", String(1 / scale));
      figure.style.setProperty(
        "--orb-travel",
        `${preference.matches ? 0 : progress * distance}px`,
      );
    }
    window.addEventListener("scroll", updateTravel, { passive: true });
    window.addEventListener("resize", updateTravel);
    preference.addEventListener("change", updateTravel);
    headerLayout.addEventListener("change", updateTravel);
    // Expanded course listings change the document's scroll range.
    new ResizeObserver(updateTravel).observe(document.body);
    updateTravel();
  }
  // The introduction and poster are usable before any GPU or HDR work begins.
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      startOrb().catch(() => {
        figure.dataset.status = "fallback";
      });
    },
    { rootMargin: "150px" },
  );
  observer.observe(figure);
}

async function startOrb() {
  const stage = figure.querySelector(".silver-orb-stage");
  const dragTarget = figure.querySelector(".silver-orb-drag");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 4 / 3, 0.1, 30);
  camera.position.set(0, 0, 5.6);
  const { material, uniforms } = createSurface();
  const geometry = new THREE.SphereGeometry(1.08, 192, 128);
  const orb = new THREE.Mesh(geometry, material);
  orb.position.y = 0.14;
  scene.add(orb);
  const modelView = new THREE.Matrix4();
  orb.onBeforeRender = () => {
    modelView.multiplyMatrices(camera.matrixWorldInverse, orb.matrixWorld);
    uniforms.uNormalMatrix.value.getNormalMatrix(modelView);
  };

  const pmrem = new THREE.PMREMGenerator(renderer);
  let environment;
  try {
    const texture = await new RGBELoader().loadAsync(
      new URL("./studio-small-09-1k.hdr", import.meta.url).href,
    );
    texture.mapping = THREE.EquirectangularReflectionMapping;
    environment = pmrem.fromEquirectangular(texture);
    texture.dispose();
    scene.environment = environment.texture;
    scene.environmentRotation.set(0, 0.8, 0);
  } catch (error) {
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    throw error;
  } finally {
    pmrem.dispose();
  }

  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  let paused = preference.matches;
  let visible = false;
  let failed = false;
  let frame = 0;
  let lastTime = 0;
  let time = 0,
    impulse = paused ? 0 : 0.9,
    energy = 0,
    spring = 0,
    springVelocity = paused ? 0 : 0.8,
    travel = 0;
  let lastScroll = scrollY;
  function canAnimate() {
    return !paused && visible && !document.hidden && !failed;
  }
  function invalidate() {
    if (!frame && visible && !document.hidden && !failed)
      frame = requestAnimationFrame(render);
  }
  const drag = addDragRotation(dragTarget, orb, camera, canAnimate, invalidate);

  function render(now) {
    frame = 0;
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.04) : 0;
    lastTime = now;
    if (canAnimate()) {
      time += dt;
      impulse *= Math.exp(-dt * 2.4);
      energy = THREE.MathUtils.damp(energy, impulse, 7, dt);
      springVelocity += (-spring * 22 - springVelocity * 4.2) * dt;
      spring = THREE.MathUtils.clamp(spring + springVelocity * dt, -1.2, 1.2);
      uniforms.uTime.value = time;
      uniforms.uEnergy.value = energy;
      uniforms.uSpring.value = spring;
      uniforms.uTravel.value = THREE.MathUtils.damp(
        uniforms.uTravel.value,
        travel,
        4,
        dt,
      );
      orb.position.y = 0.14 + Math.sin(time * 0.7) * 0.045;
    }
    drag.update(dt);
    renderer.render(scene, camera);
    figure.dataset.motion = paused
      ? "paused"
      : energy > 0.035
        ? "rippling"
        : "idle";
    if (canAnimate()) invalidate();
  }
  function suspend() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  }
  preference.addEventListener("change", (event) => {
    paused = event.matches;
    invalidate();
  });
  function disturb(delta) {
    if (!canAnimate()) return;
    impulse = Math.min(1.6, impulse + Math.abs(delta) * 0.008);
    springVelocity += THREE.MathUtils.clamp(delta * 0.012, -1.8, 1.8);
    travel += delta * 0.0015;
  }
  window.addEventListener(
    "scroll",
    () => {
      const delta = scrollY - lastScroll;
      lastScroll = scrollY;
      disturb(delta);
    },
    { passive: true },
  );
  window.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey) return;
      const maxScroll = document.documentElement.scrollHeight - innerHeight;
      if (
        maxScroll <= 0 ||
        (scrollY <= 0 && event.deltaY < 0) ||
        (scrollY >= maxScroll - 1 && event.deltaY > 0)
      ) {
        const unit =
          event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
        disturb(event.deltaY * unit);
      }
    },
    { passive: true },
  );
  document.addEventListener("visibilitychange", () => {
    suspend();
    invalidate();
  });

  const visibility = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    figure.dataset.visible = String(visible);
    if (!visible) suspend();
    else invalidate();
  });
  visibility.observe(stage);
  const resize = new ResizeObserver(() => {
    const { width, height } = stage.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    invalidate();
  });
  resize.observe(stage);

  renderer.domElement.setAttribute("aria-hidden", "true");
  stage.insertBefore(renderer.domElement, dragTarget);
  // Only hide the poster after a complete first frame, including the HDR.
  const { width, height } = stage.getBoundingClientRect();
  renderer.setSize(width, height);
  renderer.render(scene, camera);
  figure.dataset.ready = "true";
  dragTarget.hidden = false;
  invalidate();

  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    failed = true;
    suspend();
    visibility.disconnect();
    resize.disconnect();
    delete figure.dataset.ready;
    figure.dataset.status = "fallback";
    renderer.domElement.remove();
    dragTarget.hidden = true;
    geometry.dispose();
    material.dispose();
    environment.dispose();
    renderer.dispose();
  });
}
