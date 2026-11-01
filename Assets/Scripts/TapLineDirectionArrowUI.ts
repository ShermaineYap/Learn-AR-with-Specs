// TapLineDirectionArrowUI — the small arrow drawn at the edge of the user's view.
// Owns: rendering one warm-coloured arrow icon and rotating it within its own plane.
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
  @hint("Arrow icon size in cm (at the distance the controller places it).")
  @widget(new SliderWidget(1, 10, 0.1))
  iconSizeCm: number = 4

  @input("vec4", "{1.0, 0.85, 0.45, 1.0}")
  @hint("Arrow colour. Warm and bright so it shows on the additive display.")
  @widget(new ColorWidget())
  arrowColor: vec4 = new vec4(1.0, 0.85, 0.45, 1.0)
  @ui.group_end

  private iconSO!: SceneObject
  private _visible = false

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
    mat.mainPass.baseTex = ICON_ARROW
    mat.mainPass.baseColor = this.arrowColor
    mat.mainPass.depthTest = true
    mat.mainPass.depthWrite = false
    img.clearMaterials()
    img.addMaterial(mat)
    this.iconSO.getTransform().setLocalScale(new vec3(this.iconSizeCm, this.iconSizeCm, 1))

    this.setVisible(false)
  }

  setVisible(v: boolean): void {
    this._visible = v
    if (this.iconSO) this.iconSO.enabled = v
  }

  /** 0° points right (+X of this object), 90° points up. */
  setPointAngleDeg(deg: number): void {
    if (!this.iconSO) return
    this.iconSO.getTransform().setLocalRotation(quat.fromEulerAngles(0, 0, deg * MathUtils.DegToRad))
  }
}
