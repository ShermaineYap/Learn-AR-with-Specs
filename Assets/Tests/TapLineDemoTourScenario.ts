// demo-tour — NOT a done-criteria test. Plays the whole TapLine flow at a natural, human pace for a
// screen recording (~70 s): start pose, smooth walk to each tree (the glow appears at 1.5 m on its own),
// real SIK pinches on trunk and end mark, the tip note showing and fading, the arrow guiding the turn to
// the next tree, and a final hold on the "3 of 3 trees done" message.
//
// Demo-only extras live in this file and exist only while this scenario runs:
//  - a soft ripple where each pinch lands,
//  - the LEAF on-screen log strip hidden (it comes back when the next scenario starts),
//  - the simulated hand reaching up from below the view for each pinch, holding the pinch a moment,
//    then lowering out of view (LEAF otherwise leaves it frozen in mid-air after a TapLine pinch).
// Camera motion is eased everywhere (zero velocity at every segment boundary) so nothing jumps.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {ScenarioConfig} from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig"
import {LeafHandInteractor} from "Leaf.lspkg/Interactors/interactor/LeafTwoHandInteractor"
import {nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {
  EYE_Y,
  TapLineCameraRig,
  findEndMarkInteractable,
  findTrunkInteractable,
  getMain,
  log,
  realPinch,
  waitForLensReady,
} from "./TapLineLeafHelpers"
import {TapLineMain} from "../Scripts/TapLineMain"
import {TapLineTree} from "../Scripts/TapLineTree"

const UNLIT: Material = requireAsset("../Materials/TapLineUnlit.mat") as Material
const DEG = Math.PI / 180

/** Distance from the bark where the user stops in front of each tree (cm). */
const STOP_FROM_BARK_CM = 70
/** Comfortable head-turn rate for turns (deg/s). */
const TURN_RATE_DEG_S = 32

// LEAF's in-preview log strip and diagnostic report are drawn by these root objects.
const LEAF_OVERLAY_NAMES = ["LeafDebugUICamera", "LeafDiagnosticReportCamera"]

/** Cosine ease in/out: velocity is zero at both ends, peak ~1.57x the average speed. */
function ease(t: number): number {
  const c = Math.max(0, Math.min(1, t))
  return 0.5 - 0.5 * Math.cos(Math.PI * c)
}

function wrapDeg(d: number): number {
  let x = d
  while (x > 180) x -= 360
  while (x < -180) x += 360
  return x
}

type Orientation = {yaw: number; pitch: number}

// ── LEAF overlay hiding ──────────────────────────────────────────────────────

function findLeafOverlays(): SceneObject[] {
  const found: SceneObject[] = []
  const n = global.scene.getRootObjectsCount()
  for (let i = 0; i < n; i++) {
    const so = global.scene.getRootObject(i)
    if (LEAF_OVERLAY_NAMES.indexOf(so.name) >= 0) found.push(so)
  }
  return found
}

function findLeafLogText(): Text | null {
  for (const so of findLeafOverlays()) {
    for (let k = 0; k < so.getChildrenCount(); k++) {
      const c = so.getChild(k)
      if (c.name === "LeafDebugLogLine") return c.getComponent("Component.Text") as Text
    }
  }
  return null
}

/**
 * Keeps the LEAF overlays disabled for the whole demo (including the "[demo-tour] PASSED" line LEAF
 * writes after run() returns). A root-level watcher re-enables them as soon as LEAF writes a line for
 * any other scenario, so the five tests keep their on-screen log.
 */
function startHidingLeafOverlay(): () => void {
  const watcherSO = global.scene.createSceneObject("DemoTourLeafOverlayHider")
  const sc = watcherSO.createComponent("Component.ScriptComponent") as ScriptComponent
  let demoRunning = true
  sc.createEvent("UpdateEvent").bind(() => {
    const overlays = findLeafOverlays()
    if (demoRunning) {
      for (const so of overlays) if (so.enabled) so.enabled = false
      return
    }
    const t = findLeafLogText()
    const text = t ? t.text : ""
    if (text.indexOf("demo-tour") < 0 && text.indexOf("RUNS:") >= 0) {
      for (const so of overlays) so.enabled = true
      watcherSO.destroy()
      return
    }
    for (const so of overlays) if (so.enabled) so.enabled = false
  })
  return () => {
    demoRunning = false
  }
}

// ── pinch ripple ─────────────────────────────────────────────────────────────

function buildRingMesh(segments: number, inner: number, outer: number): RenderMesh {
  const b = new MeshBuilder([
    {name: "position", components: 3},
    {name: "normal", components: 3, normalized: true},
  ])
  b.topology = MeshTopology.Triangles
  b.indexType = MeshIndexType.UInt16
  const verts: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    verts.push(c * inner, s * inner, 0, 0, 0, 1)
    verts.push(c * outer, s * outer, 0, 0, 0, 1)
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2
    const bb = a + 1
    const c = a + 2
    const d = a + 3
    idx.push(a, bb, c, bb, d, c) // front
    idx.push(a, c, bb, bb, c, d) // back (double-sided)
  }
  b.appendVerticesInterleaved(verts)
  b.appendIndices(idx)
  b.updateMesh()
  return b.getMesh()
}

