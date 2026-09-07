import { message } from 'antd';

function escapeCss(value: string) {
  return typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}

export function scrollToFirstError(errors: Record<string, string>) {
  const firstFieldId = Object.keys(errors)[0];
  if (!firstFieldId || typeof document === 'undefined') return;
  const target =
    document.querySelector(`[data-field-id="${escapeCss(firstFieldId)}"]`) ||
    document.querySelector(`[data-field-id="${escapeCss(firstFieldId.split('.')[0])}"]`);
  if (target && 'scrollIntoView' in target) {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

export function notifyValidationErrors(errors: Record<string, string>) {
  const firstMessage = Object.values(errors)[0] || '请完善必填项';
  try {
    message?.error?.(firstMessage);
  } catch {
    // Field-level errors remain visible if the host omits Ant Design static messages.
  }
  scrollToFirstError(errors);
}

export async function validateAndNotify(
  validateAllWithErrors: () => Promise<Record<string, string>>,
) {
  const errors = await validateAllWithErrors();
  if (Object.keys(errors).length > 0) {
    notifyValidationErrors(errors);
    return false;
  }
  return true;
}
