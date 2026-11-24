import type { WorldData, WNode } from './types';

export interface World extends WorldData {
  adj: { to: number; km: number }[][];   // 陸路
  portsByZone: number[][];
  nodesByRegion: number[][];
  nodesByCountry: Record<string, number[]>;
  regionIdx: Record<string, number>;
}

export let W: World;

export async function loadWorld(url: string): Promise<World> {
  const data: WorldData = await (await fetch(url)).json();
  return setWorld(data);
}

export function setWorld(data: WorldData): World {
  const adj: World['adj'] = data.nodes.map(() => []);
  for (const [a, b, km] of data.edges) { adj[a].push({ to: b, km }); adj[b].push({ to: a, km }); }
  const portsByZone: number[][] = data.zones.map(() => []);
  const nodesByRegion: number[][] = data.regions.map(() => []);
  const nodesByCountry: Record<string, number[]> = {};
  for (const n of data.nodes) {
    for (const z of n.zones) portsByZone[z].push(n.id);
    nodesByRegion[n.region].push(n.id);
    (nodesByCountry[n.country] ??= []).push(n.id);
  }
  const regionIdx = Object.fromEntries(data.regions.map((r) => [r.name, r.id]));
  W = { ...data, adj, portsByZone, nodesByRegion, nodesByCountry, regionIdx };
  return W;
}

export function km(a: WNode, b: WNode): number {
  const R = 6371, t = Math.PI / 180;
  const dla = (b.lat - a.lat) * t, dlo = (b.lon - a.lon) * t;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const nodeKm = (a: number, b: number) => km(W.nodes[a], W.nodes[b]);
export function isAdj(a: number, b: number): boolean { return W.adj[a].some((e) => e.to === b); }
