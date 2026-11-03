// TapLineDirectionArrowUI — the small arrow drawn at the edge of the user's view.
// Owns: rendering one bright warm-yellow arrow icon (same colour as the cut line), its gentle pulse,
//       and rotating it within its own plane.
// Expects: a parent controller (TapLineArrowController) that places this object near the edge of the
//          view each frame and calls setVisible()/setPointAngleDeg().
// Must NOT: compute where the next tree is or decide when to show — passive view only.

import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {FlexAlign, FlexDirection, FlexJustify} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"

const ICON_ARROW: Texture = requireAsset("../Icons/arrow_forward.png") as Texture
const IMAGE_MATERIAL: Material = requireAsset("../Materials/ImageMaterial.mat") as Material

@component
export class TapLineDirectionArrowUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">TapLineDirectionArrowUI – edge-of-view arrow</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Icon image size in cm. The arrow glyph fills ~65% of the image, so 12 cm draws an ~8 cm arrow.")
  @widget(new SliderWidget(1, 20, 0.5))
  iconSizeCm: number = 12

  @input("vec4", "{1.0, 0.9, 0.55, 1.0}")
  @hint("Arrow colour: bright warm yellow, matching the cut line. Shows well on the additive display.")
  @widget(new ColorWidget())
  arrowColor: vec4 = new vec4(1.0, 0.9, 0.55, 1.0)

  @input
  @hint("Pulse rate in cycles per second. Gentle = slow.")
  @widget(new SliderWidget(0.2, 3, 0.1))
  pulseHz: number = 0.9

  @input
  @hint("Pulse depth: how much the arrow grows (scale) and dims at the low point (0 = no pulse).")
  @widget(new SliderWidget(0, 0.5, 0.01))
  pulseAmount: number = 0.12
  @ui.group_end

  private iconSO!: SceneObject
  private mat!: Material
  private _visible = false
  private pulseT = 0

  /** Glyph fraction of the icon image (arrow_forward.png: 333 of 512 px). */
  static readonly GLYPH_FRACTION = 333 / 512

  /** Visible arrow length in cm (without pulse). */
  get arrowLengthCm(): number {
    return this.iconSizeCm * TapLineDirectionArrowUI.GLYPH_FRACTION
  }

  /** Current pulse scale factor (1 = rest). */
  get pulseScale(): number {
    return this._pulseScale
  }

  private _pulseScale = 1

  get isVisible(): boolean {
    return this._visible
  }

  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas")

    const content = global.scene.createSceneObject("ArrowContent")
    content.setParent(this.sceneObject)
    const flex = content.createComponent(FlexLayout.getTypeName()) as FlexLayout
    flex.onInitialized.add(() => {
      flex.width = this.iconSizeCm
      flex.height = this.iconSizeCm
      flex.direction = FlexDirection.Row
      flex.justifyContent = FlexJustify.Center
      flex.alignItems = FlexAlign.Center
    })

    // The rotating pivot is its own child so FlexLayout (which writes X/Y) never fights the rotation.
    const pivot = global.scene.createSceneObject("ArrowPivot")
    pivot.setParent(content)
    const pivotItem = pivot.createComponent(FlexItem.getTypeName()) as FlexItem
    pivotItem.overrideWidth = this.iconSizeCm
    pivotItem.overrideHeight = this.iconSizeCm
    // FlexLayout auto-discovers these FlexItem children on start (autoDiscoverItemsOnStart).

    this.iconSO = global.scene.createSceneObject("ArrowIcon")
    this.iconSO.setParent(pivot)
    const img = this.iconSO.createComponent("Component.Image") as Image
    const mat = IMAGE_MATERIAL.clone()
    this.mat = mat
    mat.mainPass.baseTex = ICON_ARROW
    mat.mainPass.baseColor = this.arrowColor
    mat.mainPass.depthTest = true
    mat.mainPass.depthWrite = false
    img.clearMaterials()
    img.addMaterial(mat)
    this.iconSO.getTransform().setLocalScale(new vec3(this.iconSizeCm, this.iconSizeCm, 1))

    this.setVisible(false)
    this.createEvent("UpdateEvent").bind(() => this.tickPulse(getDeltaTime()))
  }

  setVisible(v: boolean): void {
    if (v && !this._visible) this.pulseT = 0 // each appearance starts at full size and brightness
    this._visible = v
    if (this.iconSO) this.iconSO.enabled = v
    if (v) this.applyPulse()
  }

  /** Gentle pulse: smooth sine in size (1 .. 1+amount) and brightness (1-amount .. 1). */
  private tickPulse(dt: number): void {
    if (!this._visible) return
    this.pulseT += dt
    this.applyPulse()
  }

  private applyPulse(): void {
    if (!this.iconSO) return
    const k = 0.5 + 0.5 * Math.cos(2 * Math.PI * this.pulseHz * this.pulseT) // 1 at start
    this._pulseScale = 1 + this.pulseAmount * k
    const s = this.iconSizeCm * this._pulseScale
    this.iconSO.getTransform().setLocalScale(new vec3(s, s, 1))
    const b = 1 - this.pulseAmount * (1 - k)
    const c = this.arrowColor
    this.mat.mainPass.baseColor = new vec4(c.x, c.y, c.z, c.w * b)
  }

  /** 0° points right (+X of this object), 90° points up. */
  setPointAngleDeg(deg: number): void {
    if (!this.iconSO) return
    this.iconSO.getTransform().setLocalRotation(quat.fromEulerAngles(0, 0, deg * MathUtils.DegToRad))
  }
}
