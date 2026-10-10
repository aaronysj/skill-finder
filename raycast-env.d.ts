/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Skills Directories - Comma-separated directories scanned recursively for SKILL.md files. */
  "skillsDirs": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `search-skills` command */
  export type SearchSkills = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `search-skills` command */
  export type SearchSkills = {}
}

