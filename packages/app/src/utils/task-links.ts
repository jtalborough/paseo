export function linksToText(links: string[]): string {
  return links.join("\n");
}

export function textToLinks(value: string): string[] {
  const seen = new Set<string>();
  const links: string[] = [];
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    links.push(trimmed);
  }
  return links;
}
