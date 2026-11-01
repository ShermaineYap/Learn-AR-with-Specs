// TapLineLeafHelpers — shared helpers for the TapLine LEAF scenarios.
// - TapLineCameraRig: really moves/rotates the preview's world camera (the "Camera Object"
//   that SIK's WorldCameraFinderProvider returns, i.e. the same camera TapLineMain reads for
//   proximity and the arrow controller reads for "in view"). DeviceTracking is paused while a
//   scenario drives the camera, then restored.
// - Real SIK pinch helpers: simulated right hand moves to the target Interactable, makes the
//   pinch gesture, and triggers it through SIK's RightHandInteractor (LeafHandInteractor).

import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {LeafHandInteractor} from "Leaf.lspkg/Interactors/interactor/LeafTwoHandInteractor"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {TapLineMain} from "../Scripts/TapLineMain"
import {TapLineTree} from "../Scripts/TapLineTree"

export const FLOOR_Y = -160
export const EYE_Y = 0
const DEG = Math.PI / 180

export function log(msg: string): void {
  print("[TapLineLeaf] " + msg)
}

export function getMain(): TapLineMain {
  const so = findSceneObjectByName("TapLine")
  expect(isNull(so)).toBe(false)
  const main = so.getComponent(TapLineMain.getTypeName()) as TapLineMain
  expect(isNull(main)).toBe(false)
  return main
}

export async function waitForLensReady(main: TapLineMain): Promise<void> {
  // TapLineMain + trees build in OnStart; wait until tree 1 has an Interactable on its trunk.
  const start = getTime()
  while (getTime() - start < 5) {
    if (main.treeCount === 3 && !isNull(findTrunkInteractable(main.getTree(0)))) {
      await sleep(300)
      return
    }
    await nextFrame()
  }
  throw new Error("TapLine did not finish initialising within 5 s")
}

export function findTrunkInteractable(tree: TapLineTree): Interactable | null {
  const trunkSO = tree.trunk.getSceneObject()
  for (let i = 0; i < trunkSO.getChildrenCount(); i++) {
    const c = trunkSO.getChild(i)
    if (c.name === "TrunkHitArea") {
      return c.getComponent(Interactable.getTypeName()) as Interactable
    }
  }
  return null
}

export function findEndMarkInteractable(tree: TapLineTree): Interactable | null {
  return tree.endMark.getComponent(Interactable.getTypeName()) as Interactable
}

/**
 * Real SIK pinch: simulated right hand moves to the target, pinches, SIK fires the trigger events.
 * TapLine disables the trunk/end-mark Interactable inside onTriggerStart (by design), so SIK never
 * delivers onTriggerEnd and LEAF's trigger() promise never resolves. We therefore treat the pinch as
 * complete once `handled()` reports the Lens reacted (or once trigger() resolves on its own), and
 * fail if neither happens within timeoutMs.
 */
export async function realPinch(
  target: Interactable,
  label: string,
  handled: () => boolean,
  timeoutMs = 4000,
): Promise<void> {
  expect(isNull(target), label + " Interactable exists").toBe(false)
  const hand = LeafHandInteractor.get("right")
  log("real hand pinch on " + label)
  let finished = false
  let error: any = null
  hand.trigger(target).then(
    () => (finished = true),
    (e) => (error = e),
  )
  const ok = await waitUntil(() => finished || error !== null || handled(), timeoutMs)
  if (error !== null) throw error
  if (!ok) {
    throw new Error("Real pinch on " + label + " had no effect within " + timeoutMs + " ms (Interactable not hoverable/enabled?)")
  }
  log("real hand pinch on " + label + " handled (trigger() resolved: " + finished + ")")
  await sleep(150)
}

export async function waitUntil(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = getTime()
  while ((getTime() - start) * 1000 < timeoutMs) {
    if (cond()) return true
    await nextFrame()
  }
  return cond()
}

/** Yaw (deg) that makes a camera at `from` face the XZ direction toward `to`. 0 = facing -Z. */
export function yawToward(from: vec3, to: vec3): number {
  const dx = to.x - from.x
  const dz = to.z - from.z
  return Math.atan2(-dx, -dz) / DEG
}

export class TapLineCameraRig {
  readonly camera: Camera
  readonly cameraTransform: Transform
  private paused: DeviceTracking[] = []

  constructor() {
    this.camera = WorldCameraFinderProvider.getInstance().getComponent()
    this.cameraTransform = this.camera.getTransform()
  }

  /** Pause device tracking so the scenario owns the camera pose. */
  takeControl(): void {
    const comps = this.camera.getSceneObject().getComponents("Component.DeviceTracking") as DeviceTracking[]
    for (const c of comps) {
      if (c.enabled) {
        c.enabled = false
        this.paused.push(c)
      }
    }
    log("camera control taken (paused " + this.paused.length + " DeviceTracking component(s))")
  }

  release(): void {
    for (const c of this.paused) {
      if (!isNull(c)) c.enabled = true
    }
    this.paused = []
  }

  get position(): vec3 {
    return this.cameraTransform.getWorldPosition()
  }

  get yawDeg(): number {
    const f = this.cameraTransform.getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
    return Math.atan2(-f.x, -f.z) / DEG
  }

