/**
 * YSFlight .fld parser (FLT-304).
 *
 * Parses the text container format used by runtime/scenery/*.fld:
 *   FIELD / FLDNAME / GND / SKY / BASEELV / MAGVAR
 *   PCK "<name>" <lineCount>   -> packed text block stored BY NAME
 *   TER / PC2 / PST / FLD ...  -> items referencing a packed block via
 *                                 FIL "<name>", placed by POS x y z h p b,
 *                                 terminated by END.
 *
 * This mirrors YsScenery::LoadFldOneLine: PCK payloads are buffered into
 * pckFileList; item sections then load them via FIL name lookup.
 *
 * TerrMesh grids follow YsElevationGrid::LoadTerOneLine: NBL gives block
 * counts (nodes are (nx+1)*(nz+1)), TMS the node spacing, BLO lines carry
 * one node each in row-major order (index z*(nx+1)+x).
 */
import { tokenize, commandOf } from "./tokenizer.js";

export interface FldElevationGrid {
  kind: "elevationGrid";
  /** Block counts; nodes are (nx+1)*(nz+1). */
  nx: number;
  nz: number;
  /** Node spacing in meters. */
  xWidM: number;
  zWidM: number;
  /** Node elevations, row-major (z*(nx+1)+x), meters relative to base. */
  y: number[];
  /** Diagonal split flag per node ("L" in BLO). */
  lup: boolean[];
  specular: boolean;
}

export type FldItem =
  | { kind: "ter"; fileRef: string; posM: number[]; grid: FldElevationGrid }
  | {
      kind: "child";
      fileRef: string;
      posM: number[];
      /** Raw payload lines of the nested .fld (parsed recursively). */
      payloadLines: string[];
    }
  | { kind: "unhandled"; itemType: string; fileRef: string; posM: number[] };

export interface FldDocument {
  name: string;
  groundColorRGB: [number, number, number] | null;
  skyColorRGB: [number, number, number] | null;
  /** Base elevation: node y=0 corresponds to this true altitude. */
  baseElevationM: number;
  items: FldItem[];
}

function parseLength(arg: string | undefined): number {
  // YSFlight lengths carry unit suffixes like "0.00m".
  return parseFloat((arg ?? "0").replace(/[a-zA-Z]/g, ""));
}

function parsePos(args: string[]): number[] {
  // POS x y z h p b — keep translation only for v0.1.
  return [parseFloat(args[1] ?? "0"), parseFloat(args[2] ?? "0"), parseFloat(args[3] ?? "0")];
}

/** Parse inline TerrMesh payload lines into an elevation grid, or null. */
export function parseTerrMesh(lines: string[]): FldElevationGrid | null {
  let nx = 0;
  let nz = 0;
  let xWid = 0;
  let zWid = 0;
  let specular = false;
  const y: number[] = [];
  const lup: boolean[] = [];

  for (const line of lines) {
    const args = tokenize(line);
    if (args.length === 0) continue;
    switch (commandOf(args)) {
      case "TERRMESH":
        break;
      case "SPEC":
        specular = /^true$/i.test(args[1] ?? "");
        break;
      case "NBL": // NBLOCK
        nx = parseInt(args[1] ?? "0", 10);
        nz = parseInt(args[2] ?? "0", 10);
        break;
      case "TMS": // TMSIZE
        xWid = parseFloat(args[1] ?? "0");
        zWid = parseFloat(args[2] ?? "0");
        break;
      case "BLO": {
        // BLOCK <y> [L|R] <flags> <r> <g> <b> <flags> <r> <g> <b>
        y.push(parseFloat(args[1] ?? "0"));
        lup.push((args[2] ?? "").toUpperCase() === "L");
        break;
      }
      case "CBE": // color-by-elevation: visual only
      case "BOT":
      case "RIG":
      case "TOP":
      case "LEF":
      case "END":
      case "TEX":
        break;
      default:
        break;
    }
  }

  const expectedNodes = (nx + 1) * (nz + 1);
  if (nx <= 0 || nz <= 0 || y.length !== expectedNodes) {
    return null;
  }
  return { kind: "elevationGrid", nx, nz, xWidM: xWid, zWidM: zWid, y, lup, specular };
}

