export const confirmAction = (title?: string, content?: string) => {
  const message = [title, content].filter(Boolean).join('\n') || '确认继续吗？';
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return true;
  }

  try {
    return window.confirm(message);
  } catch {
    return true;
  }
};
