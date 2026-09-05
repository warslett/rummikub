import { ScriptedProvider } from "./scripted.js";
import type { AiProvider } from "./scripted.js";

export { ScriptedProvider };
export type { AiProvider };

export function getProvider(providerName = "scripted"): AiProvider {
  switch (providerName) {
    case "scripted":
      return new ScriptedProvider();
    default:
      console.warn(`Unknown AI provider "${providerName}", falling back to "scripted"`);
      return new ScriptedProvider();
  }
}
