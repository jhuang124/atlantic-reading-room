import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export type Issue = {
  id: string;
  year: number;
  month: number;
  issue: string;
  cover: string;
  sourceUrl: string;
  coverStories: {
    title: string;
    url: string;
    dek?: string;
    authors: string[];
  }[];
  issueTheme?: string | null;
};
export type RoomAPI = {
  focusYear: (year: number | null) => void;
  select: (id: string | null) => void;
  setLight: (night: boolean) => void;
  setTour: (active: boolean) => void;
  resize: () => void;
  dispose: () => void;
};
export function createRoom(
  host: HTMLDivElement,
  issues: Issue[],
  onSelect: (id: string) => void,
  onHover: (id: string | null) => void,
  onReady: () => void,
): RoomAPI {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.32;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute(
    'aria-label',
    'Interactive three-dimensional Atlantic reading room. Drag to look around, scroll to zoom, or select a cover.',
  );
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#172019');
  scene.fog = new THREE.FogExp2('#172019', 0.015);
  const camera = new THREE.PerspectiveCamera(
    48,
    host.clientWidth / host.clientHeight,
    0.08,
    90,
  );
  camera.position.set(0, 4.6, 9);
  const pmrem = new THREE.PMREMGenerator(renderer),
    env = new RoomEnvironment();
  const envMap = pmrem.fromScene(env, 0.06);
  scene.environment = envMap.texture;
  scene.environmentIntensity = 0.35;
  const texs: THREE.Texture[] = [];
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  const rng = (seed: number) => {
    let n = seed;
    return () => {
      n = (1664525 * n + 1013904223) >>> 0;
      return n / 4294967296;
    };
  };
  const rand = rng(1857);
  function canvasTexture(
    w: number,
    h: number,
    paint: (c: CanvasRenderingContext2D) => void,
  ) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    texs.push(t);
    return t;
  }
  const wood = canvasTexture(256, 1024, (c) => {
    c.fillStyle = '#5e3820';
    c.fillRect(0, 0, 256, 1024);
    for (let k = 0; k < 3200; k++) {
      const x = rand() * 256;
      c.strokeStyle = `rgba(${rand() > 0.5 ? '20,8,0' : '153,103,63'},${rand() * 0.16})`;
      c.lineWidth = rand() * 2 + 0.2;
      c.beginPath();
      c.moveTo(x, 0);
      for (let y = 0; y <= 1024; y += 32)
        c.lineTo(x + Math.sin(y * 0.006 + k) * 2.7, y);
      c.stroke();
    }
  });
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  const paper = canvasTexture(32, 256, (c) => {
    c.fillStyle = '#d2c7af';
    c.fillRect(0, 0, 32, 256);
    for (let y = 0; y < 256; y += 3) {
      c.fillStyle = y % 2 ? '#aa9d83' : '#f0e9da';
      c.fillRect(0, y, 32, 1);
    }
  });
  const plaster = canvasTexture(256, 256, (c) => {
    c.fillStyle = '#344137';
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 12000; i++) {
      c.fillStyle = `rgba(0,0,0,${rand() * 0.09})`;
      c.fillRect(rand() * 256, rand() * 256, 2, 2);
    }
  });
  function material(
    color: string,
    roughness = 0.7,
    metalness = 0,
    map?: THREE.Texture,
  ) {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      map,
    });
    mats.add(m);
    return m;
  }
  const walnut = material('#c4a17d', 0.42, 0, wood),
    darkwood = material('#63513f', 0.55, 0, wood),
    bronze = material('#b39662', 0.3, 0.78),
    wall = material('#a8afa0', 0.88, 0, plaster),
    black = material('#121713', 0.65),
    cream = material('#ded3b9', 0.8),
    leather = material('#384739', 0.45),
    pages = material('#ffffff', 0.94, 0, paper);
  function mesh(
    geo: THREE.BufferGeometry,
    mat: THREE.Material | THREE.Material[],
    parent: THREE.Object3D,
    x = 0,
    y = 0,
    z = 0,
  ) {
    geos.add(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function box(
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material = walnut,
  ) {
    return mesh(new THREE.BoxGeometry(w, h, d), mat, parent, x, y, z);
  }
  function cylinder(
    parent: THREE.Object3D,
    r1: number,
    r2: number,
    h: number,
    x: number,
    y: number,
    z: number,
    mat = bronze,
  ) {
    return mesh(
      new THREE.CylinderGeometry(r1, r2, h, 40),
      mat,
      parent,
      x,
      y,
      z,
    );
  }
  function lettering(
    text: string,
    w: number,
    h: number,
    size = 80,
    color = '#ded4b5',
    font = 'Georgia',
  ) {
    const t = canvasTexture(1024, 256, (c) => {
      c.clearRect(0, 0, 1024, 256);
      c.fillStyle = color;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `${size}px ${font}`;
      c.fillText(text, 512, 128);
    });
    const m = new THREE.MeshBasicMaterial({
      map: t,
      transparent: true,
      depthWrite: false,
    });
    mats.add(m);
    return mesh(new THREE.PlaneGeometry(w, h), m, scene);
  }
  // Individual parquet boards catch the light at alternating angles.
  const floorGeo = new THREE.BoxGeometry(0.58, 0.045, 2.32);
  geos.add(floorGeo);
  const floor = new THREE.InstancedMesh(floorGeo, walnut, 1296);
  floor.receiveShadow = true;
  const dummy = new THREE.Object3D();
  let fi = 0;
  for (let x = 0; x < 27; x++)
    for (let z = 0; z < 24; z++)
      for (let slat = 0; slat < 2; slat++) {
        const turn = (x + z) % 2;
        dummy.position.set(
          (x - 13) * 1.17 + (turn ? 0 : (slat - 0.5) * 0.585),
          -0.035,
          (z - 12) * 1.17 + (turn ? (slat - 0.5) * 0.585 : 0),
        );
        dummy.rotation.y = turn ? Math.PI / 2 : 0;
        dummy.scale.set(1, 1, 0.5);
        dummy.updateMatrix();
        floor.setMatrixAt(fi, dummy.matrix);
        floor.setColorAt(
          fi,
          new THREE.Color().setHSL(0.075, 0.25, 0.29 + rand() * 0.12),
        );
        fi++;
      }
  scene.add(floor);
  box(scene, 40, 0.12, 40, 0, -0.12, -3, darkwood);
  // The shallow arc keeps covers facing the visitor while giving each year a bay.
  const bayAngles = new Map<number, number>();
  const books = new Map<
    string,
    {
      group: THREE.Group;
      home: THREE.Vector3;
      rotation: THREE.Euler;
      issue: Issue;
    }
  >();
  const targets: THREE.Object3D[] = [];
  const loader = new THREE.TextureLoader();
  let loaded = 0;
  const stripMat = new THREE.MeshBasicMaterial({ color: '#ffd997' });
  mats.add(stripMat);
  for (let year = 2021; year <= 2026; year++) {
    const a = (year - 2023.5) * 0.315;
    bayAngles.set(year, a);
    const bay = new THREE.Group();
    bay.position.set(Math.sin(a) * 13.5, 0, -Math.cos(a) * 13.5);
    bay.rotation.y = -a;
    scene.add(bay);
    box(bay, 4.23, 6.55, 0.24, 0, 3.25, -0.3, wall);
    box(bay, 4.23, 0.32, 0.58, 0, 0.16, 0, darkwood);
    box(bay, 4.23, 0.2, 0.66, 0, 6.33, 0, walnut);
    for (const x of [-2.04, 2.04]) {
      box(bay, 0.14, 6.2, 0.53, x, 3.15, 0, walnut);
      box(bay, 0.028, 6.0, 0.035, x, 3.15, 0.29, bronze);
    }
    const label = lettering(String(year), 1.15, 0.29, 125);
    scene.remove(label);
    bay.add(label);
    label.position.set(0, 6.0, 0.04);
    const list = issues
      .filter((i) => i.year === year)
      .sort((a, b) => a.month - b.month);
    for (let row = 0; row < 4; row++) {
      const sy = 0.63 + row * 1.29;
      box(bay, 3.98, 0.085, 0.62, 0, sy, 0.12, walnut);
      box(bay, 3.92, 0.025, 0.025, 0, sy - 0.055, 0.39, stripMat);
      box(bay, 3.92, 0.035, 0.022, 0, sy + 0.035, 0.44, bronze);
    }
    list.forEach((issue, index) => {
      const col = index % 3,
        row = 3 - Math.floor(index / 3),
        x = (col - 1) * 1.23,
        y = 0.63 + row * 1.29 + 0.585;
      const g = new THREE.Group();
      g.position.set(x, y, 0.17);
      g.rotation.x = -0.075;
      bay.add(g);
      box(g, 0.865, 1.125, 0.048, 0, 0, -0.005, pages);
      box(g, 0.891, 1.153, 0.008, 0, 0, -0.035, darkwood);
      const coverMat = new THREE.MeshStandardMaterial({
        color: '#eee6d5',
        roughness: 0.66,
        metalness: 0,
      });
      mats.add(coverMat);
      const cover = mesh(
        new THREE.PlaneGeometry(0.891, 1.153),
        coverMat,
        g,
        0,
        0,
        0.025,
      );
      cover.userData.issueId = issue.id;
      targets.push(cover);
      // Slightly rounded spine, plus a fine fold at the bound edge.
      const spine = cylinder(g, 0.018, 0.018, 1.153, -0.443, 0, -0.002, cream);
      spine.rotation.y = Math.PI / 2;
      const fold = box(g, 0.006, 1.149, 0.004, -0.42, 0, 0.028, darkwood);
      fold.castShadow = false;
      const texture = loader.load(
        issue.cover,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          coverMat.map = t;
          coverMat.color.set('#ffffff');
          coverMat.needsUpdate = true;
          loaded++;
          if (loaded === issues.length) onReady();
        },
        undefined,
        () => {
          loaded++;
          if (loaded === issues.length) onReady();
        },
      );
      texs.push(texture);
      scene.updateMatrixWorld(true);
      const pos = new THREE.Vector3(),
        quat = new THREE.Quaternion(),
        scale = new THREE.Vector3();
      g.matrixWorld.decompose(pos, quat, scale);
      scene.attach(g);
      books.set(issue.id, {
        group: g,
        home: pos.clone(),
        rotation: new THREE.Euler().setFromQuaternion(quat),
        issue,
      });
      const month = lettering(
        issue.issue.replace(` ${year}`, ''),
        0.96,
        0.12,
        63,
        '#c8bda4',
        'sans-serif',
      );
      scene.remove(month);
      bay.add(month);
      month.position.set(x, 0.63 + row * 1.29 - 0.15, 0.435);
    });
    const glow = new THREE.PointLight('#ffd9a0', 11, 6, 2);
    glow.position.set(0, 5.7, 1.0);
    bay.add(glow);
  }
  // Architectural shell: green plaster, stepped cornice, brass picture lights.
  box(scene, 34, 8, 0.3, 0, 4, -14.1, wall);
  for (const x of [-15.7, 15.7]) {
    box(scene, 0.3, 8, 30, x, 4, 0, wall);
    for (let z = -12; z < 9; z += 3) {
      box(scene, 0.13, 6.5, 0.09, x - Math.sign(x) * 0.2, 3.4, z, bronze);
    }
  }
  box(scene, 34, 0.15, 30, 0, 7.5, -1, black);
  for (let year = 2021; year <= 2026; year++) {
    const a = bayAngles.get(year)!,
      g = new THREE.Group();
    g.position.set(Math.sin(a) * 13.5, 0, -Math.cos(a) * 13.5);
    g.rotation.y = -a;
    scene.add(g);
    box(g, 1.15, 0.06, 0.09, 0, 6.48, 0.57, bronze);
    box(g, 1.08, 0.035, 0.1, 0, 6.435, 0.58, stripMat);
    box(g, 0.045, 0.2, 0.52, 0, 6.45, 0.27, bronze);
  }
  // A low reading table, turned legs, magazines and a banker lamp.
  const table = new THREE.Group();
  table.position.set(-2, 0, -2.8);
  table.rotation.y = 0.16;
  scene.add(table);
  const tabletop = mesh(
    new THREE.CylinderGeometry(2.75, 2.75, 0.16, 96),
    walnut,
    table,
    0,
    1.37,
    0,
  );
  tabletop.scale.z = 0.53;
  const trim = mesh(
    new THREE.CylinderGeometry(2.76, 2.76, 0.024, 96),
    bronze,
    table,
    0,
    1.32,
    0,
  );
  trim.scale.z = 0.53;
  for (const x of [-1.9, 1.9])
    for (const z of [-0.63, 0.63]) {
      cylinder(table, 0.065, 0.045, 1.27, x, 0.66, z, darkwood);
      cylinder(table, 0.067, 0.067, 0.16, x, 0.12, z, bronze);
    }
  for (let j = 0; j < 4; j++) {
    const stack = box(
      table,
      0.9,
      0.035,
      1.2,
      0.55,
      1.49 + j * 0.04,
      0.05,
      pages,
    );
    stack.rotation.y = -0.1 + j * 0.035;
  }
  const tableCover = loader.load(issues[0].cover, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
  });
  texs.push(tableCover);
  const tableMat = material('#ffffff', 0.55, 0, tableCover);
  const tb = mesh(
    new THREE.PlaneGeometry(0.9, 1.2),
    tableMat,
    table,
    0.55,
    1.634,
    0.05,
  );
  tb.rotation.x = -Math.PI / 2;
  tb.rotation.z = 0.005;
  const lampX = -1.28;
  const base = cylinder(table, 0.3, 0.34, 0.06, lampX, 1.49, 0);
  base.scale.z = 0.7;
  cylinder(table, 0.026, 0.026, 0.76, lampX, 1.87, 0);
  const shade = mesh(
    new THREE.SphereGeometry(0.41, 36, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    leather,
    table,
    lampX,
    2.27,
    0,
  );
  shade.scale.set(1.4, 0.57, 0.7);
  const under = mesh(
    new THREE.CircleGeometry(0.4, 40),
    stripMat,
    table,
    lampX,
    2.27,
    0,
  );
  under.rotation.x = Math.PI / 2;
  under.scale.set(1.4, 0.7, 1);
  const lampLight = new THREE.PointLight('#ffcf80', 12, 6, 2);
  lampLight.position.set(-3.2, 2.15, -2.8);
  scene.add(lampLight);
  // Upholstered reading chairs. Rounded cushions and cylindrical piping are geometry.
  for (const side of [-1, 1]) {
    const chair = new THREE.Group();
    chair.position.set(side * 4.15, 0, -0.2);
    chair.rotation.y = side * -0.3 + Math.PI;
    scene.add(chair);
    const seat = mesh(
      new THREE.CapsuleGeometry(0.37, 0.82, 6, 20),
      leather,
      chair,
      0,
      0.65,
      0,
    );
    seat.rotation.z = Math.PI / 2;
    seat.scale.set(0.55, 1, 1.35);
    const back = mesh(
      new THREE.CapsuleGeometry(0.36, 0.82, 6, 20),
      leather,
      chair,
      0,
      1.15,
      -0.47,
    );
    back.rotation.z = Math.PI / 2;
    back.scale.set(1.2, 1, 0.42);
    for (const x of [-0.69, 0.69]) {
      const arm = mesh(
        new THREE.CapsuleGeometry(0.11, 0.84, 5, 16),
        walnut,
        chair,
        x,
        1.02,
        0,
      );
      arm.rotation.x = Math.PI / 2;
      for (const z of [-0.4, 0.4])
        cylinder(chair, 0.035, 0.025, 0.84, x, 0.46, z, bronze);
    }
  }
  // A pale, luminous clerestory and long diagonal shadows imply late-afternoon light.
  const sun = new THREE.DirectionalLight('#fff0ce', 3.4);
  sun.position.set(-9, 11, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -18,
    right: 18,
    top: 18,
    bottom: -18,
    near: 0.5,
    far: 45,
  });
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.025;
  scene.add(sun);
  sun.target.position.set(0, 0, -10);
  scene.add(sun.target);
  const fill = new THREE.HemisphereLight('#d6e1d5', '#57432c', 1.7);
  scene.add(fill);
  const windowLight = new THREE.MeshBasicMaterial({ color: '#f7e5c3' });
  mats.add(windowLight);
  for (let k = 0; k < 5; k++) {
    box(scene, 0.06, 4.4, 1.8, -15.47, 4.5, -9 + k * 3.4, windowLight);
  }
  const beamMat = new THREE.MeshBasicMaterial({
    color: '#ddbf80',
    transparent: true,
    opacity: 0.038,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  mats.add(beamMat);
  for (let j = 0; j < 4; j++) {
    const beam = mesh(
      new THREE.PlaneGeometry(2.2, 17),
      beamMat,
      scene,
      -6 + j * 3,
      0.012,
      -1,
    );
    beam.rotation.x = -Math.PI / 2;
    beam.rotation.z = -0.56;
    beam.castShadow = false;
    beam.receiveShadow = false;
  }
  const dustGeo = new THREE.BufferGeometry();
  const dustCoords = new Float32Array(140 * 3);
  for (let i = 0; i < 140; i++) {
    dustCoords[i * 3] = (rand() - 0.5) * 23;
    dustCoords[i * 3 + 1] = rand() * 6.6;
    dustCoords[i * 3 + 2] = rand() * 21 - 13;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustCoords, 3));
  geos.add(dustGeo);
  const dustMat = new THREE.PointsMaterial({
    color: '#e7d8ab',
    size: 0.017,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  mats.add(dustMat);
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);
  const destination = new THREE.Vector3(0, 4.6, 9),
    lookDestination = new THREE.Vector3(0, 3, -10),
    look = new THREE.Vector3(0, 3, -10);
  let active: string | null = null,
    hover: string | null = null,
    tour = false,
    night = false,
    frame = 0,
    disposed = false,
    last = performance.now(),
    dragging = false,
    dragMoved = false;
  let px = 0,
    py = 0,
    downX = 0,
    downY = 0;
  const ray = new THREE.Raycaster(),
    pointer = new THREE.Vector2();
  let currentYear: number | null = null;
  function focusYear(year: number | null) {
    currentYear = year;
    const a = year ? bayAngles.get(year)! : 0;
    if (year) {
      const narrow = host.clientWidth < 700,
        dist = narrow ? 11.7 : 7.9;
      destination.set(
        Math.sin(a) * (13.5 - dist),
        3.42,
        -Math.cos(a) * (13.5 - dist),
      );
      lookDestination.set(Math.sin(a) * 13.5, 3.05, -Math.cos(a) * 13.5);
    } else {
      destination.set(0, 4.6, host.clientWidth < 700 ? 20 : 8.8);
      lookDestination.set(0, 3, -10);
    }
    if (reduced) {
      camera.position.copy(destination);
      look.copy(lookDestination);
    }
  }
  function select(id: string | null) {
    active = id;
  }
  function move(e: PointerEvent) {
    if (dragging) {
      const dx = e.clientX - px,
        dy = e.clientY - py;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5)
        dragMoved = true;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(
        camera.quaternion,
      );
      destination.addScaledVector(right, -dx * 0.012);
      lookDestination.addScaledVector(right, -dx * 0.012);
      destination.y = THREE.MathUtils.clamp(
        destination.y + dy * 0.008,
        1.5,
        6.4,
      );
      px = e.clientX;
      py = e.clientY;
      return;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(targets)[0];
    const next = hit?.object.userData.issueId ?? null;
    if (next !== hover) {
      hover = next;
      onHover(next);
      renderer.domElement.style.cursor = next ? 'pointer' : 'grab';
    }
  }
  function down(e: PointerEvent) {
    dragging = true;
    dragMoved = false;
    downX = px = e.clientX;
    downY = py = e.clientY;
    renderer.domElement.setPointerCapture(e.pointerId);
  }
  function up(e: PointerEvent) {
    if (!dragMoved) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects(targets)[0];
      if (hit) onSelect(hit.object.userData.issueId);
    }
    dragging = false;
    if (renderer.domElement.hasPointerCapture(e.pointerId))
      renderer.domElement.releasePointerCapture(e.pointerId);
  }
  function wheel(e: WheelEvent) {
    e.preventDefault();
    if (active) return;
    const dir = destination.clone().sub(lookDestination);
    const length = THREE.MathUtils.clamp(
      dir.length() + e.deltaY * 0.009,
      4.5,
      28,
    );
    destination
      .copy(lookDestination)
      .add(dir.normalize().multiplyScalar(length));
  }
  function leave() {
    if (!dragging) {
      hover = null;
      onHover(null);
    }
  }
  renderer.domElement.addEventListener('pointermove', move);
  renderer.domElement.addEventListener('pointerdown', down);
  renderer.domElement.addEventListener('pointerup', up);
  renderer.domElement.addEventListener('pointercancel', up);
  renderer.domElement.addEventListener('pointerleave', leave);
  renderer.domElement.addEventListener('wheel', wheel, { passive: false });
  renderer.domElement.style.touchAction = 'none';
  function animate(now: number) {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    if (document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const ease = reduced ? 1 : 1 - Math.exp(-dt * 4);
    camera.position.lerp(destination, ease);
    look.lerp(lookDestination, ease);
    if (tour && !active && !reduced) {
      const t = now * 0.000075;
      camera.position.x += Math.sin(t) * dt * 0.12;
      camera.position.y += Math.cos(t * 0.8) * dt * 0.03;
    }
    camera.lookAt(look);
    for (const [id, b] of books) {
      if (id === active) {
        const narrow = host.clientWidth < 700;
        const offset = new THREE.Vector3(
          narrow ? 0 : -0.83,
          narrow ? 0.5 : 0.04,
          narrow ? -2.9 : -3.3,
        );
        offset.applyQuaternion(camera.quaternion).add(camera.position);
        b.group.position.lerp(offset, ease);
        const q = camera.quaternion.clone();
        if (!reduced) {
          q.multiply(
            new THREE.Quaternion().setFromEuler(
              new THREE.Euler(
                Math.sin(now * 0.0004) * 0.015,
                Math.sin(now * 0.0003) * 0.025,
                0,
              ),
            ),
          );
        }
        b.group.quaternion.slerp(q, ease);
        b.group.scale.lerp(new THREE.Vector3(2.05, 2.05, 2.05), ease);
      } else {
        const p = b.home.clone();
        if (hover === id) {
          p.add(new THREE.Vector3(0, 0.02, 0.15).applyEuler(b.rotation));
        }
        b.group.position.lerp(p, ease);
        b.group.quaternion.slerp(
          new THREE.Quaternion().setFromEuler(b.rotation),
          ease,
        );
        b.group.scale.lerp(new THREE.Vector3(1, 1, 1), ease);
      }
    }
    if (!reduced) dust.rotation.y = now * 0.000008;
    renderer.toneMappingExposure = THREE.MathUtils.lerp(
      renderer.toneMappingExposure,
      night ? 0.91 : 1.32,
      ease,
    );
    sun.intensity = THREE.MathUtils.lerp(
      sun.intensity,
      night ? 0.32 : 3.4,
      ease,
    );
    fill.intensity = THREE.MathUtils.lerp(
      fill.intensity,
      night ? 0.85 : 1.7,
      ease,
    );
    renderer.render(scene, camera);
  }
  focusYear(2025);
  frame = requestAnimationFrame(animate);
  const resize = () => {
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
    focusYear(currentYear);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  return {
    focusYear,
    select,
    setLight: (v) => {
      night = v;
    },
    setTour: (v) => {
      tour = v;
    },
    resize,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointermove', move);
      renderer.domElement.removeEventListener('pointerdown', down);
      renderer.domElement.removeEventListener('pointerup', up);
      renderer.domElement.removeEventListener('pointercancel', up);
      renderer.domElement.removeEventListener('pointerleave', leave);
      renderer.domElement.removeEventListener('wheel', wheel);
      for (const t of texs) t.dispose();
      for (const m of mats) m.dispose();
      for (const g of geos) g.dispose();
      envMap.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
