import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

// Сцена светильника «Орбита». Модель собирается процедурно:
// каменное основание → стойка → дуга-держатель → стеклянное ядро с «туманностью»
// внутри (шейдер) → кольцо-орбита с маленькой луной. Вокруг — пыль и звёзды.
// Компонент Lamp.tsx только меняет `state`, сцена сама плавно догоняет цель.

export type Finish = "brass" | "graphite" | "silver";

export type LampState = {
  tone: THREE.Color; // целевой цвет света
  x: number; // положение на экране, −1…1 (NDC)
  y: number;
  s: number; // масштаб
  spin: number; // поворот от прокрутки, рад
  px: number; // курсор, −1…1
  py: number;
  power: number; // яркость, 0…1 (интро «включения»)
  on: number; // выключатель: 1 — горит, 0 — погашен
  dim: number; // приглушение для текстовых блоков, 0…1
  zoom: number; // приближение руками, 1…2.6
  mx: number; // курсор/палец для звёзд, NDC (y вверх)
  my: number;
};

const FINISH: Record<Finish, { metal: string; rough: number; stone: string }> = {
  brass: { metal: "#c8964f", rough: 0.28, stone: "#1f1b19" },
  graphite: { metal: "#34343b", rough: 0.32, stone: "#18181c" },
  silver: { metal: "#d9dde3", rough: 0.2, stone: "#5e5b58" },
};

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*snoise(p);p*=2.03;a*=.5;}return s;}
`;

// Карта шлифовки: тонкие продольные риски (шероховатость металла, плетение провода)
function brushed() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#b4b4b4";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = 120 + Math.random() * 135;
    g.fillStyle = `rgba(${v},${v},${v},${0.25 + Math.random() * 0.4})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 40 + Math.random() * 200, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 1);
  return t;
}

