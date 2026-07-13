#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = process.argv[2]
  ? resolve(process.argv[2])
  : process.env.STRUCTURED_EVENTS_COMPAT_MANIFEST
    ? resolve(process.env.STRUCTURED_EVENTS_COMPAT_MANIFEST)
  : join(rootDir, "config", "structured-events-compat.json");
const categoryNames = ["strictDecoders", "repeatedMessageStreamingProducers"];

function nonemptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isMinimumCompatibleVersion(value) {
  return (
    typeof value === "string" &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
  );
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}

function validateCategory(manifest, name, errors) {
  const category = manifest[name];
  if (!category || typeof category !== "object" || Array.isArray(category)) {
    errors.push(`${name} must be an object`);
    return;
  }
  if (!Array.isArray(category.entries)) {
    errors.push(`${name}.entries must be an array`);
    return;
  }
  if (category.entries.length === 0) {
    if (!isIsoDate(category.auditedAt)) {
      errors.push(`${name}.auditedAt must be an ISO date when entries is empty`);
    }
    if (!nonemptyString(category.owner)) {
      errors.push(`${name}.owner must be nonempty when entries is empty`);
    }
  }
  category.entries.forEach((entry, index) => {
    const path = `${name}.entries[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${path} must be an object`);
      return;
    }
    if (!nonemptyString(entry.id)) errors.push(`${path}.id must be nonempty`);
    if (!nonemptyString(entry.owner)) errors.push(`${path}.owner must be nonempty`);
    if (!isMinimumCompatibleVersion(entry.minimumCompatibleVersion)) {
      errors.push(
        `${path}.minimumCompatibleVersion must match major.minor.patch SemVer`
      );
    }
    if (entry.compatible !== true) errors.push(`${path}.compatible must be true`);
  });
}

try {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid compatibility manifest JSON: ${manifestPath}`);
    }
    throw error;
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Compatibility manifest must be an object");
  }
  const errors = [];
  categoryNames.forEach((name) => validateCategory(manifest, name, errors));
  if (errors.length > 0) {
    throw new Error(`Structured events compatibility gate failed:\n${errors.join("\n")}`);
  }
  console.log(`Structured events compatibility gate passed: ${manifestPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