  /** World right vector of the camera. */
  get right(): vec3 {
    return this.cameraTransform.getWorldRotation().multiplyVec3(vec3.right())
  }

  setPose(pos: vec3, yawDeg: number, pitchDeg: number = 0): void {
    this.cameraTransform.setWorldPosition(pos)
    const yawQ = quat.angleAxis(yawDeg * DEG, vec3.up())
    const pitchQ = quat.angleAxis(pitchDeg * DEG, vec3.right()) // +pitch = look up
    this.cameraTransform.setWorldRotation(yawQ.multiply(pitchQ))
  }

  /** Smoothly turn the head (yaw + pitch) to look at a world point, staying in place. */
  async lookAt(world: vec3, durationMs: number): Promise<void> {
    const pos = this.position
    const d = world.sub(pos)
    const yaw1 = yawToward(pos, world)
    const pitch1 = Math.atan2(d.y, Math.sqrt(d.x * d.x + d.z * d.z)) / DEG
    const y0 = this.yawDeg
    const f = this.cameraTransform.getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
    const pitch0 = Math.asin(Math.max(-1, Math.min(1, f.y))) / DEG
    let dy = yaw1 - y0
    while (dy > 180) dy -= 360
    while (dy < -180) dy += 360
    const start = getTime()
    while (true) {
      const t = Math.min(1, ((getTime() - start) * 1000) / durationMs)
      this.setPose(pos, y0 + dy * t, pitch0 + (pitch1 - pitch0) * t)
      await nextFrame()
      if (t >= 1) break
    }
  }

  /** Teleport, then hold the pose for a few frames and verify it stuck. */
  async placeAt(pos: vec3, yawDeg: number): Promise<void> {
    for (let i = 0; i < 4; i++) {
      this.setPose(pos, yawDeg)
      await nextFrame()
    }
    const p = this.position
    expect(p.distance(pos) < 1, "camera pose did not stick at " + pos.toString() + " (now " + p.toString() + ")").toBe(true)
  }

  /** Walk (position lerp) and turn (yaw lerp) over durationMs, one step per frame. */
  async walkTo(pos: vec3, yawDeg: number, durationMs: number, onFrame?: () => void): Promise<void> {
    const p0 = this.position
    const y0 = this.yawDeg
    let dy = yawDeg - y0
    while (dy > 180) dy -= 360
    while (dy < -180) dy += 360
    const start = getTime()
    while (true) {
      const t = Math.min(1, ((getTime() - start) * 1000) / durationMs)
      this.setPose(vec3.lerp(p0, pos, t), y0 + dy * t)
      await nextFrame()
      if (onFrame) onFrame()
      if (t >= 1) break
    }
  }

  /** Screen-space position of a world point (0..1), and whether it is in front of the camera. */
  project(world: vec3): {sp: vec2; inFront: boolean} {
    const local = this.cameraTransform.getWorldRotation().invert().multiplyVec3(world.sub(this.position))
    return {sp: this.camera.worldSpaceToScreenSpace(world), inFront: local.z < 0}
  }

  /** World point expressed in camera space (-Z forward, +X right). */
  toCameraSpace(world: vec3): vec3 {
    return this.cameraTransform.getWorldRotation().invert().multiplyVec3(world.sub(this.position))
  }
}

/** Standing spots ~100 cm in front of each tree (eye level), with the facing yaw. */
export const STAND = [
  {pos: new vec3(0, EYE_Y, -150), yaw: 0}, // Tree1 at (0,-160,-250): facing -Z
  {pos: new vec3(300, EYE_Y, -150), yaw: 0}, // Tree2 at (300,-160,-250): facing -Z
  {pos: new vec3(300, EYE_Y, -50), yaw: 180}, // Tree3 at (300,-160,50): facing +Z
]

/** Walk to tree i, wait for its glow, really pinch its trunk, and confirm the guide appeared. */
export async function walkUpAndPinchTrunk(rig: TapLineCameraRig, main: TapLineMain, i: number): Promise<void> {
  await rig.walkTo(STAND[i].pos, STAND[i].yaw, 1500)
  const glowing = await waitUntil(() => main.getTreeState(i) === "glowing", 1500)
  expect(glowing, "tree " + (i + 1) + " should be glowing after walking up (dist " + main.distanceToTree(i).toFixed(1) + " cm, state " + main.getTreeState(i) + ")").toBe(true)
  const tree = main.getTree(i)
  await realPinch(findTrunkInteractable(tree), "Tree" + (i + 1) + "/Trunk/TrunkHitArea", () => main.getTreeState(i) !== "glowing")
  expect(main.getTreeState(i), "tree " + (i + 1) + " state after trunk pinch").toBe("guiding")
  expect(main.lastPinchedTrunkIndex).toBe(i)
}

/** Really pinch tree i's end mark. */
export async function pinchEndMark(main: TapLineMain, i: number): Promise<void> {
  const tree = main.getTree(i)
  await realPinch(findEndMarkInteractable(tree), "Tree" + (i + 1) + "/CutGuide/EndMark", () => main.getTreeState(i) !== "guiding")
  expect(main.getTreeState(i), "tree " + (i + 1) + " state after end-mark pinch").toBe("done")
  expect(main.lastPinchedEndMarkIndex).toBe(i)
}
