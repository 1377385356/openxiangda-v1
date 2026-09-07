import React from 'react';

export function SubFormColumnLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <>
      {required ? (
        <span className="sy-field-required" aria-hidden="true">
          *
        </span>
      ) : null}
      {label}
    </>
  );
}
