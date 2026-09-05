import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { convertDnm } from "../src/convert.js";

const surface = `PCK "part" 9
SURF
V 2 3 4
V 3 3 4
V 2 4 4
F
V 0 1 2
C 255 255 255
E
E`;
const node = (name: string, directives: string) => `SRF "${name}"
FIL "part"
${directives}
END`;
const convert = (...nodes: string[]) =>
  convertDnm(`DYNAMODEL\nDNMVER 1\n${surface}\n${nodes.join("\n")}`);

it("subtracts CNT before rotation and adds POS after rotation", () => {
  const mesh = convert(node("part", "CNT 1 2 3\nPOS 10 20 30 0 0 16384")).mesh;
  expect(mesh.positions.slice(0, 3)).toEqual([-9, 21, -31]);
});

it.each([
  ["16384 0 0", [4, 3, -2]], // source +X -> +Z (heading)
  ["0 16384 0", [-2, 4, 3]], // source +Z -> +Y (pitch)
  ["0 0 16384", [3, 2, -4]], // source +X -> +Y (bank)
  ["16384 16384 16384", [-2, 4, 3]], // bank, then pitch, then heading
])("uses upstream angle units/sign/order: %s", (rotation, expected) => {
  const actual = convert(node("part", `POS 0 0 0 ${rotation}`)).mesh.positions.slice(0, 3);
  expected.forEach((n, i) => expect(actual[i]).toBeCloseTo(n, 10));
});

it("composes child-to-root, including parent pivot, regardless of file order", () => {
  const mesh = convert(
    node("child", "CNT 1 2 3\nPOS 4 5 6 0 0 0"),
    node("parent", "CLD child\nCNT 1 1 1\nPOS 10 20 30 16384 0 0"),
    node("root", "CLD parent\nPOS 100 200 300 0 0 0"),
  ).mesh;
  // child (5,6,7); parent (-6,5,4)+(10,20,30); root +(100,200,300).
  expect(mesh.positions.slice(0, 3)).toEqual([-104, 225, -334]);
});

it("uses zero relative neutral state, not STA[0] (which can be gear-up)", () => {
  const result = convert(node("part", "NST 1\nSTA 99 99 99 1000 2000 3000 0\nPOS 0 0 0 0 0 0"));
  expect(result.mesh.positions.slice(0, 3)).toEqual([-2, 3, -4]);
  expect(result.warnings).toEqual(["static neutral pose: STA animation states are not evaluated"]);
});

it.each([
  [node("a", "CLD missing"), "missing child"],
  [node("a", "CLD a"), "cycle"],
  [node("a", "CLD b") + "\n" + node("b", "CLD a"), "cycle"],
  [node("a", "") + "\n" + node("a", ""), "duplicate node"],
  [node("a", "CLD c") + "\n" + node("b", "CLD c") + "\n" + node("c", ""), "multiple parents"],
  [node("a", "POS NaN 0 0 0 0 0"), "invalid transform"],
  [node("a", "NCH 2\nCLD a"), "count mismatch"],
  [node("a", "REL INDEPENDENT"), "unsupported node directive"],
  [node("a", "SCALE 2 2 2"), "unsupported node directive"],
])("diagnoses invalid/unsupported hierarchy: %s", (nodes, diagnostic) => {
  expect(() => convert(nodes)).toThrow(diagnostic);
});

/** Independently extract real-source first-face vertices and complete node order (no converter parser reuse). */
function sourceParts(name: string) {
  const source = readFileSync(
    new URL(`./fixtures/${name}-neutral-pose.dnm`, import.meta.url),
    "utf8",
  );
  const chunks = new Map<string, number[][]>();
  for (const match of source.matchAll(/^PCK "?([^"\s]+)"? \d+\r?\n([\s\S]*?)(?=^PCK |^SRF )/gm)) {
    const vertices = [...match[2]!.split(/^F\r?$/m)[0]!.matchAll(/^V (\S+) (\S+) (\S+).*$/gm)].map(
      (v) => v.slice(1, 4).map(Number),
    );
    chunks.set(match[1]!, vertices);
  }
  const nodes = [...source.matchAll(/^SRF "([^"]+)"\r?\n([\s\S]*?)^END/gm)];
  let offset = 0;
  const parts = nodes.map((n) => {
    const vertices = chunks.get(n[2]!.match(/^FIL "?([^"\s]+)"?/m)![1]!)!;
    const part = { name: n[1]!, vertices, offset };
    offset += vertices.length * 3;
    return part;
  });
  return { source, parts, offset };
}

it("assembles every real Cessna node: POS=CNT cancels, including spinner and wheels' descendants", () => {
  const { source, parts, offset } = sourceParts("cessna172r");
  const mesh = convertDnm(source).mesh;
  expect(parts).toHaveLength(19);
  expect(mesh.positions).toHaveLength(offset);
  for (const part of parts) {
    for (const [i, [x, y, z]] of part.vertices.entries()) {
      const actual = mesh.positions.slice(part.offset + i * 3, part.offset + i * 3 + 3);
      [-x!, y!, -z!].forEach((n, axis) =>
        expect(actual[axis], `${part.name} vertex ${i}`).toBeCloseTo(n, 10),
      );
    }
  }
});

it("assembles real A10 mirrored main gear with its 32682-unit heading", () => {
  const { source, parts, offset } = sourceParts("a10");
  const mesh = convertDnm(source).mesh;
  expect(mesh.positions).toHaveLength(offset);
  // Node 00000005: POS=(2.35,-.55,-1.85), CNT=0, identity root.
  const part = parts.find((p) => p.name === "00000005")!;
  const h = (32682 * Math.PI) / 32768;
  for (const [i, [x, y, z]] of part.vertices.entries()) {
    const expected = [
      -(Math.cos(h) * x! - Math.sin(h) * z! + 2.35),
      y! - 0.55,
      -(Math.sin(h) * x! + Math.cos(h) * z! - 1.85),
    ];
    const actual = mesh.positions.slice(part.offset + i * 3, part.offset + i * 3 + 3);
    expected.forEach((n, axis) => expect(actual[axis]).toBeCloseTo(n, 10));
  }
});
