// TapLineTipNoteUI — the short per-tree tip that appears on the trunk, just above the cut line.
// Owns: rendering one wrapped, light-coloured label (no backing card — it sits on the bark) and its
//       own show / hold / fade-out timing.
// Expects: to live on a SceneObject that is a child of a tree, facing the tree's front (+Z local).
// Must NOT: decide when a tip shows or hold any tree/game state — TapLineMain/TapLineTree call
//           show()/hide(); this is a passive view.

import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {
  FlexAlign,
  FlexAlignSelf,
  FlexDirection,
  FlexJustify,
} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"

// Text.size is the em-square height: em cm = size / 43.886 (StudioLib.d.ts → Text.size).
const TEXT_SIZE_PER_CM = 43.886

@component
export class TapLineTipNoteUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">TapLineTipNoteUI – tip text on the trunk</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Tip text. TapLineTree overwrites this with the tree's own tip when the guide starts.")
  tipText: string = "Thin shave / under 1 mm"

  @input
  @hint("Letter height (em-square) in cm. The brief asks for about 3 cm.")
  @widget(new SliderWidget(1.5, 6, 0.1))
  letterHeightCm: number = 3.0

  @input
  @hint("Maximum line width in cm. Lines longer than this shrink to fit, so the note always fits the view at arm's length.")
  @widget(new SliderWidget(15, 60, 1))
  wrapWidthCm: number = 30

  @input
  @hint("Maximum number of lines. Use ' / ' in the tip text to split lines.")
  maxLines: number = 2

  @input("vec4", "{1.0, 1.0, 0.92, 1.0}")
  @hint("Text colour. Keep it light — the Specs display is additive, so dark text disappears.")
  @widget(new ColorWidget())
  textColor: vec4 = new vec4(1.0, 1.0, 0.92, 1.0)

  @input
  @hint("Start hidden (the tip only appears with the cut guide).")
  startHidden: boolean = true
  @ui.group_end

  private label!: Text
  private alpha = 0
  private holdLeft = 0
  private fadeDuration = 0.6
  private fading = false
  private _onFadedOut = new Event<void>()

  /** Fires when the auto fade finishes. */
  get onFadedOut(): PublicApi<void> {
    return this._onFadedOut.publicApi()
  }

  /** True while any part of the note is visible. */
  get isVisible(): boolean {
    return this.sceneObject.enabled && this.alpha > 0.01
  }

  get currentText(): string {
    return this.label ? this.label.text : this.tipText
  }

  get currentAlpha(): number {
    return this.alpha
  }

  /** Number of lines in the current text. */
  get lineCount(): number {
    return this.currentText.split("\n").length
  }

  /** Height of the text block (cm) for maxLines lines — used to place the note above the cut. */
  get blockHeightCm(): number {
    return this.letterHeightCm * 1.2 * this.maxLines
  }

  /** "Thin shave / under 1 mm" → two lines. */
  static toLines(msg: string, maxLines: number): string {
    const parts = msg.split("/").map((s) => s.trim()).filter((s) => s.length > 0)
    if (parts.length <= maxLines) return parts.join("\n")
    return parts.slice(0, maxLines - 1).concat([parts.slice(maxLines - 1).join(" ")]).join("\n")
  }

  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas")

    const content = global.scene.createSceneObject("TipContent")
    content.setParent(this.sceneObject)
    const flex = content.createComponent(FlexLayout.getTypeName()) as FlexLayout
    const h = this.blockHeightCm
    flex.onInitialized.add(() => {
      flex.width = this.wrapWidthCm
      flex.height = h
      flex.direction = FlexDirection.Column
      flex.justifyContent = FlexJustify.Center
      flex.alignItems = FlexAlign.Stretch
    })

    const textSO = global.scene.createSceneObject("TipText")
    textSO.setParent(content)
    textSO.getTransform().setLocalPosition(new vec3(0, 0, 0.02))
    this.label = textSO.createComponent("Component.Text") as Text
    this.label.text = TapLineTipNoteUI.toLines(this.tipText, this.maxLines)
    this.label.size = this.letterHeightCm * TEXT_SIZE_PER_CM
    ;(this.label as Text & {weight?: number}).weight = 700
    this.label.depthTest = true
    this.label.horizontalAlignment = HorizontalAlignment.Center
    this.label.verticalAlignment = VerticalAlignment.Center
    // Explicit lines; any line wider than wrapWidthCm shrinks to fit rather than spilling out of view.
    this.label.horizontalOverflow = HorizontalOverflow.Shrink
    this.label.verticalOverflow = VerticalOverflow.Overflow
    this.label.layoutRect = Rect.create(-this.wrapWidthCm / 2, this.wrapWidthCm / 2, -h / 2, h / 2)
    const item = textSO.createComponent(FlexItem.getTypeName()) as FlexItem
    item.alignSelf = FlexAlignSelf.Stretch
    item.overrideHeight = h
    // FlexLayout auto-discovers these FlexItem children on start (autoDiscoverItemsOnStart).

    this.applyAlpha(this.startHidden ? 0 : 1)
    this.createEvent("UpdateEvent").bind(() => this.tick(getDeltaTime()))
  }

  setText(msg: string): void {
    this.tipText = msg
    if (this.label) this.label.text = TapLineTipNoteUI.toLines(msg, this.maxLines)
  }

  /** Show at full opacity, then hold for holdSec and fade over fadeSec. holdSec <= 0 holds forever. */
  show(holdSec: number = 4, fadeSec: number = 0.6): void {
    this.sceneObject.enabled = true
    this.fadeDuration = Math.max(0.05, fadeSec)
    this.holdLeft = holdSec
    this.fading = false
    this.applyAlpha(1)
  }

  /** Hide immediately. */
  hide(): void {
    this.holdLeft = 0
    this.fading = false
    this.applyAlpha(0)
  }

  private tick(dt: number): void {
    if (this.alpha <= 0) return
    if (!this.fading) {
      if (this.holdLeft > 0) {
        this.holdLeft -= dt
        if (this.holdLeft <= 0) this.fading = true
      }
      return
    }
    const next = this.alpha - dt / this.fadeDuration
    this.applyAlpha(Math.max(0, next))
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
    this.label.enabled = a > 0.001
  }
}