class PinchRipple {
  private rings: {so: SceneObject; mat: Material}[] = []
  private root: SceneObject

  constructor() {
    this.root = global.scene.createSceneObject("DemoPinchRipple")
    const mesh = buildRingMesh(48, 0.82, 1.0)
    for (let i = 0; i < 2; i++) {
      const so = global.scene.createSceneObject("Ring" + i)
      so.setParent(this.root)
      const mat = UNLIT.clone()
      mat.mainPass.blendMode = BlendMode.Normal
      mat.mainPass.depthTest = false // sits on top of the end mark sphere / bark
      mat.mainPass.depthWrite = false
      mat.mainPass.baseColor = new vec4(1, 0.95, 0.82, 0)
      const rmv = so.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
      rmv.mesh = mesh
      rmv.mainMaterial = mat
      so.enabled = false
      this.rings.push({so, mat})
    }
  }

  private startedAt = -1

  /** Soft double ring that grows from ~1.5 cm to ~7 cm and fades out over ~0.85 s. Not awaited. */
  play(at: vec3, cameraPos: vec3): void {
    const t = this.root.getTransform()
    const toCam = cameraPos.sub(at).normalize()
    t.setWorldPosition(at.add(toCam.uniformScale(1.5)))
    t.setWorldRotation(quat.lookAt(toCam, vec3.up()))
    this.startedAt = getTime()
  }

  /** Called every frame by the scenario. */
  tick(): void {
    if (this.startedAt < 0) return
    const el = getTime() - this.startedAt
    let alive = false
    this.rings.forEach((r, i) => {
      const u = (el - i * 0.16) / 0.7
      if (u < 0 || u > 1) {
        r.so.enabled = false
        if (u < 0) alive = true
        return
      }
      alive = true
      r.so.enabled = true
      const grow = 1 - Math.pow(1 - u, 3) // ease-out
      const radius = 1.5 + 5.5 * grow
      r.so.getTransform().setLocalScale(new vec3(radius, radius, 1))
      r.mat.mainPass.baseColor = new vec4(1, 0.95, 0.82, (i === 0 ? 0.8 : 0.5) * (1 - u))
    })
    if (!alive) this.startedAt = -1
  }

  /** Self-check for the log: first ring's state and where its centre sits on screen. */
  describe(project: (w: vec3) => {sp: vec2; inFront: boolean}): string {
    const r = this.rings[0]
    const scale = r.so.getTransform().getLocalScale().x
    const p = project(this.root.getTransform().getWorldPosition())
    const onScreen = p.inFront && p.sp.x > 0 && p.sp.x < 1 && p.sp.y > 0 && p.sp.y < 1
    return "ring " + (r.so.enabled ? "drawn" : "hidden") + ", radius " + scale.toFixed(1) + " cm, alpha " +
      r.mat.mainPass.baseColor.w.toFixed(2) + ", " + (onScreen ? "on screen at " + p.sp.toString() : "OFF SCREEN")
  }

  destroy(): void {
    this.root.destroy()
  }
}

// ── scenario ─────────────────────────────────────────────────────────────────

@component
export class TapLineDemoTourScenario extends Scenario {
  private rig!: TapLineCameraRig
  private main!: TapLineMain
  private ripple!: PinchRipple
  private t0 = 0
  private startHoldSecs = 3

