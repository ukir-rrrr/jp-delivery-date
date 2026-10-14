import { readSettingsV1, DEFAULT_SETTINGS_V1, type SettingsV1 } from "../../domain/delivery/settings";

/** Server entry for the settings metafield. The rules live in readSettingsV1. */
export function parseSettings(raw: unknown): SettingsV1 {
  const settings = readSettingsV1(raw);
  if (!settings) throw new Error("invalid settings");
  return settings;
}

export function migrate(raw: unknown): SettingsV1 {
  if (raw == null) return DEFAULT_SETTINGS_V1;
  if (typeof raw !== "object") {
    throw new Error("settings metafield is not an object");
  }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (version === 1) return parseSettings(raw);
  throw new Error(`unsupported settings schemaVersion: ${String(version)}`);
}
