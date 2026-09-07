import { access, readdir, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import type { Skill } from "../types.ts";

const skillNamePattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;

let activeRegistry: SkillRegistry | undefined;

export function setActiveSkillRegistry(registry: SkillRegistry): void {
  activeRegistry = registry;
}

export function resolveSkillUri(uri: string): string | undefined {
  return activeRegistry?.resolveSkillUri(uri);
}

export class SkillRegistry {
  private readonly skills = new Map<string, Skill>();

  constructor(private readonly roots: string[]) {}

  async load(): Promise<void> {
    this.skills.clear();

    for (const root of this.roots) {
      if (!await exists(root)) {
        continue;
      }

      for (const skillFilePath of await findSkillFiles(root)) {
        try {
          const skill = await parseSkillFile(skillFilePath);
          const existing = this.skills.get(skill.name);
          if (existing) {
            console.warn(`Skill '${skill.name}' from ${skill.filePath} overrides ${existing.filePath}`);
          }
          this.skills.set(skill.name, skill);
          console.log(`Loaded skill: ${skill.name}`);

          for (const warning of skill.warnings) {
            console.warn(`Skill '${skill.name}' warning: ${warning}`);
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "Unknown skill load error";
          console.warn(`Skipped skill ${skillFilePath}: ${message}`);
        }
      }
    }
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  buildPromptContext(): string {
    const invokableSkills = this.list().filter((skill) => !skill.disableModelInvocation);
    if (invokableSkills.length === 0) {
      return "";
    }

    const lines = [
      "Available skills:",
      "Skills are reusable instructions stored as SKILL.md files. Use read_file with a skill:// URI to inspect a skill before applying it.",
      "",
    ];

    for (const skill of invokableSkills) {
      lines.push(`- ${skill.name}: ${skill.description} (read: skill://${skill.name}/SKILL.md)`);
    }

    return lines.join("\n");
  }

  resolveSkillUri(uri: string): string | undefined {
    if (!uri.startsWith("skill://")) {
      return undefined;
    }

    const withoutScheme = uri.slice("skill://".length);
    const slashIndex = withoutScheme.indexOf("/");
    const skillName = slashIndex === -1 ? withoutScheme : withoutScheme.slice(0, slashIndex);
    const rawRelativePath = slashIndex === -1 ? "SKILL.md" : withoutScheme.slice(slashIndex + 1);
    const skill = this.get(skillName);

    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    const requestedPath = rawRelativePath.trim() || "SKILL.md";
    const targetPath = resolve(skill.baseDir, requestedPath);
    const normalizedBase = normalize(skill.baseDir);
    const normalizedTarget = normalize(targetPath);
    const relativePath = relative(normalizedBase, normalizedTarget);

    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new Error(`skill:// path escapes skill directory: ${uri}`);
    }

    return normalizedTarget;
  }
}

export function defaultSkillRoots(cwd = process.cwd()): string[] {
  return [
    resolve(cwd, ".pi", "skills"),
    resolve(cwd, ".agents", "skills"),
    resolve(cwd, "skills"),
  ];
}

export function formatSkillForPrompt(skill: Skill): string {
  return [
    `Use this skill for the next user request.`,
    `<skill name="${skill.name}" source="skill://${skill.name}/SKILL.md">`,
    skill.body.trim(),
    "</skill>",
  ].join("\n");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function findSkillFiles(root: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name === "SKILL.md") {
        results.push(fullPath);
      }
    }
  }

  const rootStat = await stat(root);
  if (rootStat.isDirectory()) {
    await walk(root);
  }

  return results;
}

async function parseSkillFile(filePath: string): Promise<Skill> {
  const content = await readFile(filePath, "utf8");
  const { metadata, body } = parseFrontmatter(content);
  const fallbackName = basename(dirname(filePath)).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const rawName = typeof metadata.name === "string" && metadata.name.trim()
    ? metadata.name.trim()
    : fallbackName;
  const description = typeof metadata.description === "string" ? metadata.description.trim() : "";

  if (!description) {
    throw new Error("SKILL.md frontmatter must include a non-empty description.");
  }

  const warnings: string[] = [];
  if (!skillNamePattern.test(rawName)) {
    warnings.push("name should match /^[a-z0-9][a-z0-9_-]{0,63}$/.");
  }

  if (description.length > 1024) {
    warnings.push("description should be 1024 characters or fewer.");
  }

  if (!body.trim()) {
    warnings.push("body is empty; the model will only see metadata.");
  }

  return {
    name: rawName,
    description,
    filePath,
    baseDir: dirname(filePath),
    body,
    metadata,
    disableModelInvocation: metadata["disable-model-invocation"] === true,
    warnings,
  };
}

function parseFrontmatter(content: string): {
  metadata: Record<string, string | boolean | string[]>;
  body: string;
} {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return { metadata: {}, body: content };
  }

  const newline = content.startsWith("---\r\n") ? "\r\n" : "\n";
  const endMarker = `${newline}---${newline}`;
  const endIndex = content.indexOf(endMarker, 3);

  if (endIndex === -1) {
    throw new Error("Frontmatter starts with --- but has no closing ---.");
  }

  const frontmatter = content.slice(3 + newline.length, endIndex);
  const body = content.slice(endIndex + endMarker.length);
  return { metadata: parseYamlLite(frontmatter), body };
}

function parseYamlLite(source: string): Record<string, string | boolean | string[]> {
  const metadata: Record<string, string | boolean | string[]> = {};
  const lines = source.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    metadata[key] = parseScalar(rawValue);
  }

  return metadata;
}

function parseScalar(value: string): string | boolean | string[] {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((item) => stripQuotes(item.trim()))
      .filter(Boolean);
  }

  return stripQuotes(value);
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\""))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
