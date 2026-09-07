import React from 'react';

type StageResult = React.ReactNode | (() => StageResult);

function processNext(next: StageResult): React.ReactNode {
  if (typeof next === 'function') {
    return <Stage stage={next} />;
  }
  return next;
}

function Stage({ stage }: { stage: () => StageResult }) {
  return processNext(stage());
}

export function staged<Props, Ref = unknown>(
  stage: (props: Props, ref: React.ForwardedRef<Ref>) => StageResult,
) {
  return function Staged(props: Props, ref: React.ForwardedRef<Ref>) {
    return processNext(stage(props, ref));
  };
}
