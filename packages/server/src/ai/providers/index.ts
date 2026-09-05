import { ScriptedProvider } from "./scripted.js";
import { LlmProvider } from "./llm.js";
import type { AiProvider } from "./types.js";

export { ScriptedProvider, LlmProvider };
export type { AiProvider, TurnContext } from "./types.js";

export function getProvider(providerName = "scripted"): AiProvider {
  switch (providerName) {
    case "scripted":
      return new ScriptedProvider();
    case "llm":
      return new LlmProvider();
    default:
      console.warn(`Unknown AI provider "${providerName}", falling back to "scripted"`);
      return new ScriptedProvider();
  }
}
