// TapLineDoneMessageUI — the small "3 of 3 trees done" message shown near the last tree.
// Owns: rendering a check icon + one light label in a flex row, and its own show / hold / fade timing.
// Expects: to be placed (authored) near the last tree at about eye level, facing the user.
// Must NOT: decide when the row is finished — TapLineMain calls show(). Passive view only.

import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {FlexAlign, FlexDirection, FlexJustify} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"

const ICON_CHECK: Texture = requireAsset("../Icons/check_circle.png") as Texture
const IMAGE_MATERIAL: Material = requireAsset("../Materials/ImageMaterial.mat") as Material

// Snap Specs type scale (references/patterns.md → Typography); calibrated at 110 cm.
const HEADLINE1 = {size: 54, weight: 700}

@component
export class TapLineDoneMessageUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">TapLineDoneMessageUI – end-of-row message</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Message text.")
  message: string = "3 of 3 trees done"

  @input
  @hint("Viewing distance in cm the text is sized for (scales the Specs type scale).")
  @widget(new SliderWidget(40, 200, 5))
  viewDistanceCm: number = 90

  @input("vec4", "{0.75, 1.0, 0.8, 1.0}")
  @hint("Text and icon colour. Keep it light for the additive display.")
  @widget(new ColorWidget())
  textColor: vec4 = new vec4(0.75, 1.0, 0.8, 1.0)

  @input
  @hint("Seconds the message stays at full opacity before fading.")
  @widget(new SliderWidget(1, 10, 0.5))
  holdSeconds: number = 4

  @input
  @hint("Fade-out duration in seconds.")
  @widget(new SliderWidget(0.2, 3, 0.1))
  fadeSeconds: number = 1.2
  @ui.group_end

  private label!: Text
  private iconMat!: Material
  private iconSO!: SceneObject
  private alpha = 0
  private holdLeft = 0
  private fading = false
  private _shownCount = 0
  private _onFadedOut = new Event<void>()

  get onFadedOut(): PublicApi<void> {
    return this._onFadedOut.publicApi()
  }

  get isVisible(): boolean {
    return this.alpha > 0.01
  }

  /** How many times show() has been called this session (for tests). */
  get shownCount(): number {
    return this._shownCount
  }

  get currentAlpha(): number {
    return this.alpha
  }

  get currentText(): string {
    return this.label ? this.label.text : this.message
  }

  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas")
    const scale = this.viewDistanceCm / 110
    const textSize = HEADLINE1.size * scale
    const iconCm = 2.2 * scale
    const textW = 0.7 * (textSize / 62) * this.message.length + 1 // ~0.7 cm/char at size 62
    const rowH = Math.max(iconCm, 2.0 * scale)

    const content = global.scene.createSceneObject("DoneContent")
    content.setParent(this.sceneObject)
    const flex = content.createComponent(FlexLayout.getTypeName()) as FlexLayout
    flex.onInitialized.add(() => {
      flex.width = iconCm + textW + 1
      flex.height = rowH
      flex.direction = FlexDirection.Row
      flex.justifyContent = FlexJustify.Center
      flex.alignItems = FlexAlign.Center
      flex.columnGap = 0.6 * scale
    })

    this.iconSO = global.scene.createSceneObject("DoneIcon")
    this.iconSO.setParent(content)
    const img = this.iconSO.createComponent("Component.Image") as Image
    this.iconMat = IMAGE_MATERIAL.clone()
    this.iconMat.mainPass.baseTex = ICON_CHECK
    this.iconMat.mainPass.depthTest = true
    this.iconMat.mainPass.depthWrite = false
    img.clearMaterials()
    img.addMaterial(this.iconMat)
    this.iconSO.getTransform().setLocalScale(new vec3(iconCm, iconCm, 1))
    const iconItem = this.iconSO.createComponent(FlexItem.getTypeName()) as FlexItem
    iconItem.overrideWidth = iconCm
    iconItem.overrideHeight = iconCm

    const textSO = global.scene.createSceneObject("DoneText")
    textSO.setParent(content)
    textSO.getTransform().setLocalPosition(new vec3(0, 0, 0.02))
    this.label = textSO.createComponent("Component.Text") as Text
    this.label.text = this.message
    this.label.size = textSize
    ;(this.label as Text & {weight?: number}).weight = HEADLINE1.weight
    this.label.depthTest = true
    this.label.horizontalAlignment = HorizontalAlignment.Center
    this.label.verticalAlignment = VerticalAlignment.Center
    this.label.horizontalOverflow = HorizontalOverflow.Overflow
    this.label.verticalOverflow = VerticalOverflow.Overflow
    this.label.layoutRect = Rect.create(-textW / 2, textW / 2, -rowH / 2, rowH / 2)
    const textItem = textSO.createComponent(FlexItem.getTypeName()) as FlexItem
    textItem.overrideWidth = textW
    textItem.overrideHeight = rowH
    // Register explicitly once the layout is initialised (duplicates of auto-discovered items are ignored).
    flex.onInitialized.add(() => flex.addItems([iconItem, textItem]))
    this.applyAlpha(0)
    this.createEvent("UpdateEvent").bind(() => this.tick(getDeltaTime()))
  }

  /** Show at full opacity, hold for holdSeconds, then fade over fadeSeconds. */
  show(): void {
    this._shownCount++
    this.holdLeft = this.holdSeconds
    this.fading = false
    this.applyAlpha(1)
  }

  hide(): void {
    this.fading = false
    this.holdLeft = 0
    this.applyAlpha(0)
  }

  private tick(dt: number): void {
    if (this.alpha <= 0) return
    if (!this.fading) {
      this.holdLeft -= dt
      if (this.holdLeft <= 0) this.fading = true
      return
    }
    this.applyAlpha(Math.max(0, this.alpha - dt / Math.max(0.05, this.fadeSeconds)))
    if (this.alpha <= 0) {
      this.fading = false
      this._onFadedOut.invoke()
    }
  }

  private applyAlpha(a: number): void {
    this.alpha = a
    if (!this.label) return
    const c = this.textColor
    this.label.textFill.color = new vec4(c.x, c.y, c.z, c.w * a)
    this.iconMat.mainPass.baseColor = new vec4(c.x, c.y, c.z, c.w * a)
    this.label.enabled = a > 0.001
    this.iconSO.enabled = a > 0.001
  }
}
