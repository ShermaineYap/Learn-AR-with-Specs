// TapLineGeometry — pure MeshBuilder helpers for the cut guide, marks and trunk glow shell.
// Owns: building RenderMesh objects from a TapLineTrunk's surface math. No scene access, no state.
// Must NOT: create SceneObjects or hold tapping state.

import {TapLineTrunk} from "./TapLineTrunk"

function newBuilder(): MeshBuilder {
  const b = new MeshBuilder([
    {name: "position", components: 3},
    {name: "normal", components: 3, normalized: true},
  ])
  b.topology = MeshTopology.Triangles
  b.indexType = MeshIndexType.UInt16
  return b
}

/**
 * A ribbon that hugs the bark along the cut line.
 * theta runs from thetaFrom (left, near PI) to thetaTo (right, near 0) in the trunk's convention.
 * heightAt(theta) gives the line centre height (local cm). thicknessCm is measured perpendicular to
 * the sloped line; offsetCm pushes it off the bark so it never z-fights.
 */
export function buildCutRibbon(
  trunk: TapLineTrunk,
  thetaFrom: number,
  thetaTo: number,
  heightAt: (theta: number) => number,
  slopeDeg: number,
  thicknessCm: number,
  offsetCm: number,
  segments: number = 72,
): RenderMesh {
  const b = newBuilder()
  const halfV = thicknessCm / 2 / Math.cos((slopeDeg * Math.PI) / 180)
  const verts: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= segments; i++) {
    const t = thetaFrom + (thetaTo - thetaFrom) * (i / segments)
    const y = heightAt(t)
    const n = trunk.surfaceNormal(t, y)
    const lo = trunk.surfacePoint(t, y - halfV, offsetCm)
    const hi = trunk.surfacePoint(t, y + halfV, offsetCm)
    verts.push(lo.x, lo.y, lo.z, n.x, n.y, n.z)
    verts.push(hi.x, hi.y, hi.z, n.x, n.y, n.z)
  }
  // theta decreases left->right; this winding matches TapLineTrunk's outward (CCW-from-outside) faces.
  for (let i = 0; i < segments; i++) {
    const a = i * 2
    const c = a + 2
    idx.push(a, c + 1, a + 1, a, c, c + 1)
  }
  b.appendVerticesInterleaved(verts)
  b.appendIndices(idx)
  b.updateMesh()
  return b.getMesh()
}

/** UV sphere centred at the origin. */
export function buildSphere(radiusCm: number, rings: number = 14, sectors: number = 20): RenderMesh {
  const b = newBuilder()
  const verts: number[] = []
  const idx: number[] = []
  for (let r = 0; r <= rings; r++) {
    const phi = (Math.PI * r) / rings
    for (let s = 0; s <= sectors; s++) {
      const th = (2 * Math.PI * s) / sectors
      const x = Math.sin(phi) * Math.cos(th)
      const y = Math.cos(phi)
      const z = Math.sin(phi) * Math.sin(th)
      verts.push(x * radiusCm, y * radiusCm, z * radiusCm, x, y, z)
    }
  }
  const row = sectors + 1
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const a = r * row + s
      const c = a + row
      idx.push(a, a + 1, c, a + 1, c + 1, c)
    }
  }
  b.appendVerticesInterleaved(verts)
  b.appendIndices(idx)
  b.updateMesh()
  return b.getMesh()
}

/** A thin shell around the trunk between yFrom and yTo, offsetCm off the bark — used for the proximity glow. */
export function buildGlowShell(
  trunk: TapLineTrunk,
  yFrom: number,
  yTo: number,
  offsetCm: number,
  sectors: number = 48,
  rows: number = 30,
): RenderMesh {
  const b = newBuilder()
  const verts: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= sectors; i++) {
    const th = (i / sectors) * Math.PI * 2
    for (let j = 0; j <= rows; j++) {
      const y = yFrom + (yTo - yFrom) * (j / rows)
      const p = trunk.surfacePoint(th, y, offsetCm)
      const n = trunk.surfaceNormal(th, y)
      verts.push(p.x, p.y, p.z, n.x, n.y, n.z)
    }
  }
  const P = rows + 1
  for (let i = 0; i < sectors; i++) {
    for (let j = 0; j < rows; j++) {
      const bl = i * P + j
      const br = bl + 1
      const tl = (i + 1) * P + j
      const tr = tl + 1
      idx.push(bl, br, tr, bl, tr, tl)
    }
  }
  b.appendVerticesInterleaved(verts)
  b.appendIndices(idx)
  b.updateMesh()
  return b.getMesh()
}
