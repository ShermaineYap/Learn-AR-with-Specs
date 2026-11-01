// TapLineArrowController — keeps the direction arrow at the edge of the user's view, pointing at a target.
// Owns: per-frame placement of its own SceneObject relative to the camera, the "is the target in view"
//       test, and telling the arrow UI to show/hide/rotate.
// Expects (@input): arrowUI (TapLineDirectionArrowUI on this same object).
// Must NOT: choose the target — TapLineMain calls setTarget()/clearTarget().

import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {TapLineDirectionArrowUI} from "./TapLineDirectionArrowUI"

@component
export class TapLineArrowController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">TapLineArrowController – edge-of-view arrow placement</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("Arrow UI on this object.")
  arrowUI!: TapLineDirectionArrowUI
  @ui.group_end

  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Distance in front of the eyes where the arrow is drawn (cm).")
  @widget(new SliderWidget(40, 150, 1))
  distanceCm: number = 80

  @input
  @hint("How far from the centre of view the arrow sits (cm, at that distance). Larger = closer to the edge.")
  @widget(new SliderWidget(4, 30, 0.5))
  edgeOffsetCm: number = 15

  @input
  @hint("Screen margin (0–0.5) — the target counts as 'in view' only when inside this margin.")
  @widget(new SliderWidget(0, 0.3, 0.01))
  inViewMargin: number = 0.08
  @ui.group_end

  private target: vec3 | null = null
  private _targetInView = false
  private camera: Camera | null = null

  /** True while a target is set and it is currently outside the view. */
  get isArrowVisible(): boolean {
    return this.arrowUI ? this.arrowUI.isVisible : false
  }

  get hasTarget(): boolean {
    return this.target !== null
  }

  get targetInView(): boolean {
    return this._targetInView
  }

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      this.camera = WorldCameraFinderProvider.getInstance().getComponent()
    })
    this.createEvent("LateUpdateEvent").bind(() => this.tick())
  }

  setTarget(worldPos: vec3): void {
    this.target = worldPos
    this.tick()
  }

  clearTarget(): void {
    this.target = null
    this._targetInView = false
    if (this.arrowUI) this.arrowUI.setVisible(false)
  }

  private tick(): void {
    if (!this.camera || !this.arrowUI) return
    if (!this.target) {
      if (this.arrowUI.isVisible) this.arrowUI.setVisible(false)
      return
    }
    const camT = this.camera.getTransform()
    const camPos = camT.getWorldPosition()
    const camRot = camT.getWorldRotation()
    const local = camRot.invert().multiplyVec3(this.target.sub(camPos)) // camera space: -Z forward

    let inView = false
    if (local.z < 0) {
      const sp = this.camera.worldSpaceToScreenSpace(this.target)
      const m = this.inViewMargin
      inView = sp.x >= m && sp.x <= 1 - m && sp.y >= m && sp.y <= 1 - m
    }
    this._targetInView = inView

    if (inView) {
      if (this.arrowUI.isVisible) this.arrowUI.setVisible(false)
      return
    }

    // Direction in the view plane toward the target. Behind the user: point to the nearer side.
    let dx = local.x
    let dy = local.y
    if (local.z >= 0) {
      dx = Math.abs(dx) < 1 ? 1 : dx
      dy = 0
    }
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    dx /= len
    dy /= len
    // Keep it near the horizontal edge: squash the vertical component so it stays comfortably in view.
    const placeLocal = new vec3(dx * this.edgeOffsetCm, dy * this.edgeOffsetCm * 0.6, -this.distanceCm)
    const so = this.getSceneObject().getTransform()
    so.setWorldPosition(camPos.add(camRot.multiplyVec3(placeLocal)))
    so.setWorldRotation(camRot)
    this.arrowUI.setPointAngleDeg((Math.atan2(dy, dx) * 180) / Math.PI)
    if (!this.arrowUI.isVisible) this.arrowUI.setVisible(true)
  }
}
