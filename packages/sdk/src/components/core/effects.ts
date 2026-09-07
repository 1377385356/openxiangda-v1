import type {
  FieldBehavior,
  FormEffect,
  FormEffectAction,
  FormEffectCondition,
  OptionItem,
} from '../types';

/**
 * Evaluate form effects based on current form data.
 * Returns a map of fieldId → FieldBehavior adjustments.
 * Only behavior-changing actions (show/hide/enable/disable) are processed.
 * setValue actions are ignored in behavior evaluation.
 */
export function evaluateEffects(
  effects: FormEffect[],
  formData: Record<string, any>,
  currentBehaviors: Record<string, FieldBehavior>,
): Record<string, FieldBehavior> {
  const result: Record<string, FieldBehavior> = { ...currentBehaviors };

  for (const action of evaluateEffectActions(effects, formData)) {
    const target = getFieldTarget(action);
    if (!target) continue;

    switch (action.action) {
      case 'show':
        result[target] = 'NORMAL';
        break;
      case 'hide':
        result[target] = 'HIDDEN';
        break;
      case 'enable':
        result[target] = 'NORMAL';
        break;
      case 'disable':
        result[target] = 'DISABLED';
        break;
      default:
        break;
    }
  }

  return result;
}

export function evaluateEffectActions(
  effects: FormEffect[] = [],
  formData: Record<string, any>,
): FormEffectAction[] {
  const actions: FormEffectAction[] = [];

  for (const effect of effects) {
    if (evaluateCondition(effect.when, formData)) {
      actions.push(...effect.then);
    }
  }

  return actions;
}

export function evaluateFieldOverrides(
  effects: FormEffect[] = [],
  formData: Record<string, any>,
): Record<string, Record<string, any>> {
  const result: Record<string, Record<string, any>> = {};

  for (const action of evaluateEffectActions(effects, formData)) {
    const target = getFieldTarget(action);
    if (!target) continue;

    switch (action.action) {
      case 'setRequired':
        result[target] = { ...result[target], required: Boolean(action.value) };
        break;
      case 'setOptions':
        result[target] = {
          ...result[target],
          options: Array.isArray(action.value) ? action.value : [],
        };
        break;
      default:
        break;
    }
  }

  return result;
}

export function evaluateLayoutBehaviors(
  effects: FormEffect[] = [],
  formData: Record<string, any>,
): Record<string, FieldBehavior> {
  const result: Record<string, FieldBehavior> = {};

  for (const action of evaluateEffectActions(effects, formData)) {
    const target = getLayoutTarget(action);
    if (!target) continue;

    if (action.action === 'show') {
      result[target] = 'NORMAL';
    } else if (action.action === 'hide') {
      result[target] = 'HIDDEN';
    }
  }

  return result;
}

export function getValueActions(
  effects: FormEffect[] = [],
  formData: Record<string, any>,
): Array<{ fieldId: string; action: 'setValue' | 'clearValue'; value?: any }> {
  return evaluateEffectActions(effects, formData)
    .map((action) => {
      const fieldId = getFieldTarget(action);
      if (!fieldId || (action.action !== 'setValue' && action.action !== 'clearValue')) {
        return null;
      }
      return { fieldId, action: action.action, value: action.value };
    })
    .filter(Boolean) as Array<{ fieldId: string; action: 'setValue' | 'clearValue'; value?: any }>;
}

export function evaluateCondition(
  when: FormEffectCondition,
  formData: Record<string, any>,
): boolean {
  if ('all' in when) {
    return when.all.every((item) => evaluateCondition(item, formData));
  }
  if ('any' in when) {
    return when.any.some((item) => evaluateCondition(item, formData));
  }
  if ('not' in when) {
    return !evaluateCondition(when.not, formData);
  }

  const fieldValue = formData[when.field];
  const normalizedFieldValue = normalizeComparableValue(fieldValue);
  const normalizedExpectedValue = normalizeComparableValue(when.value);

  switch (when.operator) {
    case 'eq':
      return isEqualValue(normalizedFieldValue, normalizedExpectedValue);
    case 'ne':
      return !isEqualValue(normalizedFieldValue, normalizedExpectedValue);
    case 'in':
      return includesValue(normalizedExpectedValue, normalizedFieldValue);
    case 'notIn':
      return !includesValue(normalizedExpectedValue, normalizedFieldValue);
    case 'contains':
      return includesValue(normalizedFieldValue, normalizedExpectedValue);
    case 'empty':
      return isEmptyValue(fieldValue);
    case 'notEmpty':
      return !isEmptyValue(fieldValue);
    case 'between':
      return isBetween(normalizedFieldValue, normalizedExpectedValue);
    case 'changed':
      return true;
    default:
      return false;
  }
}

function getFieldTarget(action: FormEffectAction): string | undefined {
  if ('field' in action) {
    return action.field;
  }
  if (action.targetType === 'layout') {
    return undefined;
  }
  return action.target;
}

function getLayoutTarget(action: FormEffectAction): string | undefined {
  if ('target' in action && action.targetType === 'layout') {
    return action.target;
  }
  return undefined;
}

function normalizeComparableValue(value: any): any {
  if (Array.isArray(value)) {
    return value.map(normalizeComparableValue);
  }
  if (value && typeof value === 'object') {
    const option = value as Partial<OptionItem>;
    if (option.value !== undefined) {
      return option.value;
    }
  }
  return value;
}

function isEqualValue(left: any, right: any): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return left === right;
}

function includesValue(collection: any, candidate: any): boolean {
  if (Array.isArray(collection)) {
    if (Array.isArray(candidate)) {
      return candidate.some((item) => collection.some((entry) => isEqualValue(entry, item)));
    }
    return collection.some((entry) => isEqualValue(entry, candidate));
  }

  if (typeof collection === 'string') {
    return String(collection).includes(String(candidate ?? ''));
  }

  return false;
}

function isEmptyValue(value: any): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function isBetween(fieldValue: any, expectedValue: any): boolean {
  if (!Array.isArray(expectedValue) || expectedValue.length < 2) {
    return false;
  }
  const [min, max] = expectedValue;
  const comparable =
    typeof fieldValue === 'number' ? fieldValue : new Date(String(fieldValue)).getTime();
  const minValue = typeof min === 'number' ? min : new Date(String(min)).getTime();
  const maxValue = typeof max === 'number' ? max : new Date(String(max)).getTime();
  if ([comparable, minValue, maxValue].some((item) => Number.isNaN(item))) {
    return false;
  }
  return comparable >= minValue && comparable <= maxValue;
}
