#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const PROPERTY_READERS = {
  title: (property) => richText(property.title),
  rich_text: (property) => richText(property.rich_text),
  status: (property) => text(property.status?.name),
  select: (property) => text(property.select?.name),
  multi_select: (property) => property.multi_select?.map((item) => text(item.name)).filter(Boolean),
  date: (property) => text(property.date?.start),
  people: (property) =>
    property.people?.map((person) => text(person.name ?? person.id)).filter(Boolean),
  relation: (property) => property.relation?.map((item) => text(item.id)).filter(Boolean),
  url: (property) => text(property.url),
  email: (property) => text(property.email),
  phone_number: (property) => text(property.phone_number),
  checkbox: (property) => (property.checkbox ? "true" : "false"),
};

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  usage(0);
}

if (!args.projectGroupId) {
  console.error("Missing required --project-group-id <grp_...>");
  usage(2);
}

const input = await readJson(args.file);
const output = buildImportInput(input, args.projectGroupId);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

async function readJson(file) {
  const raw = file ? await readFile(file, "utf8") : await readStdin();
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Could not parse JSON: ${error.message}`);
    process.exit(2);
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function buildImportInput(page, projectGroupId) {
  const direct = flattenDirectFields(page);
  const props = page.properties ?? {};
  const url = firstValue([
    direct.url,
    text(page.url),
    text(page.public_url),
    readProperty(props, ["URL", "Url", "Link"]),
  ]);
  if (!url) {
    throw new Error("Notion task input requires a page URL");
  }

  return omitEmpty({
    projectGroupId,
    title: direct.title,
    task: firstValue([direct.task, readProperty(props, ["Task", "Name", "Title"])]),
    status: firstValue([direct.status, readProperty(props, ["Status"])]),
    actionState: firstValue([
      direct.actionState,
      readProperty(props, ["Action State", "ActionState"]),
    ]),
    doDate: firstValue([
      direct.doDate,
      readProperty(props, ["DoDate", "Do Date", "Due", "Due Date"]),
    ]),
    recurrence: firstValue([direct.recurrence, readPropertyList(props, ["Recurrence"])]),
    priority: firstValue([direct.priority, readProperty(props, ["Priority"])]),
    attention: firstValue([direct.attention, readProperty(props, ["Attention"])]),
    people: firstValue([direct.people, readPropertyList(props, ["People"])]),
    location: firstValue([direct.location, readProperty(props, ["Location", "Context"])]),
    type: firstValue([direct.type, readProperty(props, ["Type"])]),
    agents: firstValue([direct.agents, readPropertyList(props, ["Agents"])]),
    url,
    pageId: firstValue([direct.pageId, text(page.id)]),
    dataSourceId: firstValue([
      direct.dataSourceId,
      text(page.dataSourceId),
      text(page.data_source_id),
      text(page.parent?.data_source_id),
    ]),
    body: firstValue([direct.body, text(page.body), text(page.content), text(page.markdown)]),
    links: firstValue([direct.links, readPropertyList(props, ["Links", "Related Links"])]),
    github: firstValue([
      direct.github,
      readProperty(props, ["GitHub", "Github", "GitHub PR", "GitHub Issue"]),
    ]),
    importedAt: direct.importedAt,
  });
}

function flattenDirectFields(page) {
  return {
    title: directText(page, ["title"]),
    task: directText(page, ["task", "Task"]),
    status: directText(page, ["status", "Status"]),
    actionState: directText(page, ["actionState", "Action State"]),
    doDate: directText(page, ["doDate", "DoDate", "dueDate"]),
    recurrence: directList(page, ["recurrence", "Recurrence"]),
    priority: directText(page, ["priority", "Priority"]),
    attention: directText(page, ["attention", "Attention"]),
    people: directList(page, ["people", "People"]),
    location: directText(page, ["location", "Location", "context"]),
    type: directText(page, ["type", "Type"]),
    agents: directList(page, ["agents", "Agents"]),
    url: directText(page, ["url", "URL"]),
    pageId: directText(page, ["pageId", "id"]),
    dataSourceId: directText(page, ["dataSourceId", "data_source_id"]),
    body: directText(page, ["body", "content", "markdown"]),
    links: directList(page, ["links", "Links"]),
    github: directText(page, ["github", "GitHub", "Github"]),
    importedAt: directText(page, ["importedAt"]),
  };
}

function directText(page, names) {
  return text(firstExisting(page, names));
}

function directList(page, names) {
  return optionalList(firstExisting(page, names));
}

function firstExisting(object, names) {
  for (const name of names) {
    if (Object.hasOwn(object, name)) return object[name];
  }
  return undefined;
}

function readProperty(properties, names) {
  for (const name of names) {
    if (Object.hasOwn(properties, name)) {
      const value = propertyValue(properties[name]);
      if (Array.isArray(value)) return value[0];
      if (value) return value;
    }
  }
  return undefined;
}

function readPropertyList(properties, names) {
  for (const name of names) {
    if (Object.hasOwn(properties, name)) {
      const value = propertyValue(properties[name]);
      const values = list(value);
      if (values.length > 0) return values;
    }
  }
  return undefined;
}

function propertyValue(property) {
  if (property == null) return undefined;
  if (typeof property !== "object") return text(property);
  const reader = PROPERTY_READERS[property.type];
  if (reader) return reader(property);
  return text(firstValue([property.name, property.plain_text, property.id]));
}

function richText(items) {
  return (
    list(items?.map((item) => item.plain_text ?? item.text?.content))
      .join("")
      .trim() || undefined
  );
}

function text(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function list(value) {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => text(String(item))).filter(Boolean);
}

function optionalList(value) {
  const values = list(value);
  return values.length > 0 ? values : undefined;
}

function firstValue(values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) return value;
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function omitEmpty(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry == null) return false;
      if (Array.isArray(entry)) return entry.length > 0;
      return entry !== "";
    }),
  );
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--project-group-id") {
      parsed.projectGroupId = argv[++index];
    } else if (arg === "--file") {
      parsed.file = argv[++index];
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage(2);
    }
  }
  return parsed;
}

function usage(code) {
  console.error(`Usage:
  node notion-task-input.mjs --project-group-id grp_... --file notion-page.json
  cat notion-page.json | node notion-task-input.mjs --project-group-id grp_...`);
  process.exit(code);
}
