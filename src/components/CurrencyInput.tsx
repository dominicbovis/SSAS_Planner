import { useState, useRef } from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  placeholder?: string;
  id?: string;
}

export default function CurrencyInput({ value, onChange, className = '', placeholder = '0', id }: Props) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const formatted = value === 0 && !focused
    ? ''
    : value.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  function handleFocus() {
    setFocused(true);
    // Select all on focus for easy replacement
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    setFocused(false);
    const raw = e.target.value.replace(/,/g, '').replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(raw);
    onChange(isNaN(parsed) ? 0 : parsed);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Allow typing freely while focused — only strip non-numeric except . and -
    const raw = e.target.value.replace(/,/g, '');
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) onChange(parsed);
    else if (raw === '' || raw === '-') onChange(0);
  }

  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none select-none">£</span>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        value={focused ? (value === 0 ? '' : String(value)) : formatted}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
      />
    </div>
  );
}
