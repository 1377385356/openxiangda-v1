import React, { useState } from 'react';

export interface FormStepItem {
  key: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export interface FormStepsProps {
  items: FormStepItem[];
  className?: string;
  onStepChange?: (step: number) => void;
}

export function FormSteps({ items, className, onStepChange }: FormStepsProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const goTo = (step: number) => {
    setCurrentStep(step);
    onStepChange?.(step);
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      goTo(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (currentStep < items.length - 1) {
      goTo(currentStep + 1);
    }
  };

  return (
    <div className={className ?? 'w-full'} data-testid="form-steps">
      {/* Step indicator */}
      <div className="flex items-center mb-6" data-testid="form-steps-indicator">
        {items.map((item, index) => (
          <React.Fragment key={item.key}>
            <div className="flex items-center">
              <div
                className={
                  index === currentStep
                    ? 'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium bg-blue-600 text-white'
                    : index < currentStep
                      ? 'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium bg-green-500 text-white'
                      : 'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium bg-gray-200 text-gray-600'
                }
                data-testid={`form-step-circle-${index}`}
              >
                {index + 1}
              </div>
              <div className="ml-2 hidden sm:block">
                <div className="text-sm font-medium text-gray-900">{item.title}</div>
                {item.description && (
                  <div className="text-xs text-gray-500">{item.description}</div>
                )}
              </div>
            </div>
            {index < items.length - 1 && (
              <div
                className={
                  index < currentStep
                    ? 'flex-1 h-0.5 mx-4 bg-green-500'
                    : 'flex-1 h-0.5 mx-4 bg-gray-200'
                }
                data-testid={`form-step-connector-${index}`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Content */}
      <div data-testid="form-steps-content">{items[currentStep]?.children}</div>

      {/* Navigation buttons */}
      <div className="flex justify-between mt-6" data-testid="form-steps-actions">
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentStep === 0}
          className={
            currentStep === 0
              ? 'px-4 py-2 text-sm font-medium text-gray-400 bg-gray-100 rounded cursor-not-allowed'
              : 'px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50'
          }
          data-testid="form-steps-prev"
        >
          上一步
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={currentStep === items.length - 1}
          className={
            currentStep === items.length - 1
              ? 'px-4 py-2 text-sm font-medium text-gray-400 bg-gray-100 rounded cursor-not-allowed'
              : 'px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700'
          }
          data-testid="form-steps-next"
        >
          下一步
        </button>
      </div>
    </div>
  );
}
