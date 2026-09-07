import { describe, expect, it } from 'vitest';
import { extractFormValues } from './formInstanceData';

describe('extractFormValues', () => {
  const fieldIds = ['customer_name', 'customer_phone', 'customer_email'];

  it('uses nested data when the API returns the legacy wrapped shape', () => {
    expect(
      extractFormValues(
        {
          formInstanceId: 'inst-1',
          data: {
            customer_name: '星云科技',
            customer_phone: '19900000000',
            ignored: 'ignored',
          },
        },
        fieldIds,
      ),
    ).toEqual({
      customer_name: '星云科技',
      customer_phone: '19900000000',
    });
  });

  it('extracts schema fields from the flattened API response shape', () => {
    expect(
      extractFormValues(
        {
          formInstanceId: '3195be99-1a0b-4746-9970-5bc4a9a9215b',
          createdByName: '平台管理员',
          instanceTitle: '平台管理员发起的客户信息登记',
          customer_name: 'ces',
          customer_phone: '19941327382',
          customer_email: 'ce',
        },
        fieldIds,
      ),
    ).toEqual({
      customer_name: 'ces',
      customer_phone: '19941327382',
      customer_email: 'ce',
    });
  });

  it('parses JSON form data fields', () => {
    expect(
      extractFormValues(
        {
          formInstanceId: 'inst-1',
          formDataJson: JSON.stringify({ customer_name: 'JSON 客户' }),
        },
        fieldIds,
      ),
    ).toEqual({ customer_name: 'JSON 客户' });
  });

  it('falls back to omitting known metadata keys when field ids are unavailable', () => {
    expect(
      extractFormValues({
        formInstanceId: 'inst-1',
        createdByName: '平台管理员',
        customer_name: 'ces',
      }),
    ).toEqual({ customer_name: 'ces' });
  });
});
