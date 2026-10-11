// Suggest a file_path_glob from the paths the comments were left on.
// This is a prefix, not an understanding of the repo. It is good enough
// to scope a draft, and it is wrong when the same rule shows up in
// unrelated trees (the common prefix becomes short, sometimes just "**").
export function suggestFileGlob(
  paths: Array<string | null | undefined>,
): string {
  const files = [
    ...new Set(
      paths
        .filter((path): path is string => typeof path === 'string')
        .map(normalizePath)
        .filter((path) => path.length > 0),
    ),
  ];
  if (files.length === 0) return '**';
  if (files.length === 1) return files[0];

  const parts = files.map((file) => file.split('/'));
  const directories = parts.map((file) => file.slice(0, -1));
  const names = parts.map((file) => file[file.length - 1]);

  let prefixLength = 0;
  const shortest = Math.min(
    ...directories.map((directory) => directory.length),
  );
  for (let index = 0; index < shortest; index++) {
    const segment = directories[0][index];
    if (directories.every((directory) => directory[index] === segment)) {
      prefixLength += 1;
    } else {
      break;
    }
  }

  const prefix = directories[0].slice(0, prefixLength).join('/');
  const extensions = new Set(names.map(extensionOf));
  const extension = extensions.size === 1 ? [...extensions][0] : '';
  const pattern = extension ? `**/*${extension}` : '**/*';
  if (!prefix) return pattern;
  return `${prefix}/${pattern}`;
}

function normalizePath(path: string): string {
  let normalized = path.trim().replace(/\\/g, '/');
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  while (normalized.startsWith('/')) normalized = normalized.slice(1);
  return normalized;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  // "Dockerfile" and ".gitignore" are not extensions we want to glob.
  if (dot <= 0) return '';
  return name.slice(dot);
}