  async run(config?: ScenarioConfig): Promise<void> {
    // Optional: a longer opening hold at the start position (e.g. time to start a screen recorder).
    const sh = config ? config.getNumber("start_hold_secs") : undefined
    if (sh !== undefined && !isNaN(sh) && sh >= 0) this.startHoldSecs = sh
    const stopHiding = startHidingLeafOverlay()
    this.main = getMain()
    await waitForLensReady(this.main)
    this.rig = new TapLineCameraRig()
    this.rig.takeControl()
    this.ripple = new PinchRipple()
    const rippleTick = this.createEvent("UpdateEvent")
    rippleTick.bind(() => this.ripple.tick())
    try {
      await this.tour()
    } finally {
      rippleTick.enabled = false
      this.ripple.destroy()
      this.rig.release()
      stopHiding()
    }
  }

  private overlayState(): string {
    const o = findLeafOverlays()
    const shown = o.filter((so) => so.enabled).length
    return shown === 0 ? "hidden (" + o.length + " object(s))" : shown + " of " + o.length + " SHOWN"
  }

  private beat(msg: string): void {
    log("demo-tour " + (getTime() - this.t0).toFixed(1) + " s: " + msg)
  }

  private async tour(): Promise<void> {
    const main = this.main
    const [t1, t2, t3] = [main.getTree(0), main.getTree(1), main.getTree(2)]

    // Start position: the camera origin, eyes level, facing Tree 1.
    const start = new vec3(0, EYE_Y, 0)
    for (let i = 0; i < 4; i++) {
      this.rig.setPose(start, 0, 0)
      await nextFrame()
    }
    this.t0 = getTime()
    this.beat("start position (hold " + this.startHoldSecs + " s)")
    await this.hold(this.startHoldSecs)

    // ── Tree 1 ──
    const stop1 = this.stopPoint(t1)
    await this.walk([start, stop1], t1, 5.0, "walk to Tree 1")
    await this.doTree(0, t1)
    await this.turnUntilArrowGone(t2, -1, "turn right toward Tree 2")

    // ── Tree 2 ── a gentle arc that ends walking straight at the trunk.
    const stop2 = this.stopPoint(t2)
    const ctrl2 = new vec3(stop2.x - 20, EYE_Y, stop2.z + 90)
    await this.walk([stop1, ctrl2, stop2], t2, 7.5, "walk to Tree 2")
    await this.doTree(1, t2)
    await this.turnUntilArrowGone(t3, -1, "turn around (right) toward Tree 3")

    // ── Tree 3 ──
    const stop3 = this.stopPoint(t3)
    await this.walk([stop2, stop3], t3, 4.5, "walk to Tree 3")
    await this.doTree(2, t3)

    // Finish on the done message.
    const msg = main.doneMessage.getSceneObject().getTransform().getWorldPosition()
    await this.lookAt(msg, 0.8, "look up at the done message")
    await this.hold(4.2)
    this.beat("end (all trees done: " + main.isComplete + ")")
  }

  /** Pause, pinch the trunk, let the tip note show and fade, pinch the end mark, pause. */
  private async doTree(i: number, tree: TapLineTree): Promise<void> {
    const main = this.main
    this.beat("Tree " + (i + 1) + " reached (" + main.distanceToTree(i).toFixed(0) + " cm from axis, state " + main.getTreeState(i) + ")")
    await this.hold(1.0)

    this.parkHand(0)
    this.ripple.play(this.trunkHitPoint(tree), this.rig.position)
    this.checkRippleSoon("Tree " + (i + 1) + " trunk")
    this.beat("pinch trunk (ripple on, LEAF overlay " + this.overlayState() + ")")
    await realPinch(findTrunkInteractable(tree), "Tree" + (i + 1) + " trunk", () => main.getTreeState(i) !== "glowing")
    this.lowerHandSoon()
    await this.hold(6.0 - 0.15) // realPinch already settles 150 ms

    const endPos = tree.endMark.getTransform().getWorldPosition()
    await this.lookAt(endPos, 1.1, "glance at the end mark")
    await this.hold(0.3)
    this.ripple.play(endPos, this.rig.position)
    this.checkRippleSoon("Tree " + (i + 1) + " end mark")
    this.beat("pinch end mark (ripple on, LEAF overlay " + this.overlayState() + ")")
    await realPinch(findEndMarkInteractable(tree), "Tree" + (i + 1) + " end mark", () => main.getTreeState(i) !== "guiding")
    this.lowerHandSoon()
    if (i < 2) await this.hold(2.0 - 0.15)
  }

