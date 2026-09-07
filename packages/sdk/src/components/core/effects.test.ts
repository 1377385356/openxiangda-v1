import { describe, it, expect } from 'vitest';
import {
  evaluateCondition,
  evaluateEffectActions,
  evaluateEffects,
  evaluateFieldOverrides,
  evaluateLayoutBehaviors,
  getValueActions,
} from './effects';
import type { FormEffect, FieldBehavior } from '../types';

describe('evaluateEffects', () => {
  const baseBehaviors: Record<string, FieldBehavior> = {
    field1: 'NORMAL',
    field2: 'NORMAL',
    field3: 'NORMAL',
  };

  it('returns current behaviors when effects is empty', () => {
    const result = evaluateEffects([], { type: 'A' }, baseBehaviors);
    expect(result).toEqual(baseBehaviors);
  });

  describe('condition: eq', () => {
    it('applies action when condition is met', () => {
      const effects: FormEffect[] = [
        {
          when: { field: 'type', operator: 'eq', value: 'A' },
          then: [{ field: 'field1', action: 'hide' }],
        },
      ];
      const result = evaluateEffects(effects, { type: 'A' }, baseBehaviors);
      expect(result.field1).toBe('HIDDEN');
    });

    it('does not apply action when condition is not met', () => {
      const effects: FormEffect[] = [
        {
          when: { field: 'type', operator: 'eq', value: 'B' },
          then: [{ field: 'field1', action: 'hide' }],
        },
      ];
      const result = evaluateEffects(effects, { type: 'A' }, baseBehaviors);
      expect(result.field1).toBe('NORMAL');
    });
  });

  describe('condition: ne', () => {
    it('applies action when field is not equal to value', () => {
      const effects: FormEffect[] = [
        {
          when: { field: 'type', operator: 'ne', value: 'A' },
          then: [{ field: 'field1', action: 'disable' }],
        },
      ];
      const result = evaluateEffects(effects, { type: 'B' }, baseBehaviors);
      expect(result.field1).toBe('DISABLED');
    });

    it('does not apply when field equals value', () => {
      const effects: FormEffect[] = [
        {
          when: { field: 'type', operator: 'ne', value: 'A' },
          then: [{ field: 'field1', action: 'disable' }],
        },
      ];
      const result = evaluateEffects(effects, { type: 'A' }, baseBehaviors);
      expect(result.field1).toBe('NORMAL');
    });
  });

  describe('condition: in', () => {
    it('applies action when field value is in the array', () => {
      const effects: FormEffect[] = [
        {
          when: { field: 'status', operator: 'in', value: ['active', 'pending'] },
          then: [{ field: 'field2', action: 'show' }],
        },
      ];
      const behaviors: Record<string, FieldBehavior> = { ...baseBehaviors, field2: 'HIDDEN' };
      const result = evaluateEffects(effects, { status: 'active' }, behaviors);
      expect(result.field2).toBe('NORMAL');
    });

    it('does not apply when field value is not in the array', () => {
      const effects: FormEffect[] = [
        {
          when: { field: 'status', operator: 'in', value: ['active', 'pending'] },
          then: [{ field: 'field2', action: 'show' }],
        },
      ];
      const behaviors: Record<string, FieldBehavior> = { ...baseBehaviors, field2: 'HIDDEN' };
      const result = evaluateEffects(effects, { status: 'closed' }, behaviors);
      expect(result.field2).toBe('HIDDEN');
    });

    it('does not apply when value is not an array', () => {
      const effects: FormEffect[] = [
        {
          when: { field: 'status', operator: 'in', value: 'not-array' },
          then: [{ field: 'field2', action: 'show' }],
        },
      ];
      const behaviors: Record<string, FieldBehavior> = { ...baseBehaviors, field2: 'HIDDEN' };
      const result = evaluateEffects(effects, { status: 'active' }, behaviors);
      expect(result.field2).toBe('HIDDEN');
    });
  });

  describe('condition: changed', () => {
    it('always applies action', () => {
      const effects: FormEffect[] = [
        {
          when: { field: 'any', operator: 'changed' },
          then: [{ field: 'field3', action: 'enable' }],
        },
      ];
      const behaviors: Record<string, FieldBehavior> = { ...baseBehaviors, field3: 'DISABLED' };
      const result = evaluateEffects(effects, {}, behaviors);
      expect(result.field3).toBe('NORMAL');
    });
  });

  describe('actions', () => {
    it('show sets NORMAL', () => {
      const effects: FormEffect[] = [
        {
          when: { field: 'x', operator: 'changed' },
          then: [{ field: 'field1', action: 'show' }],
        },
      ];
      const behaviors: Record<string, FieldBehavior> = { field1: 'HIDDEN' };
      const result = evaluateEffects(effects, {}, behaviors);
      expect(result.field1).toBe('NORMAL');
    });

    it('hide sets HIDDEN', () => {
      const effects: FormEffect[] = [
        {
          when: { field: 'x', operator: 'changed' },
          then: [{ field: 'field1', action: 'hide' }],
        },
      ];
      const result = evaluateEffects(effects, {}, baseBehaviors);
      expect(result.field1).toBe('HIDDEN');
    });

    it('enable sets NORMAL', () => {
      const effects: FormEffect[] = [
        {
          when: { field: 'x', operator: 'changed' },
          then: [{ field: 'field1', action: 'enable' }],
        },
      ];
      const behaviors: Record<string, FieldBehavior> = { field1: 'DISABLED' };
      const result = evaluateEffects(effects, {}, behaviors);
      expect(result.field1).toBe('NORMAL');
    });

    it('disable sets DISABLED', () => {
      const effects: FormEffect[] = [
        {
          when: { field: 'x', operator: 'changed' },
          then: [{ field: 'field1', action: 'disable' }],
        },
      ];
      const result = evaluateEffects(effects, {}, baseBehaviors);
      expect(result.field1).toBe('DISABLED');
    });

    it('setValue does not change behavior', () => {
      const effects: FormEffect[] = [
        {
          when: { field: 'x', operator: 'changed' },
          then: [{ field: 'field1', action: 'setValue', value: 'newVal' }],
        },
      ];
      const result = evaluateEffects(effects, {}, baseBehaviors);
      expect(result.field1).toBe('NORMAL');
    });
  });

  describe('multiple effects', () => {
    it('later effects override earlier ones', () => {
      const effects: FormEffect[] = [
        {
          when: { field: 'x', operator: 'changed' },
          then: [{ field: 'field1', action: 'hide' }],
        },
        {
          when: { field: 'x', operator: 'changed' },
          then: [{ field: 'field1', action: 'show' }],
        },
      ];
      const result = evaluateEffects(effects, {}, baseBehaviors);
      expect(result.field1).toBe('NORMAL');
    });

    it('applies multiple actions from one effect', () => {
      const effects: FormEffect[] = [
        {
          when: { field: 'x', operator: 'changed' },
          then: [
            { field: 'field1', action: 'hide' },
            { field: 'field2', action: 'disable' },
          ],
        },
      ];
      const result = evaluateEffects(effects, {}, baseBehaviors);
      expect(result.field1).toBe('HIDDEN');
      expect(result.field2).toBe('DISABLED');
    });
  });
});

