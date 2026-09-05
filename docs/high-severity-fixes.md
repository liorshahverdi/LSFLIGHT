# High-severity gameplay fixes

Scope: takeoff overrotation, static aircraft assembly, and missing collision-ground
coverage. No attitude clamp, autopilot, reset, terrain parser/normal overhaul, or
runway/HUD roadmap work was added.

## Pitch damping

The old pitch damping was `-q * 8 * 0.01 * pitchRate`. With pitch inertia
14000 kg m² and rotation dynamic pressure about 2000 Pa, its free-rate decay time
was about 87 seconds. The supposedly reassuring release test permitted a rate of
0.2 rad/s and did not check attitude; the takeoff browser test stopped after 3 s.
Upstream `YSFLIGHT/src/vehicle/fsairplaneproperty.cpp` (around lines 1806–1820)
explicitly uses `(inputAOA-AOA)*kPitch - pitchRate*bPitch`. Our coefficient model
is not a literal DAT implementation, but likewise needs effective rate damping.

The final pitch damping uses normalized angular rate: a rotating tail's incidence
perturbation scales with rate/airspeed, so damping torque scales with airspeed,
not airspeed squared. `pitchDamp=15` is calibrated at reference speed 60 m/s:

```text
Vauthority = sqrt(2 * qBarCapPa / rho)
Qdamp = 0.5 * rho * min(V, Vauthority) * 60 m/s
pitchDampingTorque = -Qdamp * pitchDamp * pitchRate
```

At rotation the decay time is approximately 0.45 s; at falling stall speed this
still arrests rotation. The algebraic form is finite at zero airspeed, gives zero
static aerodynamic torque, and caps high-speed damping at the same authority
speed as controls. It always removes rotational energy. No restoring, trim,
control, thrust, lift, or stall coefficients were changed. Removing the hidden
percentage scaling is compensated by yawDamp 10→0.1 and rollDamp 5→0.05: their
actual torque/behavior is unchanged. Tests check speed/rate scaling, rest,
high-speed capping, and torque sign.

An intermediate V² damping-only candidate was rejected: it arrested takeoff but
could not recover the original severe cruise/full-up stall within 25 s. The
normalized-rate model passes both without new low-speed authority floors.

### Measured behavior

Deterministic 60 Hz measurements, same initial state and control sequences:

| Measurement                                     |                 Before |                  Final |
| ----------------------------------------------- | ---------------------: | ---------------------: |
| 60 s cruise altitude range, initial 1000 m      |       978.17–1043.94 m |         1000–1024.40 m |
| Full throttle, altitude gain at 20 s / final VS |    56.34 m / +6.11 m/s |    17.66 m / +1.43 m/s |
| Full throttle, altitude gain at 60 s / final VS |   66.49 m / +18.57 m/s |   101.89 m / +2.41 m/s |
| Idle, altitude change at 60 s / final VS        |   −67.93 m / −3.40 m/s |  −144.97 m / −4.50 m/s |
| 0.5 elevator for 2 s: release rate              |          0.26682 rad/s |          0.06846 rad/s |
| Same pulse, 5 s after release: rate / pitch     | 0.19782 rad/s / 83.11° | −0.00098 rad/s / 9.91° |
| Same pulse, 5 s after release: AoA              |                  8.77° |    2.31° (trim 1.745°) |

**Explicitly approved test-contract correction:** the old >50 m gain at 20 s
rewarded an underdamped transient (the old full-throttle trajectory was descending
at 40 s). It is replaced with >10 m gain and positive VS at 20 s, continuously
positive VS through 60 s and >1 m/s mean climb over 20–60 s, versus continuous idle
descent. The original ±60 m cruise bound, headless landing, steering and heading
invariance tests remain. No documented minimum cruise-to-full-throttle climb rate
was found. The roadmap's takeoff >100 m by t=60 s remains a deferred timing/runway
performance target, not a claim of this fix.

### Honest stall recovery

Both tests hold 0.85 elevator at idle until AoA actually exceeds 16°, retaining
the <10 s onset bound. Recovery applies full power and a scripted normal-input
pitch controller: lower nose toward −5°, then level toward +2° once body-forward
speed exceeds 30 m/s. Recovery requires **forward speed >40 m/s, |AoA|<10°,
VS>−5 m/s, |pitch|<20°, |pitch rate|<0.1 rad/s, finite position, no crash/contact**.
The final model additionally remains below 75° pitch throughout recovery.

| Initial IAS                        | Before onset / recovery | Final onset / recovery | Final recovery forward speed / VS | Final maximum recovery pitch |
| ---------------------------------- | ----------------------- | ---------------------- | --------------------------------- | ---------------------------- |
| 25 m/s near-level slow flight      | 4.00 s / 15.58 s        | 9.17 s / 13.67 s       | 40.000 m/s / −3.206 m/s           | 23.64°                       |
| 58 m/s original cruise stress case | 3.70 s / 16.80 s        | 9.80 s / 18.93 s       | 40.015 m/s / −1.925 m/s           | 50.77°                       |

