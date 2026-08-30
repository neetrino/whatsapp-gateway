#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillRoot = join(repoRoot, '.agents', 'skills');
const libraryRoot = join(repoRoot, '.agents', 'library');
const ruleRoot = join(repoRoot, '.cursor', 'rules');
const agentSystemRoot = join(repoRoot, '.agents', 'system');
const catalogRoot = join(repoRoot, '.agents', 'catalog');
const catalogFile = join(catalogRoot, 'catalog.json');
const profilesFile = join(catalogRoot, 'profiles.json');
const sourcesFile = join(catalogRoot, 'sources.lock.json');
const errors = [];
const warnings = [];

const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const categories = new Set(['onboarding', 'quality', 'frontend', 'backend', 'database', 'security', 'operations', 'architecture', 'documentation']);
const states = new Set(['active', 'library', 'deprecated']);
const origins = new Set(['internal', 'external-vendored', 'external-adapted']);
const platforms = new Set(['cursor', 'codex']);
const risks = new Set(['low', 'medium', 'high']);

function report(collection, file, reason) {
  collection.push({ file: relative(repoRoot, file), reason });
}

function filesUnder(root, predicate) {
  if (!existsSync(root)) return [];
  const found = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(path, predicate));
    else if (predicate(path)) found.push(path);
  }
  return found;
}

