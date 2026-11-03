// Criterion 2: pinching the trunk shows the cut guide on that trunk — a glowing line starting ~120 cm
// high on the left, sloping down to the right at ~30°, with a start mark and a bigger end mark, plus that
// tree's tip note above it.
// Driven by REAL camera movement (walk up to Tree1) and a REAL SIK hand pinch on Tree1/Trunk/TrunkHitArea.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {FLOOR_Y, TapLineCameraRig, getMain, log, waitForLensReady, walkUpAndPinchTrunk} from "./TapLineLeafHelpers"

function aabbSize(so: SceneObject): number {
  const rmv = so.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
  if (isNull(rmv)) return -1
  const s = rmv.worldAabbMax().sub(rmv.worldAabbMin())
  return Math.max(s.x, s.y, s.z)
}

function childNamed(so: SceneObject, name: string): SceneObject | null {
  for (let i = 0; i < so.getChildrenCount(); i++) if (so.getChild(i).name === name) return so.getChild(i)
  return null
}

@component
export class TapLineC2CutGuideScenario extends Scenario {
  async run(): Promise<void> {
    const main = getMain()
    await waitForLensReady(main)
    // Design detail: every tree has a latex cup hanging just below the low (right) end of the cut.
    for (let i = 0; i < 3; i++) {
      const t = main.getTree(i)
      const cup = childNamed(t.trunk.getSceneObject(), "LatexCup")
      expect(cup !== null, "Tree" + (i + 1) + " has a LatexCup").toBe(true)
      const rmv = cup.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      expect(isNull(rmv), "LatexCup has a mesh").toBe(false)
      const mn = rmv.worldAabbMin()
      const mx = rmv.worldAabbMax()
      const end = t.guideEndWorld
      // The wire hoop wraps the trunk, so measure the cup by its lowest part (the cup body) under the cut end.
      const gap = end.y - mx.y
      log("Tree" + (i + 1) + " cup: top " + (mx.y - FLOOR_Y).toFixed(1) + " cm, bottom " + (mn.y - FLOOR_Y).toFixed(1) +
        " cm, cut end " + (end.y - FLOOR_Y).toFixed(1) + " cm, gap " + gap.toFixed(1) + " cm")
      expect(gap, "cup sits below the end of the cut (not covering the end mark)").toBeGreaterThan(2)
      // (MeshBuilder AABB min includes the trunk-local origin at the floor, so only the top edge is meaningful.)
      expect(gap, "cup hangs just below the cut end (top within ~10 cm)").toBeLessThan(10)
    }
    const rig = new TapLineCameraRig()
    rig.takeControl()
    try {
      const tree = main.getTree(0)
      expect(main.isGuideVisibleOn(0), "guide hidden before pinch").toBe(false)
      expect(tree.isGuideVisible).toBe(false)

      await walkUpAndPinchTrunk(rig, main, 0)
      await sleep(300)

      // Guide visible on THIS trunk only.
      expect(main.isGuideVisibleOn(0)).toBe(true)
      expect(main.isGuideVisibleOn(1)).toBe(false)
      expect(main.isGuideVisibleOn(2)).toBe(false)
      expect(tree.guideOpacity).toBeCloseTo(1, 2)
      expect(tree.cutGuide.enabled).toBe(true)
      expect(tree.guideLine.enabled).toBe(true)
      expect(tree.startMark.enabled).toBe(true)
      expect(tree.endMark.enabled).toBe(true)
      expect(isNull(childNamed(tree.guideLine, "GuideCore")), "guide line mesh exists").toBe(false)
      expect(tree.endMarkInteractableEnabled, "end mark pinchable").toBe(true)

      // ~120 cm high at the start, measured above the floor in world space.
      const s = tree.guideStartWorld
      const e = tree.guideEndWorld
      const startH = s.y - FLOOR_Y
      const endH = e.y - FLOOR_Y
      log("guide start " + s.toString() + " (h " + startH.toFixed(1) + "), end " + e.toString() + " (h " + endH.toFixed(1) + ")")
      expect(startH).toBeGreaterThan(117)
      expect(startH).toBeLessThan(123)
      expect(tree.guideStartHeight).toBeCloseTo(120, 0)

      // Starts on the user's left, ends on the right (as seen from where the user stands).
      const lateral = e.sub(s).dot(rig.right)
      log("start->end lateral (camera right) = " + lateral.toFixed(2) + " cm")
      expect(lateral, "guide should run left -> right from the user's view").toBeGreaterThan(5)
      // Slopes downward to the right.
      expect(startH - endH, "guide should slope down to the right").toBeGreaterThan(5)

      // ~30° along the bark: configured slope, plus a geometric check from the endpoints.
      expect(tree.guideSlopeDeg).toBeCloseTo(30, 0)
      const r = tree.trunk.trunkRadius + 0.6
      const arc = r * (150 * Math.PI / 180) // guide spans 165° -> 15° around the trunk
      const measured = Math.atan((startH - endH) / arc) * 180 / Math.PI
      log("measured slope along bark = " + measured.toFixed(2) + " deg (radius " + r.toFixed(1) + ")")
      expect(measured).toBeGreaterThan(27)
      expect(measured).toBeLessThan(33)

      // Start mark at the start, bigger end mark at the end.
      const smPos = tree.startMark.getTransform().getWorldPosition()
      const emPos = tree.endMark.getTransform().getWorldPosition()
      expect(smPos.distance(s), "start mark sits at guide start").toBeLessThan(3)
      expect(emPos.distance(e), "end mark sits at guide end").toBeLessThan(5)
      const endVisual = childNamed(tree.endMark, "EndMarkVisual")
      expect(isNull(endVisual), "EndMarkVisual exists").toBe(false)
      const startSize = aabbSize(tree.startMark)
      const endSize = aabbSize(endVisual)
      log("start mark size " + startSize.toFixed(2) + " cm, end mark size " + endSize.toFixed(2) + " cm")
      expect(startSize).toBeGreaterThan(0.5)
      expect(endSize, "end mark should be bigger than start mark").toBeGreaterThan(startSize * 1.5)

      // That tree's tip note, above the guide.
      expect(main.isTipNoteVisibleOn(0)).toBe(true)
      expect(main.isTipNoteVisibleOn(1)).toBe(false)
      expect(main.isTipNoteVisibleOn(2)).toBe(false)
      expect(tree.tipNote.currentAlpha).toBeCloseTo(1, 1)
      log("tip text: '" + tree.tipNote.currentText + "'")
      expect(tree.tipNote.currentText).toBe("Thin shave\nunder 1 mm")
      expect(tree.tipNote.lineCount, "tip note is at most two lines").toBeLessThan(3)
      // Size: at most ~30 cm wide, letters ~3 cm, centred on the trunk.
      const tipTexts: Text[] = []
      const collectText = (so: SceneObject) => {
        const t = so.getComponent("Component.Text") as Text
        if (!isNull(t)) tipTexts.push(t)
        for (let k = 0; k < so.getChildrenCount(); k++) collectText(so.getChild(k))
      }
      collectText(tree.tipNote.getSceneObject())
      expect(tipTexts.length, "tip note has a Text").toBe(1)
      const tipText = tipTexts[0]
      const tmn = tipText.worldAabbMin()
      const tmx = tipText.worldAabbMax()
      const tipWidth = tmx.x - tmn.x // Tree1 faces +Z, so the note's width runs along world X
      const letterCm = tipText.size / 43.886
      const trunkAxisX = tree.getSceneObject().getTransform().getWorldPosition().x
      const tipCentreX = (tmn.x + tmx.x) / 2
      log("tip note: width " + tipWidth.toFixed(1) + " cm, letter (em) " + letterCm.toFixed(2) + " cm, centre offset " +
        (tipCentreX - trunkAxisX).toFixed(1) + " cm, bottom " + (tmn.y - FLOOR_Y).toFixed(1) + " cm, top " + (tmx.y - FLOOR_Y).toFixed(1) + " cm")
      expect(tipWidth, "tip note no wider than ~30 cm").toBeLessThan(31)
      expect(Math.abs(letterCm - 3), "tip letters ~3 cm").toBeLessThan(0.35)
      expect(Math.abs(tipCentreX - trunkAxisX), "tip note centred on the trunk").toBeLessThan(2)
      const tipPos = tree.tipNote.getTransform().getWorldPosition()
      expect(tipPos.y, "tip note above the guide start").toBeGreaterThan(s.y)
      const tipOnTrunk = Math.sqrt(Math.pow(tipPos.x - s.x, 2) + Math.pow(tipPos.z - s.z, 2))
      expect(tipOnTrunk, "tip note on the same trunk").toBeLessThan(40)

      // Looking down at the trunk (a real user tilts their head ~22 deg down from eye level at 1 m),
      // the whole guide — start mark, end mark and tip note — is in view.
      await rig.lookAt(s.add(e).uniformScale(0.5), 600)
      await sleep(100)
      const inView = (w: vec3) => {
        const pj = rig.project(w)
        return pj.inFront && pj.sp.x > 0 && pj.sp.x < 1 && pj.sp.y > 0 && pj.sp.y < 1
      }
      expect(inView(smPos), "start mark in view when looking at the trunk").toBe(true)
      expect(inView(emPos), "end mark in view when looking at the trunk").toBe(true)
      expect(inView(tipPos), "tip note in view when looking at the trunk").toBe(true)

      // At arm's length (~60 cm from the bark), looking at the middle of the cut: the WHOLE note, both marks
      // and the line are in view, and the note does not cover the start mark.
      const treeBase = tree.getSceneObject().getTransform().getWorldPosition()
      await rig.placeAt(new vec3(treeBase.x, 0, treeBase.z + 75), 0)
      await rig.lookAt(s.add(e).uniformScale(0.5), 400)
      await sleep(100)
      const nmn = tipText.worldAabbMin()
      const nmx = tipText.worldAabbMax()
      let notePts = 0
      let minSx = 1, maxSx = 0, maxSy = 0
      for (let ix = 0; ix <= 4; ix++)
        for (let iy = 0; iy <= 2; iy++) {
          const w = new vec3(nmn.x + ((nmx.x - nmn.x) * ix) / 4, nmn.y + ((nmx.y - nmn.y) * iy) / 2, nmn.z + ((nmx.z - nmn.z) * iy) / 2)
          const pj = rig.project(w)
          if (pj.inFront && pj.sp.x >= 0 && pj.sp.x <= 1 && pj.sp.y >= 0 && pj.sp.y <= 1) notePts++
          minSx = Math.min(minSx, pj.sp.x)
          maxSx = Math.max(maxSx, pj.sp.x)
          maxSy = Math.max(maxSy, pj.sp.y) // screen y grows downward: max = note's lowest point on screen
        }
      const sm = rig.project(smPos)
      const smR = 0.012 // ~1 cm start-mark radius on screen at this distance
      const startClear = sm.sp.y - smR > maxSy || sm.sp.x < minSx || sm.sp.x > maxSx
      log("arm's length: note " + notePts + "/15 points in view, screen x " + minSx.toFixed(2) + ".." + maxSx.toFixed(2) +
        ", note bottom y " + maxSy.toFixed(3) + ", start mark y " + sm.sp.y.toFixed(3))
      expect(notePts, "whole tip note in view at arm's length").toBe(15)
      expect(inView(smPos) && inView(emPos), "both marks in view at arm's length").toBe(true)
      expect(startClear, "tip note does not cover the start mark").toBe(true)
      log("C2 done")
    } finally {
      rig.release()
    }
  }
}
