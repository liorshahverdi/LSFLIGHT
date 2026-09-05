import * as THREE from "three";

/** HeightfieldTerrain takes max(0, grids), including outside all grid footprints.
 * Keep the zero plane beneath terrain; depth bias resolves coplanar zero cells
 * in favor of the converted mesh without moving the collision/render elevation.
 */
export function makeFallbackGround(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial> {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80000, 80000),
    new THREE.MeshLambertMaterial({
      color: 0x5a8a4a,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  return ground;
}
