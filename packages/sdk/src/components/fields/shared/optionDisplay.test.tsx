import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderOptionLabel, renderReadonlyOptions, toAntdOptions } from './optionDisplay';

describe('optionDisplay', () => {
  it('renders colored option labels as tags when enabled', () => {
    render(<>{renderOptionLabel({ label: '紧急', value: 'urgent', color: '#ff4d4f' }, true)}</>);

    const tag = screen.getByText('紧急');
    expect(tag).toHaveClass('ant-tag');
    expect(tag).toHaveClass('sy-option-color-tag');
  });

  it('keeps plain labels when colored options are disabled', () => {
    expect(renderOptionLabel({ label: '普通', value: 'normal', color: '#1677ff' }, false)).toBe(
      '普通',
    );
  });

  it('maps antd options and readonly values with color metadata', () => {
    const options = [{ label: '高', value: 'high', color: '#faad14' }];

    expect(toAntdOptions(options, true)[0].value).toBe('high');
    render(<>{renderReadonlyOptions(options, true)}</>);
    expect(screen.getByText('高')).toHaveClass('sy-option-color-tag');
  });

  it('maps legacy light editor colors to antd preset tag colors', () => {
    render(<>{renderOptionLabel({ label: '默认蓝', value: 'blue', color: '#e0f0ff' }, true)}</>);

    expect(screen.getByText('默认蓝')).toHaveClass('ant-tag-blue');
  });

  it('supports status preset aliases', () => {
    render(
      <>{renderOptionLabel({ label: '进行中', value: 'running', color: 'processing' }, true)}</>,
    );

    expect(screen.getByText('进行中')).toHaveClass('ant-tag-blue');
  });
});
