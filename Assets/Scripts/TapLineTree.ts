// TapLineTree — one stand-in rubber tree: its glow, cut guide (line + start mark + end mark), tip note
// and spatial "tok" source.
// Owns: building the guide/glow visuals on the trunk surface, their fades, the trunk + end-mark SIK
//       Interactables (collider + Interactable, so mouse click works in Interactive Preview and LEAF), and
//       playing its own tok.
// Expects (@input): trunk (TapLineTrunk), glow / cutGuide / guideLine / startMark / endMark SceneObjects,
//       tipNote (TapLineTipNoteUI), tokAudio (AudioComponent on the TokSource child).
// Must NOT: decide tapping order or state — TapLineMain owns the per-tree state and calls the public
//       methods here; this script only reports pinches through its events.

import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {TapLineTrunk} from "./TapLineTrunk"
import {TapLineTipNoteUI} from "./TapLineTipNoteUI"
import {buildCutRibbon, buildGlowShell, buildSphere} from "./TapLineGeometry"

const UNLIT: Material = requireAsset("../Materials/TapLineUnlit.mat") as Material
const DEG = Math.PI / 180
// Guide spans the user-facing half of the trunk: 180° = far left edge, 0° = far right edge.
const GUIDE_START_ANGLE_DEG = 165
const GUIDE_END_ANGLE_DEG = 15
const START_MARK_CM = 2 // brief: ~2 cm start mark

