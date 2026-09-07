import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  collectFormSnapshotFieldIds,
  validateFormFieldContracts,
} = require('../lib/form-field-contract');
const {
  satisfiedFormCodesFromContext,
} = require('../lib/cli');

const formUuid = 'FORM_HGY_TEST_PROJECT';
const snapshots = new Map([
  [
    formUuid,
    collectFormSnapshotFieldIds({
      form: {
        formFields: {
          projectName: { fieldId: 'projectName', label: '项目名称' },
        },
        schema: {
          type: 'object',
          properties: [
            { componentName: 'TextField', props: { fieldId: 'instrumentCode' } },
          ],
        },
      },
    }),
  ],
]);
const common = {
  kind: 'Function',
  code: 'portal_public_query',
  formCode: 'hgy_test_project',
  formUuid,
  api: 'queryAdvancedFormPage',
  file: 'src/resources/functions/portal-public-query.ts',
};
const result = validateFormFieldContracts(
  [
    { ...common, field: 'projectName', line: 20 },
    { ...common, field: 'instrumentCode', line: 21 },
    { ...common, field: 'modifiedTime', line: 22 },
    { ...common, field: 'testRunId', line: 23 },
  ],
  snapshots
);

assert.equal(result.contractVersion, 'form_field_contract_v1');
assert.equal(result.valid, false);
assert.equal(result.checkedForms, 1);
assert.equal(result.checkedReferences, 4);
assert.deepEqual(
  result.errors.map(item => [item.code, item.field]),
  [['FORM_FIELD_CONTRACT_FIELD_MISSING', 'testRunId']]
);
assert.match(result.errors[0].message, /portal_public_query/);
assert.match(result.errors[0].message, /hgy_test_project\.testRunId/);

const missingBinding = validateFormFieldContracts(
  [{ ...common, formUuid: null, field: 'projectName', line: 24 }],
  snapshots
);
assert.equal(missingBinding.valid, false);
assert.equal(
  missingBinding.errors[0].code,
  'FORM_FIELD_CONTRACT_BINDING_MISSING'
);

const satisfiedFormCodes = satisfiedFormCodesFromContext({
  satisfiedSelectors: [
    'form:hgy_instrument_reservation_rule',
    'form:hgy_reservation_order',
    'form:hgy_instrument_reservation_rule',
    'function:not-a-form',
    'form:invalid selector',
  ],
});
assert.deepEqual(
  Array.from(satisfiedFormCodes).sort(),
  ['hgy_instrument_reservation_rule', 'hgy_reservation_order'],
  'only exact form noop selectors from the current staged context may use the active frozen schema'
);

console.log('form field contract smoke passed');
