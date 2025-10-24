import * as React from "react"
import { cn } from "@/lib/utils"

export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value?: number | number[];
  onValueChange?: (value: number[]) => void;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, onValueChange, value, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseInt(e.target.value);
      if (onValueChange) {
        onValueChange([newValue]);
      }
      if (props.onChange) {
        props.onChange(e);
      }
    };

    // Convert array value to single number for HTML input
    const inputValue = Array.isArray(value) ? value[0] : value;

    return (
      <input
        type="range"
        className={cn(
          "w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700",
          className
        )}
        ref={ref}
        {...props}
        value={inputValue}
        onChange={handleChange}
      />
    )
  }
)
Slider.displayName = "Slider"

export { Slider }
