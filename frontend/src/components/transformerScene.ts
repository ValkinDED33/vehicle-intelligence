import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { TransformerAppearance } from "../utils/transformerAppearance";

function buildTransformer(a: TransformerAppearance) {
  const root = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: a.paint, metalness: .65, roughness: .3 });
  const metal = new THREE.MeshStandardMaterial({ color: "#81969d", metalness: .85, roughness: .32 });
  const dark = new THREE.MeshStandardMaterial({ color: "#17252b", metalness: .5, roughness: .5 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#101719", roughness: .9 });
  const glass = new THREE.MeshStandardMaterial({ color: "#345b65", metalness: .7, roughness: .16 });
  const glow = new THREE.MeshStandardMaterial({ color: a.accent, emissive: a.accent, emissiveIntensity: 1.8 });
  const wide = (a.frame === "utility" ? 1.15 : a.frame === "van" ? 1.22 : a.frame === "sport" ? .93 : 1) * (.97 + (a.seed >>> 12) % 100 / 1600);
  const tall = a.frame === "van" ? 1.08 : a.frame === "sport" ? .96 : 1;
  const variant = a.seed % 7;
  const box = (parent: THREE.Object3D, material: THREE.Material, size: number[], position: number[], rotation = 0) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(size[0], size[1], size[2], 3, Math.min(...size) * .18), material);
    mesh.position.set(position[0], position[1], position[2]); mesh.rotation.z = rotation;
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const wheel = (parent: THREE.Object3D, x: number, y: number, z: number, size: number) => {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(size, size, .24, 20), rubber);
    tire.rotation.z = Math.PI / 2; tire.position.set(x, y, z); parent.add(tire);
    for (const side of [-1, 1]) {
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(size * .61, size * .61, .025, 10), metal);
      hub.rotation.z = Math.PI / 2; hub.position.set(x + side * .13, y, z); parent.add(hub);
    }
  };
  const torso = new THREE.Group(); torso.position.y = 2.65 * tall; root.add(torso);
  box(torso, dark, [1.05 * wide, 1.35, .65], [0, .25, 0]);
  const bonnet = box(torso, paint, [1.5 * wide, .64, .82], [0, .65, .18]); bonnet.rotation.x = -.13;
  for (const sign of [-1, 1]) {
    const panel = box(torso, paint, [.63 * wide, .4, .13], [sign * .43 * wide, .87, .56], sign * .1);
    panel.rotation.y = sign * .14;
    box(torso, metal, [.035, .34, .055], [sign * .26, .82, .67], sign * .1);
  }
  box(torso, glass, [1.12 * wide, .28, .1], [0, 1.04, .36]);
  box(torso, dark, [.8 * wide, .26, .1], [0, .54, .62]);
  const slats = a.frame === "sport" ? 5 : 3 + variant % 3;
  for (let i = 0; i < slats; i++) box(torso, metal, [.68 * wide, .018, .03], [0, .45 + i * .045, .69]);
  for (const sign of [-1, 1]) {
    box(torso, glow, [.26, .09, .07], [sign * .59 * wide, .72, .64], sign * (variant % 3) * .08);
    box(torso, paint, [.28 * wide, .4, .54], [sign * .45, -.12, .15], sign * .16);
  }
  for (let i = 0; i < 3; i++) box(torso, metal, [.45 - i * .06, .12, .38], [0, -.14 - i * .17, .32]);
  box(root, dark, [.85, .35, .6], [0, 1.83 * tall, 0]);
  for (const sign of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(sign * .45, 1.8 * tall, 0); leg.rotation.z = sign * .06; root.add(leg);
    box(leg, metal, [.35, .9, .35], [0, -.45, 0]);
    box(leg, paint, [.49 * wide, .6, .52], [0, -.43, .13]);
    box(leg, dark, [.14, .42, .04], [0, -.45, .41], -sign * .12);
    box(leg, dark, [.38, .22, .42], [0, -.93, .03]);
    box(leg, paint, [.55 * wide, .7, .62], [sign * .05, -1.3, .05]);
    box(leg, metal, [.26, .46, .07], [sign * .05, -1.3, .4], -sign * .1);
    box(leg, glow, [.04, .4, .04], [sign * .15, -1.31, .39]);
    wheel(leg, sign * .31, -1.26, -.06, a.frame === "utility" ? .31 : .26);
    box(leg, dark, [.62 * wide, .2, .92], [sign * .08, -1.68, .2]);
    box(leg, paint, [.56 * wide, .16, .52], [sign * .08, -1.56, .41]);
  }
  const arms: THREE.Group[] = [];
  for (const sign of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(sign * .92 * wide, 3.28 * tall, 0); arm.rotation.z = sign * .13; root.add(arm); arms.push(arm);
    box(arm, paint, [.6 * wide, .52, .69], [sign * .08, 0, 0], -sign * .2);
    wheel(arm, sign * .36 * wide, 0, -.05, .31 + variant * .007);
    box(arm, metal, [.24, .83, .27], [sign * .08, -.55, 0]);
    const joint = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 8), dark);
    joint.position.set(sign * .1, -.63, .03); arm.add(joint);
    box(arm, paint, [.45, .54, .5], [sign * .15, -.89, .03]);
    box(arm, glow, [.04, .26, .04], [sign * .28, -.85, .3]);
    box(arm, dark, [.35, .3, .3], [sign * .17, -1.29, .05]);
    for (let i = 0; i < 3; i++) box(arm, metal, [.07, .22, .08], [sign * (.06 + i * .1), -1.4, .24]);
    const door = box(torso, paint, [.47, .85 + variant * .025, .12], [sign * .87 * wide, .65, -.46], -sign * (.32 + variant * .04));
    door.rotation.y = sign * .3;
    box(door, glass, [.34, .34, .05], [0, .19, -.08]);
  }
  box(root, metal, [.2, .2, .2], [0, 3.82 * tall, 0]);
  const head = new THREE.Group(); head.position.y = 4.04 * tall; root.add(head);
  box(head, paint, [.57 + variant * .012, .61, .52], [0, .02, 0]);
  for (const sign of [-1, 1]) box(head, metal, [.15, .31, .2], [sign * .24, -.07, .25], sign * .12);
  box(head, dark, [.45, .31, .08], [0, -.03, .28]);
  box(head, metal, [.26, .14, .08], [0, -.16, .35]);
  for (const sign of [-1, 1]) {
    box(head, glow, [.14, .045, .05], [sign * .12, .05, .34], -sign * .09);
    box(head, metal, [.1, .36 + variant * .025, .16], [sign * .29, .26, -.04], -sign * .17);
  }
  box(head, paint, [.12 + variant * .006, .27, .36], [0, .34, -.02]);
  const labelCanvas = document.createElement("canvas"); labelCanvas.width = 512; labelCanvas.height = 96;
  const ctx = labelCanvas.getContext("2d")!;
  ctx.fillStyle = "#15272e"; ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = "#edf7f8"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "600 30px Arial";
  ctx.fillText(a.label.toUpperCase(), 256, 32, 480);
  ctx.font = "20px Arial"; ctx.fillStyle = a.accent;
  ctx.fillText(a.code, 256, 73);
  const texture = new THREE.CanvasTexture(labelCanvas); texture.colorSpace = THREE.SRGBColorSpace;
  box(torso, new THREE.MeshStandardMaterial({ map: texture, roughness: .7 }), [.9, .17, .035], [0, .14, .64]);
  return { root, head, arms };
}

