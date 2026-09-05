import { expect, it } from "vitest";
import * as THREE from "three";
import { HeightfieldTerrain } from "@lsflight/sim";
import { makeFallbackGround } from "../src/fallback-ground.js";

const grid = {
  nx: 1,
  nz: 1,
  xWidM: 100,
  zWidM: 100,
  origin: { x: 10, z: 20 },
  elevationsM: [5, 5, 5, 5],
};

it("renders upward-facing zero ground where heightAt falls back, including beyond runway", () => {
  const terrain = new HeightfieldTerrain({ grids: [grid] });
  const ground = makeFallbackGround();
  ground.updateMatrixWorld();
  for (const [x, z] of [
    [-30, 400],
    [0, -1562],
    [0, -4000],
    [-5000, -5000],
  ]) {
    expect(terrain.heightAt(x!, z!)).toBe(0);
    const hits = new THREE.Raycaster(
      new THREE.Vector3(x, 100, z),
      new THREE.Vector3(0, -1, 0),
    ).intersectObject(ground);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.point.y).toBeCloseTo(0, 8);
  }
  ground.geometry.dispose();
  ground.material.dispose();
});

it("matches collision's sea-level floor and lets terrain/runway win the depth test", () => {
  const ground = makeFallbackGround();
  const material = ground.material;
  expect(ground.position.y).toBe(0);
  expect(material.depthTest).toBe(true);
  expect(material.depthWrite).toBe(true);
  expect(material.transparent).toBe(false);
  expect(material.polygonOffset).toBe(true);
  expect(material.polygonOffsetFactor).toBeGreaterThan(0);
  expect(material.polygonOffsetUnits).toBeGreaterThan(0);
  for (const elevation of [-10, 0, 100]) {
    const terrain = new HeightfieldTerrain({
      grids: [{ ...grid, elevationsM: Array(4).fill(elevation) }],
    });
    expect(terrain.heightAt(50, 60)).toBe(Math.max(0, elevation));
  }
  ground.geometry.dispose();
  material.dispose();
});
