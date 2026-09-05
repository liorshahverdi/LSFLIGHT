# Aircraft mesh conversion

From the repository root, with the YSFLIGHT runtime assets present:

```sh
npm run generate:models
npx vitest run tools/convert-dnm/tests packages/render/tests/mesh.test.ts
```

This regenerates the committed Cessna 172R and A10 JSON deterministically. Source
paths remain in each document; attribution and BSD-3-Clause terms are in
[NOTICE.md](../../NOTICE.md). The small real-source face fixtures retain original
vertex, normal and color lines, with face indices remapped as noted in each file.

SRF face indices are **zero-based**. A PCK line count includes the `Surf` header;
adjacent chunks need no separator. `N cx cy cz nx ny nz` contains a face center
followed by its direction normal. Legacy A10 faces mostly wind opposite their
normals, while Cessna faces mostly agree. Conversion orients each polygon to its
explicit direction normal, retaining source order when the normal or polygon is
degenerate/absent. The `(-x, y, -z)` frame conversion is a proper rotation and
requires no further winding reversal.

## Static neutral pose

The converter resolves `CLD` child names independently of file order, then applies
each node's transform child-to-root:

```text
T(POS.xyz) * RotateXZ(heading) * RotateZY(pitch) * RotateXY(bank) * T(-CNT)
```

Angles use **32768 units per PI radians**, not degrees. These are the upstream
YS matrix plane rotations: positive heading maps +X toward +Z, positive pitch
maps +Z toward +Y, positive bank maps +X toward +Y. The sim frame conversion is
applied only after composing the entire hierarchy. Cessna's equal POS/CNT values
cancel in neutral pose; adding POS alone displaced its control surfaces and
wheels. A10's `00000028.srf` heading of 32682 is now applied, not ignored.

Neutral means upstream `NodeState::Initialize`: zero relative translation and
attitude, visible. It does **not** mean `STA[0]`, which can be a retracted/hidden
gear state. `STA`, `CLA`, and `PAX` animation metadata are validated but not
animated. Assets containing STA emit the explicit warning
`static neutral pose: STA animation states are not evaluated`. Unknown node
or top-level directives, unsupported versions/relationships, malformed
transforms, missing children/surfaces, duplicate nodes, multiple parents and
hierarchy cycles are errors, not silent success.

The full hierarchy and first-face excerpts in `tests/fixtures/*-neutral-pose.dnm`
retain real source node blocks and selected source vertices/normals/colors;
indices are remapped as noted in the files. Thus CI tests do not require an
upstream checkout. Full model regeneration still requires the source assets.
See [high-severity-fixes.md](../../docs/high-severity-fixes.md) for the pinned
upstream implementation, geometric measurements and flight/visual evidence.

Remaining static-mesh limits: fan triangulation (not a general concave polygon
solver), last-face vertex colors, no material transparency/emission or class
visibility/animation system. All neutral nodes remain visible, including light
and interior geometry. This is a static assembly, not a complete YSFlight visual
or aircraft-configuration renderer.