describe('effect helpers', () => {
  it('returns matching actions and ignores non-matching effects', () => {
    const effects: FormEffect[] = [
      {
        when: { field: 'status', operator: 'eq', value: 'active' },
        then: [{ target: 'name', action: 'setValue', value: 'Alice' }],
      },
      {
        when: { field: 'status', operator: 'eq', value: 'disabled' },
        then: [{ target: 'name', action: 'clearValue' }],
      },
    ];

    expect(evaluateEffectActions(effects, { status: 'active' })).toEqual([
      { target: 'name', action: 'setValue', value: 'Alice' },
    ]);
    expect(evaluateEffectActions(undefined, { status: 'active' })).toEqual([]);
  });

  it('evaluates field overrides from target and field actions', () => {
    const options = [{ label: 'A', value: 'a' }];
    const effects: FormEffect[] = [
      {
        when: { field: 'ready', operator: 'eq', value: true },
        then: [
          { target: 'name', action: 'setRequired', value: 1 },
          { field: 'status', action: 'setOptions', value: options },
          { field: 'emptyOptions', action: 'setOptions', value: 'bad-value' },
          { target: 'layout-1', targetType: 'layout', action: 'setRequired', value: true },
          { field: 'ignored', action: 'hide' },
        ],
      },
    ];

    expect(evaluateFieldOverrides(effects, { ready: true })).toEqual({
      name: { required: true },
      status: { options },
      emptyOptions: { options: [] },
    });
  });

  it('evaluates layout behaviors only for layout targets', () => {
    const effects: FormEffect[] = [
      {
        when: { field: 'mode', operator: 'eq', value: 'simple' },
        then: [
          { target: 'advanced-section', targetType: 'layout', action: 'hide' },
          { target: 'basic-section', targetType: 'layout', action: 'show' },
          { target: 'name', targetType: 'field', action: 'hide' },
          { field: 'legacyField', action: 'hide' },
          { target: 'noop-section', targetType: 'layout', action: 'disable' },
        ],
      },
    ];

    expect(evaluateLayoutBehaviors(effects, { mode: 'simple' })).toEqual({
      'advanced-section': 'HIDDEN',
      'basic-section': 'NORMAL',
    });
    expect(evaluateLayoutBehaviors(undefined, { mode: 'simple' })).toEqual({});
  });

  it('extracts setValue and clearValue actions for field targets', () => {
    const effects: FormEffect[] = [
      {
        when: { field: 'status', operator: 'changed' },
        then: [
          { field: 'name', action: 'setValue', value: 'Alice' },
          { target: 'description', action: 'clearValue' },
          { target: 'layout-1', targetType: 'layout', action: 'clearValue' },
          { target: 'ignored', action: 'hide' },
        ],
      },
    ];

    expect(getValueActions(effects, { status: 'anything' })).toEqual([
      { fieldId: 'name', action: 'setValue', value: 'Alice' },
      { fieldId: 'description', action: 'clearValue', value: undefined },
    ]);
  });

  it('applies behavior actions with target-based field actions and skips layout actions', () => {
    const effects: FormEffect[] = [
      {
        when: { field: 'ready', operator: 'changed' },
        then: [
          { target: 'name', action: 'disable' },
          { target: 'layout-1', targetType: 'layout', action: 'hide' },
          { target: 'status', action: 'unknown' as any },
        ],
      },
    ];

    expect(evaluateEffects(effects, {}, { name: 'NORMAL', status: 'NORMAL' })).toEqual({
      name: 'DISABLED',
      status: 'NORMAL',
    });
  });
});

