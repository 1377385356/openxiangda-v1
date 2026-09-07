import type { ThemeConfig } from 'antd';

const baseTheme = {
  hashed: false,
  token: {
    colorPrimary: '#1677ff',
    colorInfo: '#1677ff',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
    colorText: 'rgba(0,0,0,0.88)',
    colorTextSecondary: 'rgba(0,0,0,0.65)',
    colorTextTertiary: 'rgba(0,0,0,0.45)',
    colorTextDisabled: 'rgba(0,0,0,0.25)',
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f5f5f5',
    colorBgElevated: '#ffffff',
    colorBorder: '#d9d9d9',
    colorBorderSecondary: '#f0f0f0',
    borderRadius: 6,
    borderRadiusSM: 4,
    borderRadiusLG: 8,
    fontSize: 14,
    controlHeight: 32,
  },
  components: {
    Form: { itemMarginBottom: 16 },
    Card: { paddingLG: 24 },
  },
} satisfies ThemeConfig;

export const antdTheme: ThemeConfig = {
  ...baseTheme,
  cssVar: { prefix: 'ant' },
};

export const legacyAntdTheme: ThemeConfig = {
  ...baseTheme,
  cssVar: { prefix: 'sy-ant' },
};

export default antdTheme;
