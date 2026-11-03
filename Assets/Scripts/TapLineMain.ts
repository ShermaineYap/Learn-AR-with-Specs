// TapLineMain — the central manager for TapLine (stand-in rubber-tapping row of 3 trees).
// Owns: the single source of truth for flow state — current tree index, per-tree state
//       (idle / glowing / guiding / done), last "tok" tree, arrow target — plus proximity checks
//       and the order rules (trees done 1 → 2 → 3; a finished tree never glows or starts again).
// Expects (@input): tree1..tree3 (TapLineTree), arrow (TapLineArrowController), doneMessage
//       (TapLineDoneMessageUI). Audio tracks for the guide cue and the done chime.
// Must NOT: build visuals or author UI text — trees and UI modules render; this script decides.
//
// Readable public state (for LEAF tests): currentTreeIndex, treeStates, getTreeState(i),
// isTipNoteVisible, isArrowVisible, isDoneMessageVisible, lastTokTreeIndex, tokCount,
// distanceToTree(i), isWithinRange(i), isComplete. Test helpers pinchTrunk(i) / pinchEndMark(i)
// run exactly the same gated logic as a real pinch.

import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {TapLineTree} from "./TapLineTree"
import {TapLineArrowController} from "./TapLineArrowController"
import {TapLineDoneMessageUI} from "./TapLineDoneMessageUI"

export type TreeState = "idle" | "glowing" | "guiding" | "done"

