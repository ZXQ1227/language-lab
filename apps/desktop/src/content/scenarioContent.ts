// Scenario content loader.
//
// `content/scenarios/*.json` is product content shipped with the app. For
// v0.1 the JSON files are bundled into the webview via explicit imports;
// each file is parsed with scenarioContentSchema before it is used, so a
// malformed content file fails loudly instead of corrupting the database.

import { scenarioContentSchema, type ScenarioContent } from "@language-lab/core";
import cafeOrder from "../../../../content/scenarios/cafe-order.json";
import doctorVisit from "../../../../content/scenarios/doctor-visit.json";
import smallTalk from "../../../../content/scenarios/small-talk.json";

const RAW_CONTENT_FILES = [cafeOrder, doctorVisit, smallTalk] as const;

export function parseScenarioContent(raw: unknown): ScenarioContent {
  return scenarioContentSchema.parse(raw) as ScenarioContent;
}

export function loadScenarioContent(): ScenarioContent[] {
  return RAW_CONTENT_FILES.map((raw) => parseScenarioContent(raw));
}