// Карта камня: поры и светлые вкрапления
function speckle() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#d8d8d8";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = Math.random() < 0.5 ? 150 + Math.random() * 40 : 235 + Math.random() * 20;
    g.fillStyle = `rgba(${v},${v},${v},${0.5 + Math.random() * 0.5})`;
    const r = Math.random() < 0.9 ? 0.6 + Math.random() : 1.5 + Math.random() * 1.5;
    g.beginPath();
    g.arc(Math.random() * 256, Math.random() * 256, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

// Солнечная панель: тёмно-синие ячейки секторами, серебряные шины между ними
function solar() {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b1226";
  g.fillRect(0, 0, S, S);
  const cx = S / 2;
  for (let ring = 0; ring < 3; ring++) {
    const r0 = (0.2 + ring * 0.27) * cx;
    const r1 = r0 + 0.25 * cx;
    const n = 18 + ring * 10;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + 0.01;
      const a1 = ((i + 1) / n) * Math.PI * 2 - 0.01;
      const tone = 22 + Math.random() * 14;
      g.fillStyle = `rgb(${tone * 0.5}, ${tone * 0.75}, ${tone * 2})`;
      g.beginPath();
      g.arc(cx, cx, r1, a0, a1);
      g.arc(cx, cx, r0, a1, a0, true);
      g.fill();
      // тонкие токосъёмные линии внутри ячейки
      g.strokeStyle = "rgba(170, 185, 220, 0.18)";
      g.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        g.beginPath();
        g.arc(cx, cx, r0 + ((r1 - r0) * k) / 4, a0, a1);
        g.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class LampScene {
  readonly state: LampState;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private raf = 0;
  private mobile: boolean;
  private dbg = "";

  private lamp = new THREE.Group(); // позиция и масштаб на экране
  private body = new THREE.Group(); // вращение
  private orbit = new THREE.Group(); // кольцо
  private moon!: THREE.Mesh;
  private dust!: THREE.Points;
  private stars!: THREE.Points;
  private glow!: THREE.Sprite;
  private pool!: THREE.Mesh;
  private core!: THREE.PointLight;
  private rim!: THREE.DirectionalLight;
  private metal: THREE.MeshPhysicalMaterial;
  private stone: THREE.MeshStandardMaterial;

  private tone = new THREE.Color("#ffa04d");
  private tone2 = new THREE.Color();
  private uGlobe: Record<string, THREE.IUniform>;
  private uBg: Record<string, THREE.IUniform>;
  private uStars: Record<string, THREE.IUniform>;
  private cur = { x: 0, y: 0, s: 1, spin: 0, px: 0, py: 0, power: 0, dim: 0, on: 1, zoom: 1 };
  private uFade = { value: 1 }; // пыль и звёзды внутри ядра гаснут вместе со светом
  private key!: THREE.DirectionalLight; // «комнатный» свет, когда светильник выключен
  private hemi!: THREE.HemisphereLight;
  private grey = new THREE.Color("#8e8983");
  private shown = new THREE.Color();
  // вращение руками: угол, скорость (инерция) и флаг «держат»
  private drag = { yaw: 0, pitch: 0, vYaw: 0, vPitch: 0, held: false };
  // где светильник на экране (CSS px) — для попадания курсором
  readonly bounds = { x: 0, y: 0, r: 0, bx: 0, by: 0, bVis: false };
  private btn!: THREE.Mesh; // кнопка включения на основании
  private btnRing!: THREE.Mesh;
  private btnPress = 0;
  private filament!: THREE.MeshBasicMaterial;
  private filamentOff = new THREE.Color("#3b3027");
  private hot = new THREE.Color();
  // курсор для звёзд: сглаженная точка и сила отклика (затихает, пока крутят светильник)
  private mouse = { x: 0, y: 0, k: 0 };
  private metalTarget = new THREE.Color();
  private stoneTarget = new THREE.Color();
  private roughTarget = 0.28;
  private onTone?: (c: THREE.Color) => void;

  constructor(canvas: HTMLCanvasElement, opts: { mobile: boolean; onTone?: (c: THREE.Color) => void }) {
    this.mobile = opts.mobile;
    this.onTone = opts.onTone;
    this.state = { tone: this.tone.clone(), x: 0, y: 0, s: 1, spin: 0, px: 0, py: 0, power: 0, dim: 0, on: 1, zoom: 1, mx: 9, my: 9 };

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.5 : 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    // тени от стойки, дуги и кольца на основании — свет идёт изнутри ядра
    // Диагностика мигания на телефонах: ?t=a — без теней, b — без bloom, c — туманность стоит,
    // d — без стекла и колбы, e — 8-битный буфер вместо half float. Убрать после поиска причины.
    const dbg = typeof location !== "undefined" ? new URLSearchParams(location.search).get("t") || "" : "";
    this.dbg = dbg;
    this.renderer.shadowMap.enabled = !dbg.includes("a");
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.set(0, 1.1, 10);
    this.camera.lookAt(0, 0.15, 0);

    // окружение для отражений металла и стекла
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    // шлифованный металл: продольные риски в карте шероховатости
    this.metal = new THREE.MeshPhysicalMaterial({
      color: FINISH.brass.metal,
      metalness: 1,
      roughness: 0.28,
      roughnessMap: brushed(),
      clearcoat: 0.25,
      clearcoatRoughness: 0.35,
    });
    // литой камень: мелкие поры и вкрапления
    const stoneTex = speckle();
    this.stone = new THREE.MeshStandardMaterial({ color: FINISH.brass.stone, roughness: 0.62, metalness: 0.05, map: stoneTex, bumpMap: stoneTex, bumpScale: 1.2 });
    this.metalTarget.copy(this.metal.color);
    this.stoneTarget.copy(this.stone.color);

    this.uGlobe = { uTone: { value: this.tone.clone() }, uTone2: { value: new THREE.Color() }, uTime: { value: 0 }, uPower: { value: 0 }, uOn: { value: 1 } };
    this.uBg = {
      uTone: { value: this.tone.clone() },
      uLamp: { value: new THREE.Vector2(0.5, 0.55) },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uPower: { value: 0 },
      uMobile: { value: this.mobile ? 1 : 0 },
    };
    this.uStars = {
      uTone: { value: this.tone.clone() },
      uTime: { value: 0 },
      uPx: { value: this.renderer.getPixelRatio() },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uMouseK: { value: 0 },
      uAspect: { value: 1 },
    };

    this.buildBackground();
    this.buildLamp();
    this.castShadows();
    this.buildStars();

    const size = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(size);
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: dbg.includes("e") ? THREE.UnsignedByteType : THREE.HalfFloatType, samples: this.mobile ? 0 : 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.35, 0.7);
    if (!this.dbg.includes("b")) this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    this.loop();
  }

  // ---------- Фон: тёмный космос, свечение вокруг светильника ----------
  private buildBackground() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uBg,
      depthTest: false,
      depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = position.xy*.5+.5; gl_Position = vec4(position.xy, 0., 1.); }`,
      fragmentShader: /* glsl */ `
        ${NOISE}
        uniform vec3 uTone; uniform vec2 uLamp; uniform float uAspect, uTime, uPower, uMobile;
        varying vec2 vUv;
        void main(){
          vec2 d = vUv - uLamp; d.x *= uAspect;
          float r = length(d);
          vec3 base = vec3(.010, .009, .016);
          // мягкое световое облако вокруг ядра
          float halo = (exp(-r * 7.5) * .16 + exp(-r * 18.) * .3) * (1. - uMobile * .45);
          // туманность — медленные полосы света в фоне
          vec2 q = vUv * vec2(uAspect, 1.) * 1.6;
          float n = fbm(vec3(q, uTime * .025));
          float neb = smoothstep(.05, .9, n) * (1. - smoothstep(.0, .7, r)) * .07;
          vec3 c = base + uTone * (halo + neb) * uPower;
          // виньетка
          vec2 v = vUv - .5; c *= 1. - dot(v, v) * .9;
          gl_FragColor = vec4(c, 1.);
        }`,
    });
    const bg = new THREE.Mesh(geo, mat);
    bg.frustumCulled = false;
    bg.renderOrder = -10;
    this.scene.add(bg);
  }

  // ---------- Светильник ----------
  private buildLamp() {
    this.scene.add(this.lamp);
    this.lamp.add(this.body);
    const Y_BASE = -1.78;
    const GLOBE_Y = 0.42;
    const R = 0.9;

    // основание: литой камень с фаской и латунным поясом
    const prof = [
      [0, 0], [0.92, 0], [0.98, 0.03], [0.98, 0.17], [0.95, 0.2], [0, 0.2],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const base = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), this.stone);
    base.position.y = Y_BASE;
    base.receiveShadow = true;
    this.body.add(base);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.985, 0.012, 12, 128), this.metal);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = Y_BASE + 0.09;
    this.body.add(belt);

    // стойка и муфта
    const ARC_R = 1.12;
    const stemTop = GLOBE_Y - ARC_R;
    const stemLen = stemTop - (Y_BASE + 0.2);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, stemLen, 24), this.metal);
    stem.position.y = Y_BASE + 0.2 + stemLen / 2;
    this.body.add(stem);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.07, 32), this.metal);
    collar.position.y = Y_BASE + 0.235;
    this.body.add(collar);

    // дуга-держатель: обнимает ядро сзади, от низа до верха
    const arc = new THREE.Mesh(new THREE.TorusGeometry(ARC_R, 0.03, 16, 160, Math.PI * 1.22), this.metal);
    arc.rotation.set(0, Math.PI / 2, -Math.PI / 2);
    arc.position.y = GLOBE_Y;
    this.body.add(arc);
    const capGeo = new THREE.SphereGeometry(0.055, 24, 16);
    const a1 = -Math.PI / 2;
    const a2 = -Math.PI / 2 + Math.PI * 1.22;
    for (const a of [a1, a2]) {
      const cap = new THREE.Mesh(capGeo, this.metal);
      // точка дуги в плоскости YZ (дуга повернута на 90° вокруг Y)
      cap.position.set(0, GLOBE_Y + Math.sin(a) * ARC_R, -Math.cos(a) * ARC_R);
      this.body.add(cap);
    }
    // ось ядра — тонкие штифты сверху и снизу
    for (const sgn of [-1, 1]) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, ARC_R - R + 0.02, 12), this.metal);
      pin.position.y = GLOBE_Y + sgn * (R + (ARC_R - R) / 2);
      this.body.add(pin);
    }

    // фурнитура: латунные чашки там, где штифты входят в стекло
    const cupGeo = new THREE.CylinderGeometry(0.1, 0.075, 0.07, 32);
    for (const sgn of [-1, 1]) {
      const cup = new THREE.Mesh(cupGeo, this.metal);
      cup.position.y = GLOBE_Y + sgn * (R + 0.005);
      if (sgn < 0) cup.rotation.x = Math.PI;
      this.body.add(cup);
    }

    // солнечная панель на основании: днём заряжается, вечером светит без провода
    const panel = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.86, 128, 1),
      new THREE.MeshPhysicalMaterial({ map: solar(), metalness: 0.2, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 0.5 }),
    );
    panel.rotation.x = -Math.PI / 2;
    panel.position.y = Y_BASE + 0.202;
    panel.receiveShadow = true;
    this.body.add(panel);
    for (const r of [0.865, 0.155]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 8, 128), this.metal);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = Y_BASE + 0.204;
      this.body.add(rim);
    }

    // кнопка включения на торце основания + светящееся кольцо вокруг
    this.btn = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 40), this.metal);
    this.btn.rotation.x = Math.PI / 2;
    this.btn.position.set(0, Y_BASE + 0.1, 0.99);
    this.body.add(this.btn);
    this.btnRing = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.011, 10, 48), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    this.btnRing.position.set(0, Y_BASE + 0.1, 0.982);
    this.body.add(this.btnRing);

    // лампочка внутри ядра: латунный цоколь с резьбой, прозрачная колба, спиральные нити
    const bulbY = GLOBE_Y - R + 0.06;
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.2, 40), this.metal);
    socket.position.y = bulbY + 0.1;
    this.body.add(socket);
    for (let i = 0; i < 4; i++) {
      const thread = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.012, 8, 40), this.metal);
      thread.rotation.x = Math.PI / 2;
      thread.position.y = bulbY + 0.04 + i * 0.045;
      this.body.add(thread);
    }
    const bulbProf = [
      [0.1, 0], [0.13, 0.05], [0.22, 0.17], [0.27, 0.31], [0.26, 0.44], [0.19, 0.55], [0.08, 0.6], [0, 0.61],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const bulb = new THREE.Mesh(
      new THREE.LatheGeometry(bulbProf, 64),
      new THREE.MeshPhysicalMaterial({ color: "#fff6ea", roughness: 0.03, metalness: 0, transparent: true, opacity: 0.22, clearcoat: 1, envMapIntensity: 2.2, depthWrite: false, side: THREE.DoubleSide }),
    );
    bulb.position.y = bulbY + 0.2;
    bulb.renderOrder = 1;
    bulb.visible = !this.dbg.includes("d");
    this.body.add(bulb);
    // стеклянная ножка и держатели нитей
    const wireMat = new THREE.MeshStandardMaterial({ color: "#b9b2a8", metalness: 0.9, roughness: 0.3 });
    const glassStem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.03, 0.2, 16), wireMat);
    glassStem.position.y = bulbY + 0.3;
    this.body.add(glassStem);
    // нити накаливания: четыре спирали-«волоска», расходятся от ножки
    this.filament = new THREE.MeshBasicMaterial({ color: "#3b3027" });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 80; i++) {
        const t = i / 80;
        const y = bulbY + 0.38 + Math.sin(t * Math.PI) * 0.16;
        const r = 0.04 + Math.sin(t * Math.PI) * 0.1;
        const aa = a + (t - 0.5) * 0.9;
        const coil = 0.008;
        pts.push(new THREE.Vector3(Math.cos(aa) * r + Math.cos(t * 140) * coil, y + Math.sin(t * 140) * coil, Math.sin(aa) * r));
      }
      const fil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.005, 6), this.filament);
      this.body.add(fil);
      // держатель от ножки к концам нити
      for (const end of [pts[0], pts[80]]) {
        const from = new THREE.Vector3(0, bulbY + 0.4, 0);
        const len = from.distanceTo(end);
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, len, 4), wireMat);
        w.position.copy(from).lerp(end, 0.5);
        w.lookAt(end);
        w.rotateX(Math.PI / 2);
        this.body.add(w);
      }
    }

    // контактная тень под основанием — светильник «стоит», а не висит
    const cv2 = document.createElement("canvas");
    cv2.width = cv2.height = 128;
    const g2 = cv2.getContext("2d")!;
    const gr2 = g2.createRadialGradient(64, 64, 20, 64, 64, 64);
    gr2.addColorStop(0, "rgba(0,0,0,0.85)");
    gr2.addColorStop(1, "rgba(0,0,0,0)");
    g2.fillStyle = gr2;
    g2.fillRect(0, 0, 128, 128);
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv2), transparent: true, depthWrite: false }));
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = Y_BASE - 0.002;
    this.body.add(contact);

    // ядро: «туманность» внутри матового стекла
    const globeMat = new THREE.ShaderMaterial({
      uniforms: this.uGlobe,
      vertexShader: /* glsl */ `
        varying vec3 vObj; varying vec3 vN; varying vec3 vV;
        void main(){
          vObj = position;
          vec4 mv = modelViewMatrix * vec4(position, 1.);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      transparent: true,
      fragmentShader: /* glsl */ `
        ${NOISE}
        uniform vec3 uTone, uTone2; uniform float uTime, uPower, uOn;
        varying vec3 vObj; varying vec3 vN; varying vec3 vV;
        void main(){
          vec3 n = normalize(vN);
          // clamp обязателен: на видеокартах Apple dot() единичных векторов бывает чуть больше 1,
          // fres уходит в минус, pow() даёт NaN, а bloom разносит его по кадру — светильник «моргает»
          float facing = clamp(dot(n, normalize(vV)), 0., 1.);
          float fres = clamp(1. - facing, 0., 1.);
          float t = uTime * .1;
          // матовое стекло: мелкое «зерно» пескоструя
          float grain = snoise(vObj * 90.) * .5 + .5;

          // --- горит: свет рассеивается в стекле, внутри медленно плывёт туманность ---
          vec3 p = vObj * 1.4;
          float n1 = fbm(p + vec3(0., t, t * .6));
          float n2 = fbm(p * 1.6 + n1 * 1.3 - vec3(t * .8, 0., 0.));
          float neb = smoothstep(-.6, .9, n2);
          // светодиод стоит внизу ядра — там стекло чуть ярче
          float led = exp(-pow(length(vObj - vec3(0., -.3, 0.)) * 1.8, 2.));
          vec3 col = mix(uTone2, uTone, .35 + .65 * neb);
          vec3 lit = col * (.35 + .5 * neb) * (.5 + .9 * facing);
          lit += uTone * (pow(facing, 2.2) * .3 + led * .22);
          lit += mix(uTone, vec3(1., .96, .9), .55) * pow(facing, 8.) * .12;
          lit += uTone * pow(fres, 2.4) * .7;
          lit *= (.94 + grain * .12) * .62;

          // --- погашен: молочное стекло в свете комнаты, видна начинка ---
          vec3 L = normalize(vec3(-.5, .8, .6));
          float diff = dot(n, L) * .5 + .5;
          vec3 frost = vec3(.6, .59, .57) * (.05 + .2 * diff * diff);
          frost += vec3(.85, .86, .9) * pow(fres, 3.) * .16;
          frost *= .9 + grain * .2;

          vec3 c = mix(frost, lit * uPower, uOn);
          float alpha = mix(.78 + .22 * pow(fres, 1.5), .58 + .42 * pow(fres, 1.2), uOn);
          gl_FragColor = vec4(c, alpha);
        }`,
    });
    // ядро не пишет глубину: звёзды внутри него остаются видны сквозь «стекло»
    globeMat.depthWrite = false;
    const globe = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), globeMat);
    globe.position.y = GLOBE_Y;
    this.body.add(globe);

    // маленькая галактика внутри ядра
    const IN = this.mobile ? 160 : 280;
    const ip = new Float32Array(IN * 3);
    const ir = new Float32Array(IN);
    for (let i = 0; i < IN; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(R * 0.82 * Math.pow(Math.random(), 0.7));
      v.y *= 0.55; // сплющенный диск, как галактика
      ip.set([v.x, v.y, v.z], i * 3);
      ir[i] = Math.random();
    }
    const ig = new THREE.BufferGeometry();
    ig.setAttribute("position", new THREE.BufferAttribute(ip, 3));
    ig.setAttribute("aRnd", new THREE.BufferAttribute(ir, 1));
    const inner = new THREE.Points(ig, this.pointsMaterial(0.55, this.uFade));
    inner.position.y = GLOBE_Y;
    inner.rotation.z = 0.35;
    inner.renderOrder = 1;
    this.body.add(inner);

    // внешнее стекло — отражения окружения и блик
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.035, 96, 64),
      new THREE.MeshPhysicalMaterial({
        color: "#ffffff",
        roughness: 0.04,
        metalness: 0,
        transparent: true,
        opacity: 0.16,
        clearcoat: 1,
        envMapIntensity: 2.4,
        depthWrite: false,
      }),
    );
    glass.position.y = GLOBE_Y;
    glass.renderOrder = 2;
    glass.visible = !this.dbg.includes("d");
    this.body.add(glass);

    // свет ядра: окрашивает металл и камень
    this.core = new THREE.PointLight(this.tone, 0, 0, 1.6);
    this.core.position.y = GLOBE_Y - R + 0.6; // у нитей лампочки
    this.core.castShadow = true;
    this.core.shadow.mapSize.set(this.mobile ? 256 : 512, this.mobile ? 256 : 512);
    this.core.shadow.bias = -0.004;
    this.core.shadow.radius = 6;
    this.body.add(this.core);
    this.rim = new THREE.DirectionalLight(this.tone, 0);
    this.rim.position.set(-3, 4, -4);
    this.scene.add(this.rim);
    this.scene.add(new THREE.AmbientLight("#ffffff", 0.06));
    // когда светильник погашен, его освещает «комната»: мягкий верхний свет и холодный контровой
    this.key = new THREE.DirectionalLight("#fff4e8", 0);
    this.key.position.set(-4, 6, 5);
    this.scene.add(this.key);
    this.hemi = new THREE.HemisphereLight("#c9d4ff", "#1a1410", 0);
    this.scene.add(this.hemi);

    // кольцо-орбита: тонкий обод + полупрозрачная лента, вращается само
    this.orbit.position.y = GLOBE_Y;
    this.orbit.rotation.set(Math.PI / 2 - 0.42, 0, 0.32);
    this.lamp.add(this.orbit);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.016, 12, 200), this.metal);
    this.orbit.add(hoop);
    const band = new THREE.Mesh(
      new THREE.RingGeometry(1.42, 1.6, 160, 1),
      new THREE.MeshPhysicalMaterial({ color: "#ffffff", metalness: 0.9, roughness: 0.25, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
    );
    band.renderOrder = 1;
    this.orbit.add(band);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    this.moon.position.x = 1.62;
    this.orbit.add(this.moon);

    // пыль вокруг ядра — диск частиц в плоскости орбиты
    const N = this.mobile ? 260 : 520;
    const pos = new Float32Array(N * 3);
    const rnd = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.25 + Math.pow(Math.random(), 1.6) * 1.6;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.sin(a) * r;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
      rnd[i] = Math.random();
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    dg.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 1));
    this.dust = new THREE.Points(dg, this.pointsMaterial(0.9, this.uFade));
    this.dust.position.y = GLOBE_Y;
    this.dust.rotation.copy(this.orbit.rotation);
    this.lamp.add(this.dust);

    // ореол — спрайт с радиальным градиентом за ядром
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const g = cv.getContext("2d")!;
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,0.35)");
    gr.addColorStop(0.35, "rgba(255,255,255,0.08)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.glow.scale.setScalar(3.4);
    this.glow.position.set(0, GLOBE_Y, -0.6);
    this.glow.renderOrder = -1;
    this.lamp.add(this.glow);

    // световое пятно на столе
    this.pool = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshBasicMaterial({ map: this.glow.material.map, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.6 }),
    );
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = Y_BASE + 0.001;
    this.lamp.add(this.pool);
  }

  // металл отбрасывает тени на основание; стекло и частицы — нет
  private castShadows() {
    this.lamp.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material === this.metal) m.castShadow = true;
    });
  }

  private pointsMaterial(size: number, fade: THREE.IUniform = { value: 1 }) {
    return new THREE.ShaderMaterial({
      uniforms: { ...this.uStars, uSize: { value: size }, uFade: fade },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aRnd; uniform float uTime, uPx, uSize, uAspect, uMouseK; uniform vec2 uMouse; varying float vA; varying float vR;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.);
          vR = aRnd;
          vA = max(0., .45 + .55 * sin(uTime * (.6 + aRnd * 1.8) + aRnd * 40.));
          vec4 clip = projectionMatrix * mv;
          // звёзды расступаются вокруг курсора и вспыхивают
          vec2 ndc = clip.xy / clip.w;
          vec2 dd = ndc - uMouse; dd.x *= uAspect;
          float l = length(dd);
          float f = exp(-l * l * 12.) * uMouseK;
          ndc += (dd / max(l, 1e-4)) * f * .045 * vec2(1. / uAspect, 1.);
          clip.xy = ndc * clip.w;
          vA += f * .9;
          gl_PointSize = uSize * (1. + aRnd * 2.2) * uPx * (12. / -mv.z) * (1. + f * .8);
          gl_Position = clip;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTone; uniform float uFade; varying float vA; varying float vR;
        void main(){
          float d = length(gl_PointCoord - .5);
          float a = smoothstep(.5, 0., d);
          vec3 c = mix(vec3(1., .96, .92), uTone, .35 + vR * .5);
          gl_FragColor = vec4(c * a * vA * uFade, a * vA * uFade);
        }`,
    });
  }

  private buildStars() {
    // звёздное поле на весь экран: коробка позади светильника, шире кадра
    const N = this.mobile ? 1300 : 2800;
    const pos = new Float32Array(N * 3);
    const rnd = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos.set([(Math.random() - 0.5) * 46, (Math.random() - 0.5) * 26, -4 - Math.random() * 26], i * 3);
      rnd[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 1));
    this.stars = new THREE.Points(g, this.pointsMaterial(1.6));
    this.scene.add(this.stars);
  }

  // ---------- Управление ----------
  grab() {
    this.drag.held = true;
    this.drag.vYaw = this.drag.vPitch = 0;
  }
  // dx, dy — сдвиг пальца/мыши в CSS px с прошлого события
  turn(dx: number, dy: number) {
    const d = this.drag;
    const yaw = dx * 0.011;
    const pitch = dy * 0.006;
    d.yaw += yaw;
    d.pitch = Math.max(-0.55, Math.min(0.55, d.pitch + pitch));
    d.vYaw = yaw * 60; // рад/с — для инерции после отпускания
    d.vPitch = pitch * 60;
  }
  release() {
    this.drag.held = false;
  }
  pressButton() {
    this.btnPress = 1;
  }

  setFinish(f: Finish) {
    this.metalTarget.set(FINISH[f].metal);
    this.stoneTarget.set(FINISH[f].stone);
    this.roughTarget = FINISH[f].rough;
  }

  // Точка на плоскости z=0 под заданной точкой экрана (NDC)
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private hit = new THREE.Vector3();
  private toWorld(x: number, y: number) {
    this.camera.updateMatrixWorld();
    this.ray.setFromCamera(new THREE.Vector2(x, y), this.camera);
    this.ray.ray.intersectPlane(this.plane, this.hit);
    return this.hit;
  }

  // Размер холста берём у самого холста (CSS: 100lvh), а не у окна: в Safari на телефоне
  // при прокрутке адресная строка прячется и window.innerHeight скачет. Если пересоздавать
  // буфер на каждый такой скачок, холст на кадр очищается и светильник «моргает».
  private W = 1;
  private H = 1;
  resize() {
    const cv = this.renderer.domElement;
    const w = cv.clientWidth || window.innerWidth;
    const h = cv.clientHeight || window.innerHeight;
    if (w === this.W && h === this.H) return;
    this.W = w;
    this.H = h;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.bloom.resolution.set(w, h);
    this.camera.aspect = w / h;
    // на узком экране отодвигаем камеру, чтобы кольцо не резалось по краям
    this.camera.position.z = w / h < 0.8 ? 10 / Math.max(w / h / 0.8, 0.62) : 10;
    this.camera.updateProjectionMatrix();
    this.uBg.uAspect.value = w / h;
    this.uStars.uAspect.value = w / h;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;
    const k = 1 - Math.exp(-4 * dt);
    const kSlow = 1 - Math.exp(-2.2 * dt);
    const s = this.state;
    const c = this.cur;

    c.x += (s.x - c.x) * k;
    c.y += (s.y - c.y) * k;
    c.s += (s.s - c.s) * k;
    c.spin += (s.spin - c.spin) * k;
    c.px += (s.px - c.px) * kSlow;
    c.py += (s.py - c.py) * kSlow;
    c.power += (s.power - c.power) * (1 - Math.exp(-9 * dt));
    c.dim += (s.dim - c.dim) * k;
    c.zoom += (s.zoom - c.zoom) * (1 - Math.exp(-6 * dt));
    c.on += (s.on - c.on) * (1 - Math.exp(-7 * dt));

    // цвет: мягко догоняем цель, второй тон — сдвиг по оттенку, глубже
    const prev = this.tone.getHex();
    this.tone.lerp(s.tone, kSlow);
    const hsl = { h: 0, s: 0, l: 0 };
    this.tone.getHSL(hsl);
    this.tone2.setHSL((hsl.h + 0.09) % 1, Math.min(1, hsl.s * 1.1), hsl.l * 0.42);
    // интерфейс красится в цвет света, а у погашенной лампы — в тёплый серый
    const shownPrev = this.shown.getHex();
    this.shown.copy(this.tone).lerp(this.grey, 1 - c.on);
    if (this.tone.getHex() !== prev || this.shown.getHex() !== shownPrev) this.onTone?.(this.shown);

    this.metal.color.lerp(this.metalTarget, k);
    this.stone.color.lerp(this.stoneTarget, k);
    this.metal.roughness += (this.roughTarget - this.metal.roughness) * k;

    const on = c.on;
    const power = c.power * on * (1 - c.dim * 0.65);
    this.uGlobe.uOn.value = Math.min(1, on * c.power * 1.2);
    this.uFade.value = power;
    (this.moon.material as THREE.MeshBasicMaterial).color.setScalar(0.12 + 0.88 * power);
    this.key.intensity = 1.6 * (1 - on);
    // нить накаливания: раскалена в цвет света, погашенная — тёмная медь
    this.hot.copy(this.tone).lerp(new THREE.Color(1, 0.92, 0.8), 0.5).multiplyScalar(1 + 2.6 * power);
    this.filament.color.copy(this.filamentOff).lerp(this.hot, Math.min(1, on * c.power));
    // кнопка: кольцо светится, когда лампа горит; при нажатии утапливается
    (this.btnRing.material as THREE.MeshBasicMaterial).color.copy(this.tone).multiplyScalar(0.25 + 2.2 * on * c.power);
    this.btnPress *= Math.exp(-10 * dt);
    this.btn.position.z = 0.99 - this.btnPress * 0.03;
    this.hemi.intensity = 0.5 * (1 - on);
    this.uGlobe.uTone.value.copy(this.tone);
    this.uGlobe.uTone2.value.copy(this.tone2);
    this.uGlobe.uTime.value = this.dbg.includes("c") ? 3 : time;
    this.uGlobe.uPower.value = (1 - c.dim * 0.65) * 0.95;
    this.uBg.uTone.value.copy(this.tone);
    this.uBg.uTime.value = time;
    this.uBg.uPower.value = power;
    this.uStars.uTone.value.copy(this.tone);
    this.uStars.uTime.value = time;
    {
      const m = this.mouse;
      const W = this.W;
      const H = this.H;
      const away = s.mx > 5;
      if (!away) {
        const km = 1 - Math.exp(-3 * dt);
        m.x += (s.mx - m.x) * km;
        m.y += (s.my - m.y) * km;
      }
      // над светильником и пока его крутят — звёзды почти не реагируют
      const b = this.bounds;
      const overLamp = Math.hypot((s.mx * 0.5 + 0.5) * W - b.x, (0.5 - s.my * 0.5) * H - b.y) < b.r * 1.1;
      const busy = this.drag.held || Math.abs(this.drag.vYaw) > 0.25;
      const want = away || busy ? 0 : overLamp ? 0.2 : 1;
      m.k += (want - m.k) * (1 - Math.exp(-(want < m.k ? 4 : 1.6) * dt));
      this.uStars.uMouse.value.set(m.x, m.y);
      this.uStars.uMouseK.value = m.k;
    }
    this.core.color.copy(this.tone);
    this.core.intensity = 20 * power;
    this.rim.color.copy(this.tone);
    this.rim.intensity = 2.2 * power;
    this.glow.material.color.copy(this.tone).multiplyScalar(power * (this.mobile ? 0.5 : 1));
    (this.pool.material as THREE.MeshBasicMaterial).color.copy(this.tone).multiplyScalar(power * 0.7);
    // на телефоне буфер меньше и ореол «расползается» — свечение слабее
    this.bloom.strength = (this.mobile ? 0.38 : 0.7) * (0.4 + power * 0.6);

    // положение на экране и масштаб
    const fit = this.mobile ? 0.82 : 1;
    const p = this.toWorld(c.x, c.y);
    this.lamp.position.set(p.x, p.y - 0.42 * c.s * fit * c.zoom, 0);
    this.lamp.scale.setScalar(c.s * fit * c.zoom);

    // вращение: прокрутка + лёгкий дрейф + курсор
    // инерция после броска; наклон мягко возвращается к норме
    const d = this.drag;
    if (!d.held) {
      d.yaw += d.vYaw * dt;
      d.vYaw *= Math.exp(-2.2 * dt);
      d.pitch += d.vPitch * dt;
      d.vPitch *= Math.exp(-6 * dt);
      d.pitch *= Math.exp(-1.6 * dt);
    }
    this.body.rotation.y = c.spin + time * 0.06 + c.px * 0.35 + d.yaw;
    this.lamp.rotation.x = c.py * 0.08 + d.pitch;
    this.lamp.rotation.z = -c.px * 0.04;
    this.orbit.rotation.y = c.spin * 0.35 + c.px * 0.2;
    this.orbit.rotation.z = 0.32 + time * 0.12 + c.spin * 0.5;
    this.dust.rotation.z = time * 0.05 + c.spin * 0.3;
    this.stars.rotation.y = c.spin * 0.04 + c.px * 0.03;
    this.stars.rotation.x = c.py * 0.02;

    // экранная точка ядра — для фонового свечения
    this.lamp.updateMatrixWorld();
    const v = new THREE.Vector3(0, 0.42, 0).applyMatrix4(this.lamp.matrixWorld);
    v.project(this.camera);
    this.uBg.uLamp.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
    const w = this.W;
    const h = this.H;
    this.bounds.x = (v.x * 0.5 + 0.5) * w;
    this.bounds.y = (0.5 - v.y * 0.5) * h;
    // радиус кольца в пикселях: ~1.7 единицы сцены × масштаб
    const edge = new THREE.Vector3(1.7, 0.42, 0).applyMatrix4(this.lamp.matrixWorld).project(this.camera);
    this.bounds.r = Math.abs(edge.x - v.x) * 0.5 * w;
    // кнопка на экране и смотрит ли она на камеру
    const bw = new THREE.Vector3();
    this.btn.getWorldPosition(bw);
    const toCam = this.camera.position.clone().sub(bw).normalize();
    const nrm = new THREE.Vector3(0, 0, 1).applyQuaternion(this.body.getWorldQuaternion(new THREE.Quaternion()));
    this.bounds.bVis = nrm.dot(toCam) > 0.15;
    bw.project(this.camera);
    this.bounds.bx = (bw.x * 0.5 + 0.5) * w;
    this.bounds.by = (0.5 - bw.y * 0.5) * h;

    this.composer.render();
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.composer.dispose();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }
}
