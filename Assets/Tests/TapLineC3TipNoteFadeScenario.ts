// Criterion 3: the tip note fades out on its own after ~4 s, while the guide line stays.
// Driven by REAL camera movement + REAL SIK hand pinch on the trunk; then only waiting (no method calls).
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {TapLineCameraRig, getMain, log, waitForLensReady, walkUpAndPinchTrunk} from "./TapLineLeafHelpers"

@component
export class TapLineC3TipNoteFadeScenario extends Scenario {
  async run(): Promise<void> {
    const main = getMain()
    await waitForLensReady(main)
    const rig = new TapLineCameraRig()
    rig.takeControl()
    try {
      const tree = main.getTree(0)
      await walkUpAndPinchTrunk(rig, main, 0)
      const t0 = getTime()
      expect(main.isTipNoteVisibleOn(0)).toBe(true)

      let fadeStart = -1
      let goneAt = -1
      let visibleAt3_5 = false
      while (getTime() - t0 < 8) {
        const t = getTime() - t0
        const a = tree.tipNote.currentAlpha
        if (fadeStart < 0 && a < 0.99) fadeStart = t
        if (t >= 3.4 && t <= 3.6 && main.isTipNoteVisibleOn(0)) visibleAt3_5 = true
        if (goneAt < 0 && !main.isTipNoteVisibleOn(0)) {
          goneAt = t
          break
        }
        await nextFrame()
      }
      log("tip fade started at " + fadeStart.toFixed(2) + " s, gone at " + goneAt.toFixed(2) + " s")
      expect(visibleAt3_5, "tip note still visible at ~3.5 s").toBe(true)
      expect(fadeStart).toBeGreaterThan(3.7)
      expect(fadeStart).toBeLessThan(4.5)
      expect(goneAt > 0, "tip note never faded out within 8 s").toBe(true)
      expect(goneAt).toBeGreaterThan(3.9)
      expect(goneAt).toBeLessThan(5.5)

      // Guide stays — right after the tip goes and 1.5 s later.
      expect(main.isGuideVisibleOn(0)).toBe(true)
      expect(tree.guideOpacity).toBeCloseTo(1, 2)
      await sleep(1500)
      expect(main.isTipNoteVisibleOn(0)).toBe(false)
      expect(tree.tipNote.currentAlpha).toBeCloseTo(0, 2)
      expect(main.isGuideVisibleOn(0), "guide still visible after the tip fades").toBe(true)
      expect(tree.guideOpacity).toBeCloseTo(1, 2)
      expect(main.getTreeState(0)).toBe("guiding")
      expect(tree.endMarkInteractableEnabled).toBe(true)
      log("C3 done")
    } finally {
      rig.release()
    }
  }
}
