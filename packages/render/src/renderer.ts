/**
 * Minimal three.js flight renderer (FLT-405 slice).
 * Consumes read-only transform state; never mutates simulation data.
 */
import * as THREE from "three";
import { meshDocToGeometry, validateMeshDoc, type MeshDoc } from "./mesh.js";
import { chaseCameraPose, type CameraPose } from "./chase-camera.js";
import { makeFallbackGround } from "./fallback-ground.js";

/** Heightfield grid data (subset of convert-fld output). */
export interface RenderHeightfieldGrid {
  nx: number;
  nz: number;
  xWidM: number;
  zWidM: number;
  origin: { x: number; z: number };
  elevationsM: number[];
}

export interface RenderState {
  pos: { x: number; y: number; z: number };
  att: { x: number; y: number; z: number; w: number };
}

function makeAircraftMesh(): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xe8e8ec });
  const red = new THREE.MeshLambertMaterial({ color: 0xc23b22 });

  // Fuselage along -Z (nose forward).
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.35, 7, 12), white);
  fuselage.rotation.x = Math.PI / 2;
  g.add(fuselage);

  // Wings.
  const wings = new THREE.Mesh(new THREE.BoxGeometry(11, 0.16, 1.6), white);
  wings.position.z = 0.3;
  g.add(wings);

  // Tail fin + stabilizer.
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.4, 1.1), red);
  fin.position.set(0, 0.75, 3);
  g.add(fin);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 0.9), white);
  stab.position.z = 3;
  g.add(stab);

  // Landing gear: struts + wheels (visible, fixed tricycle).
  const strutMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.18, 12);
  for (const [x, y, z] of [
    [-1.5, -1.0, 0.25],
    [1.5, -1.0, 0.25],
    [0, -0.9, -2],
  ] as const) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 8), strutMat);
    strut.position.set(x, y + 0.25, z);
    g.add(strut);
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    g.add(wheel);
  }

  // Nose prop disc hint.
  const prop = new THREE.Mesh(
    new THREE.CircleGeometry(0.95, 24),
    new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide }),
  );
  prop.position.z = -3.55;
  g.add(prop);

  return g;
}

