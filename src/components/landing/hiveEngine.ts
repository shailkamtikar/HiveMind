import {
  Color,
  CylinderGeometry,
  DirectionalLight,
  EdgesGeometry,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
} from "three";
import { buildCells, HIVE_RADIUS, pathToCentre, toPlane, wobble, type Cell } from "./hive";

/**
 * The 3D honeycomb: cells for four friends and the AI, message ripples crossing the comb, drag to turn,
 * click to lift a cell. Named imports from three.js keep the bundle to what is actually used.
 * Returns a function that tears everything down. Throws if WebGL is unavailable.
 */

const SIZE = 1; // hexagon circumradius in scene units

export type HiveInfo = { label: string; text: string } | null;

export function startHive(el: HTMLElement, onInfo: (info: HiveInfo) => void): () => void {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.className = "block size-full touch-pan-y";
  el.appendChild(canvas);
  const figure = el.closest("figure");

  const scene = new Scene();
  const camera = new PerspectiveCamera(28, 1, 0.1, 100);
  const world = new Group();
  scene.add(world);
  scene.add(new HemisphereLight(0xffffff, 0x8a8478, 1.5));
  const sun = new DirectionalLight(0xffffff, 2.1);
  sun.position.set(4, 9, 6);
  scene.add(sun);

  // Colours come from the CSS design tokens and follow light/dark changes.
  const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888888";
  const palette = () => ({
    empty: new Color(token("--surface-2")).lerp(new Color(token("--border")), 0.35),
    member: new Color(token("--accent")),
    ai: new Color(token("--foreground")),
    edge: new Color(token("--foreground")),
  });
  let colors = palette();

  const cells = buildCells();
  type Item = { cell: Cell; mesh: Mesh; edges: LineSegments; height: number; lift: number };
  const geometry = new CylinderGeometry(SIZE * 0.93, SIZE * 0.93, 1, 6);
  const edgeGeometry = new EdgesGeometry(geometry);
  const items: Item[] = cells.map((cell, index) => {
    const height = cell.kind === "ai" ? 1.15 : cell.kind === "member" ? 0.62 : 0.3 + wobble(cell.q, cell.r) * 0.16;
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: colors[cell.kind === "empty" ? "empty" : cell.kind], roughness: 0.78, metalness: 0.02 }));
    const { x, z } = toPlane(cell.q, cell.r, SIZE);
    mesh.position.set(x, 0, z);
    mesh.scale.y = height;
    mesh.userData.index = index;
    const edges = new LineSegments(edgeGeometry, new LineBasicMaterial({ color: colors.edge, transparent: true, opacity: 0.4 }));
    mesh.add(edges);
    world.add(mesh);
    return { cell, mesh, edges, height, lift: 0 };
  });
  const recolour = () => {
    colors = palette();
    for (const it of items) {
      (it.mesh.material as MeshStandardMaterial).color.copy(colors[it.cell.kind === "empty" ? "empty" : it.cell.kind]);
      (it.edges.material as LineBasicMaterial).color.copy(colors.edge);
    }
  };
  const themeWatch = new MutationObserver(recolour);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", recolour);

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = el;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Fit the whole comb (a circle of radius R) whatever shape the box is.
    const R = HIVE_RADIUS * Math.sqrt(3) * SIZE + SIZE * 1.1;
    const vHalf = (camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const d = (R / Math.sin(Math.min(vHalf, hHalf))) * 0.93;
    const elevation = (46 * Math.PI) / 180;
    camera.position.set(0, d * Math.sin(elevation), d * Math.cos(elevation));
    camera.lookAt(0, -0.35, 0); // a little below centre, so the comb sits above the caption bar
    camera.updateProjectionMatrix();
  };
  const sizeWatch = new ResizeObserver(resize);
  sizeWatch.observe(el);
  resize();

  // Interaction
  const ray = new Raycaster();
  const pointer = new Vector2();
  let yaw = -0.5;
  let velocity = 0;
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let hovered = -1;
  let selected = -1;
  let visible = true;

  const pick = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(items.map((i) => i.mesh), false)[0];
    return hit ? (hit.object.userData.index as number) : -1;
  };
  const describe = (i: number): HiveInfo => {
    if (i < 0) return null;
    const c = items[i].cell;
    return { label: c.kind === "ai" ? "HiveMind" : c.kind === "member" ? c.name! : "Open seat", text: c.line! };
  };
  const refreshInfo = () => onInfo(describe(selected >= 0 ? selected : hovered));

  const onDown = (e: PointerEvent) => {
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    velocity = 0;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (dragging) {
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      moved += Math.abs(dx);
      yaw += dx * 0.009;
      velocity = dx * 0.009;
    } else {
      const h = pick(e.clientX, e.clientY);
      if (h !== hovered) {
        hovered = h;
        canvas.style.cursor = h >= 0 ? "pointer" : "grab";
        refreshInfo();
      }
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (moved < 5) {
      const h = pick(e.clientX, e.clientY);
      selected = h === selected ? -1 : h;
      refreshInfo();
    }
  };
  const onCancel = () => (dragging = false);
  const onLeave = () => {
    if (!dragging && hovered !== -1) {
      hovered = -1;
      refreshInfo();
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") velocity -= 0.04;
    if (e.key === "ArrowRight") velocity += 0.04;
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.style.cursor = "grab";
  figure?.addEventListener("keydown", onKey);

  // Message ripples: a member's message crosses the comb to the AI, which glows as it answers.
  type Pulse = { start: number; path: { q: number; r: number }[] };
  const pulses: Pulse[] = [];
  const members = items.filter((i) => i.cell.kind === "member").map((i) => i.cell);
  let nextPulse = 1.2;
  let memberTurn = 0;
  const aiIndex = items.findIndex((i) => i.cell.kind === "ai");

  const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), { threshold: 0 });
  io.observe(el);
  let raf = 0;
  let last = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!visible || document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;

    if (!dragging) {
      velocity *= Math.pow(0.04, dt); // inertia fades out
      yaw += velocity + dt * 0.11; // and the comb keeps turning slowly
    }
    world.rotation.y = yaw;

    if (t > nextPulse && pulses.length < 2) {
      const from = members[memberTurn++ % members.length];
      pulses.push({ start: t, path: pathToCentre(from.q, from.r) });
      nextPulse = t + 3.4;
    }
    for (let i = pulses.length - 1; i >= 0; i--) if (t - pulses[i].start > 6) pulses.splice(i, 1);

    for (const [index, it] of items.entries()) {
      let bump = 0;
      for (const p of pulses) {
        const step = p.path.findIndex((c) => c.q === it.cell.q && c.r === it.cell.r);
        if (step >= 0) {
          const x = (t - p.start) / 0.32 - step;
          bump += Math.exp(-x * x * 1.6) * (it.cell.kind === "ai" ? 0.45 : 0.3);
        }
      }
      const target = bump + (index === hovered ? 0.14 : 0) + (index === selected ? 0.75 : 0);
      it.lift += (target - it.lift) * Math.min(1, dt * 9);
      it.mesh.scale.y = it.height + it.lift;
      it.mesh.position.y = (it.height + it.lift) / 2;
    }
    (items[aiIndex].mesh.material as MeshStandardMaterial).emissive.copy(colors.member).multiplyScalar(Math.min(0.5, items[aiIndex].lift * 0.9));

    renderer.render(scene, camera);
    figure?.setAttribute("data-yaw", yaw.toFixed(2));
    figure?.setAttribute("data-selected", selected >= 0 ? items[selected].cell.name! : "");
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    sizeWatch.disconnect();
    themeWatch.disconnect();
    scheme.removeEventListener("change", recolour);
    figure?.removeEventListener("keydown", onKey);
    for (const it of items) {
      (it.mesh.material as MeshStandardMaterial).dispose();
      (it.edges.material as LineBasicMaterial).dispose();
    }
    geometry.dispose();
    edgeGeometry.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
