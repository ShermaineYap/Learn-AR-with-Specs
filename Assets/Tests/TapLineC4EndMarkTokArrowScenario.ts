// Criterion 4: pinching the end mark fades the guide away and plays a "tok" from the next tree; if that
// tree is out of view a small arrow at the edge of the view points to it, and the arrow disappears once
// the tree is in view.
// Driven by REAL camera movement (walk to Tree1, then really ROTATE the camera toward Tree2) and REAL SIK
// hand pinches on Tree1's TrunkHitArea and EndMark. No manager action methods called.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {
  STAND,
  TapLineCameraRig,
  getMain,
  log,
  pinchEndMark,
  waitForLensReady,
  waitUntil,
  walkUpAndPinchTrunk,
  yawToward,
} from "./TapLineLeafHelpers"

@component
export class TapLineC4EndMarkTokArrowScenario extends Scenario {
  async run(): Promise<void> {
    const main = getMain()
    await waitForLensReady(main)
    const rig = new TapLineCameraRig()
    rig.takeControl()
    try {
      const tree1 = main.getTree(0)
      const tree2 = main.getTree(1)
      const arrowSO = findSceneObjectByName("DirectionArrow")
      expect(isNull(arrowSO)).toBe(false)

      await walkUpAndPinchTrunk(rig, main, 0)
      await sleep(400)
      expect(main.isArrowVisible, "no arrow before the end mark").toBe(false)
      expect(main.isGuideVisibleOn(0)).toBe(true)

      const tokBefore = main.tokCount
      const tree2TokBefore = tree2.tokPlayCount
      // Tree2 must be out of view from the Tree1 standing spot for the arrow half of this criterion.
      const pj0 = rig.project(tree2.focusWorld)
      log("Tree2 focus screen pos " + pj0.sp.toString() + " inFront=" + pj0.inFront)
      expect(pj0.inFront && pj0.sp.x >= 0 && pj0.sp.x <= 1, "precondition: Tree2 out of view from Tree1").toBe(false)

      // Watch for the tok sound actually playing on Tree2's TokSource while the pinch happens.
      let sawTokPlaying = false
      let watching = true
      const watcher = (async () => {
        while (watching) {
          if (tree2.isTokPlaying) sawTokPlaying = true
          await nextFrame()
        }
      })()

      await pinchEndMark(main, 0)
      const opacityRightAfter = tree1.guideOpacity
      await sleep(300)
      watching = false
      await watcher

      // Tok from the NEXT tree.
      expect(main.tokCount - tokBefore, "exactly one tok").toBe(1)
      expect(main.lastTokTreeIndex, "tok came from tree 2").toBe(1)
      expect(tree2.tokPlayCount - tree2TokBefore).toBe(1)
      expect(main.getTree(2).tokPlayCount, "tree 3 did not tok").toBe(0)
      expect(sawTokPlaying, "Tree2 TokSource AudioComponent was playing").toBe(true)
      const tokPos = tree2.tokAudio.getSceneObject().getTransform().getWorldPosition()
      expect(tokPos.distance(tree2.focusWorld), "tok source sits on tree 2").toBeLessThan(10)
      expect(tree2.tokAudio.spatialAudio.enabled, "tok is spatial").toBe(true)

      // Guide fades away (not a hard cut).
      log("guide opacity right after end-mark pinch " + opacityRightAfter.toFixed(2))
      expect(opacityRightAfter, "guide should fade, not vanish instantly").toBeGreaterThan(0.2)
      const faded = await waitUntil(() => !main.isGuideVisibleOn(0), 2000)
      expect(faded, "guide faded away within 2 s").toBe(true)
      await sleep(250) // CutGuide is disabled the frame alpha reaches exactly 0
      expect(tree1.guideOpacity).toBeCloseTo(0, 2)
      expect(tree1.cutGuide.enabled, "CutGuide disabled after fade").toBe(false)
      expect(tree1.endMarkInteractableEnabled, "end mark no longer pinchable").toBe(false)
      expect(main.isTipNoteVisibleOn(0), "tip note hidden after done").toBe(false)

      // Arrow at the edge of view pointing toward Tree2 (to the right).
      expect(main.isArrowVisible, "arrow shown while Tree2 is out of view").toBe(true)
      expect(main.arrowTargetTreeIndex).toBe(1)
      const aLocal = rig.toCameraSpace(arrowSO.getTransform().getWorldPosition())
      log("arrow in camera space " + aLocal.toString())
      expect(aLocal.z, "arrow in front of the eyes").toBeLessThan(-30)
      expect(aLocal.x, "arrow on the right side (Tree2 is to the right)").toBeGreaterThan(3)
      const apj = rig.project(arrowSO.getTransform().getWorldPosition())
      expect(apj.sp.x > 0 && apj.sp.x < 1 && apj.sp.y > 0 && apj.sp.y < 1, "arrow itself is within view").toBe(true)
      expect(apj.sp.x, "arrow toward the edge, not centre").toBeGreaterThan(0.55)

      // Really rotate the head toward Tree2; the arrow must disappear once Tree2 is in view.
      const targetYaw = yawToward(rig.position, tree2.focusWorld)
      let hiddenAtYaw = 999
      let tree2InViewWhenHidden = false
      await rig.walkTo(rig.position, targetYaw, 2000, () => {
        if (hiddenAtYaw === 999 && !main.isArrowVisible) {
          hiddenAtYaw = rig.yawDeg
          const p = rig.project(tree2.focusWorld)
          tree2InViewWhenHidden = p.inFront && p.sp.x >= 0 && p.sp.x <= 1
        }
      })
      await sleep(200)
      log("turned to yaw " + rig.yawDeg.toFixed(1) + "; arrow hid at yaw " + hiddenAtYaw.toFixed(1))
      expect(main.isArrowVisible, "arrow gone once Tree2 is in view").toBe(false)
      expect(hiddenAtYaw !== 999, "arrow hid during the turn").toBe(true)
      expect(tree2InViewWhenHidden, "arrow hid only when Tree2 was actually in view").toBe(true)

      // Turn back away: arrow returns (it's driven by view, not a one-shot).
      await rig.walkTo(rig.position, STAND[0].yaw, 1200)
      await sleep(200)
      expect(main.isArrowVisible, "arrow returns when Tree2 leaves view again").toBe(true)
      log("C4 done")
    } finally {
      rig.release()
    }
  }
}
