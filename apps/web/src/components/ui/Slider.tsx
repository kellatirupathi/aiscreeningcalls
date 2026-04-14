interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange?: (value: number) => void;
  ariaLabel?: string;
}

export function Slider({ value, min = 0, max = 100, step = 1, disabled, onChange, ariaLabel }: SliderProps) {
  const ratio = ((value - min) / (max - min)) * 100;

  return (
    <div className="app-slider">
      <div className="app-slider__track" />
      <div className="app-slider__fill" style={{ width: `${ratio}%` }} />
      <div className="app-slider__thumb" style={{ left: `${ratio}%` }} />
      <input
        className="app-slider__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange?.(Number(event.target.value))}
      />
    </div>
  );
}