  // ── simulated hand (demo polish) ──

  private checkRippleSoon(what: string): void {
    const run = async () => {
      await sleep(350)
      if (this.ripple) log("demo-tour ripple check (" + what + "): " + this.ripple.describe((w) => this.rig.project(w)))
    }
    run()
  }

  /** A point well below and slightly right of the eyes, in camera space — always outside the view. */
  private handRestPoint(): vec3 {
    const rot = this.rig.cameraTransform.getWorldRotation()
    return this.rig.position.add(rot.multiplyVec3(new vec3(18, -65, -15)))
  }

  /** Put the hand at the rest point (out of view) so the next pinch reaches up from below. */
  private parkHand(durationMs: number): void {
    try {
      LeafHandInteractor.get("right").hand.setPosition(this.handRestPoint(), durationMs)
    } catch (e) {
      log("demo-tour: could not move the hand: " + e)
    }
  }

  /** Hold the pinch for a beat so it reads on camera, then relax and lower the hand. Not awaited. */
  private lowerHandSoon(): void {
    const run = async () => {
      await sleep(450)
      try {
        const hand = LeafHandInteractor.get("right").hand
        hand.makeGesture("neutral")
        await hand.setPosition(this.handRestPoint(), 650)
      } catch (e) {
        log("demo-tour: could not lower the hand: " + e)
      }
    }
    run()
  }

  // ── motion primitives (all eased; each starts from the current pose) ──

  private get orientation(): Orientation {
    const f = this.rig.cameraTransform.getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
    return {yaw: Math.atan2(-f.x, -f.z) / DEG, pitch: Math.asin(Math.max(-1, Math.min(1, f.y))) / DEG}
  }

  private orientationToward(from: vec3, to: vec3): Orientation {
    const d = to.sub(from)
    return {yaw: Math.atan2(-d.x, -d.z) / DEG, pitch: Math.atan2(d.y, Math.sqrt(d.x * d.x + d.z * d.z)) / DEG}
  }

  private async hold(seconds: number): Promise<void> {
    await sleep(Math.max(0, seconds) * 1000)
  }

  /** Where the user stops: STOP_FROM_BARK_CM in front of the tree's cut side, at eye height. */
  private stopPoint(tree: TapLineTree): vec3 {
    const base = tree.getSceneObject().getTransform().getWorldPosition()
    const g = this.gazeTarget(tree) // the cut is on the side the user works from
    const flat = new vec3(g.x - base.x, 0, g.z - base.z).normalize()
    const d = tree.trunk.trunkRadius + STOP_FROM_BARK_CM
    return new vec3(base.x + flat.x * d, EYE_Y, base.z + flat.z * d)
  }

  /** Middle of the cut line: where the eyes rest while working on a tree (note + both marks in view). */
  private gazeTarget(tree: TapLineTree): vec3 {
    return tree.guideStartWorld.add(tree.guideEndWorld).uniformScale(0.5)
  }

  /** Point on the bark straight ahead of the eyes (where a pinch at the trunk lands). */
  private trunkHitPoint(tree: TapLineTree): vec3 {
    const base = tree.getSceneObject().getTransform().getWorldPosition()
    const cam = this.rig.position
    const fwd = this.rig.cameraTransform.getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
    const r = tree.trunk.trunkRadius
    // Ray/cylinder (vertical axis) intersection in XZ.
    const ox = cam.x - base.x
    const oz = cam.z - base.z
    const a = fwd.x * fwd.x + fwd.z * fwd.z
    const b = 2 * (ox * fwd.x + oz * fwd.z)
    const c = ox * ox + oz * oz - r * r
    const disc = b * b - 4 * a * c
    if (a > 1e-6 && disc >= 0) {
      const s = (-b - Math.sqrt(disc)) / (2 * a)
      if (s > 0) return cam.add(fwd.uniformScale(s))
    }
    const g = this.gazeTarget(tree)
    const toCam = new vec3(cam.x - base.x, 0, cam.z - base.z).normalize()
    return new vec3(base.x + toCam.x * r, g.y, base.z + toCam.z * r)
  }

