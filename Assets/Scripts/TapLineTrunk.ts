/**
 * TapLineTrunk — procedural stand-in rubber tree trunk for TapLine (code-authored MeshBuilder geometry,
 * declared in the build plan: the cut guide must sit exactly on a trunk of known radius).
 * Owns: the trunk mesh (bark, root flare, old cut groove, renewed-bark panel) and pure surface-math helpers.
 * Must NOT: hold any tapping state or handle input — TapLineTree owns that.
 *
 * Local space: pivot at the trunk base on the floor (y = 0), trunk grows +Y.
 * The "front" of the tree (the tapping face the user stands at) faces local +Z.
 * Seen from the front, the user's left is local -X and right is local +X.
 *
 * Builds: a slightly tapered trunk with a root flare and subtle bark ridges,
 * an old tapping cut (a sloped groove) across the front half that slopes down
 * left-to-right at `slopeDeg`, and a lighter "renewed bark" tapped panel below it.
 *
 * Use surfacePoint() / cutLineHeight() to place the new cut guide exactly on the
 * bark, just below the old cut.
 */
@component
export class TapLineTrunk extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">TapLineTrunk – stand-in rubber tree trunk</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("Vertex color material (vertexBaseColorMaterial)")
  material: Material;
  @ui.group_end

  @ui.group_start("Settings")
  @input
  @hint("Visible trunk height (cm)")
  trunkHeight: number = 300;

  @input
  @hint("Trunk radius at tapping height (cm). 14 = 28 cm wide")
  trunkRadius: number = 14;

  @input
  @hint("Height of the old cut at its left (high) end (cm)")
  oldCutHeight: number = 123;

  @input
  @hint("Cut slope from horizontal (degrees), down to the right")
  slopeDeg: number = 30;

  @input
  @hint("Depth of the old cut groove (cm)")
  grooveDepth: number = 0.9;

  /** Half-width of the old cut groove (cm). */
  private readonly grooveHalfWidth: number = 0.7;

  @input
  @hint("Height of the renewed-bark tapped panel below the old cut (cm)")
  panelHeight: number = 40;
  @ui.group_end

  private readonly segments = 96;

  private rmv: RenderMeshVisual;

  private built = false;

  onAwake() {
    this.ensureBuilt();
  }

  /** Builds the mesh once (safe to call from other scripts' onAwake). */
  ensureBuilt(): void {
    if (this.built) return;
    this.built = true;
    this.build();
  }

  /** Height (cm, local) of the old cut centre at angle theta (radians). Front half is theta in [0, PI]; PI = left, 0 = right. */
  cutLineHeight(theta: number): number {
    const arc = this.trunkRadius * (Math.PI - theta);
    return this.oldCutHeight - Math.tan((this.slopeDeg * Math.PI) / 180) * arc;
  }

  /** Bark surface radius at (theta, y), including taper, flare, ridges and the old cut groove. */
  radiusAt(theta: number, y: number): number {
    const H = this.trunkHeight;
    const R0 = this.trunkRadius;
    // Taper so the radius equals R0 at ~120 cm and narrows slightly upward.
    let r = R0 * (1 + 0.06 * (120 - y) / H);
    // Root flare at the base.
    r += 5.5 * Math.exp(-y / 10) * (1 + 0.35 * Math.sin(theta * 5 + 0.7));
    // Subtle bark ridges (rubber bark is fairly smooth).
    r += 0.18 * Math.sin(theta * 23 + y * 0.04) + 0.12 * Math.sin(theta * 11 - y * 0.09);
    // Old cut groove on the front half only.
    r -= this.grooveAt(theta, y) * this.grooveDepth;
    return r;
  }

  /** Local-space point on the bark at angle theta (radians) and height y, pushed out by `offset` cm. */
  surfacePoint(theta: number, y: number, offset: number = 0): vec3 {
    const r = this.radiusAt(theta, y) + offset;
    return new vec3(r * Math.cos(theta), y, r * Math.sin(theta));
  }

  /** Outward normal (local) on the bark at (theta, y). */
  surfaceNormal(theta: number, y: number): vec3 {
    const n = this.normalAt(theta, y);
    return new vec3(n[0], n[1], n[2]);
  }

  // 0..1 groove profile: 1 at the cut centre line, fading at the ends of the half-spiral.
  private grooveAt(theta: number, y: number): number {
    const t = this.wrapFront(theta);
    if (t < 0) return 0;
    const d = (y - this.cutLineHeight(t)) / this.grooveHalfWidth;
    const endFade = this.smooth(0, 0.12, t) * this.smooth(0, 0.12, Math.PI - t);
    return Math.exp(-d * d) * endFade;
  }

  // Map theta into [0, PI] if on the front half, else -1.
  private wrapFront(theta: number): number {
    let t = theta % (Math.PI * 2);
    if (t < 0) t += Math.PI * 2;
    return t <= Math.PI ? t : -1;
  }

  private smooth(a: number, b: number, x: number): number {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  }

  private normalAt(theta: number, y: number): number[] {
    const e = 0.01;
    const R = this.radiusAt(theta, y);
    const Rt = (this.radiusAt(theta + e, y) - this.radiusAt(theta - e, y)) / (2 * e);
    const Ry = (this.radiusAt(theta, y + e) - this.radiusAt(theta, y - e)) / (2 * e);
    const c = Math.cos(theta), s = Math.sin(theta);
    // Pt = dP/dtheta, Py = dP/dy; outward normal = Py x Pt
    const pt = [Rt * c - R * s, 0, Rt * s + R * c];
    const py = [Ry * c, 1, Ry * s];
    const n = [
      py[1] * pt[2] - py[2] * pt[1],
      py[2] * pt[0] - py[0] * pt[2],
      py[0] * pt[1] - py[1] * pt[0],
    ];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / len, n[1] / len, n[2] / len];
  }

  // Height samples: fine around the tapping band, coarse elsewhere.
  private heightSamples(): number[] {
    const H = this.trunkHeight;
    const lowCut = this.cutLineHeight(0);
    const bandLo = Math.max(0, lowCut - this.panelHeight - 4);
    const bandHi = Math.min(H, this.oldCutHeight + 6);
    const ys: number[] = [];
    // Base flare region
    for (let y = 0; y < Math.min(30, bandLo); y += 2) ys.push(y);
    for (let y = Math.min(30, bandLo); y < bandLo; y += 5) ys.push(y);
    for (let y = bandLo; y < bandHi; y += 0.4) ys.push(y);
    for (let y = bandHi; y < H; y += 8) ys.push(y);
    ys.push(H);
    return ys;
  }

  private colorAt(theta: number, y: number, n: number[]): number[] {
    // Light grey-brown bark so it reads on an additive display.
    let base = [0.74, 0.68, 0.6];
    const noise = 0.04 * Math.sin(theta * 37 + y * 0.31) + 0.03 * Math.sin(theta * 7 - y * 0.05);
    base = base.map((v) => v + noise);

    const t = this.wrapFront(theta);
    if (t >= 0) {
      const cutY = this.cutLineHeight(t);
      const endFade = this.smooth(0, 0.1, t) * this.smooth(0, 0.1, Math.PI - t);
      // Renewed-bark tapped panel just below the old cut: warmer and lighter.
      const below = cutY - y;
      const panel =
        this.smooth(-0.2, 0.6, below) * (1 - this.smooth(this.panelHeight - 6, this.panelHeight, below)) * endFade;
      const panelCol = [0.84, 0.74, 0.58];
      base = base.map((v, i) => v * (1 - panel) + panelCol[i] * panel);
      // Groove interior: pale cream exposed wood / dried latex.
      const g = this.grooveAt(theta, y);
      const grooveCol = [0.96, 0.9, 0.74];
      base = base.map((v, i) => v * (1 - g) + grooveCol[i] * g);
    }

    // Baked lighting (material is unlit): ambient + one key light from front-upper-left.
    const L = [-0.45, 0.55, 0.7];
    const ll = Math.hypot(L[0], L[1], L[2]);
    const ndl = Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / ll);
    const shade = 0.62 + 0.45 * ndl;
    return [Math.min(1, base[0] * shade), Math.min(1, base[1] * shade), Math.min(1, base[2] * shade), 1];
  }

  // Baked key light (material is unlit), same as the bark.
  private shade(base: number[], n: number[]): number[] {
    const L = [-0.45, 0.55, 0.7];
    const ll = Math.hypot(L[0], L[1], L[2]);
    const ndl = Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / ll);
    const s = 0.62 + 0.45 * ndl;
    return [Math.min(1, base[0] * s), Math.min(1, base[1] * s), Math.min(1, base[2] * s), 1];
  }

  /**
   * Adds the latex-collection set that makes the stand-in read as a rubber tree: a small cup hanging just
   * below the low end of the cut, a tin spout in the bark above it, and a thin wire hoop around the trunk.
   * theta = angle of the cut's low (right) end; cutEndY = height of that end (local cm).
   * Visual only: no collider, so it never blocks pinches on the end mark above it.
   */
  addLatexCup(theta: number, cutEndY: number): SceneObject {
    const verts: number[] = [];
    const idx: number[] = [];
    let count = 0;
    const v = (p: number[], n: number[], col: number[]): number => {
      const c = this.shade(col, n);
      verts.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], c[3]);
      return count++;
    };
    // Both windings, so faces show from either side regardless of culling.
    const quad = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d, a, c, b, a, d, c);

    const CUP = [0.9, 0.66, 0.48]; // light clay — readable on the additive display
    const LATEX = [0.98, 0.97, 0.93];
    const TIN = [0.86, 0.88, 0.9];
    const WIRE = [0.78, 0.78, 0.8];

    const ox = Math.cos(theta), oz = Math.sin(theta); // outward from the trunk axis
    const tx = -Math.sin(theta), tz = Math.cos(theta); // tangent around the trunk

    // Cup: open truncated cone, outer + inner wall, rim, and a base.
    const rTop = 5.5, rBot = 3.6, cupH = 7, wall = 0.35;
    const spoutY = cutEndY - 5;
    const rimY = spoutY - 4.5;
    const barkR = this.radiusAt(theta, rimY);
    const cx = ox * (barkR + rTop + 0.4), cz = oz * (barkR + rTop + 0.4);
    const S = 28;
    const coneN = (a: number) => {
      const s = (rTop - rBot) / cupH;
      const l = Math.hypot(1, s);
      return [Math.cos(a) / l, -s / l, Math.sin(a) / l];
    };
    const ring = (r: number, y: number, a: number) => [cx + r * Math.cos(a), y, cz + r * Math.sin(a)];
    for (let i = 0; i < S; i++) {
      const a0 = (i / S) * Math.PI * 2, a1 = ((i + 1) / S) * Math.PI * 2;
      const y0 = rimY - cupH, y1 = rimY;
      // outer wall
      quad(v(ring(rBot, y0, a0), coneN(a0), CUP), v(ring(rBot, y0, a1), coneN(a1), CUP),
           v(ring(rTop, y1, a1), coneN(a1), CUP), v(ring(rTop, y1, a0), coneN(a0), CUP));
      // inner wall (darker in shade naturally via inverted normal)
      const n0 = coneN(a0).map((k) => -k), n1 = coneN(a1).map((k) => -k);
      quad(v(ring(rBot - wall, y0 + wall, a0), n0, CUP), v(ring(rBot - wall, y0 + wall, a1), n1, CUP),
           v(ring(rTop - wall, y1, a1), n1, CUP), v(ring(rTop - wall, y1, a0), n0, CUP));
      // rim
      quad(v(ring(rTop - wall, y1, a0), [0, 1, 0], CUP), v(ring(rTop - wall, y1, a1), [0, 1, 0], CUP),
           v(ring(rTop, y1, a1), [0, 1, 0], CUP), v(ring(rTop, y1, a0), [0, 1, 0], CUP));
      // base
      quad(v([cx, y0, cz], [0, -1, 0], CUP), v(ring(rBot, y0, a0), [0, -1, 0], CUP),
           v(ring(rBot, y0, a1), [0, -1, 0], CUP), v([cx, y0, cz], [0, -1, 0], CUP));
      // latex pooled in the cup, ~60% full
      const ly = rimY - cupH * 0.4;
      const lr = rBot + (rTop - rBot) * 0.6 - wall;
      quad(v([cx, ly, cz], [0, 1, 0], LATEX), v(ring(lr, ly, a0), [0, 1, 0], LATEX),
           v(ring(lr, ly, a1), [0, 1, 0], LATEX), v([cx, ly, cz], [0, 1, 0], LATEX));
    }

    // Spout: a small tin strip pushed into the bark, sloping down toward the cup.
    const sw = 1.6, sLen = 4.5, drop = 2.2;
    const sb = this.radiusAt(theta, spoutY) - 0.3;
    const sp = (along: number, side: number, up: number) => {
      const r = sb + along;
      return [ox * r + tx * side, spoutY - (along / sLen) * drop + up, oz * r + tz * side];
    };
    const sn = [ox * 0.4, 0.9, oz * 0.4];
    quad(v(sp(0, -sw, 0), sn, TIN), v(sp(0, sw, 0), sn, TIN), v(sp(sLen, sw, 0), sn, TIN), v(sp(sLen, -sw, 0), sn, TIN));
    // little upturned edges so it reads as a channel
    quad(v(sp(0, -sw, 0), [-tx, 0, -tz], TIN), v(sp(sLen, -sw, 0), [-tx, 0, -tz], TIN),
         v(sp(sLen, -sw, 0.5), [-tx, 0, -tz], TIN), v(sp(0, -sw, 0.5), [-tx, 0, -tz], TIN));
    quad(v(sp(0, sw, 0), [tx, 0, tz], TIN), v(sp(sLen, sw, 0), [tx, 0, tz], TIN),
         v(sp(sLen, sw, 0.5), [tx, 0, tz], TIN), v(sp(0, sw, 0.5), [tx, 0, tz], TIN));

    // Wire hoop around the trunk at the rim, holding the cup.
    const W = 48, wy = rimY - 0.6, wh = 0.35;
    for (let i = 0; i < W; i++) {
      const a0 = (i / W) * Math.PI * 2, a1 = ((i + 1) / W) * Math.PI * 2;
      const r0 = this.radiusAt(a0, wy) + 0.25, r1 = this.radiusAt(a1, wy) + 0.25;
      const n0 = [Math.cos(a0), 0, Math.sin(a0)], n1 = [Math.cos(a1), 0, Math.sin(a1)];
      quad(v([r0 * n0[0], wy - wh / 2, r0 * n0[2]], n0, WIRE), v([r1 * n1[0], wy - wh / 2, r1 * n1[2]], n1, WIRE),
           v([r1 * n1[0], wy + wh / 2, r1 * n1[2]], n1, WIRE), v([r0 * n0[0], wy + wh / 2, r0 * n0[2]], n0, WIRE));
    }

    const builder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "normal", components: 3, normalized: true },
      { name: "color", components: 4 },
    ]);
    builder.topology = MeshTopology.Triangles;
    builder.indexType = MeshIndexType.UInt16;
    builder.appendVerticesInterleaved(verts);
    builder.appendIndices(idx);
    builder.updateMesh();

    const so = global.scene.createSceneObject("LatexCup");
    so.setParent(this.sceneObject);
    const rmv = so.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = builder.getMesh();
    if (this.material) rmv.mainMaterial = this.material;
    return so;
  }

  private build() {
    const builder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "normal", components: 3, normalized: true },
      { name: "color", components: 4 },
    ]);
    builder.topology = MeshTopology.Triangles;
    builder.indexType = MeshIndexType.UInt16;

    const S = this.segments;
    const ys = this.heightSamples();
    const P = ys.length;
    const verts: number[] = [];
    const indices: number[] = [];

    // (S+1) columns x P rows; column i = angle, row j = height.
    for (let i = 0; i <= S; i++) {
      const theta = (i / S) * Math.PI * 2;
      for (let j = 0; j < P; j++) {
        const y = ys[j];
        const p = this.surfacePoint(theta, y);
        const n = this.normalAt(theta, y);
        const col = this.colorAt(theta, y, n);
        verts.push(p.x, p.y, p.z, n[0], n[1], n[2], col[0], col[1], col[2], col[3]);
      }
    }
    // Winding: (Py x Pt) is outward, so [bl, br, tr, bl, tr, tl] with
    // bl=(i,j), br=(i,j+1), tl=(i+1,j), tr=(i+1,j+1) is CCW from outside.
    for (let i = 0; i < S; i++) {
      for (let j = 0; j < P - 1; j++) {
        const bl = i * P + j;
        const br = i * P + j + 1;
        const tl = (i + 1) * P + j;
        const tr = (i + 1) * P + j + 1;
        indices.push(bl, br, tr, bl, tr, tl);
      }
    }

    // Top cap (normal +Y): cut wood end, light tan.
    let vi = (S + 1) * P;
    const H = this.trunkHeight;
    const capCol = [0.86, 0.78, 0.62, 1];
    const center = vi;
    verts.push(0, H, 0, 0, 1, 0, ...capCol);
    vi++;
    const ring = vi;
    for (let i = 0; i <= S; i++) {
      const p = this.surfacePoint((i / S) * Math.PI * 2, H);
      verts.push(p.x, p.y, p.z, 0, 1, 0, ...capCol);
      vi++;
    }
    for (let i = 0; i < S; i++) indices.push(center, ring + i + 1, ring + i);

    builder.appendVerticesInterleaved(verts);
    builder.appendIndices(indices);
    builder.updateMesh();

    this.rmv = this.sceneObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    this.rmv.mesh = builder.getMesh();
    if (this.material) this.rmv.mainMaterial = this.material;
  }
}