describe('evaluateCondition edge cases', () => {
  it('supports all, any and not condition groups', () => {
    expect(
      evaluateCondition(
        {
          all: [
            { field: 'status', operator: 'eq', value: 'active' },
            {
              any: [
                { field: 'role', operator: 'eq', value: 'admin' },
                { field: 'role', operator: 'eq', value: 'owner' },
              ],
            },
            { not: { field: 'deleted', operator: 'eq', value: true } },
          ],
        },
        { status: 'active', role: 'owner', deleted: false },
      ),
    ).toBe(true);
  });

  it('normalizes option objects before equality and inclusion checks', () => {
    expect(
      evaluateCondition(
        { field: 'assignee', operator: 'eq', value: { label: 'Alice', value: 'u-1' } },
        { assignee: { label: 'Alice', value: 'u-1' } },
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { field: 'assignees', operator: 'in', value: ['u-1', 'u-2'] },
        { assignees: [{ label: 'Alice', value: 'u-1' }] },
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { field: 'tags', operator: 'contains', value: { label: 'Hot', value: 'hot' } },
        { tags: [{ label: 'Hot', value: 'hot' }] },
      ),
    ).toBe(true);
  });

  it('handles notIn, string contains, empty and notEmpty operators', () => {
    expect(
      evaluateCondition(
        { field: 'status', operator: 'notIn', value: ['closed'] },
        { status: 'open' },
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { field: 'title', operator: 'contains', value: 'low' },
        { title: 'sy-lowcode' },
      ),
    ).toBe(true);
    expect(evaluateCondition({ field: 'items', operator: 'empty' }, { items: [] })).toBe(true);
    expect(evaluateCondition({ field: 'items', operator: 'notEmpty' }, { items: ['x'] })).toBe(
      true,
    );
  });

  it('evaluates numeric and date ranges and rejects invalid ranges', () => {
    expect(
      evaluateCondition({ field: 'amount', operator: 'between', value: [1, 5] }, { amount: 3 }),
    ).toBe(true);
    expect(
      evaluateCondition(
        { field: 'date', operator: 'between', value: ['2024-01-01', '2024-12-31'] },
        { date: '2024-06-01' },
      ),
    ).toBe(true);
    expect(
      evaluateCondition({ field: 'amount', operator: 'between', value: [1] }, { amount: 3 }),
    ).toBe(false);
    expect(
      evaluateCondition(
        { field: 'date', operator: 'between', value: ['bad-date', '2024-12-31'] },
        { date: '2024-06-01' },
      ),
    ).toBe(false);
  });

  it('uses strict array equality and returns false for unknown operators', () => {
    expect(
      evaluateCondition({ field: 'tags', operator: 'eq', value: ['a', 'b'] }, { tags: ['a', 'b'] }),
    ).toBe(true);
    expect(
      evaluateCondition({ field: 'status', operator: 'unknown' as any }, { status: 'open' }),
    ).toBe(false);
  });
});