  /**
   * Walk along a straight line (2 points) or a quadratic curve (3 points) with eased speed, while the
   * head blends from its current orientation to looking at the tree's cut. Ends looking at the cut.
   */
  private async walk(path: vec3[], tree: TapLineTree, seconds: number, label: string): Promise<void> {
    this.beat(label)
    const o0 = this.orientation
    const target = this.gazeTarget(tree)
    const at = (u: number): vec3 => {
      if (path.length === 2) return vec3.lerp(path[0], path[1], u)
      const a = vec3.lerp(path[0], path[1], u)
      const b = vec3.lerp(path[1], path[2], u)
      return vec3.lerp(a, b, u)
    }
    let glowLogged = false
    let peak = 0
    let maxStep = 0
    let prev = this.rig.position
    let prevT = -1
    const i = this.main.getTree(0) === tree ? 0 : this.main.getTree(1) === tree ? 1 : 2
    const start = getTime()
    while (true) {
      const now = getTime()
      const t = Math.min(1, (now - start) / seconds)
      const u = ease(t)
      const pos = at(u)
      // Speed from the same clock that placed the camera (smooth by construction); also the largest
      // single-frame step, which is what a viewer would see as a jump.
      const step = pos.distance(prev)
      if (prevT >= 0 && now > prevT) peak = Math.max(peak, step / (now - prevT))
      if (prevT >= 0) maxStep = Math.max(maxStep, step)
      prev = pos
      prevT = now
      const look = this.orientationToward(pos, target)
      // Head settles onto the tree a little ahead of the feet (eased blend), so it never snaps.
      const h = ease(Math.min(1, t * 1.4))
      const yaw = o0.yaw + wrapDeg(look.yaw - o0.yaw) * h
      const pitch = o0.pitch + (look.pitch - o0.pitch) * h
      this.rig.setPose(pos, yaw, pitch)
      await nextFrame()
      if (!glowLogged && this.main.getTreeState(i) === "glowing") {
        glowLogged = true
        this.beat("Tree " + (i + 1) + " glows at " + this.main.distanceToTree(i).toFixed(0) + " cm")
      }
      if (t >= 1) break
    }
    this.beat(label + " done, peak speed " + peak.toFixed(0) + " cm/s, largest frame step " + maxStep.toFixed(1) + " cm")
  }

  /** Smooth head turn (in place) to look at a world point. */
  private async lookAt(world: vec3, seconds: number, label: string): Promise<void> {
    this.beat(label)
    const pos = this.rig.position
    const o0 = this.orientation
    const o1 = this.orientationToward(pos, world)
    const dy = wrapDeg(o1.yaw - o0.yaw)
    const start = getTime()
    while (true) {
      const t = Math.min(1, (getTime() - start) / seconds)
      const u = ease(t)
      this.rig.setPose(pos, o0.yaw + dy * u, o0.pitch + (o1.pitch - o0.pitch) * u)
      await nextFrame()
      if (t >= 1) break
    }
  }

  /**
   * Turn in place in the given direction (-1 = right, +1 = left) until facing the next tree's cut,
   * at a comfortable head-turn rate. The arrow disappears part-way, as soon as the tree enters view.
   */
  private async turnUntilArrowGone(next: TapLineTree, dir: number, label: string): Promise<void> {
    this.beat(label + (this.main.isArrowVisible ? " (arrow showing)" : " (no arrow)"))
    const pos = this.rig.position
    const o0 = this.orientation
    const o1 = this.orientationToward(pos, this.gazeTarget(next))
    let dy = wrapDeg(o1.yaw - o0.yaw)
    if (dir < 0 && dy > 0) dy -= 360
    if (dir > 0 && dy < 0) dy += 360
    const seconds = Math.max(1.6, Math.abs(dy) / TURN_RATE_DEG_S)
    let arrowGoneLogged = false
    const start = getTime()
    while (true) {
      const t = Math.min(1, (getTime() - start) / seconds)
      const u = ease(t)
      this.rig.setPose(pos, o0.yaw + dy * u, o0.pitch + (o1.pitch - o0.pitch) * u)
      await nextFrame()
      if (!arrowGoneLogged && !this.main.isArrowVisible) {
        arrowGoneLogged = true
        this.beat("arrow gone (next tree in view)")
      }
      if (t >= 1) break
    }
    await this.hold(1.0) // settle on the next tree before walking
  }
}
