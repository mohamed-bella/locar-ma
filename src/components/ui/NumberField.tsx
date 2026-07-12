import { useEffect, useState } from 'react'
import { NumericFormat } from 'react-number-format'
import { fieldCls } from './Form'
import { cn } from './cn'

// Formatted number input (thousands separators, optional suffix like " MAD").
// Submits the RAW numeric value via a hidden input carrying `name`.
export function NumberField({
  name,
  defaultValue,
  suffix,
  placeholder,
  decimalScale = 2,
  className,
  id,
  onValueChange,
}: {
  name: string
  defaultValue?: number | string | null
  suffix?: string
  placeholder?: string
  decimalScale?: number
  className?: string
  id?: string
  onValueChange?: (value: string) => void
}) {
  const [val, setVal] = useState(defaultValue != null ? String(defaultValue) : '')

  useEffect(() => {
    setVal(defaultValue != null ? String(defaultValue) : '')
  }, [defaultValue])

  return (
    <>
      <NumericFormat
        id={id}
        value={val}
        onValueChange={(v) => {
          setVal(v.value)
          onValueChange?.(v.value)
        }}
        thousandSeparator=" "
        suffix={suffix}
        decimalScale={decimalScale}
        allowNegative={false}
        placeholder={placeholder}
        inputMode="decimal"
        className={cn(fieldCls, 'tnum', className)}
      />
      <input type="hidden" name={name} value={val} />
    </>
  )
}
