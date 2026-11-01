// Criterion 5: after finishing the third tree, a small "3 of 3 trees done" message appears and then fades.
// Driven by REAL camera movement (walking Tree1 -> Tree2 -> Tree3) and REAL SIK hand pinches on each
// TrunkHitArea and EndMark. No manager action methods called.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {TapLineCameraRig, getMain, log, pinchEndMark, waitForLensReady, walkUpAndPinchTrunk} from "./TapLineLeafHelpers"
import {TapLineDoneMessageUI} from "../Scripts/TapLineDoneMessageUI"

@component
export class TapLineC5DoneMessageScenario extends Scenario {
  async run(): Promise<void> {
    const main = getMain()
    await waitForLensReady(main)
    const doneSO = findSceneObjectByName("DoneMessage")
    expect(isNull(doneSO)).toBe(false)
    const done = doneSO.getComponent(TapLineDoneMessageUI.getTypeName()) as TapLineDoneMessageUI
    expect(isNull(done)).toBe(false)
    const rig = new TapLineCameraRig()
    rig.takeControl()
    try {
      const shownBefore = done.shownCount
      for (let i = 0; i < 3; i++) {
        await walkUpAndPinchTrunk(rig, main, i)
        await sleep(300)
        if (i < 2) {
          await pinchEndMark(main, i)
          expect(main.isDoneMessageVisible, "no done message after tree " + (i + 1)).toBe(false)
          expect(main.currentTreeIndex).toBe(i + 1)
          await sleep(300)
        }
      }
      expect(main.isComplete).toBe(false)
      await pinchEndMark(main, 2)
      await sleep(100)

      expect(main.isComplete).toBe(true)
      expect(main.currentTreeIndex).toBe(3)
      expect(main.getTreeState(0)).toBe("done")
      expect(main.getTreeState(1)).toBe("done")
      expect(main.getTreeState(2)).toBe("done")
      expect(main.isDoneMessageVisible, "done message appears").toBe(true)
      expect(done.shownCount - shownBefore, "shown exactly once").toBe(1)
      log("done text: '" + done.currentText + "'")
      expect(done.currentText.includes("3 of 3 trees done")).toBe(true)
      expect(main.isArrowVisible, "no arrow after the last tree").toBe(false)
      // FINDING (not part of the literal criterion, logged not asserted): can the user see the message
      // without turning? Checks the projected bounds of the message's Text from three natural gazes.
      const texts: Text[] = []
      const collect = (so: SceneObject) => {
        const t = so.getComponent("Component.Text") as Text
        if (!isNull(t)) texts.push(t)
        for (let k = 0; k < so.getChildrenCount(); k++) collect(so.getChild(k))
      }
      collect(doneSO)
      const visibleFraction = (): string => {
        if (texts.length === 0) return "no Text found"
        const mn = texts[0].worldAabbMin()
        const mx = texts[0].worldAabbMax()
        let inside = 0
        let total = 0
        for (let ix = 0; ix <= 4; ix++)
          for (let iy = 0; iy <= 2; iy++) {
            const w = new vec3(mn.x + ((mx.x - mn.x) * ix) / 4, mn.y + ((mx.y - mn.y) * iy) / 2, mn.z + ((mx.z - mn.z) * ix) / 4)
            const p = rig.project(w)
            total++
            if (p.inFront && p.sp.x >= 0 && p.sp.x <= 1 && p.sp.y >= 0 && p.sp.y <= 1) inside++
          }
        const c = rig.project(mn.add(mx).uniformScale(0.5))
        return inside + "/" + total + " sample points in view; centre at " + c.sp.toString()
      }
      log("FINDING gaze=level, facing Tree3: " + visibleFraction())
      await rig.lookAt(main.getTree(2).focusWorld, 250)
      log("FINDING gaze=Tree3 guide height (120 cm): " + visibleFraction())
      await rig.lookAt(main.getTree(2).endMark.getTransform().getWorldPosition(), 250)
      log("FINDING gaze=Tree3 end mark just pinched: " + visibleFraction())
      expect(main.isDoneMessageVisible, "still visible after the glances").toBe(true)

      // ...then fades on its own.
      const t0 = getTime()
      let fadeStart = -1
      let goneAt = -1
      while (getTime() - t0 < 10) {
        const t = getTime() - t0
        if (fadeStart < 0 && done.currentAlpha < 0.99) fadeStart = t
        if (!main.isDoneMessageVisible) {
          goneAt = t
          break
        }
        await nextFrame()
      }
      log("done message fade started " + fadeStart.toFixed(2) + " s, gone at " + goneAt.toFixed(2) + " s")
      expect(fadeStart, "message holds for a moment before fading").toBeGreaterThan(1)
      expect(goneAt > 0, "done message faded out within 10 s").toBe(true)
      expect(goneAt - fadeStart, "fade is gradual, not a cut").toBeGreaterThan(0.3)
      await sleep(300)
      expect(done.currentAlpha).toBeCloseTo(0, 2)
      expect(done.shownCount - shownBefore, "not re-shown").toBe(1)
      log("C5 done")
    } finally {
      rig.release()
    }
  }
}
