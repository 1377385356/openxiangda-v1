import { useMemo } from 'react';
import type { FieldBehavior, FormEffect } from '../types';
import { evaluateEffects } from '../core/effects';

export interface UseFieldBehaviorOptions {
  fieldId: string;
  permissions?: Record<string, FieldBehavior>;
  effects?: FormEffect[];
  formData: Record<string, any>;
  defaultBehavior?: FieldBehavior;
}

/**
 * Computes the final behavior for a field.
 * Priority: permissions > effects > defaultBehavior > 'NORMAL'
 */
export function useFieldBehavior({
  fieldId,
  permissions,
  effects,
  formData,
  defaultBehavior = 'NORMAL',
}: UseFieldBehaviorOptions): FieldBehavior {
  return useMemo(() => {
    // If permissions explicitly define this field, that takes priority
    if (permissions && permissions[fieldId]) {
      return permissions[fieldId];
    }

    // Evaluate effects to see if they modify the behavior
    if (effects && effects.length > 0) {
      const baseBehaviors: Record<string, FieldBehavior> = { [fieldId]: defaultBehavior };
      const computed = evaluateEffects(effects, formData, baseBehaviors);
      return computed[fieldId] as FieldBehavior;
    }

    return defaultBehavior;
  }, [fieldId, permissions, effects, formData, defaultBehavior]);
}
