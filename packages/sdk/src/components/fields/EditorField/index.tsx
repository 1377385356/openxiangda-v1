import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Extension, type Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Color from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import Highlight from '@tiptap/extension-highlight';
import CharacterCount from '@tiptap/extension-character-count';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { common, createLowlight } from 'lowlight';
import { Button, Input, InputNumber, Modal, Select, Space, Tooltip } from 'antd';
import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  BoldOutlined,
  ClearOutlined,
  CodeOutlined,
  HighlightOutlined,
  ItalicOutlined,
  LinkOutlined,
  OrderedListOutlined,
  PictureOutlined,
  RedoOutlined,
  StrikethroughOutlined,
  TableOutlined,
  UnderlineOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import type {
  EditorChoiceOption,
  EditorFieldProps,
  EditorToolbarAction,
  FormRuntimeApi,
} from '../../types';
import { FieldWrapper } from '../../core/FieldWrapper';
import { useFormContext } from '../../core/FormContext';
import { useDeviceDetect } from '../../hooks/useDeviceDetect';
import { normalizeRichTextHtml } from '../../utils/richText';

const lowlight = createLowlight(common);

const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
});

const DEFAULT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

const DEFAULT_FONT_FAMILIES: EditorChoiceOption[] = [
  { label: '默认字体', value: '' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: '宋体', value: 'SimSun, serif' },
  { label: '微软雅黑', value: 'Microsoft YaHei, sans-serif' },
  { label: '等宽字体', value: 'Menlo, Consolas, monospace' },
];

const DEFAULT_FONT_SIZES: EditorChoiceOption[] = [
  { label: '12px', value: '12px' },
  { label: '14px', value: '14px' },
  { label: '16px', value: '16px' },
  { label: '18px', value: '18px' },
  { label: '24px', value: '24px' },
  { label: '32px', value: '32px' },
];

const DEFAULT_COLOR_PRESETS = [
  '#111827',
  '#6b7280',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#1677ff',
  '#8b5cf6',
];

const TOOLBAR_PRESETS: Record<'minimal' | 'basic' | 'full', EditorToolbarAction[]> = {
  minimal: ['bold', 'italic', 'link', 'bulletList', 'orderedList', 'undo', 'redo'],
  basic: [
    'undo',
    'redo',
    'heading',
    'bold',
    'italic',
    'underline',
    'strike',
    'bulletList',
    'orderedList',
    'link',
    'image',
  ],
  full: [
    'undo',
    'redo',
    'heading',
    'fontFamily',
    'fontSize',
    'bold',
    'italic',
    'underline',
    'strike',
    'superscript',
    'subscript',
    'color',
    'highlight',
    'bulletList',
    'orderedList',
    'taskList',
    'blockquote',
    'codeBlock',
    'alignLeft',
    'alignCenter',
    'alignRight',
    'link',
    'image',
    'imageUrl',
    'table',
    'addColumnBefore',
    'addColumnAfter',
    'deleteColumn',
    'addRowBefore',
    'addRowAfter',
    'deleteRow',
    'toggleHeaderRow',
    'deleteTable',
    'clear',
  ],
};

const KNOWN_ACTIONS = new Set<EditorToolbarAction>(TOOLBAR_PRESETS.full);

const normalizeToolbarConfig = (
  config?: EditorFieldProps['toolbarConfig'],
): EditorToolbarAction[] => {
  if (Array.isArray(config)) {
    return (config as string[]).filter((item): item is EditorToolbarAction =>
      KNOWN_ACTIONS.has(item as EditorToolbarAction),
    );
  }
  if (config === 'minimal' || config === 'basic' || config === 'full') {
    return TOOLBAR_PRESETS[config];
  }
  return TOOLBAR_PRESETS.full;
};

const countCharacters = (editor: Editor) => {
  const characters = (editor.storage as any)?.characterCount?.characters;
  return typeof characters === 'function' ? characters() : editor.getText().length;
};

