import { useRef, forwardRef, useImperativeHandle, ChangeEvent, ClipboardEvent, KeyboardEvent, useEffect, useCallback, memo } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SingleOTPInputRef {
  focus: () => void;
  getValue: () => string;
  setValue: (value: string) => void;
  clear: () => void;
}

interface SingleOTPInputProps {
  onChange?: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  initialValue?: string;
}

/**
 * Single input field untuk OTP yang mendukung copy-paste
 * FULLY UNCONTROLLED untuk mencegah flickering
 * Menggunakan DOM value langsung, bukan React state
 */
const SingleOTPInputInner = forwardRef<SingleOTPInputRef, SingleOTPInputProps>(
  (
    {
      onChange,
      onComplete,
      disabled = false,
      maxLength = 6,
      className,
      placeholder = "Masukkan kode OTP",
      autoFocus = false,
      initialValue = "",
    },
    ref
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const counterRef = useRef<HTMLParagraphElement>(null);
    // Simpan onChange dan onComplete di ref untuk mencegah re-render
    const onChangeRef = useRef(onChange);
    const onCompleteRef = useRef(onComplete);
    
    // Update refs ketika props berubah (tanpa trigger re-render)
    useEffect(() => {
      onChangeRef.current = onChange;
      onCompleteRef.current = onComplete;
    });

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      getValue: () => inputRef.current?.value || "",
      setValue: (val: string) => {
        if (inputRef.current) {
          const sanitized = val.replace(/\D/g, "").slice(0, maxLength);
          inputRef.current.value = sanitized;
          updateCounter(sanitized.length);
          onChangeRef.current?.(sanitized);
        }
      },
      clear: () => {
        if (inputRef.current) {
          inputRef.current.value = "";
          updateCounter(0);
          onChangeRef.current?.("");
        }
      },
    }));

    // Update counter display tanpa React state
    const updateCounter = useCallback((length: number) => {
      if (counterRef.current) {
        counterRef.current.textContent = `${length}/${maxLength} digit`;
      }
    }, [maxLength]);

    // Autofocus dengan delay
    useEffect(() => {
      if (autoFocus && inputRef.current) {
        const timer = setTimeout(() => {
          inputRef.current?.focus();
        }, 150);
        return () => clearTimeout(timer);
      }
    }, [autoFocus]);

    // Set initial value
    useEffect(() => {
      if (inputRef.current && initialValue) {
        const sanitized = initialValue.replace(/\D/g, "").slice(0, maxLength);
        inputRef.current.value = sanitized;
        updateCounter(sanitized.length);
      }
    }, [initialValue, maxLength, updateCounter]);

    const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value;
      const sanitized = rawValue.replace(/\D/g, "").slice(0, maxLength);
      
      // Update input value langsung (DOM manipulation)
      if (e.target.value !== sanitized) {
        e.target.value = sanitized;
      }
      
      // Update counter
      updateCounter(sanitized.length);
      
      // Notify parent (debounced, non-blocking)
      onChangeRef.current?.(sanitized);
      
      // Trigger onComplete jika sudah lengkap
      if (sanitized.length === maxLength) {
        onCompleteRef.current?.(sanitized);
      }
    }, [maxLength, updateCounter]);

    const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, maxLength);
      
      if (inputRef.current) {
        inputRef.current.value = pastedData;
        updateCounter(pastedData.length);
        
        onChangeRef.current?.(pastedData);
        
        if (pastedData.length === maxLength) {
          onCompleteRef.current?.(pastedData);
        }
      }
    }, [maxLength, updateCounter]);

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
      // Izinkan: Backspace, Delete, Tab, Escape, Enter, arrows
      if (
        e.key === "Backspace" ||
        e.key === "Delete" ||
        e.key === "Tab" ||
        e.key === "Escape" ||
        e.key === "Enter" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "Home" ||
        e.key === "End"
      ) {
        return;
      }

      // Izinkan Ctrl+C, Ctrl+V, Ctrl+A
      if (e.ctrlKey || e.metaKey) {
        return;
      }

      // Block non-digit
      if (!/^\d$/.test(e.key)) {
        e.preventDefault();
      }
    }, []);

    return (
      <div className="w-full max-w-xs mx-auto">
        <Input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          defaultValue={initialValue}
          onChange={handleChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="one-time-code"
          className={cn(
            "text-center text-xl font-semibold tracking-[0.5em] h-14",
            "focus:ring-2 focus:ring-primary",
            className
          )}
        />
        <p ref={counterRef} className="text-xs text-muted-foreground text-center mt-2">
          {initialValue.length}/{maxLength} digit
        </p>
      </div>
    );
  }
);

SingleOTPInputInner.displayName = "SingleOTPInputInner";

// Wrap dengan memo untuk mencegah re-render dari parent
const SingleOTPInput = memo(SingleOTPInputInner);
export default SingleOTPInput;