export class FlightRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly aircraft = makeAircraftMesh();
  private readonly groundPlane!: THREE.Mesh;
  private readonly sun!: THREE.DirectionalLight;
  private readonly sunTarget!: THREE.Object3D;
  private readonly target = new THREE.Vector3();
  private pose: CameraPose | undefined;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Sky: vertical gradient dome (horizon haze -> zenith blue).
    this.renderer.setClearColor(0x87b5e0);
    this.scene.fog = new THREE.Fog(0xc3d9ee, 6000, 24000);
    this.scene.add(this.makeSkyDome());

    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.5,
      40000,
    );

    // Lights: cool sky fill + warm late-afternoon sun casting shadows.
    this.scene.add(new THREE.HemisphereLight(0xbcd4f5, 0x59713f, 0.85));
    const sun = new THREE.DirectionalLight(0xffe8c8, 1.9);
    sun.position.set(-420, 520, 300); // low-ish angle -> visible terrain relief
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -140;
    sun.shadow.camera.right = 140;
    sun.shadow.camera.top = 140;
    sun.shadow.camera.bottom = -140;
    sun.shadow.camera.near = 50;
    sun.shadow.camera.far = 2200;
    sun.shadow.bias = -0.0004;
    this.sun = sun;
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    sun.target = this.sunTarget;
    this.scene.add(sun);

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Same zero-elevation fallback as HeightfieldTerrain.heightAt outside grids.
    this.groundPlane = makeFallbackGround();
    this.scene.add(this.groundPlane);

    // Runway-ish strip for orientation.
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(45, 1200),
      new THREE.MeshLambertMaterial({ color: 0x3a3a3e }),
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.y = 0.02;
    strip.receiveShadow = true;
    this.scene.add(strip);

    this.scene.add(this.aircraft);

    window.addEventListener("resize", () => this.onResize());
  }

  /**
   * Build terrain meshes from converted .fld heightfield grids (FLT-601).
   * Color ramp approximates YSFlight: water/grass/rock/snow by elevation.
   */
  setHeightfield(grids: RenderHeightfieldGrid[]): void {
    for (const g of grids) {
      const nx1 = g.nx + 1;
      const nz1 = g.nz + 1;
      const positions = new Float32Array(nx1 * nz1 * 3);
      for (let z = 0; z < nz1; z++) {
        for (let x = 0; x < nx1; x++) {
          const y = g.elevationsM[z * nx1 + x] ?? 0;
          positions[(z * nx1 + x) * 3] = g.origin.x + x * g.xWidM;
          positions[(z * nx1 + x) * 3 + 1] = y;
          positions[(z * nx1 + x) * 3 + 2] = g.origin.z + z * g.zWidM;
        }
      }
      const indices: number[] = [];
      for (let bz = 0; bz < g.nz; bz++) {
        for (let bx = 0; bx < g.nx; bx++) {
          const n00 = bz * nx1 + bx;
          const n01 = (bz + 1) * nx1 + bx;
          const n10 = bz * nx1 + (bx + 1);
          const n11 = (bz + 1) * nx1 + (bx + 1);
          // Two triangles per block, diagonal n01-n10.
          indices.push(n00, n01, n10, n10, n01, n11);
        }
      }

      // Vertex colors by elevation (green lowlands -> rock -> snow).
      let minE = Infinity;
      let maxE = -Infinity;
      for (const e of g.elevationsM) {
        if (e < minE) minE = e;
        if (e > maxE) maxE = e;
      }
      const range = Math.max(1, maxE - minE);
      const colors = new Float32Array(nx1 * nz1 * 3);
      for (let i = 0; i < nx1 * nz1; i++) {
        const t = Math.min(1, Math.max(0, ((g.elevationsM[i] ?? 0) - minE) / range));
        // green (0.29,0.54,0.30) -> rock (0.48,0.42,0.35) -> white
        let r: number, gg: number, b: number;
        if (t < 0.5) {
          const k = t / 0.5;
          r = 0.29 + (0.48 - 0.29) * k;
          gg = 0.54 + (0.42 - 0.54) * k;
          b = 0.3 + (0.35 - 0.3) * k;
        } else {
          const k = (t - 0.5) / 0.5;
          r = 0.48 + (0.95 - 0.48) * k;
          gg = 0.42 + (0.95 - 0.42) * k;
          b = 0.35 + (0.97 - 0.35) * k;
        }
        colors[i * 3] = r;
        colors[i * 3 + 1] = gg;
        colors[i * 3 + 2] = b;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
      this.scene.add(mesh);
    }
  }

  /**
   * Gradient sky dome: large inverted sphere with a vertical two-stop
   * gradient shader (horizon haze matching the fog, deeper zenith blue).
   */
  private makeSkyDome(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(30000, 24, 12);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x3f7fd2) },
        horizonColor: { value: new THREE.Color(0xc3d9ee) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        varying vec3 vWorld;
        void main() {
          float h = normalize(vWorld).y;
          float t = clamp(h * 1.6 + 0.12, 0.0, 1.0);
          gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
        }
      `,
    });
    const dome = new THREE.Mesh(geo, mat);
    dome.frustumCulled = false;
    return dome;
  }

  /** Push the latest read-only sim transform into the render scene. */
  sync(state: RenderState): void {
    this.aircraft.position.set(state.pos.x, state.pos.y, state.pos.z);
    this.aircraft.quaternion.set(state.att.x, state.att.y, state.att.z, state.att.w);
    // Cover the full camera range as the aircraft leaves finite terrain grids.
    this.groundPlane.position.set(state.pos.x, 0, state.pos.z);

    // Keep the shadow frustum centered on the aircraft so shadows stay
    // crisp near the player regardless of world position.
    if (this.sun) {
      this.sunTarget.position.set(state.pos.x, 0, state.pos.z);
      this.sun.position.set(state.pos.x - 420, Math.max(120, state.pos.y + 520), state.pos.z + 300);
    }

    this.pose = chaseCameraPose(state, 1 / 60, this.pose);
    this.camera.position.set(this.pose.position.x, this.pose.position.y, this.pose.position.z);
    this.target.set(this.pose.lookAt.x, this.pose.lookAt.y, this.pose.lookAt.z);
    this.camera.lookAt(this.target);

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Replace the placeholder aircraft with a converted YSFlight model.
   * Falls back to the placeholder if the doc is invalid.
   */
  setModel(doc: unknown): boolean {
    if (!validateMeshDoc(doc)) return false;
    const geo = meshDocToGeometry(doc as MeshDoc);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.aircraft.clear();
    const model = new THREE.Mesh(geo, mat);
    // Mark only a real converted-model draw, not placeholder/HUD-only success.
    delete this.container.dataset.modelTrianglesRendered;
    model.onAfterRender = () => {
      this.container.dataset.modelTrianglesRendered = String(doc.indices.length / 3);
    };
    this.aircraft.add(model);
    return true;
  }

  private onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