const getImageUrl = async (
  api: Partial<FormRuntimeApi> | undefined,
  file: File,
  bucketName: string,
) => {
  if (typeof api?.uploadFile !== 'function') {
    throw new Error('当前环境不支持图片上传');
  }
  const uploaded = await api.uploadFile(file, bucketName);
  if (uploaded.previewUrl || uploaded.url) return uploaded.previewUrl || uploaded.url;
  if (uploaded.bucketName && uploaded.objectName) {
    if (typeof api.createFileAccessTicket !== 'function') {
      throw new Error('当前环境不支持图片预览');
    }
    const ticket = await api.createFileAccessTicket(
      uploaded.bucketName,
      uploaded.objectName,
      uploaded.name,
      'preview',
    );
    return typeof ticket === 'string'
      ? ticket
      : ticket?.previewUrl || ticket?.url || ticket?.downloadUrl || '';
  }
  return '';
};

const isImageAllowed = (file: File, allowedTypes: string[]) => {
  if (!allowedTypes.length) return true;
  const lowerName = file.name.toLowerCase();
  return allowedTypes.some((type) => {
    const normalized = type.toLowerCase();
    if (normalized.startsWith('.')) return lowerName.endsWith(normalized);
    return file.type.toLowerCase() === normalized;
  });
};

const isSupportedUrl = (value: string, allowImageData = false) => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(trimmed)) return true;
  return allowImageData && /^(data:image\/|blob:)/i.test(trimmed);
};

function ToolbarButton({
  active,
  disabled,
  icon,
  label,
  text,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  label: string;
  text?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Tooltip title={label}>
      <Button
        size="small"
        type={active ? 'primary' : 'default'}
        icon={icon}
        disabled={disabled}
        aria-label={label}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
      >
        {text}
      </Button>
    </Tooltip>
  );
}

