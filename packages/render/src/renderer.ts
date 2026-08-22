/**
 * Minimal three.js flight renderer (FLT-405 slice).
 * Consumes read-only transform state; never mutates simulation data.
 */
import * as THREE from "three";
import { chaseCameraPose, type CameraPose } from "./chase-camera.js";

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
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40000, 40000),
      new THREE.MeshLambertMaterial({ color: 0x5a8a4a }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    this.scene.add(ground);

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