function disposeScene(scene: THREE.Scene) {
  const materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  for (const material of materials) {
    if ("map" in material && material.map instanceof THREE.Texture) material.map.dispose();
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
}

function litScene(a: TransformerAppearance, hero: boolean) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#e8f6ff", "#293a39", 3));
  const key = new THREE.DirectionalLight("#ffffff", 4); key.position.set(3, 7, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(a.accent, 3); rim.position.set(-4, 3, -3); scene.add(rim);
  const robot = buildTransformer(a); scene.add(robot.root);
  if (hero) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.MeshStandardMaterial({ color: "#0b171d", metalness: .1, roughness: .85, envMapIntensity: .1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.03; scene.add(floor);
    const grid = new THREE.GridHelper(30, 30, "#40626b", "#233c45"); scene.add(grid);
    scene.fog = new THREE.Fog("#07131b", 10, 26);
  }
  return { scene, robot };
}

function environment(renderer: THREE.WebGLRenderer) {
  const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(room, .04);
  room.dispose(); pmrem.dispose(); return target;
}

export function mountTransformer(canvas: HTMLCanvasElement, a: TransformerAppearance): () => void {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const { scene, robot } = litScene(a, true);
  const env = environment(renderer); scene.environment = env.texture; scene.environmentIntensity = 1.25;
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 60);
  camera.position.set(5.4, 3.9, 9.5); camera.lookAt(0, 2.25, 0);
  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
    camera.setViewOffset(width, height, -width * (width < 500 ? .04 : .17), 0, width, height);
    renderer.render(scene, camera);
  };
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  let pointerX = 0, pointerY = 0, frame = 0;
  const pointer = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointerX = ((event.clientX - rect.left) / rect.width - .5) * .35;
    pointerY = ((event.clientY - rect.top) / rect.height - .5) * .15;
  };
  const leave = () => { pointerX = pointerY = 0; };
  canvas.addEventListener("pointermove", pointer); canvas.addEventListener("pointerleave", leave);
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const animate = (time: number) => {
    frame = requestAnimationFrame(animate);
    if (document.hidden) return;
    const t = motion.matches ? 0 : time / 1000;
    robot.root.rotation.y = -.15 + pointerX + Math.sin(t * .42) * .045;
    robot.head.rotation.y = pointerX * .65; robot.head.rotation.x = pointerY;
    robot.arms.forEach((arm, i) => arm.rotation.x = Math.sin(t * .85 + i) * .035);
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(animate);
  return () => {
    cancelAnimationFrame(frame); observer.disconnect();
    canvas.removeEventListener("pointermove", pointer); canvas.removeEventListener("pointerleave", leave);
    disposeScene(scene); env.dispose(); renderer.dispose(); renderer.forceContextLoss();
  };
}

const portraits = new Map<string, string>();
let portraitRenderer: THREE.WebGLRenderer | undefined;
let portraitEnvironment: THREE.WebGLRenderTarget | undefined;
export async function transformerPortrait(a: TransformerAppearance): Promise<string> {
  const cached = portraits.get(a.key); if (cached) return cached;
  portraitRenderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true });
  portraitRenderer.setSize(192, 192); portraitRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  portraitEnvironment ??= environment(portraitRenderer);
  const { scene, robot } = litScene(a, false);
  scene.environment = portraitEnvironment.texture;
  robot.root.rotation.y = -.2;
  const camera = new THREE.PerspectiveCamera(32, 1, .1, 30);
  camera.position.set(1.8, 4.15, 3.9); camera.lookAt(0, 3.58, 0);
  portraitRenderer.render(scene, camera);
  const url = portraitRenderer.domElement.toDataURL("image/png");
  disposeScene(scene);
  if (portraits.size >= 96) portraits.delete(portraits.keys().next().value!);
  portraits.set(a.key, url); return url;
}
