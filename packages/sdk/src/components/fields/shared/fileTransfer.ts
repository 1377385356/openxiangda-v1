export function collectTransferFiles(
  files?: FileList | null,
  items?: DataTransferItemList | null,
): File[] {
  const directFiles = Array.from(files ?? []);
  const itemFiles = Array.from(items ?? [])
    .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
    .filter((file): file is File => Boolean(file));
  return Array.from(new Set([...directFiles, ...itemFiles]));
}