function EditorToolbar({
  editor,
  actions,
  disabled,
  fontFamilies,
  fontSizes,
  colorPresets,
  onPickImage,
  onOpenImageUrl,
  onOpenLink,
  onOpenTable,
}: {
  editor: Editor | null;
  actions: EditorToolbarAction[];
  disabled?: boolean;
  fontFamilies: EditorChoiceOption[];
  fontSizes: EditorChoiceOption[];
  colorPresets: string[];
  onPickImage: () => void;
  onOpenImageUrl: () => void;
  onOpenLink: () => void;
  onOpenTable: () => void;
}) {
  if (!editor || actions.length === 0) return null;

  const has = (action: EditorToolbarAction) => actions.includes(action);
  const can = (editor as any).can?.();
  const canUndo = typeof can?.undo === 'function' ? can.undo() : true;
  const canRedo = typeof can?.redo === 'function' ? can.redo() : true;
  const textStyle = editor.getAttributes('textStyle');
  const linkActive = editor.isActive('link');
  const tableActive = editor.isActive('table');
  const blockValue = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
      ? 'h2'
      : editor.isActive('heading', { level: 3 })
        ? 'h3'
        : editor.isActive('codeBlock')
          ? 'codeBlock'
          : 'p';

  return (
    <div className="sy-editor-toolbar" role="toolbar" aria-label="编辑器工具栏">
      {(has('undo') || has('redo')) && (
        <div className="sy-editor-toolbar-group">
          {has('undo') && (
            <ToolbarButton
              label="撤销"
              icon={<UndoOutlined />}
              disabled={disabled || !canUndo}
              onClick={() => editor.chain().focus().undo().run()}
            />
          )}
          {has('redo') && (
            <ToolbarButton
              label="重做"
              icon={<RedoOutlined />}
              disabled={disabled || !canRedo}
              onClick={() => editor.chain().focus().redo().run()}
            />
          )}
        </div>
      )}

      {(has('heading') || has('fontFamily') || has('fontSize')) && (
        <div className="sy-editor-toolbar-group">
          {has('heading') && (
            <Select
              className="sy-editor-toolbar-select"
              size="small"
              value={blockValue}
              disabled={disabled}
              style={{ width: 104 }}
              options={[
                { label: '正文', value: 'p' },
                { label: '标题 1', value: 'h1' },
                { label: '标题 2', value: 'h2' },
                { label: '标题 3', value: 'h3' },
                { label: '代码块', value: 'codeBlock' },
              ]}
              onChange={(value) => {
                if (value === 'p') editor.chain().focus().setParagraph().run();
                if (value === 'h1') editor.chain().focus().toggleHeading({ level: 1 }).run();
                if (value === 'h2') editor.chain().focus().toggleHeading({ level: 2 }).run();
                if (value === 'h3') editor.chain().focus().toggleHeading({ level: 3 }).run();
                if (value === 'codeBlock') editor.chain().focus().toggleCodeBlock().run();
              }}
            />
          )}
          {has('fontFamily') && (
            <Select
              className="sy-editor-toolbar-select"
              size="small"
              value={textStyle.fontFamily || ''}
              disabled={disabled}
              style={{ width: 126 }}
              options={fontFamilies}
              onChange={(value) => {
                if (value) editor.chain().focus().setFontFamily(value).run();
                else editor.chain().focus().unsetFontFamily().run();
              }}
            />
          )}
          {has('fontSize') && (
            <Select
              className="sy-editor-toolbar-select"
              size="small"
              value={textStyle.fontSize || undefined}
              placeholder="字号"
              disabled={disabled}
              style={{ width: 86 }}
              options={fontSizes}
              onChange={(value) =>
                editor.chain().focus().setMark('textStyle', { fontSize: value }).run()
              }
            />
          )}
        </div>
      )}

      {(has('bold') ||
        has('italic') ||
        has('underline') ||
        has('strike') ||
        has('superscript') ||
        has('subscript')) && (
        <div className="sy-editor-toolbar-group">
          {has('bold') && (
            <ToolbarButton
              label="加粗"
              icon={<BoldOutlined />}
              disabled={disabled}
              active={editor.isActive('bold')}
              onClick={() => editor.chain().focus().toggleBold().run()}
            />
          )}
          {has('italic') && (
            <ToolbarButton
              label="斜体"
              icon={<ItalicOutlined />}
              disabled={disabled}
              active={editor.isActive('italic')}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            />
          )}
          {has('underline') && (
            <ToolbarButton
              label="下划线"
              icon={<UnderlineOutlined />}
              disabled={disabled}
              active={editor.isActive('underline')}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            />
          )}
          {has('strike') && (
            <ToolbarButton
              label="删除线"
              icon={<StrikethroughOutlined />}
              disabled={disabled}
              active={editor.isActive('strike')}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            />
          )}
          {has('superscript') && (
            <ToolbarButton
              label="上标"
              text="x²"
              disabled={disabled}
              active={editor.isActive('superscript')}
              onClick={() => editor.chain().focus().toggleSuperscript().run()}
            />
          )}
          {has('subscript') && (
            <ToolbarButton
              label="下标"
              text="x₂"
              disabled={disabled}
              active={editor.isActive('subscript')}
              onClick={() => editor.chain().focus().toggleSubscript().run()}
            />
          )}
        </div>
      )}

      {(has('color') || has('highlight')) && (
        <div className="sy-editor-toolbar-group">
          {has('color') && (
            <>
              <Tooltip title="文字颜色">
                <input
                  type="color"
                  className="sy-editor-color"
                  title="文字颜色"
                  disabled={disabled}
                  value={textStyle.color || '#111827'}
                  onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}
                />
              </Tooltip>
              <Space.Compact size="small" className="sy-editor-color-presets">
                {colorPresets.slice(0, 8).map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="sy-editor-swatch"
                    style={{ backgroundColor: color }}
                    disabled={disabled}
                    title={color}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => editor.chain().focus().setColor(color).run()}
                  />
                ))}
              </Space.Compact>
            </>
          )}
          {has('highlight') && (
            <ToolbarButton
              label="高亮"
              icon={<HighlightOutlined />}
              disabled={disabled}
              active={editor.isActive('highlight')}
              onClick={() => editor.chain().focus().toggleHighlight({ color: '#fff3bf' }).run()}
            />
          )}
        </div>
      )}

      {(has('bulletList') ||
        has('orderedList') ||
        has('taskList') ||
        has('blockquote') ||
        has('codeBlock')) && (
        <div className="sy-editor-toolbar-group">
          {has('bulletList') && (
            <ToolbarButton
              label="无序列表"
              icon={<UnorderedListOutlined />}
              disabled={disabled}
              active={editor.isActive('bulletList')}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            />
          )}
          {has('orderedList') && (
            <ToolbarButton
              label="有序列表"
              icon={<OrderedListOutlined />}
              disabled={disabled}
              active={editor.isActive('orderedList')}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            />
          )}
          {has('taskList') && (
            <ToolbarButton
              label="任务列表"
              text="任务"
              disabled={disabled}
              active={editor.isActive('taskList')}
              onClick={() => editor.chain().focus().toggleTaskList().run()}
            />
          )}
          {has('blockquote') && (
            <ToolbarButton
              label="引用"
              text="引用"
              disabled={disabled}
              active={editor.isActive('blockquote')}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            />
          )}
          {has('codeBlock') && (
            <ToolbarButton
              label="代码块"
              icon={<CodeOutlined />}
              disabled={disabled}
              active={editor.isActive('codeBlock')}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            />
          )}
        </div>
      )}

      {(has('alignLeft') || has('alignCenter') || has('alignRight')) && (
        <div className="sy-editor-toolbar-group">
          {has('alignLeft') && (
            <ToolbarButton
              label="左对齐"
              icon={<AlignLeftOutlined />}
              disabled={disabled}
              active={editor.isActive({ textAlign: 'left' })}
              onClick={() => editor.chain().focus().setTextAlign('left').run()}
            />
          )}
          {has('alignCenter') && (
            <ToolbarButton
              label="居中"
              icon={<AlignCenterOutlined />}
              disabled={disabled}
              active={editor.isActive({ textAlign: 'center' })}
              onClick={() => editor.chain().focus().setTextAlign('center').run()}
            />
          )}
          {has('alignRight') && (
            <ToolbarButton
              label="右对齐"
              icon={<AlignRightOutlined />}
              disabled={disabled}
              active={editor.isActive({ textAlign: 'right' })}
              onClick={() => editor.chain().focus().setTextAlign('right').run()}
            />
          )}
        </div>
      )}

      {(has('link') || has('image') || has('imageUrl')) && (
        <div className="sy-editor-toolbar-group">
          {has('link') && (
            <ToolbarButton
              label={linkActive ? '编辑链接' : '插入链接'}
              icon={<LinkOutlined />}
              disabled={disabled}
              active={linkActive}
              onClick={onOpenLink}
            />
          )}
          {has('image') && (
            <ToolbarButton
              label="上传图片"
              icon={<PictureOutlined />}
              disabled={disabled}
              onClick={onPickImage}
            />
          )}
          {has('imageUrl') && (
            <ToolbarButton
              label="插入图片 URL"
              text="URL"
              disabled={disabled}
              onClick={onOpenImageUrl}
            />
          )}
        </div>
      )}

      {(has('table') ||
        has('addColumnBefore') ||
        has('addColumnAfter') ||
        has('deleteColumn') ||
        has('addRowBefore') ||
        has('addRowAfter') ||
        has('deleteRow') ||
        has('toggleHeaderRow') ||
        has('deleteTable')) && (
        <div className="sy-editor-toolbar-group">
          {has('table') && (
            <ToolbarButton
              label="插入表格"
              icon={<TableOutlined />}
              disabled={disabled}
              active={tableActive}
              onClick={onOpenTable}
            />
          )}
          {has('addColumnBefore') && (
            <ToolbarButton
              label="左侧加列"
              text="左列"
              disabled={disabled || !tableActive}
              onClick={() => editor.chain().focus().addColumnBefore().run()}
            />
          )}
          {has('addColumnAfter') && (
            <ToolbarButton
              label="右侧加列"
              text="右列"
              disabled={disabled || !tableActive}
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            />
          )}
          {has('deleteColumn') && (
            <ToolbarButton
              label="删除列"
              text="删列"
              disabled={disabled || !tableActive}
              onClick={() => editor.chain().focus().deleteColumn().run()}
            />
          )}
          {has('addRowBefore') && (
            <ToolbarButton
              label="上方加行"
              text="上行"
              disabled={disabled || !tableActive}
              onClick={() => editor.chain().focus().addRowBefore().run()}
            />
          )}
          {has('addRowAfter') && (
            <ToolbarButton
              label="下方加行"
              text="下行"
              disabled={disabled || !tableActive}
              onClick={() => editor.chain().focus().addRowAfter().run()}
            />
          )}
          {has('deleteRow') && (
            <ToolbarButton
              label="删除行"
              text="删行"
              disabled={disabled || !tableActive}
              onClick={() => editor.chain().focus().deleteRow().run()}
            />
          )}
          {has('toggleHeaderRow') && (
            <ToolbarButton
              label="切换表头"
              text="表头"
              disabled={disabled || !tableActive}
              onClick={() => editor.chain().focus().toggleHeaderRow().run()}
            />
          )}
          {has('deleteTable') && (
            <ToolbarButton
              label="删除表格"
              text="删表"
              disabled={disabled || !tableActive}
              onClick={() => editor.chain().focus().deleteTable().run()}
            />
          )}
        </div>
      )}

      {has('clear') && (
        <div className="sy-editor-toolbar-group">
          <ToolbarButton
            label="清除格式"
            icon={<ClearOutlined />}
            disabled={disabled}
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          />
        </div>
      )}
    </div>
  );
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const isEditorDestroyed = (editor: Editor | null) => Boolean((editor as any)?.isDestroyed);

