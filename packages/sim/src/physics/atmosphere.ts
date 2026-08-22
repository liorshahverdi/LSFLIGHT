/**
 * ISA-style atmosphere (FLT-202). Ported to match YSFlight's FsGetAirDensity
 * (src/dynamics/fsairproperty.cpp) within 1%: lapse-rate troposphere,
 * isothermal stratosphere.
 */

const RHO0 = 1.225; // kg/m^3 at sea level
const P0 = 101325; // Pa
const T0 = 288.15; // K
const LAPSE = 0.0065; // K/m
const TROPOPAUSE = 11_000; // m
const T_TROPOPAUSE = T0 - LAPSE * TROPOPAUSE; // 216.65 K
const RHO_TROPOPAUSE = RHO0 * Math.pow(T_TROPOPAUSE / T0, 4.2561);
const EXP_SCALE = 6341.62; // m, density scale height above tropopause

/** Air density in kg/m^3 at altitude (m MSL). */
export function airDensity(altM: number): number {
  if (altM <= TROPOPAUSE) {
    const t = T0 - LAPSE * Math.max(0, altM);
    return RHO0 * Math.pow(t / T0, 4.2561);
  }
  return RHO_TROPOPAUSE * Math.exp(-(altM - TROPOPAUSE) / EXP_SCALE);
}

/** Speed of sound in m/s at altitude (m MSL). */
export function speedOfSound(altM: number): number {
  const t = altM <= TROPOPAUSE ? T0 - LAPSE * Math.max(0, altM) : T_TROPOPAUSE;
  return Math.sqrt(1.4 * 287.05 * t);
}

/** Static pressure in Pa at altitude (m MSL). */
export function airPressure(altM: number): number {
  if (altM <= TROPOPAUSE) {
    const t = T0 - LAPSE * Math.max(0, altM);
    return P0 * Math.pow(t / T0, 5.2561);
  }
  const pTrop = P0 * Math.pow(T_TROPOPAUSE / T0, 5.2561);
  return pTrop * Math.exp(-(altM - TROPOPAUSE) / EXP_SCALE);
}
