// Criterion 5: after finishing the third tree, a small "3 of 3 trees done" message appears and then fades.
// Driven by REAL camera movement (walking Tree1 -> Tree2 -> Tree3) and REAL SIK hand pinches on each
// TrunkHitArea and EndMark. No manager action methods called.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {FLOOR_Y, TapLineCameraRig, getMain, log, pinchEndMark, waitForLensReady, walkUpAndPinchTrunk} from "./TapLineLeafHelpers"
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
      // Placement (design fix): in front of Tree3, ~1 m from the user (clamped to just in front of the bark),
      // ~140 cm above the floor, facing the user.
      const msgPos = doneSO.getTransform().getWorldPosition()
      const cam = rig.position
      const flat = Math.hypot(msgPos.x - cam.x, msgPos.z - cam.z)
      const treeBase = main.getTree(2).getSceneObject().getTransform().getWorldPosition()
      const toTree = Math.hypot(treeBase.x - cam.x, treeBase.z - cam.z)
      const msgToTree = Math.hypot(treeBase.x - msgPos.x, treeBase.z - msgPos.z)
      const heightAboveFloor = msgPos.y - FLOOR_Y
      const fwd = doneSO.getTransform().forward
      const toCam = new vec3(cam.x - msgPos.x, 0, cam.z - msgPos.z).normalize()
      const facing = fwd.x * toCam.x + fwd.z * toCam.z
      log("done message: " + flat.toFixed(1) + " cm from user (tree " + toTree.toFixed(1) + " cm), " +
        heightAboveFloor.toFixed(1) + " cm high, facing dot " + facing.toFixed(3) + ", " + msgToTree.toFixed(1) + " cm from trunk axis")
      expect(flat, "message no more than ~1 m from the user").toBeLessThan(105)
      expect(flat, "message not in the user's face").toBeGreaterThan(50)
      expect(msgToTree, "message in front of the trunk, not inside it").toBeGreaterThan(main.getTree(2).trunk.trunkRadius + 3)
      expect(msgToTree < toTree, "message between the user and Tree3").toBe(true)
      expect(Math.abs(heightAboveFloor - main.doneMessageHeightCm), "message at the configured height (" + main.doneMessageHeightCm + " cm)").toBeLessThan(3)
      expect(heightAboveFloor < 160, "message slightly below eye level").toBe(true)
      expect(facing, "message faces the user").toBeGreaterThan(0.98)

      // In view: projected bounds of the message's Text, from three natural gazes.
      const texts: Text[] = []
      const collect = (so: SceneObject) => {
        const t = so.getComponent("Component.Text") as Text
        if (!isNull(t)) texts.push(t)
        for (let k = 0; k < so.getChildrenCount(); k++) collect(so.getChild(k))
      }
      collect(doneSO)
      expect(texts.length > 0, "done message has Text").toBe(true)
      const pointsInView = (): number => {
        const mn = texts[0].worldAabbMin()
        const mx = texts[0].worldAabbMax()
        let inside = 0
        for (let ix = 0; ix <= 4; ix++)
          for (let iy = 0; iy <= 2; iy++) {
            const w = new vec3(mn.x + ((mx.x - mn.x) * ix) / 4, mn.y + ((mx.y - mn.y) * iy) / 2, mn.z + ((mx.z - mn.z) * ix) / 4)
            const p = rig.project(w)
            if (p.inFront && p.sp.x >= 0 && p.sp.x <= 1 && p.sp.y >= 0 && p.sp.y <= 1) inside++
          }
        return inside
      }
      const visibleFraction = (): string => {
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
      // Right after the pinch the user is looking at the end mark they just pinched — the key gaze.
      // Measure all three gazes first (so the log shows each), then assert.
      await rig.lookAt(main.getTree(2).endMark.getTransform().getWorldPosition(), 250)
      log("gaze=Tree3 end mark just pinched: " + visibleFraction())
      const atEndMark = pointsInView()
      await rig.lookAt(main.getTree(2).focusWorld, 250)
      log("gaze=Tree3 guide height (120 cm): " + visibleFraction())
      const atGuide = pointsInView()
      await rig.lookAt(msgPos.add(new vec3(0, 20, 0)), 250)
      log("gaze=level toward Tree3: " + visibleFraction())
      const atLevel = pointsInView()
      expect(atEndMark, "whole message in view while looking at the end mark just pinched").toBe(15)
      expect(atGuide, "whole message in view while looking at the guide").toBe(15)
      expect(atLevel, "whole message in view at head level").toBe(15)
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