const getSafeEditorHtml = (editor: Editor) => {
  if (isEditorDestroyed(editor)) return '';
  try {
    return editor.isEmpty ? '' : editor.getHTML();
  } catch {
    const text = editor.getText?.() || '';
    return text ? `<p>${escapeHtml(text)}</p>` : '';
  }
};

export interface RichTextEditorCoreProps {
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  height?: number | string;
  toolbarConfig?: EditorFieldProps['toolbarConfig'];
  uploadBucketName?: string;
  maxImageSize?: number;
  allowedImageTypes?: string[];
  fontFamilies?: EditorChoiceOption[];
  fontSizes?: EditorChoiceOption[];
  colorPresets?: string[];
  api?: Partial<FormRuntimeApi>;
  inputClassName?: string;
  fieldId?: string;
  mobile?: boolean;
}

export function RichTextEditorCore({
  value = '',
  onChange,
  disabled,
  inputClassName,
  placeholder,
  rows = 8,
  maxLength,
  height,
  toolbarConfig,
  uploadBucketName = 'images',
  maxImageSize = 10,
  allowedImageTypes = DEFAULT_IMAGE_TYPES,
  fontFamilies = DEFAULT_FONT_FAMILIES,
  fontSizes = DEFAULT_FONT_SIZES,
  colorPresets = DEFAULT_COLOR_PRESETS,
  api,
  fieldId = 'richText',
  mobile = false,
}: RichTextEditorCoreProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [charCount, setCharCount] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const [imageUrlOpen, setImageUrlOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [imageTitle, setImageTitle] = useState('');
  const [imageUrlError, setImageUrlError] = useState('');
  const [tableOpen, setTableOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const actions = useMemo(() => normalizeToolbarConfig(toolbarConfig), [toolbarConfig]);
  const visibleActions = mobile ? [] : actions;
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        link: false,
        underline: false,
      }),
      Underline,
      Superscript,
      Subscript,
      TextStyle,
      FontFamily.configure({ types: ['textStyle'] }),
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Placeholder.configure({ placeholder: placeholder || '请输入内容' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({
        allowBase64: false,
        HTMLAttributes: { class: 'sy-editor-image' },
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      CharacterCount.configure(maxLength ? { limit: maxLength } : {}),
      CodeBlockLowlight.configure({ lowlight }),
    ],
    [maxLength, placeholder],
  );

  const updateHtml = useCallback((next: string) => {
    onChangeRef.current?.(next);
  }, []);

  const editor = useEditor(
    {
      extensions,
      content: value || '',
      editable: !disabled,
      parseOptions: {
        preserveWhitespace: 'full',
      },
      onUpdate: ({ editor: currentEditor }) => {
        if (isEditorDestroyed(currentEditor)) return;
        const nextCharCount = countCharacters(currentEditor);
        setCharCount(nextCharCount);
        if (maxLength && nextCharCount > maxLength) {
          currentEditor.commands.undo();
          return;
        }
        updateHtml(getSafeEditorHtml(currentEditor));
      },
      editorProps: {
        attributes: {
          class: 'sy-editor-prose',
          'data-testid': `editorfield-input-${fieldId}`,
        },
      },
    },
    [fieldId, extensions, disabled, maxLength, updateHtml],
  );

  useEffect(() => {
    if (!editor || isEditorDestroyed(editor)) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || isEditorDestroyed(editor)) return;
    const currentHtml = getSafeEditorHtml(editor);
    if ((value || '') !== currentHtml) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
    setCharCount(countCharacters(editor));
  }, [editor, value]);

  const insertImageFiles = useCallback(
    async (files: File[]) => {
      if (!editor || isEditorDestroyed(editor) || disabled || files.length === 0) return;
      const validFiles = files.filter((file) => {
        if (!isImageAllowed(file, allowedImageTypes)) return false;
        if (maxImageSize && file.size > maxImageSize * 1024 * 1024) return false;
        return true;
      });
      if (validFiles.length !== files.length) {
        setUploadError(`图片仅支持 ${allowedImageTypes.join(', ')}，且不能超过 ${maxImageSize}MB`);
      } else {
        setUploadError('');
      }
      if (!validFiles.length) return;
      setUploading(true);
      try {
        for (const file of validFiles) {
          const url = await getImageUrl(api, file, uploadBucketName);
          if (url) {
            editor.chain().focus().setImage({ src: url, alt: file.name, title: file.name }).run();
          }
        }
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : '图片上传失败');
      } finally {
        setUploading(false);
      }
    },
    [allowedImageTypes, api, disabled, editor, maxImageSize, uploadBucketName],
  );

  const openLinkModal = useCallback(() => {
    if (!editor || isEditorDestroyed(editor)) return;
    setLinkUrl(editor.getAttributes('link').href || '');
    setLinkError('');
    setLinkOpen(true);
  }, [editor]);

  const confirmLink = () => {
    if (!editor || isEditorDestroyed(editor)) return;
    const nextUrl = linkUrl.trim();
    if (!nextUrl) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setLinkOpen(false);
      return;
    }
    if (!isSupportedUrl(nextUrl)) {
      setLinkError('请输入 http(s)、mailto、tel、/ 或 # 开头的链接');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: nextUrl }).run();
    setLinkOpen(false);
  };

  const removeLink = () => {
    if (!editor || isEditorDestroyed(editor)) return;
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkOpen(false);
  };

  const openImageUrlModal = useCallback(() => {
    setImageUrl('');
    setImageAlt('');
    setImageTitle('');
    setImageUrlError('');
    setImageUrlOpen(true);
  }, []);

  const confirmImageUrl = () => {
    if (!editor || isEditorDestroyed(editor)) return;
    const src = imageUrl.trim();
    if (!isSupportedUrl(src, true)) {
      setImageUrlError('请输入有效图片地址');
      return;
    }
    editor
      .chain()
      .focus()
      .setImage({ src, alt: imageAlt.trim() || undefined, title: imageTitle.trim() || undefined })
      .run();
    setImageUrlOpen(false);
  };

  const confirmTable = () => {
    if (!editor || isEditorDestroyed(editor)) return;
    editor
      .chain()
      .focus()
      .insertTable({
        rows: Math.max(1, tableRows),
        cols: Math.max(1, tableCols),
        withHeaderRow: true,
      })
      .run();
    setTableOpen(false);
  };

  const minHeight =
    typeof height === 'number'
      ? height
      : typeof height === 'string'
        ? height
        : Math.max(160, rows * 32);
  const showFooter = !mobile || uploading || !!uploadError;

  return (
    <>
      <div className={inputClassName} data-testid={`editorfield-shell-${fieldId}`}>
        <div className={`sy-editor ${disabled ? 'is-disabled' : ''} ${mobile ? 'is-mobile' : ''}`}>
          <EditorToolbar
            editor={editor}
            actions={visibleActions}
            disabled={disabled || uploading}
            fontFamilies={fontFamilies}
            fontSizes={fontSizes}
            colorPresets={colorPresets}
            onPickImage={() => inputRef.current?.click()}
            onOpenImageUrl={openImageUrlModal}
            onOpenLink={openLinkModal}
            onOpenTable={() => setTableOpen(true)}
          />
          <div
            className="sy-editor-body"
            style={{ minHeight }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                event.preventDefault();
                if (!isEditorDestroyed(editor)) {
                  editor?.chain().focus('end').run();
                }
              }
            }}
            onPasteCapture={(event) => {
              const files = Array.from(event.clipboardData?.files || []).filter((file) =>
                file.type.startsWith('image/'),
              );
              if (files.length) {
                event.preventDefault();
                void insertImageFiles(files);
              }
            }}
            onDropCapture={(event) => {
              const files = Array.from(event.dataTransfer?.files || []).filter((file) =>
                file.type.startsWith('image/'),
              );
              if (files.length) {
                event.preventDefault();
                void insertImageFiles(files);
              }
            }}
          >
            <EditorContent editor={editor} />
          </div>
          <input
            ref={inputRef}
            className="sy-editor-file-input"
            data-testid={`editorfield-file-input-${fieldId}`}
            type="file"
            accept={allowedImageTypes.join(',')}
            aria-hidden="true"
            hidden
            multiple
            tabIndex={-1}
            style={{ display: 'none' }}
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = '';
              void insertImageFiles(files);
            }}
          />
        </div>
        {showFooter && (
          <div className="sy-editor-footer">
            <span className={uploadError ? 'sy-editor-footer-error' : undefined}>
              {uploading ? '图片上传中...' : uploadError}
            </span>
            {!mobile && (
              <span>
                {charCount}
                {maxLength ? `/${maxLength}` : ' 字'}
              </span>
            )}
          </div>
        )}
      </div>

      <Modal
        title="编辑链接"
        open={linkOpen}
        onCancel={() => setLinkOpen(false)}
        onOk={confirmLink}
        footer={
          <Space>
            <Button onClick={() => setLinkOpen(false)}>取消</Button>
            <Button danger disabled={!editor?.isActive('link')} onClick={removeLink}>
              移除链接
            </Button>
            <Button type="primary" onClick={confirmLink}>
              确定
            </Button>
          </Space>
        }
      >
        <Input
          autoFocus
          placeholder="https://example.com"
          value={linkUrl}
          status={linkError ? 'error' : undefined}
          onChange={(event) => {
            setLinkUrl(event.target.value);
            setLinkError('');
          }}
          onPressEnter={confirmLink}
        />
        {linkError && <div className="sy-field-error">{linkError}</div>}
      </Modal>

      <Modal
        title="插入图片 URL"
        open={imageUrlOpen}
        onCancel={() => setImageUrlOpen(false)}
        onOk={confirmImageUrl}
        okText="插入"
      >
        <div className="sy-editor-modal-form">
          <Input
            autoFocus
            placeholder="https://example.com/image.png"
            value={imageUrl}
            status={imageUrlError ? 'error' : undefined}
            onChange={(event) => {
              setImageUrl(event.target.value);
              setImageUrlError('');
            }}
          />
          <Input
            placeholder="Alt 文本"
            value={imageAlt}
            onChange={(event) => setImageAlt(event.target.value)}
          />
          <Input
            placeholder="Title"
            value={imageTitle}
            onChange={(event) => setImageTitle(event.target.value)}
          />
          {imageUrlError && <div className="sy-field-error">{imageUrlError}</div>}
        </div>
      </Modal>

      <Modal
        title="插入表格"
        open={tableOpen}
        onCancel={() => setTableOpen(false)}
        onOk={confirmTable}
        okText="插入"
      >
        <div className="sy-editor-modal-form sy-editor-table-size">
          <label>
            行数
            <InputNumber
              min={1}
              max={20}
              value={tableRows}
              onChange={(value) => setTableRows(value || 1)}
            />
          </label>
          <label>
            列数
            <InputNumber
              min={1}
              max={12}
              value={tableCols}
              onChange={(value) => setTableCols(value || 1)}
            />
          </label>
        </div>
      </Modal>
    </>
  );
}