@component
export class TapLineTree extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">TapLineTree – one stand-in rubber tree</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("The trunk mesh component (surface math is used to lay the guide on the bark).")
  trunk!: TapLineTrunk

  @input
  @hint("Glow shell SceneObject (faint proximity glow).")
  glow!: SceneObject

  @input
  @hint("Cut guide root (line + start mark + end mark). Shown on trunk pinch, faded on end-mark pinch.")
  cutGuide!: SceneObject

  @input
  @hint("Guide line SceneObject (child of CutGuide).")
  guideLine!: SceneObject

  @input
  @hint("Start mark SceneObject (child of CutGuide).")
  startMark!: SceneObject

  @input
  @hint("End mark SceneObject (child of CutGuide). Pinch it to say 'done'.")
  endMark!: SceneObject

  @input
  @hint("Tip note UI on this trunk.")
  tipNote!: TapLineTipNoteUI

  @input
  @hint("Spatial audio source for the 'tok' that calls the user to this tree.")
  tokAudio!: AudioComponent
  @ui.group_end

  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Tip text shown with the guide on this tree.")
  tipText: string = "Thin shave — stay under 1 mm"

  @input
  @hint("Height (cm above the floor) where the cut guide starts, on the left.")
  @widget(new SliderWidget(80, 160, 1))
  guideStartHeightCm: number = 120

  @input
  @hint("Cut guide line thickness in cm.")
  @widget(new SliderWidget(0.3, 3, 0.1))
  guideThicknessCm: number = 1.0

  @input("vec4", "{1.0, 0.9, 0.55, 1.0}")
  @hint("Cut guide colour — bright warm white/yellow for the additive display.")
  @widget(new ColorWidget())
  guideColor: vec4 = new vec4(1.0, 0.9, 0.55, 1.0)

  @input
  @hint("End mark diameter in cm (easy to pinch).")
  @widget(new SliderWidget(3, 10, 0.1))
  endMarkCm: number = 5

  @input("vec4", "{1.0, 0.8, 0.45, 0.22}")
  @hint("Trunk glow colour; alpha is the faint resting glow strength.")
  @widget(new ColorWidget())
  glowColor: vec4 = new vec4(1.0, 0.8, 0.45, 0.22)

  @input
  @hint("Seconds for the guide to fade away after the end mark is pinched.")
  @widget(new SliderWidget(0.1, 3, 0.1))
  guideFadeSeconds: number = 0.8
  @ui.group_end

  @ui.separator
  @ui.group_start("Debug")
  @input
  @hint("Draw the trunk and end-mark colliders as wireframes (hit-zone check). Takes effect on preview restart.")
  debugColliders: boolean = false
  @ui.group_end

  private _tokPlayCount = 0
  private _onTrunkPinched = new Event<void>()
  private _onEndMarkPinched = new Event<void>()

  private trunkInteractable!: Interactable
  private trunkCollider!: ColliderComponent
  private endCollider!: ColliderComponent
  private endInteractable!: Interactable
  private endVisual!: SceneObject

  private glowMat!: Material
  private guideMats: Material[] = []
  private guideBaseAlpha: number[] = []
  private endMat!: Material

  private built = false
  private wantTrunkInteractable = false
  private wantEndInteractable = false
  private glowOn = false
  private trunkHovered = false
  private endHovered = false
  private glowAlpha = 0
  private guideAlpha = 0
  private guideTarget = 0

  private guideStartLocal = vec3.zero()
  private guideEndLocal = vec3.zero()

  get onTrunkPinched(): PublicApi<void> {
    return this._onTrunkPinched.publicApi()
  }

  get onEndMarkPinched(): PublicApi<void> {
    return this._onEndMarkPinched.publicApi()
  }

  /** True while the glow is (or is becoming) visible. */
  get isGlowOn(): boolean {
    return this.glowOn
  }

  get glowOpacity(): number {
    return this.glowAlpha
  }

  /** True while any part of the guide is visible. */
  get isGuideVisible(): boolean {
    return this.built && this.cutGuide.enabled && this.guideAlpha > 0.01
  }

  get guideOpacity(): number {
    return this.guideAlpha
  }

  /** How many times this tree's tok has been triggered. */
  get tokPlayCount(): number {
    return this._tokPlayCount
  }

  get isTokPlaying(): boolean {
    return !!this.tokAudio && this.tokAudio.isPlaying()
  }

  get isTrunkHovered(): boolean {
    return this.trunkHovered
  }

  get isEndMarkHovered(): boolean {
    return this.endHovered
  }

  /** Guide start (top-left) in world space. */
  get guideStartWorld(): vec3 {
    return this.getTransform().getWorldTransform().multiplyPoint(this.guideStartLocal)
  }

  /** Guide end (bottom-right) in world space. */
  get guideEndWorld(): vec3 {
    return this.getTransform().getWorldTransform().multiplyPoint(this.guideEndLocal)
  }

  /** Guide start height above the tree base, in cm. */
  get guideStartHeight(): number {
    return this.guideStartLocal.y
  }

  get guideEndHeight(): number {
    return this.guideEndLocal.y
  }

  /** Slope of the guide from horizontal, measured along the bark (deg). */
  get guideSlopeDeg(): number {
    return this.trunk.slopeDeg
  }

  /** World position used for the tok and for "is this tree in view" (trunk axis at guide height). */
  get focusWorld(): vec3 {
    return this.getTransform()
      .getWorldTransform()
      .multiplyPoint(new vec3(0, this.guideStartHeightCm, 0))
  }

  get trunkInteractableEnabled(): boolean {
    return this.trunkInteractable ? this.trunkInteractable.enabled : false
  }

  get endMarkInteractableEnabled(): boolean {
    return this.endInteractable ? this.endInteractable.enabled : false
  }

  onAwake(): void {
    if (!this.trunk || !this.glow || !this.cutGuide || !this.guideLine || !this.startMark || !this.endMark) {
      print("TapLineTree(" + this.sceneObject.name + "): required @input not wired — check the scene wiring.")
      return
    }
    // Build in OnStart: sibling scripts (TapLineTrunk) are only callable once every onAwake has run.
    this.createEvent("OnStartEvent").bind(() => {
      this.trunk.ensureBuilt()
      this.buildGlow()
      this.buildGuide()
      this.buildTrunkTarget()
      this.buildEndTarget()
      this.setupAudio()

      this.applyGlow(0)
      this.applyGuide(0)
      this.cutGuide.enabled = false

      this.trunkInteractable.onTriggerStart.add(() => this._onTrunkPinched.invoke())
      this.trunkInteractable.onHoverEnter.add(() => (this.trunkHovered = true))
      this.trunkInteractable.onHoverExit.add(() => (this.trunkHovered = false))
      this.endInteractable.onTriggerStart.add(() => this._onEndMarkPinched.invoke())
      this.endInteractable.onHoverEnter.add(() => (this.endHovered = true))
      this.endInteractable.onHoverExit.add(() => (this.endHovered = false))
      this.built = true
      // Apply any state TapLineMain pushed before this tree finished building.
      this.setTrunkInteractable(this.wantTrunkInteractable)
      this.setEndMarkInteractable(this.wantEndInteractable)
    })
    this.createEvent("UpdateEvent").bind(() => this.tick(getDeltaTime()))
  }

  // ── public API used by TapLineMain ─────────────────────────────────────────

  setGlow(on: boolean): void {
    this.glowOn = on
  }

  setTrunkInteractable(on: boolean): void {
    this.wantTrunkInteractable = on
    if (this.trunkInteractable) this.trunkInteractable.enabled = on
    // Disable the big trunk collider too, so it can't block rays aimed at the end mark.
    if (this.trunkCollider) this.trunkCollider.enabled = on
    if (!on) this.trunkHovered = false
  }

  setEndMarkInteractable(on: boolean): void {
    this.wantEndInteractable = on
    if (this.endInteractable) this.endInteractable.enabled = on
    if (this.endCollider) this.endCollider.enabled = on
    if (!on) this.endHovered = false
  }

  showGuide(): void {
    if (!this.built) return
    this.cutGuide.enabled = true
    this.guideTarget = 1
    this.applyGuide(1)
    if (this.tipNote) {
      this.tipNote.setText(this.tipText)
    }
  }

  fadeGuide(): void {
    this.guideTarget = 0
    this.setEndMarkInteractable(false)
  }

  hideGuideNow(): void {
    this.guideTarget = 0
    this.applyGuide(0)
    this.cutGuide.enabled = false
  }

  playTok(): void {
    if (!this.tokAudio || !this.tokAudio.audioTrack) {
      print("TapLineTree(" + this.sceneObject.name + "): no tok audio wired.")
      return
    }
    this._tokPlayCount++
    try {
      if (this.tokAudio.isPlaying()) this.tokAudio.stop(false)
      this.tokAudio.play(1)
    } catch (e) {
      // Audio can be unavailable (e.g. preview audio off); never let a sound block the flow.
      print("TapLineTree(" + this.sceneObject.name + "): tok audio unavailable: " + e)
    }
  }

  // ── building ────────────────────────────────────────────────────────────────

  private makeMat(color: vec4, depthWrite: boolean): Material {
    const m = UNLIT.clone()
    m.mainPass.blendMode = BlendMode.Normal
    m.mainPass.depthTest = true
    m.mainPass.depthWrite = depthWrite
    m.mainPass.baseColor = color
    return m
  }

  private visualOn(so: SceneObject, mesh: RenderMesh, mat: Material): RenderMeshVisual {
    let rmv = so.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (!rmv) rmv = so.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    rmv.mesh = mesh
    rmv.mainMaterial = mat
    return rmv
  }

  private buildGlow(): void {
    this.glowMat = this.makeMat(this.glowColor, false)
    this.visualOn(this.glow, buildGlowShell(this.trunk, 20, 240, 1.2), this.glowMat)
  }

  private guideHeightAt(theta: number): number {
    const start = GUIDE_START_ANGLE_DEG * DEG
    const offset = this.trunk.cutLineHeight(start) - this.guideStartHeightCm
    return this.trunk.cutLineHeight(theta) - offset
  }

  private buildGuide(): void {
    const t0 = GUIDE_START_ANGLE_DEG * DEG
    const t1 = GUIDE_END_ANGLE_DEG * DEG
    const slope = this.trunk.slopeDeg
    const hAt = (t: number) => this.guideHeightAt(t)

    // Bright core line + a soft halo behind it so it reads as "glowing".
    const coreMat = this.makeMat(this.guideColor, false)
    const g = this.guideColor
    const haloMat = this.makeMat(new vec4(g.x, g.y * 0.9, g.z * 0.7, 0.35), false)
    this.guideMats.push(coreMat, haloMat)
    const halo = global.scene.createSceneObject("GuideHalo")
    halo.setParent(this.guideLine)
    this.visualOn(halo, buildCutRibbon(this.trunk, t0, t1, hAt, slope, this.guideThicknessCm * 3.2, 0.35), haloMat)
    const core = global.scene.createSceneObject("GuideCore")
    core.setParent(this.guideLine)
    this.visualOn(core, buildCutRibbon(this.trunk, t0, t1, hAt, slope, this.guideThicknessCm, 0.6), coreMat)

    // Marks: positioned on the bark at each end of the line.
    this.guideStartLocal = this.trunk.surfacePoint(t0, hAt(t0), 0.6)
    this.guideEndLocal = this.trunk.surfacePoint(t1, hAt(t1), 0.6)

    const startMat = this.makeMat(this.guideColor, false)
    this.guideMats.push(startMat)
    const sr = START_MARK_CM / 2
    this.startMark.getTransform().setLocalPosition(this.trunk.surfacePoint(t0, hAt(t0), sr * 0.6))
    this.visualOn(this.startMark, buildSphere(sr), startMat)

    const er = this.endMarkCm / 2
    // EndMark is the unit-scale collider wrapper; the visual is a child so hover scaling never touches the collider.
    this.endMark.getTransform().setLocalPosition(this.trunk.surfacePoint(t1, hAt(t1), er * 0.7))
    this.endVisual = global.scene.createSceneObject("EndMarkVisual")
    this.endVisual.setParent(this.endMark)
    const ec = this.guideColor
    this.endMat = this.makeMat(new vec4(Math.min(1, ec.x), Math.min(1, ec.y + 0.07), Math.min(1, ec.z + 0.3), ec.w), false)
    this.guideMats.push(this.endMat)
    this.visualOn(this.endVisual, buildSphere(er), this.endMat)
  }

  private buildTrunkTarget(): void {
    // Unit-scale hit wrapper, centred on the trunk axis halfway up (collider shapes are centred on their object).
    const hit = global.scene.createSceneObject("TrunkHitArea")
    hit.setParent(this.trunk.getSceneObject())
    hit.getTransform().setLocalPosition(new vec3(0, this.trunk.trunkHeight / 2, 0))
    const col = hit.createComponent("Physics.ColliderComponent") as ColliderComponent
    const shape = Shape.createCylinderShape()
    shape.axis = Axis.Y
    shape.radius = this.trunk.trunkRadius + 2
    shape.length = this.trunk.trunkHeight
    col.shape = shape
    col.fitVisual = false
    col.enabled = false
    col.debugDrawEnabled = this.debugColliders
    this.trunkCollider = col
    this.trunkInteractable = hit.createComponent(Interactable.getTypeName()) as Interactable
    this.trunkInteractable.enabled = false
  }

  private buildEndTarget(): void {
    const col = this.endMark.createComponent("Physics.ColliderComponent") as ColliderComponent
    const shape = Shape.createSphereShape()
    shape.radius = this.endMarkCm / 2 + 1.5 // a little larger than the visual — easy to pinch
    col.shape = shape
    col.fitVisual = false
    col.enabled = false
    col.debugDrawEnabled = this.debugColliders
    this.endCollider = col
    this.endInteractable = this.endMark.createComponent(Interactable.getTypeName()) as Interactable
    this.endInteractable.enabled = false
  }

  private setupAudio(): void {
    if (!this.tokAudio) return
    this.tokAudio.playbackMode = Audio.PlaybackMode.LowLatency
    const sa = this.tokAudio.spatialAudio
    sa.enabled = true
    sa.positionEffect.enabled = true
    sa.distanceEffect.enabled = true
    sa.distanceEffect.type = Audio.DistanceCurveType.Inverse
    sa.distanceEffect.minDistance = 50
    sa.distanceEffect.maxDistance = 1500
    sa.directivityEffect.enabled = false
  }

  // ── per-frame fades ─────────────────────────────────────────────────────────

  private tick(dt: number): void {
    if (!this.built) return
    const glowTarget = this.glowOn ? (this.trunkHovered ? 1.8 : 1) : 0
    if (Math.abs(this.glowAlpha - glowTarget) > 0.001) {
      const step = dt * 3
      this.applyGlow(
        this.glowAlpha < glowTarget
          ? Math.min(glowTarget, this.glowAlpha + step)
          : Math.max(glowTarget, this.glowAlpha - step),
      )
    }

    if (this.guideTarget === 0 && this.guideAlpha > 0) {
      this.applyGuide(Math.max(0, this.guideAlpha - dt / Math.max(0.05, this.guideFadeSeconds)))
      if (this.guideAlpha <= 0) this.cutGuide.enabled = false
    }

    if (this.endVisual) {
      const s = this.endHovered ? 1.3 : 1
      this.endVisual.getTransform().setLocalScale(new vec3(s, s, s))
    }
  }

  private applyGlow(a: number): void {
    this.glowAlpha = a
    const c = this.glowColor
    this.glowMat.mainPass.baseColor = new vec4(c.x, c.y, c.z, Math.min(1, c.w * a))
    this.glow.enabled = a > 0.001
  }

  private applyGuide(a: number): void {
    this.guideAlpha = a
    for (let i = 0; i < this.guideMats.length; i++) {
      const m = this.guideMats[i]
      if (this.guideBaseAlpha.length <= i) this.guideBaseAlpha.push(m.mainPass.baseColor.w)
      const c = m.mainPass.baseColor
      m.mainPass.baseColor = new vec4(c.x, c.y, c.z, this.guideBaseAlpha[i] * a)
    }
  }
}
