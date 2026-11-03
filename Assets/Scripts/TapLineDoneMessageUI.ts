// TapLineDoneMessageUI — the small "3 of 3 trees done" message shown near the last tree.
// Owns: rendering a check icon + one light label in a flex row, and its own show / hold / fade timing.
// Expects: to be placed (authored) near the last tree at about eye level, facing the user.
// Must NOT: decide when the row is finished — TapLineMain calls show(). Passive view only.

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"

const ICON_CHECK: Texture = requireAsset("../Icons/check_circle.png") as Texture
const IMAGE_MATERIAL: Material = requireAsset("../Materials/ImageMaterial.mat") as Material

// Text.size is the em-square height: em cm = size / 43.886 (StudioLib.d.ts → Text.size).
const TEXT_SIZE_PER_CM = 43.886

@component
export class TapLineDoneMessageUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">TapLineDoneMessageUI – end-of-row message</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Message text.")
  message: string = "3 of 3 trees done"

  @input
  @hint("Letter height (em-square) in cm. ~5 cm reads easily at about 1 m.")
  @widget(new SliderWidget(2, 10, 0.5))
  letterHeightCm: number = 5

  @input("vec4", "{1.0, 0.95, 0.82, 1.0}")
  @hint("Text and icon colour: bright warm white. No backing — the display is additive.")
  @widget(new ColorWidget())
  textColor: vec4 = new vec4(1.0, 0.95, 0.82, 1.0)

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
    const em = this.letterHeightCm
    const iconCm = em * 1.0
    const gap = em * 0.35
    // Bold sans averages ~0.55 em per character; used only to centre the row.
    const textW = 0.55 * em * this.message.length
    const rowW = iconCm + gap + textW
    const left = -rowW / 2
    const rowH = em * 1.4

    // Icon on the left, vertically centred on the text.
    this.iconSO = global.scene.createSceneObject("DoneIcon")
    this.iconSO.setParent(this.sceneObject)
    const img = this.iconSO.createComponent("Component.Image") as Image
    this.iconMat = IMAGE_MATERIAL.clone()
    this.iconMat.mainPass.baseTex = ICON_CHECK
    this.iconMat.mainPass.depthTest = false // always readable: the stand-in trunk must not hide it
    this.iconMat.mainPass.depthWrite = false
    img.clearMaterials()
    img.addMaterial(this.iconMat)
    this.iconSO.getTransform().setLocalScale(new vec3(iconCm, iconCm, 1))
    this.iconSO.getTransform().setLocalPosition(new vec3(left + iconCm / 2, 0, 0))

    // Text starts right after the icon.
    const textSO = global.scene.createSceneObject("DoneText")
    textSO.setParent(this.sceneObject)
    textSO.getTransform().setLocalPosition(new vec3(0, 0, 0.02))
    this.label = textSO.createComponent("Component.Text") as Text
    this.label.text = this.message
    this.label.size = em * TEXT_SIZE_PER_CM
    ;(this.label as Text & {weight?: number}).weight = 700
    // On the glasses a real trunk can't hide virtual text; keep the stand-in trunk from hiding it either.
    this.label.depthTest = false
    this.label.horizontalAlignment = HorizontalAlignment.Center
    this.label.verticalAlignment = VerticalAlignment.Center
    this.label.horizontalOverflow = HorizontalOverflow.Overflow
    this.label.verticalOverflow = VerticalOverflow.Overflow
    // Centred layout box on the text's own object; centreRow() positions it beside the icon once measured.
    this.label.layoutRect = Rect.create(-textW, textW, -rowH / 2, rowH / 2)
    textSO.getTransform().setLocalPosition(new vec3(left + iconCm + gap + textW / 2, 0, 0.02))
    this.iconCm = iconCm
    this.gapCm = gap
    this.rowH = rowH
    this.applyAlpha(0)
    this.createEvent("UpdateEvent").bind(() => this.tick(getDeltaTime()))
  }

  /** Show at full opacity, hold for holdSeconds, then fade over fadeSeconds. */
  show(): void {
    this._shownCount++
    this.holdLeft = this.holdSeconds
    this.fading = false
    this.applyAlpha(1)
    this.centreRow()
  }

  private iconCm = 5
  private gapCm = 1.75
  private rowH = 7

  private needsCentre = false

  /**
   * Centre icon + text as one row, using the text's real width from its cursor positions
   * (the onAwake layout only estimates it). Text is centre-aligned on its own SceneObject.
   */
  private centreRow(): void {
    let positions: CursorPosition[] = []
    try {
      positions = this.label.getCursorPositions()
    } catch (e) {
      positions = []
    }
    if (!positions || positions.length < 2) {
      this.needsCentre = true // not laid out yet; try again next frame
      return
    }
    let minX = Infinity
    let maxX = -Infinity
    for (const p of positions) {
      minX = Math.min(minX, p.position.x)
      maxX = Math.max(maxX, p.position.x)
    }
    let w = maxX - minX
    // If there is no cursor after the last character, add one average character width.
    if (positions.length <= this.message.length) w += w / Math.max(1, positions.length - 1)
    if (!(w > 1)) {
      this.needsCentre = true
      return
    }
    this.needsCentre = false
    const total = this.iconCm + this.gapCm + w
    const left = -total / 2
    this.iconSO.getTransform().setLocalPosition(new vec3(left + this.iconCm / 2, 0, 0))
    // Glyph centre sits at (minX+maxX)/2 in the text's local layout; shift so it lands at the text slot centre.
    const glyphCentre = (minX + (minX + w)) / 2
    const slotCentre = left + this.iconCm + this.gapCm + w / 2
    this.label.getSceneObject().getTransform().setLocalPosition(new vec3(slotCentre - glyphCentre, 0, 0.02))
  }

  hide(): void {
    this.fading = false
    this.holdLeft = 0
    this.applyAlpha(0)
  }

  private tick(dt: number): void {
    if (this.alpha <= 0) return
    if (this.needsCentre) this.centreRow()
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