The old cruise stress case reached 179.80° during recovery even though its final
state eventually met the honest criteria. The final case loses 18.90 m after
stall onset and recovers without inversion. The former recovery assertion
(|AoA|<10, IAS>40 within 10 s) could falsely pass a backward tailslide because the
existing airflow model reports AoA=0 for backward flow. The stronger recovery
contract uses the explicitly documented FLT-1204 25 s limit, not that false pass.
Backward-flow aerodynamics remain a known envelope limitation, not a claimed fix.

### Normal-wall-time browser reproduction

B releases brakes; Shift sets full throttle; at HUD IAS58 hold S until HUD ALT15,
release, no further inputs. Read-only response instrumentation copies state after
the real render call; it never changes the clock, state or controls.

| Time after release | Altitude |     Pitch rate | Vertical speed |
| ------------------ | -------: | -------------: | -------------: |
| Release            |  18.08 m | +0.13658 rad/s |     +15.34 m/s |
| +4 s               |  91.28 m | −0.00131 rad/s |     +16.32 m/s |
| +10 s              | 167.36 m | −0.00538 rad/s |      +8.83 m/s |
| +20 s              | 222.54 m | −0.00900 rad/s |      +3.19 m/s |
| +30 s              | 249.00 m | −0.00808 rad/s |      +2.28 m/s |

The original QA release rate was 0.628 rad/s, nearly inverted at +4 s and crashed
by +10 s with −48.4 m/s sink. Final sampled attitude remains upright, AoA peaks
around 11.3°, and climb continues through 30 s. The committed browser and headless
regressions check every sample/tick for 20 s after release: upward velocity,
altitude gain, <30° attitude, <0.2 rad/s pitch rate, no stall/inversion/crash and
rate settling after 4 s. Browser pixels and screenshots prove visible ground,
not merely scene membership.

## DNM neutral assembly

Reference: captainys/public commit
`c0f0f9e182d04e3e7249ef7ff9efea50b48a0647`,
[`ysshelldnmtemplate.h`](https://github.com/captainys/public/blob/c0f0f9e182d04e3e7249ef7ff9efea50b48a0647/src/ysgebl/src/kernel/ysshelldnmtemplate.h):
`NodeState::Initialize` (zero relative pose, visible), `CacheTransformation`
(lines 543–560), `GetNodeToRootTransformation` (575–584), and POS/CNT parsing
(1542–1569). Rotation signs/order are specified in the same revision's
`src/ysclass/src/ysgeometry.h` `RotateXZ`, `RotateZY`, `RotateXY` methods.

Composition is `parent * T(POS) * RotateXZ(h) * RotateZY(p) * RotateXY(b) * T(-CNT)`.
Angles are PI/32768 radians per unit; vertices are finally rotated into sim frame
`(-x,y,-z)`. Neutral is zero **relative** pose, not STA[0]; A10 STA[0] can retract
or hide gear. Static animation metadata produces an explicit warning rather than
claiming animated/class-dependent fidelity. Unknown node/top-level semantics and
invalid hierarchies fail conversion.

Cessna has 19 nodes, 2360 vertices and 4312 triangles. Every full-source neutral
vertex matches the raw source vertex after frame rotation: equal POS/CNT cancel,
including descendant transforms. Minimum control-surface vertex distances to the
fuselage/wing source mesh change from 0.681 m (flap), 1.209 m (aileron), 2.604 m
(elevator), 2.823 m (rudder), and 1.850 m (main wheels), all to **0 m**. This is
geometric attachment evidence, not merely valid arrays. The A10 retains 441
vertices/643 triangles; its 32682-unit gear heading is applied with the upstream
sign, and its tail/control-surface pivot errors are removed. Focused real-source
fixtures and synthetic noncommuting hierarchy/pivot rotations protect these rules.

Regenerate with `npm run generate:models`. Source metadata and NOTICE attribution
are retained. Static limits are fan triangulation, shared-vertex/last-face color,
no transparency/emission, and no animated or class-dependent visibility selection.

## Ground coverage

Actual collision behavior is `max(0, grid heights)`, not only an outside-grid
fallback. A zero-height opaque Lambert plane is therefore retained after terrain
loads, including under negative elevations. Positive polygon depth offset puts
coplanar zero cells behind converted terrain without changing world elevation.
Normal depth testing/writing lets positive terrain and the runway at y=0.02 win.
The 80 km plane follows aircraft X/Z, covering the camera's 40 km far range.
Tests check collision agreement, upward faces and material/depth settings;
browser ground-color pixel counts and parked/taxi/rotation/airborne screenshots
show actual coverage. No FLD parser or terrain-normal changes were made.

## Evidence and deferred limits

Logs, metrics and screenshots are outside the repository at
`/tmp/lsflight-high-fixes/`: `final-flight-metrics.json`, `geometry-evidence.json`,
`takeoff-followthrough.json`, `qa-parked.png`, `qa-rotation.png`, and
`qa-takeoff-{4,10,16,20,30}s.png`. Focused red logs show the old takeoff, hierarchy
and hidden-ground failures. Full-check results and incremental review patch are
reported in the implementation handoff.

Keyboard takeoff still runs past the finite strip (rotation z≈−1565 m); HUD
ROLLING/parked touchdown/stale crash-airflow labels remain deferred. Chromium
SwiftShader visual evidence is not native-GPU performance or Firefox/Safari
coverage. This is not a full aircraft-envelope or indefinite hands-off flight
certification.
