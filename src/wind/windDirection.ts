import type { BeachConfig } from "../beaches/types";
import { seawardNormal } from "../map/coastalOrientation";

export type WindRelation = "onshore" | "offshore" | "lateral-north" | "lateral-south";

export type WindVector = { x: number; z: number };

export function windFlowVector(fromDegrees: number): WindVector {
  const flowBearing = (fromDegrees + 180) * Math.PI / 180;
  return {
    x: Math.sin(flowBearing),
    z: Math.cos(flowBearing)
  };
}

export function classifyWindForBeach(
  fromDegrees: number,
  beach: Pick<BeachConfig, "shoreline" | "seaSide">
): WindRelation {
  const coastX = beach.shoreline.end.x - beach.shoreline.start.x;
  const coastZ = beach.shoreline.end.z - beach.shoreline.start.z;
  const seaward = seawardNormal(coastX, coastZ, beach.seaSide);
  const flow = windFlowVector(fromDegrees);
  const crossShore = flow.x * seaward.x + flow.z * seaward.z;
  if (crossShore <= -.35) return "onshore";
  if (crossShore >= .35) return "offshore";
  return flow.z >= 0 ? "lateral-north" : "lateral-south";
}

export function windRelationLabel(relation: WindRelation): string {
  return ({
    onshore: "de mar · hacia la playa",
    offshore: "de tierra · hacia mar abierto",
    "lateral-north": "lateral · hacia el norte",
    "lateral-south": "lateral · hacia el sur"
  })[relation];
}