function readSource(file) {
  return readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasDuplicates(values) {
  return new Set(values).size !== values.length;
}

function isSafeRepoPath(value) {
  return typeof value === 'string' && value.length > 0 && !isAbsolute(value) && !/^[A-Za-z]:\//.test(value) && !value.startsWith('./') && !value.includes('\\') && !value.split('/').includes('..');
}

function readFrontmatter(file, source) {
  if (!source.startsWith('---\n')) {
    report(errors, file, 'YAML frontmatter is missing.');
    return null;
  }
  const end = source.indexOf('\n---\n', 4);
  if (end < 0) {
    report(errors, file, 'YAML frontmatter is not closed.');
    return null;
  }
  const fields = new Map();
  for (const line of source.slice(4, end).split('\n')) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (match) fields.set(match[1], match[2].trim().replace(/^(['"])(.*)\1$/, '$2'));
  }
  return fields;
}

function validateLocalLinks(file, source) {
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of source.matchAll(linkPattern)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, '').split('#')[0];
    if (!rawTarget || /^(?:https?:|mailto:|tel:)/i.test(rawTarget)) continue;
    let target;
    try {
      target = decodeURIComponent(rawTarget);
    } catch {
      report(errors, file, `Markdown link has invalid encoding: ${rawTarget}`);
      continue;
    }
    if (!existsSync(resolve(dirname(file), target))) report(errors, file, `Local Markdown link does not resolve: ${rawTarget}`);
  }
}

function parseJsonFile(file) {
  if (!existsSync(file)) {
    report(errors, file, 'Required catalog JSON file is missing.');
    return null;
  }
  let data;
  try {
    data = JSON.parse(readSource(file));
  } catch (error) {
    report(errors, file, `Invalid JSON: ${error.message}`);
    return null;
  }
  if (!isObject(data)) {
    report(errors, file, 'JSON root must be an object.');
    return null;
  }
  if (!Number.isInteger(data.version) || data.version <= 0) report(errors, file, 'version must be a positive integer.');
  return data;
}

function validateSkillPackages(root, expectedState, allPackages) {
  const packages = new Map();
  if (!existsSync(root)) {
    report(errors, root, `${expectedState} Skill directory is missing.`);
    return packages;
  }
  for (const file of filesUnder(root, (path) => basename(path) === 'SKILL.md')) {
    const source = readSource(file);
    const fields = readFrontmatter(file, source);
    if (!fields) continue;
    const name = fields.get('name') ?? '';
    const description = fields.get('description') ?? '';
    if (!name) report(errors, file, 'Frontmatter field "name" is required.');
    if (!description) report(errors, file, 'Frontmatter field "description" is required.');
    if (name && !kebabCase.test(name)) report(errors, file, 'Skill name must be lowercase kebab-case.');
    if (name && basename(dirname(file)) !== name) report(errors, file, 'Skill name must match its direct parent directory.');
    if (name && allPackages.has(name)) report(errors, file, `Duplicate Skill name also used by ${relative(repoRoot, allPackages.get(name).file)}.`);
    else if (name) {
      const record = { file, directory: dirname(file), fields, expectedState };
      packages.set(name, record);
      allPackages.set(name, record);
    }
    if (description && (description.length < 40 || /^(?:helps? with development|useful skill|development skill|does things)\.?$/i.test(description))) {
      report(errors, file, 'Description is too generic; include action, trigger, and boundary.');
    } else if (description && !/\buse (?:when|for)\b/i.test(description)) {
      report(warnings, file, 'Description may be vague; state when the Skill should trigger.');
    }
    if (source.split('\n').length > 300) report(warnings, file, 'SKILL.md is excessively long; consider references.');
    if (!/^## Verification\b/m.test(source)) report(warnings, file, 'Skill lacks explicit verification guidance.');
    if (!/^## Output\b/m.test(source)) report(warnings, file, 'Skill lacks explicit output guidance.');
    for (const markdown of filesUnder(dirname(file), (path) => path.endsWith('.md') && basename(path) !== 'LICENSE.source.txt')) {
      validateLocalLinks(markdown, readSource(markdown));
    }
  }
  return packages;
}

function validateRules() {
  if (!existsSync(ruleRoot)) {
    report(errors, ruleRoot, 'Cursor Rule directory is missing.');
    return 0;
  }
  const files = filesUnder(ruleRoot, (path) => path.endsWith('.mdc'));
  for (const file of files) {
    const source = readSource(file);
    if (!source.trim()) {
      report(errors, file, 'Rule file is empty.');
      continue;
    }
    const fields = readFrontmatter(file, source);
    if (fields) {
      const alwaysApply = fields.get('alwaysApply');
      if (alwaysApply !== undefined && !['true', 'false'].includes(alwaysApply)) report(errors, file, 'alwaysApply must be true or false when present.');
      if (!fields.has('globs')) report(warnings, file, 'Rule has no globs field; verify task-only activation is intentional.');
      else if (!/^\[.*\]$/.test(fields.get('globs'))) report(errors, file, 'globs must use the repository array form, including [] for task-relevant Rules.');
    }
    validateLocalLinks(file, source);
    if (/\.cursor\/skills|21-project-onboarding|99-project-size/.test(source)) report(errors, file, 'Rule references a removed or migrated Skill path.');
  }
  return files.length;
}

function validateSources(data) {
  const sourcesById = new Map();
  if (!data) return sourcesById;
  if (!Array.isArray(data.sources)) {
    report(errors, sourcesFile, 'sources must be an array.');
    return sourcesById;
  }
  const required = ['id', 'repository', 'commit', 'sourcePath', 'license', 'licenseReviewed', 'reviewedAt', 'importedAs', 'adaptation'];
  for (const source of data.sources) {
    if (!isObject(source)) {
      report(errors, sourcesFile, 'Each source entry must be an object.');
      continue;
    }
    for (const field of required) if (!(field in source)) report(errors, sourcesFile, `Source entry is missing required field: ${field}.`);
    if (!kebabCase.test(source.id ?? '')) report(errors, sourcesFile, 'Source id must be lowercase kebab-case.');
    else if (sourcesById.has(source.id)) report(errors, sourcesFile, `Duplicate source id: ${source.id}.`);
    else sourcesById.set(source.id, source);
    if (!/^https:\/\/github\.com\/[^/]+\/[^/]+(?:\.git)?$/.test(source.repository ?? '')) report(errors, sourcesFile, `Source ${source.id ?? '<unknown>'} repository must be an HTTPS GitHub URL.`);
    if (!/^[0-9a-f]{40}$/i.test(source.commit ?? '')) report(errors, sourcesFile, `Source ${source.id ?? '<unknown>'} commit must be a full 40-character hexadecimal SHA.`);
    if (!isSafeRepoPath(source.sourcePath)) report(errors, sourcesFile, `Source ${source.id ?? '<unknown>'} sourcePath must be relative and safe.`);
    if (typeof source.license !== 'string' || !source.license.trim()) report(errors, sourcesFile, `Source ${source.id ?? '<unknown>'} license must be non-empty.`);
    if (source.licenseReviewed !== true) report(errors, sourcesFile, `Source ${source.id ?? '<unknown>'} licenseReviewed must be true for curated sources.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source.reviewedAt ?? '')) {
      report(errors, sourcesFile, `Source ${source.id ?? '<unknown>'} reviewedAt must use YYYY-MM-DD.`);
    } else {
      const parsed = new Date(`${source.reviewedAt}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== source.reviewedAt) report(errors, sourcesFile, `Source ${source.id ?? '<unknown>'} reviewedAt must be a real calendar date.`);
      const today = new Date();
      const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
      if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > todayUtc) report(errors, sourcesFile, `Source ${source.id ?? '<unknown>'} reviewedAt must not be in the future.`);
    }
    if (!kebabCase.test(source.importedAs ?? '')) report(errors, sourcesFile, `Source ${source.id ?? '<unknown>'} importedAs must be lowercase kebab-case.`);
    if (!['vendored', 'adapted'].includes(source.adaptation)) report(errors, sourcesFile, `Source ${source.id ?? '<unknown>'} adaptation must be vendored or adapted.`);
    if (source.adaptation === 'adapted' && (typeof source.adaptationNotes !== 'string' || source.adaptationNotes.trim().length < 20)) report(errors, sourcesFile, `Adapted source ${source.id ?? '<unknown>'} requires meaningful adaptationNotes.`);
  }
  return sourcesById;
}

function readProvenanceFields(file) {
  const fields = new Map();
  if (!existsSync(file)) return fields;
  for (const line of readSource(file).split('\n')) {
    const match = line.match(/^([A-Za-z][A-Za-z ]+):\s*(.+)$/);
    if (match) fields.set(match[1], match[2].trim());
  }
  return fields;
}

function validateExternalProvenance(entry, source) {
  const directory = resolve(repoRoot, entry.path);
  const sourceFile = join(directory, 'SOURCE.md');
  const licenseFile = join(directory, 'LICENSE.source.txt');
  if (!existsSync(sourceFile)) report(errors, sourceFile, `External Skill ${entry.name} requires SOURCE.md.`);
  if (!existsSync(licenseFile)) report(errors, licenseFile, `External Skill ${entry.name} requires LICENSE.source.txt.`);
  else {
    try {
      if (!readSource(licenseFile).trim()) report(errors, licenseFile, `External Skill ${entry.name} LICENSE.source.txt must not be empty.`);
    } catch (error) {
      report(errors, licenseFile, `External Skill ${entry.name} LICENSE.source.txt is not readable: ${error.message}`);
    }
  }
  if (!existsSync(sourceFile)) return;
  const fields = readProvenanceFields(sourceFile);
  const expected = new Map([
    ['Source ID', entry.sourceId],
    ['Source repository', source.repository],
    ['Pinned commit', source.commit],
    ['Source path', source.sourcePath],
    ['License', source.license],
    ['License reviewed', String(source.licenseReviewed)],
    ['Review date', source.reviewedAt],
    ['Imported as', source.importedAs],
    ['Adaptation type', source.adaptation],
  ]);
  if (source.adaptation === 'adapted') expected.set('Adaptation summary', source.adaptationNotes);
  for (const [label, value] of expected) {
    if (!fields.has(label)) report(errors, sourceFile, `Missing provenance field: ${label}.`);
    else if (fields.get(label) !== value) report(errors, sourceFile, `${label} does not match sources.lock.json.`);
  }
}

function validateCatalog(data, sourcesById, activeSkills, librarySkills, allPackages) {
  const entriesByName = new Map();
  const usedSourceIds = new Set();
  if (!data) return { entriesByName, usedSourceIds };
  if (!Array.isArray(data.skills)) {
    report(errors, catalogFile, 'skills must be an array.');
    return { entriesByName, usedSourceIds };
  }
  const required = ['name', 'category', 'state', 'origin', 'path', 'compatibility', 'risk'];
  const allowed = new Set([...required, 'sourceId']);
  const paths = new Set();
  for (const entry of data.skills) {
    if (!isObject(entry)) {
      report(errors, catalogFile, 'Each catalog Skill entry must be an object.');
      continue;
    }
    for (const field of required) if (!(field in entry)) report(errors, catalogFile, `Catalog entry is missing required field: ${field}.`);
    for (const field of Object.keys(entry)) if (!allowed.has(field)) report(errors, catalogFile, `Catalog entry ${entry.name ?? '<unknown>'} has unsupported field: ${field}.`);
    const name = entry.name ?? '';
    if (!kebabCase.test(name)) report(errors, catalogFile, `Catalog Skill name must be lowercase kebab-case: ${name || '<empty>'}.`);
    else if (entriesByName.has(name)) report(errors, catalogFile, `Duplicate catalog Skill name: ${name}.`);
    else entriesByName.set(name, entry);
    if (!categories.has(entry.category)) report(errors, catalogFile, `Catalog Skill ${name} has invalid category: ${entry.category}.`);
    if (!states.has(entry.state)) report(errors, catalogFile, `Catalog Skill ${name} has invalid state: ${entry.state}.`);
    if (!origins.has(entry.origin)) report(errors, catalogFile, `Catalog Skill ${name} has invalid origin: ${entry.origin}.`);
    if (!isSafeRepoPath(entry.path)) report(errors, catalogFile, `Catalog Skill ${name} path must be repository-relative, safe, and use forward slashes.`);
    if (entry.state === 'active' && !entry.path?.startsWith('.agents/skills/')) report(errors, catalogFile, `Active Skill ${name} path must start with .agents/skills/.`);
    if (entry.state === 'library' && !entry.path?.startsWith('.agents/library/')) report(errors, catalogFile, `Library Skill ${name} path must start with .agents/library/.`);
    if (entry.state !== 'deprecated' && isSafeRepoPath(entry.path) && !existsSync(resolve(repoRoot, entry.path))) report(errors, catalogFile, `Catalog Skill ${name} path does not exist: ${entry.path}.`);
    if (paths.has(entry.path)) report(errors, catalogFile, `Duplicate catalog Skill path: ${entry.path}.`);
    else paths.add(entry.path);
    if (!Array.isArray(entry.compatibility) || entry.compatibility.length === 0) report(errors, catalogFile, `Catalog Skill ${name} compatibility must be a non-empty array.`);
    else {
      if (hasDuplicates(entry.compatibility)) report(errors, catalogFile, `Catalog Skill ${name} compatibility contains duplicates.`);
      for (const platform of entry.compatibility) if (!platforms.has(platform)) report(errors, catalogFile, `Catalog Skill ${name} has unsupported compatibility: ${platform}.`);
    }
    if (!risks.has(entry.risk)) report(errors, catalogFile, `Catalog Skill ${name} has invalid risk: ${entry.risk}.`);
    if (entry.origin === 'internal' && 'sourceId' in entry) report(errors, catalogFile, `Internal Skill ${name} must not define sourceId.`);
    if (entry.origin !== 'internal') {
      if (!entry.sourceId) report(errors, catalogFile, `External Skill ${name} requires sourceId.`);
      else if (!sourcesById.has(entry.sourceId)) report(errors, catalogFile, `External Skill ${name} references unknown sourceId: ${entry.sourceId}.`);
      else {
        usedSourceIds.add(entry.sourceId);
        const source = sourcesById.get(entry.sourceId);
        if (source.importedAs !== name) report(errors, catalogFile, `External Skill ${name} does not match source importedAs: ${source.importedAs}.`);
        if (entry.origin === 'external-vendored' && source.adaptation !== 'vendored') report(errors, catalogFile, `External-vendored Skill ${name} requires source adaptation vendored.`);
        if (entry.origin === 'external-adapted' && source.adaptation !== 'adapted') report(errors, catalogFile, `External-adapted Skill ${name} requires source adaptation adapted.`);
        if (isSafeRepoPath(entry.path) && existsSync(resolve(repoRoot, entry.path))) validateExternalProvenance(entry, source);
      }
    }
    if (['active', 'library'].includes(entry.state) && isSafeRepoPath(entry.path)) {
      const directory = resolve(repoRoot, entry.path);
      const skillFile = join(directory, 'SKILL.md');
      if (!existsSync(skillFile)) report(errors, catalogFile, `${entry.state} Skill ${name} has no SKILL.md at ${entry.path}.`);
      if (basename(directory) !== name) report(errors, catalogFile, `Catalog Skill ${name} must match its path directory name.`);
      const expectedPackages = entry.state === 'active' ? activeSkills : librarySkills;
      const discovered = expectedPackages.get(name);
      if (!discovered) report(errors, catalogFile, `Catalog marks ${name} ${entry.state}, but it was not discovered in the matching package tree.`);
      else if (resolve(discovered.directory) !== directory) report(errors, catalogFile, `Catalog path for ${entry.state} Skill ${name} does not match its discovered directory.`);
    }
  }
  for (const [name, pkg] of allPackages) {
    const entry = entriesByName.get(name);
    if (!entry) report(errors, catalogFile, `${pkg.expectedState} Skill ${name} is not registered in catalog.json.`);
    else if (entry.state !== pkg.expectedState) report(errors, catalogFile, `Skill ${name} exists in the ${pkg.expectedState} tree but catalog state is ${entry.state}.`);
  }
  for (const sourceId of sourcesById.keys()) if (!usedSourceIds.has(sourceId)) report(warnings, sourcesFile, `Source ${sourceId} is not referenced by any catalog entry.`);
  return { entriesByName, usedSourceIds };
}

function validateProfiles(data, catalogEntries) {
  if (!data) return new Map();
  if (!isObject(data.profiles)) {
    report(errors, profilesFile, 'profiles must be an object.');
    return new Map();
  }
  const profiles = new Map(Object.entries(data.profiles));
  for (const [name, profile] of profiles) {
    if (!kebabCase.test(name)) report(errors, profilesFile, `Profile name must be lowercase kebab-case: ${name}.`);
    if (!isObject(profile)) {
      report(errors, profilesFile, `Profile ${name} must be an object.`);
      continue;
    }
    if (typeof profile.description !== 'string' || !profile.description.trim()) report(errors, profilesFile, `Profile ${name} requires a non-empty description.`);
    if (!Array.isArray(profile.extends)) report(errors, profilesFile, `Profile ${name} extends must be an array.`);
    if (!Array.isArray(profile.skills)) report(errors, profilesFile, `Profile ${name} skills must be an array.`);
    if (!Array.isArray(profile.extends) || !Array.isArray(profile.skills)) continue;
    if (hasDuplicates(profile.extends)) report(errors, profilesFile, `Profile ${name} extends contains duplicates.`);
    if (hasDuplicates(profile.skills)) report(errors, profilesFile, `Profile ${name} skills contains duplicates.`);
    for (const parent of profile.extends) {
      if (!profiles.has(parent)) report(errors, profilesFile, `Profile ${name} extends unknown profile: ${parent}.`);
      if (parent === name) report(errors, profilesFile, `Profile ${name} must not extend itself.`);
    }
    for (const skill of profile.skills) {
      if (!catalogEntries.has(skill)) report(errors, profilesFile, `Profile ${name} references unknown catalog Skill: ${skill}.`);
      else if (catalogEntries.get(skill).state === 'deprecated') report(errors, profilesFile, `Profile ${name} references deprecated Skill: ${skill}.`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function detectCycle(name, trail) {
    if (visiting.has(name)) {
      report(errors, profilesFile, `Profile inheritance cycle detected: ${[...trail, name].join(' -> ')}.`);
      return;
    }
    if (visited.has(name)) return;
    visiting.add(name);
    const profile = profiles.get(name);
    if (isObject(profile) && Array.isArray(profile.extends)) {
      for (const parent of profile.extends) if (profiles.has(parent)) detectCycle(parent, [...trail, name]);
    }
    visiting.delete(name);
    visited.add(name);
  }
  for (const name of profiles.keys()) detectCycle(name, []);

  const memo = new Map();
  function resolveProfile(name, resolving = new Set()) {
    if (memo.has(name)) return memo.get(name);
    if (resolving.has(name)) return new Set();
    const nextResolving = new Set(resolving).add(name);
    const profile = profiles.get(name);
    const inherited = new Set();
    if (isObject(profile) && Array.isArray(profile.extends)) {
      for (const parent of profile.extends) {
        if (!profiles.has(parent)) continue;
        for (const skill of resolveProfile(parent, nextResolving)) inherited.add(skill);
      }
    }
    if (isObject(profile) && Array.isArray(profile.skills)) {
      for (const skill of profile.skills) {
        if (inherited.has(skill)) report(errors, profilesFile, `Profile ${name} directly lists inherited Skill: ${skill}.`);
        inherited.add(skill);
      }
    }
    memo.set(name, inherited);
    return inherited;
  }
  for (const name of profiles.keys()) resolveProfile(name);
  return memo;
}

function validateDocumentationAndGovernance() {
  const governance = ['ROADMAP.md', 'DECISIONS.md', 'PHASE_STATUS.md', 'EXTERNAL_SKILL_POLICY.md'];
  for (const name of governance) {
    const file = join(agentSystemRoot, name);
    if (!existsSync(file)) report(errors, file, 'Required Agent-system governance file is missing.');
  }
  const files = [
    join(repoRoot, 'AGENTS.md'),
    join(repoRoot, 'README.md'),
    join(repoRoot, '.agents', 'README.md'),
    join(catalogRoot, 'README.md'),
    ...filesUnder(agentSystemRoot, (file) => file.endsWith('.md')),
  ];
  for (const file of new Set(files)) {
    if (!existsSync(file)) report(errors, file, 'Required Agent-system entry point or documentation file is missing.');
    else validateLocalLinks(file, readSource(file));
  }
}

function validateArchitecturalIsolation() {
  for (const name of ['RULES_SKILLS_ARCHITECTURE.md', 'SKILL_AUTHORING_GUIDE.md', 'SKILL_TRIGGER_TESTS.md']) {
    const file = join(repoRoot, 'docs', name);
    if (existsSync(file)) report(errors, file, 'Agent-system governance belongs under .agents/system/, not product docs/.');
  }
}

const allPackages = new Map();
const activeSkills = validateSkillPackages(skillRoot, 'active', allPackages);
const librarySkills = validateSkillPackages(libraryRoot, 'library', allPackages);
const ruleCount = validateRules();
const sourcesData = parseJsonFile(sourcesFile);
const sourcesById = validateSources(sourcesData);
const catalogData = parseJsonFile(catalogFile);
const { entriesByName: catalogEntries } = validateCatalog(catalogData, sourcesById, activeSkills, librarySkills, allPackages);
const profilesData = parseJsonFile(profilesFile);
const resolvedProfiles = validateProfiles(profilesData, catalogEntries);
validateDocumentationAndGovernance();
validateArchitecturalIsolation();

for (const item of errors) console.error(`ERROR\nFILE: ${item.file}\nREASON: ${item.reason}\n`);
for (const item of warnings) console.warn(`WARNING\nFILE: ${item.file}\nREASON: ${item.reason}\n`);

console.log('Validated:');
console.log(`- ${activeSkills.size} active Skills`);
console.log(`- ${librarySkills.size} library Skills`);
console.log(`- ${ruleCount} Rules`);
console.log(`- ${catalogEntries.size} catalog entries`);
console.log(`- ${resolvedProfiles.size} profiles`);
console.log(`- ${sourcesById.size} external sources`);
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);
process.exitCode = errors.length ? 1 : 0;
