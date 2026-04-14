interface ToggleProps {
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  ariaLabel?: string;
}

export function Toggle({ checked, disabled, onChange, ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      className={`app-toggle ${checked ? "app-toggle--checked" : ""}`}
      disabled={disabled}
      aria-pressed={checked}
      aria-label={ariaLabel}
      onClick={() => onChange?.(!checked)}
    >
      <span className="app-toggle__thumb" />
    </button>
  );
}
