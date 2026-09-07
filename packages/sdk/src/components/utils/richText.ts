const htmlTagPattern = /<[a-z!/][\s\S]*?>/i;
const escapedHtmlTagPattern = /&lt;[a-z!/][\s\S]*?&gt;/i;

export function decodeHtmlEntities(value: string): string {
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
  }

  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

export function sanitizeRichTextHtml(value?: string): string {
  const html = value || '';
  if (!html.trim()) return '';

  if (typeof DOMParser === 'undefined') {
    return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  }

  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script, style, iframe, object, embed').forEach((node) => node.remove());
  parsed.body.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const attrValue = attribute.value.trim();
      if (/^on/i.test(name)) {
        element.removeAttribute(attribute.name);
        return;
      }
      if ((name === 'href' || name === 'src') && /^javascript:/i.test(attrValue)) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  return parsed.body.innerHTML;
}

export function normalizeRichTextHtml(value?: unknown): string {
  const raw = typeof value === 'string' ? value : value == null ? '' : String(value);
  if (!raw.trim()) return '';
  const shouldDecode = !htmlTagPattern.test(raw) && escapedHtmlTagPattern.test(raw);
  return sanitizeRichTextHtml(shouldDecode ? decodeHtmlEntities(raw) : raw);
}
