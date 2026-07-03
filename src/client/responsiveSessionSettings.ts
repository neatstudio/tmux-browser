import {
  DEFAULT_SESSION_SETTINGS,
  type SessionSettings
} from "../shared/sessionSettings";
import { getResponsiveUiTier } from "./responsiveUiTier";

export function getResponsiveSessionDefaults(width: number): SessionSettings {
  const tier = getResponsiveUiTier(width);

  if (tier === "phone") {
    return {
      ...DEFAULT_SESSION_SETTINGS,
      fontSize: 11,
      lineHeight: 1
    };
  }

  if (tier === "pad") {
    return {
      ...DEFAULT_SESSION_SETTINGS,
      fontSize: 12,
      lineHeight: 1
    };
  }

  return {
    ...DEFAULT_SESSION_SETTINGS,
    fontSize: 13,
    lineHeight: 1
  };
}
