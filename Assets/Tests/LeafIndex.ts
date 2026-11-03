import {scenariosIndex} from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator"
import {ScenarioMetadata} from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata"
import {TapLineC1ProximityGlowScenario} from "./TapLineC1ProximityGlowScenario"
import {TapLineC2CutGuideScenario} from "./TapLineC2CutGuideScenario"
import {TapLineC3TipNoteFadeScenario} from "./TapLineC3TipNoteFadeScenario"
import {TapLineC4EndMarkTokArrowScenario} from "./TapLineC4EndMarkTokArrowScenario"
import {TapLineC5DoneMessageScenario} from "./TapLineC5DoneMessageScenario"
import {TapLineDemoTourScenario} from "./TapLineDemoTourScenario"

@component
export class LeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenariosIndex: ScenarioMetadata[] = [
    {id: "c1-proximity-glow", typename: TapLineC1ProximityGlowScenario.getTypeName()},
    {id: "c2-cut-guide", typename: TapLineC2CutGuideScenario.getTypeName()},
    {id: "c3-tip-note-fade", typename: TapLineC3TipNoteFadeScenario.getTypeName()},
    {id: "c4-endmark-tok-arrow", typename: TapLineC4EndMarkTokArrowScenario.getTypeName()},
    {id: "c5-done-message", typename: TapLineC5DoneMessageScenario.getTypeName()},
    // Not a done-criteria test: a ~70 s paced walkthrough for screen recording.
    // start_hold_secs: seconds to hold at the start position before walking (default 3).
    {id: "demo-tour", typename: TapLineDemoTourScenario.getTypeName(), parameters: {start_hold_secs: "3"}},
  ]
}
