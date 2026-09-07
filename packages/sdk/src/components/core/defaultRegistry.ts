import type React from 'react';
import { TextField } from '../fields/TextField';
import { NumberField } from '../fields/NumberField';
import { TextAreaField } from '../fields/TextAreaField';
import { SelectField } from '../fields/SelectField';
import { MultiSelectField } from '../fields/MultiSelectField';
import { RadioField } from '../fields/RadioField';
import { CheckboxField } from '../fields/CheckboxField';
import { DateField } from '../fields/DateField';
import { CascadeDateField } from '../fields/CascadeDateField';
import { AttachmentField } from '../fields/AttachmentField';
import { ImageField } from '../fields/ImageField';
import { SubFormField } from '../fields/SubFormField';
import { UserSelectField } from '../fields/UserSelectField';
import { DepartmentSelectField } from '../fields/DepartmentSelectField';
import { CascadeSelectField } from '../fields/CascadeSelectField';
import { AddressField } from '../fields/AddressField';
import { AssociationFormField } from '../fields/AssociationFormField';
import { EditorField } from '../fields/EditorField';
import { SerialNumberField } from '../fields/SerialNumberField';
import { LocationField } from '../fields/LocationField';
import { DigitalSignatureField } from '../fields/DigitalSignatureField';
import { JSONField } from '../fields/JSONField';

export const defaultComponentRegistry: Record<string, React.ComponentType<any>> = {
  TextField,
  NumberField,
  TextAreaField,
  SelectField,
  MultiSelectField,
  RadioField,
  CheckboxField,
  DateField,
  CascadeDateField,
  AttachmentField,
  ImageField,
  SubFormField,
  UserSelectField,
  EmployeeSelectField: UserSelectField,
  DepartmentSelectField,
  TextareaField: TextAreaField,
  CascadeSelectField,
  AddressField,
  AssociationFormField,
  EditorField,
  SerialNumberField,
  LocationField,
  DigitalSignatureField,
  JSONField,
};
