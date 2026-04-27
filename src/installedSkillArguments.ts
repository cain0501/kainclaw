function splitFallback(args: string): string[] {
  return args.split(/\s+/).filter(Boolean);
}

export function parseInstalledSkillArguments(args: string): string[] {
  if (!args.trim()) {
    return [];
  }

  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let escaping = false;

  for (const char of args) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\" && !inSingle) {
      escaping = true;
      continue;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (char === `"` && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (/\s/.test(char) && !inSingle && !inDouble) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaping || inSingle || inDouble) {
    return splitFallback(args);
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function isValidArgumentName(name: string): boolean {
  return !!name.trim() && !/^\d+$/.test(name.trim());
}

export function parseInstalledSkillArgumentNames(
  value: string | string[] | undefined,
): string[] {
  if (!value) {
    return [];
  }

  const values = Array.isArray(value)
    ? value
    : value.startsWith("[") && value.endsWith("]")
      ? value
          .slice(1, -1)
          .split(",")
          .map(item => item.trim().replace(/^["']|["']$/g, ""))
      : value.split(/\s+/);

  return values.filter(isValidArgumentName);
}

export function substituteInstalledSkillArguments(
  content: string,
  args: string | undefined,
  appendIfNoPlaceholder = true,
  argumentNames: string[] = [],
): string {
  if (args === undefined || args === null) {
    return content;
  }

  const parsedArgs = parseInstalledSkillArguments(args);
  const originalContent = content;

  for (let index = 0; index < argumentNames.length; index += 1) {
    const name = argumentNames[index];
    if (!name) {
      continue;
    }
    content = content.replace(
      new RegExp(`\\$${name}(?![\\[\\w])`, "g"),
      parsedArgs[index] ?? "",
    );
  }

  content = content.replace(/\$ARGUMENTS\[(\d+)\]/g, (_, indexStr: string) => {
    const index = Number.parseInt(indexStr, 10);
    return parsedArgs[index] ?? "";
  });

  content = content.replace(/\$(\d+)(?!\w)/g, (_, indexStr: string) => {
    const index = Number.parseInt(indexStr, 10);
    return parsedArgs[index] ?? "";
  });

  content = content.replaceAll("$ARGUMENTS", args);

  if (content === originalContent && appendIfNoPlaceholder && args) {
    return `${content}\n\nARGUMENTS: ${args}`;
  }

  return content;
}
