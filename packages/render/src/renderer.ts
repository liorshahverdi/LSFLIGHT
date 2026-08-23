/**
 * Minimal three.js flight renderer (FLT-405 slice).
 * Consumes read-only transform state; never mutates simulation data.
 */
import * as THREE from "three";
import { meshDocToGeometry, validateMeshDoc, type MeshDoc } from "./mesh.js";
import { chaseCameraPose, type CameraPose } from "./chase-camera.js";

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
  private readonly target = new THREE.Vector3();
  private pose: CameraPose | undefined;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x87b5e0);
    this.scene.fog = new THREE.Fog(0x87b5e0, 4000, 18000);

    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.5,
      40000,
    );

    // Lights.
    this.scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x4a7c3f, 1.0));
    const sun = new THREE.DirectionalLight(0xfff2d9, 1.4);
    sun.position.set(-500, 800, 300);
    this.scene.add(sun);

    // Ground plane (placeholder until converted terrain lands, FLT-601).
    this.groundPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(40000, 40000),
      new THREE.MeshLambertMaterial({ color: 0x5a8a4a }),
    );
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.position.y = -0.05;
    this.scene.add(this.groundPlane);

    // Runway-ish strip for orientation.
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(45, 1200),
      new THREE.MeshLambertMaterial({ color: 0x3a3a3e }),
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.y = 0.02;
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
    if (grids.length > 0) {
      this.groundPlane.visible = false;
    }
  }

  /** Push the latest read-only sim transform into the render scene. */
  sync(state: RenderState): void {
    this.aircraft.position.set(state.pos.x, state.pos.y, state.pos.z);
    this.aircraft.quaternion.set(state.att.x, state.att.y, state.att.z, state.att.w);

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
    this.aircraft.add(new THREE.Mesh(geo, mat));
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