export function EditorField(props: EditorFieldProps) {
  const {
    fieldId,
    label,
    behavior: propBehavior,
    required,
    tips,
    className,
    labelClassName,
    tipsClassName,
    inputClassName,
    placeholder,
    defaultValue,
    rows,
    maxLength,
    height,
    toolbarConfig,
    uploadBucketName,
    maxImageSize,
    allowedImageTypes,
    fontFamilies,
    fontSizes,
    colorPresets,
    onChange,
  } = props;
  const { formData, fieldBehaviors, setFieldValue, registerField, unregisterField, api } =
    useFormContext();
  const { isMobile } = useDeviceDetect();
  const behavior = propBehavior ?? fieldBehaviors[fieldId] ?? 'NORMAL';
  const rawValue = (formData[fieldId] as string | undefined) ?? '';
  const value = normalizeRichTextHtml(rawValue);

  useEffect(() => {
    registerField(fieldId);
    if (defaultValue !== undefined && formData[fieldId] === undefined) {
      setFieldValue(fieldId, normalizeRichTextHtml(defaultValue));
    }
    return () => unregisterField(fieldId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldId]);

  useEffect(() => {
    if (rawValue && rawValue !== value) {
      setFieldValue(fieldId, value);
    }
  }, [fieldId, rawValue, setFieldValue, value]);

  const updateHtml = useCallback(
    (next: string) => {
      setFieldValue(fieldId, next);
      onChange?.(next);
    },
    [fieldId, onChange, setFieldValue],
  );

  if (behavior === 'HIDDEN') return null;

  return (
    <FieldWrapper
      fieldId={fieldId}
      label={label}
      required={required}
      tips={tips}
      className={className}
      labelClassName={labelClassName}
      tipsClassName={tipsClassName}
    >
      {behavior === 'READONLY' ? (
        <div
          className="sy-field-readonly-value sy-editor-readonly"
          data-testid={`editorfield-readonly-${fieldId}`}
          dangerouslySetInnerHTML={{ __html: value || '--' }}
        />
      ) : (
        <RichTextEditorCore
          fieldId={fieldId}
          value={value}
          onChange={updateHtml}
          disabled={behavior === 'DISABLED'}
          inputClassName={inputClassName}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          height={height}
          toolbarConfig={toolbarConfig}
          uploadBucketName={uploadBucketName}
          maxImageSize={maxImageSize}
          allowedImageTypes={allowedImageTypes}
          fontFamilies={fontFamilies}
          fontSizes={fontSizes}
          colorPresets={colorPresets}
          api={api}
          mobile={isMobile}
        />
      )}
    </FieldWrapper>
  );
}