@component
export class TapLineMain extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">TapLineMain – tapping row manager</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("Tree 1 (straight ahead of the start).")
  tree1!: TapLineTree

  @input
  @hint("Tree 2 (about 3 m to the right of Tree 1).")
  tree2!: TapLineTree

  @input
  @hint("Tree 3 (about 3 m from Tree 2, behind the user while at Tree 2).")
  tree3!: TapLineTree

  @input
  @hint("Edge-of-view arrow controller.")
  arrow!: TapLineArrowController

  @input
  @hint("'3 of 3 trees done' message.")
  doneMessage!: TapLineDoneMessageUI

  @input
  @hint("Soft cue played when a cut guide appears.")
  guideOnTrack!: AudioTrackAsset

  @input
  @hint("Chime played when the last tree is finished.")
  doneChimeTrack!: AudioTrackAsset
  @ui.group_end

  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Walk within this distance (cm, measured on the floor) of an untapped tree to make it glow.")
  @widget(new SliderWidget(50, 300, 5))
  proximityCm: number = 150

  @input
  @hint("Seconds the tip note stays before fading on its own.")
  @widget(new SliderWidget(1, 10, 0.5))
  tipHoldSeconds: number = 4

  @input
  @hint("Seconds the tip note takes to fade out.")
  @widget(new SliderWidget(0.1, 3, 0.1))
  tipFadeSeconds: number = 0.6

  @input
  @hint("Only the next tree in order (1 → 2 → 3) can glow and start. Off = any untapped tree glows.")
  glowOnlyNextTree: boolean = true

  @input
  @hint("'3 of 3 trees done' height above the floor (cm). Slightly below eye level.")
  @widget(new SliderWidget(80, 200, 5))
  doneMessageHeightCm: number = 130

  @input
  @hint("'3 of 3 trees done' distance from the user (cm), on the line to the last tree.")
  @widget(new SliderWidget(40, 200, 5))
  doneMessageDistanceCm: number = 100

  @input
  @hint("Volume of the guide cue and done chime (0–1).")
  @widget(new SliderWidget(0, 1, 0.05))
  cueVolume: number = 0.6
  @ui.group_end

  @ui.separator
  @ui.group_start("Debug")
  @input
  @hint("Print state changes to the log.")
  debugLogs: boolean = true
  @ui.group_end

  private trees: TapLineTree[] = []
  private states: TreeState[] = []
  private _currentTreeIndex = 0
  private _lastTokTreeIndex = -1
  private _tokCount = 0
  private _arrowTargetIndex = -1
  private _lastPinchedTrunk = -1
  private _lastPinchedEndMark = -1
  private camera: Camera | null = null
  private cueAudio: AudioComponent | null = null
  private ready = false

  // ── readable public state ───────────────────────────────────────────────────

  /** 0-based index of the tree to tap next; equals the tree count (3) once all are done. */
  get currentTreeIndex(): number {
    return this._currentTreeIndex
  }

  /** 1-based number of the tree to tap next (4 when complete). */
  get currentTreeNumber(): number {
    return this._currentTreeIndex + 1
  }

  get treeCount(): number {
    return this.trees.length
  }

  get treeStates(): TreeState[] {
    return this.states.slice()
  }

  getTreeState(i: number): TreeState {
    return this.states[i]
  }

  getTree(i: number): TapLineTree {
    return this.trees[i]
  }

  get isComplete(): boolean {
    return this.trees.length > 0 && this._currentTreeIndex >= this.trees.length
  }

  /** True while any tree's tip note is visible. */
  get isTipNoteVisible(): boolean {
    return this.trees.some((t) => t.tipNote && t.tipNote.isVisible)
  }

  isTipNoteVisibleOn(i: number): boolean {
    const t = this.trees[i]
    return !!(t && t.tipNote && t.tipNote.isVisible)
  }

  isGuideVisibleOn(i: number): boolean {
    const t = this.trees[i]
    return !!(t && t.isGuideVisible)
  }

  isGlowOn(i: number): boolean {
    const t = this.trees[i]
    return !!(t && t.isGlowOn)
  }

  get isArrowVisible(): boolean {
    return this.arrow ? this.arrow.isArrowVisible : false
  }

  /** Index of the tree the arrow points to (-1 = none). */
  get arrowTargetTreeIndex(): number {
    return this._arrowTargetIndex
  }

  get isDoneMessageVisible(): boolean {
    return this.doneMessage ? this.doneMessage.isVisible : false
  }

  /** Index of the tree the last "tok" played from (-1 = none yet). */
  get lastTokTreeIndex(): number {
    return this._lastTokTreeIndex
  }

  get tokCount(): number {
    return this._tokCount
  }

  get lastPinchedTrunkIndex(): number {
    return this._lastPinchedTrunk
  }

  get lastPinchedEndMarkIndex(): number {
    return this._lastPinchedEndMark
  }

  /** Floor (XZ) distance from the user's head to tree i's trunk, in cm. */
  distanceToTree(i: number): number {
    if (!this.camera || !this.trees[i]) return Number.POSITIVE_INFINITY
    const c = this.camera.getTransform().getWorldPosition()
    const p = this.trees[i].getTransform().getWorldPosition()
    const dx = c.x - p.x
    const dz = c.z - p.z
    return Math.sqrt(dx * dx + dz * dz)
  }

  isWithinRange(i: number): boolean {
    return this.distanceToTree(i) <= this.proximityCm
  }

  // ── lifecycle ───────────────────────────────────────────────────────────────

  onAwake(): void {
    if (!this.tree1 || !this.tree2 || !this.tree3 || !this.arrow || !this.doneMessage) {
      print("TapLineMain: required @input not wired (tree1..3, arrow, doneMessage) — check the scene wiring.")
      return
    }
    this.trees = [this.tree1, this.tree2, this.tree3]
    this.states = this.trees.map(() => "idle" as TreeState)

    this.cueAudio = this.getSceneObject().createComponent("Component.AudioComponent") as AudioComponent
    this.cueAudio.playbackMode = Audio.PlaybackMode.LowLatency
    this.cueAudio.volume = this.cueVolume

    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.tick())
  }

  private onStart(): void {
    this.camera = WorldCameraFinderProvider.getInstance().getComponent()
    this.ensureAudioListener()
    this.ready = true
    this.log("ready — tap tree 1 first (eyes at " + this.camera.getTransform().getWorldPosition().toString() + ")")
  }

  // Trees finish initialising in their own OnStart, so subscribe once each tree's events exist.
  private wired: boolean[] = []
  private wireTreeEvents(): void {
    for (let i = 0; i < this.trees.length; i++) {
      if (this.wired[i]) continue
      const t = this.trees[i]
      if (!t || !t.onTrunkPinched || !t.onEndMarkPinched) continue
      t.onTrunkPinched.add(() => this.pinchTrunk(i))
      t.onEndMarkPinched.add(() => this.pinchEndMark(i))
      this.wired[i] = true
    }
  }

  private ensureAudioListener(): void {
    if (!this.camera) return
    const camSO = this.camera.getSceneObject()
    if (!camSO.getComponent("Component.AudioListenerComponent")) {
      camSO.createComponent("Component.AudioListenerComponent")
    }
  }

  private tick(): void {
    if (!this.ready) return
    this.wireTreeEvents()
    for (let i = 0; i < this.trees.length; i++) {
      const s = this.states[i]
      if (s !== "idle" && s !== "glowing") continue
      const eligible = !this.glowOnlyNextTree || i === this._currentTreeIndex
      const shouldGlow = eligible && this.isWithinRange(i)
      if (shouldGlow && s === "idle") this.setState(i, "glowing")
      else if (!shouldGlow && s === "glowing") this.setState(i, "idle")
    }
  }

  // ── actions (called by SIK pinches, and directly by tests) ─────────────────

  /** Pinch on tree i's trunk. Starts the guide only if that trunk is glowing (near + next in order). */
  pinchTrunk(i: number): boolean {
    if (this.states[i] !== "glowing") {
      this.log("trunk " + (i + 1) + " pinched but ignored (state " + this.states[i] + ")")
      return false
    }
    this._lastPinchedTrunk = i
    this.setState(i, "guiding")
    if (this._arrowTargetIndex === i) this.clearArrow()
    return true
  }

  /** Pinch on tree i's end mark. Finishes the tree, fades the guide and plays the tok from the next tree. */
  pinchEndMark(i: number): boolean {
    if (this.states[i] !== "guiding") {
      this.log("end mark " + (i + 1) + " pinched but ignored (state " + this.states[i] + ")")
      return false
    }
    this._lastPinchedEndMark = i
    this.setState(i, "done")
    this._currentTreeIndex = Math.max(this._currentTreeIndex, i + 1)

    const next = i + 1
    if (next < this.trees.length) {
      this.trees[next].playTok()
      this._lastTokTreeIndex = next
      this._tokCount++
      this._arrowTargetIndex = next
      this.arrow.setTarget(this.trees[next].focusWorld)
      this.log("tok from tree " + (next + 1))
    } else {
      this.clearArrow()
      this.placeDoneMessage(this.trees[i])
      this.doneMessage.show()
      this.playCue(this.doneChimeTrack)
      this.log("all trees done")
    }
    return true
  }

  // ── state transitions (the only place visuals are told what to do) ─────────

  private setState(i: number, s: TreeState): void {
    const prev = this.states[i]
    this.states[i] = s
    const t = this.trees[i]
    switch (s) {
      case "idle":
        t.setGlow(false)
        t.setTrunkInteractable(false)
        break
      case "glowing":
        t.setGlow(true)
        t.setTrunkInteractable(true)
        break
      case "guiding":
        t.setGlow(false)
        t.setTrunkInteractable(false)
        t.showGuide()
        t.setEndMarkInteractable(true)
        if (t.tipNote) t.tipNote.show(this.tipHoldSeconds, this.tipFadeSeconds)
        this.playCue(this.guideOnTrack)
        break
      case "done":
        t.setGlow(false)
        t.setTrunkInteractable(false)
        t.fadeGuide()
        if (t.tipNote) t.tipNote.hide()
        break
    }
    this.log("tree " + (i + 1) + ": " + prev + " → " + s)
  }

  /**
   * Puts the done message in front of the user, toward the end mark they just pinched (so it is centred
   * where they are looking): doneMessageDistanceCm from the user, doneMessageHeightCm above the floor,
   * turned (yaw only) to face the user — so it is in view right after the last end-mark pinch.
   */
  private placeDoneMessage(tree: TapLineTree): void {
    const msgT = this.doneMessage.getSceneObject().getTransform()
    const treeBase = tree.getSceneObject().getTransform().getWorldPosition() // trunk axis at the floor
    const aim = tree.guideEndWorld // the end mark just pinched
    const cam = this.camera ? this.camera.getTransform().getWorldPosition() : treeBase.add(new vec3(0, 160, -100))
    const dx = aim.x - cam.x
    const dz = aim.z - cam.z
    const flat = Math.sqrt(dx * dx + dz * dz)
    const dirX = flat > 0.001 ? dx / flat : 0
    const dirZ = flat > 0.001 ? dz / flat : -1
    // Always doneMessageDistanceCm from the user. It draws without depth test, so the stand-in trunk never
    // hides it (on the glasses a real trunk can't occlude virtual content either).
    const dist = this.doneMessageDistanceCm
    msgT.setWorldPosition(new vec3(cam.x + dirX * dist, treeBase.y + this.doneMessageHeightCm, cam.z + dirZ * dist))
    // Canvas content faces local +Z: yaw it so +Z points back at the user.
    const yaw = Math.atan2(-dirX, -dirZ)
    msgT.setWorldRotation(quat.angleAxis(yaw, vec3.up()))
    this.log("done message placed " + dist.toFixed(0) + " cm from user, " + this.doneMessageHeightCm + " cm high")
  }

  private clearArrow(): void {
    this._arrowTargetIndex = -1
    this.arrow.clearTarget()
  }

  private playCue(track: AudioTrackAsset): void {
    if (!this.cueAudio || !track) return
    try {
      if (this.cueAudio.isPlaying()) this.cueAudio.stop(false)
      this.cueAudio.audioTrack = track
      this.cueAudio.volume = this.cueVolume
      this.cueAudio.play(1)
    } catch (e) {
      // Audio can be unavailable (e.g. preview audio off); never let a sound block the flow.
      this.log("cue audio unavailable: " + e)
    }
  }

  private log(msg: string): void {
    if (this.debugLogs) print("[TapLine] " + msg)
  }
}