const ITEM_TYPES = new Set(["TER", "PC2", "PST", "PLT", "SRF", "RGN", "GOB", "AOB", "FLD"]);

/** Parse a full .fld document from text lines. */
export function parseFld(text: string): FldDocument {
  const lines = text.split(/\r?\n/);
  const doc: FldDocument = {
    name: "",
    groundColorRGB: null,
    skyColorRGB: null,
    baseElevationM: 0,
    items: [],
  };

  // State machine mirroring LoadFldOneLine.
  type State = "outside" | "pck" | "item";
  let state: State = "outside";
  let pckRemain = 0;
  let pckName = "";
  let pckLines: string[] = [];
  /** Packed blocks stored by name (YsScenery::pckFileList analogue). */
  const pckMap = new Map<string, string[]>();

  let currentItemType = "";
  let currentFileRef = "";
  let currentPos: number[] = [0, 0, 0];

  const flushItem = () => {
    if (currentItemType === "") return;
    if (currentItemType === "TER") {
      const payload = currentFileRef ? pckMap.get(currentFileRef) : undefined;
      const grid = payload ? parseTerrMesh(payload) : null;
      if (grid) {
        doc.items.push({ kind: "ter", fileRef: currentFileRef, posM: currentPos, grid });
      } else {
        doc.items.push({
          kind: "unhandled",
          itemType: "TER",
          fileRef: currentFileRef,
          posM: currentPos,
        });
      }
    } else if (currentItemType === "FLD") {
      const payload = currentFileRef ? pckMap.get(currentFileRef) : undefined;
      if (payload) {
        doc.items.push({
          kind: "child",
          fileRef: currentFileRef,
          posM: currentPos,
          payloadLines: payload,
        });
      } else {
        doc.items.push({
          kind: "unhandled",
          itemType: "FLD",
          fileRef: currentFileRef,
          posM: currentPos,
        });
      }
    } else {
      doc.items.push({
        kind: "unhandled",
        itemType: currentItemType,
        fileRef: currentFileRef,
        posM: currentPos,
      });
    }
    currentItemType = "";
    currentFileRef = "";
    currentPos = [0, 0, 0];
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("#") || /^(REM)(\s|$)/i.test(trimmed)) continue;

    if (state === "pck") {
      pckLines.push(raw);
      pckRemain--;
      if (pckRemain === 0) {
        if (pckName) pckMap.set(pckName, pckLines);
        pckLines = [];
        pckName = "";
        state = "outside";
      }
      continue;
    }

    const args = tokenize(trimmed);
    if (args.length === 0) continue;
    const cmd = commandOf(args);

    if (state === "outside") {
      switch (cmd) {
        case "FIELD":
          break;
        case "FLDNAME":
          doc.name = args[1] ?? "";
          break;
        case "GND":
          doc.groundColorRGB = [
            parseInt(args[1] ?? "0", 10),
            parseInt(args[2] ?? "0", 10),
            parseInt(args[3] ?? "0", 10),
          ];
          break;
        case "SKY":
          doc.skyColorRGB = [
            parseInt(args[1] ?? "0", 10),
            parseInt(args[2] ?? "0", 10),
            parseInt(args[3] ?? "0", 10),
          ];
          break;
        case "BASEELV":
          doc.baseElevationM = parseLength(args[1]);
          break;
        case "PCK":
          pckName = (args[1] ?? "").replace(/"/g, "");
          pckRemain = parseInt(args[2] ?? "0", 10);
          pckLines = [];
          state = "pck";
          break;
        default:
          if (ITEM_TYPES.has(cmd)) {
            flushItem();
            currentItemType = cmd;
            state = "item";
          }
          break;
      }
    } else if (state === "item") {
      switch (cmd) {
        case "FIL":
          currentFileRef = (args[1] ?? "").replace(/"/g, "");
          break;
        case "POS":
          currentPos = parsePos(args);
          break;
        case "END":
          flushItem();
          state = "outside";
          break;
        default:
          break;
      }
    }
  }
  flushItem();
  return doc;
}
