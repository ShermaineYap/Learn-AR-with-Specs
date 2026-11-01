// Criterion 1: walking within ~1.5 m of a tree makes that trunk glow faintly; walking away turns it off.
// Driven by REAL camera movement (preview world camera walked frame by frame). No manager methods called.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {EYE_Y, TapLineCameraRig, getMain, log, waitForLensReady} from "./TapLineLeafHelpers"

@component
export class TapLineC1ProximityGlowScenario extends Scenario {
  async run(): Promise<void> {
    const main = getMain()
    await waitForLensReady(main)
    const rig = new TapLineCameraRig()
    rig.takeControl()
    try {
      const tree = main.getTree(0)
      // Start at the origin, 250 cm from Tree1.
      await rig.placeAt(new vec3(0, EYE_Y, 0), 0)
      await sleep(400)
      expect(main.distanceToTree(0)).toBeCloseTo(250, 0)
      expect(main.isGlowOn(0), "no glow at 250 cm").toBe(false)
      expect(tree.glowOpacity).toBeCloseTo(0, 2)
      expect(tree.glow.enabled, "Glow object hidden at 250 cm").toBe(false)

      // Walk toward Tree1 to 100 cm away; record the distance at which the glow switches on.
      let onAt = -1
      await rig.walkTo(new vec3(0, EYE_Y, -150), 0, 2500, () => {
        if (onAt < 0 && main.isGlowOn(0)) onAt = main.distanceToTree(0)
      })
      log("glow switched on at " + onAt.toFixed(1) + " cm")
      expect(onAt > 0, "glow never switched on while walking to 100 cm").toBe(true)
      expect(onAt).toBeLessThan(150.5)
      expect(onAt).toBeGreaterThan(140)

      await sleep(700)
      expect(main.getTreeState(0)).toBe("glowing")
      expect(main.isGlowOn(0)).toBe(true)
      expect(tree.glow.enabled, "Glow object visible near tree").toBe(true)
      expect(tree.glowOpacity).toBeCloseTo(1, 1)
      const effectiveAlpha = tree.glowColor.w * Math.min(1, tree.glowOpacity)
      log("effective glow alpha " + effectiveAlpha.toFixed(3))
      expect(effectiveAlpha).toBeGreaterThan(0.05)
      expect(effectiveAlpha, "glow should be faint").toBeLessThan(0.4)
      expect(tree.trunkInteractableEnabled, "trunk pinchable while glowing").toBe(true)
      // Only the next tree glows.
      expect(main.isGlowOn(1)).toBe(false)
      expect(main.isGlowOn(2)).toBe(false)

      // Walk away; record where the glow switches off.
      let offAt = -1
      await rig.walkTo(new vec3(0, EYE_Y, 0), 0, 2500, () => {
        if (offAt < 0 && !main.isGlowOn(0)) offAt = main.distanceToTree(0)
      })
      log("glow switched off at " + offAt.toFixed(1) + " cm")
      expect(offAt > 0, "glow never switched off while walking away").toBe(true)
      expect(offAt).toBeGreaterThan(149.5)
      expect(offAt).toBeLessThan(160)
      await sleep(700)
      expect(main.getTreeState(0)).toBe("idle")
      expect(main.isGlowOn(0)).toBe(false)
      expect(tree.glowOpacity).toBeCloseTo(0, 2)
      expect(tree.glow.enabled, "Glow object hidden after walking away").toBe(false)
      expect(tree.trunkInteractableEnabled).toBe(false)
      log("C1 done")
    } finally {
      rig.release()
    }
  }
}
