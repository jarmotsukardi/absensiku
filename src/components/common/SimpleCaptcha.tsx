import { useState, useEffect, useCallback } from "react";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SimpleCaptchaProps {
  onVerify: (isValid: boolean) => void;
  className?: string;
}

export function SimpleCaptcha({ onVerify, className = "" }: SimpleCaptchaProps) {
  const [captchaText, setCaptchaText] = useState("");
  const [userInput, setUserInput] = useState("");
  const [isValid, setIsValid] = useState<boolean | null>(null);

  const generateCaptcha = useCallback(() => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaText(result);
    setUserInput("");
    setIsValid(null);
    onVerify(false);
  }, [onVerify]);

  useEffect(() => {
    generateCaptcha();
  }, [generateCaptcha]);

  const handleInputChange = (value: string) => {
    setUserInput(value);
    const valid = value.toUpperCase() === captchaText;
    setIsValid(valid);
    onVerify(valid);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-muted/50 border border-border rounded-md p-3 select-none">
          <div className="flex items-center justify-center gap-1 font-mono text-xl tracking-widest">
            {captchaText.split("").map((char, i) => (
              <span
                key={i}
                style={{
                  transform: `rotate(${Math.random() * 20 - 10}deg)`,
                  color: `hsl(${Math.random() * 360}, 70%, 50%)`,
                }}
              >
                {char}
              </span>
            ))}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={generateCaptcha}
          title="Refresh captcha"
          aria-label="Refresh captcha"
        >
          <RefreshCcw className="h-4 w-4" />
        </Button>
      </div>
      <Input
        id="captcha-input"
        type="text"
        placeholder="Masukkan kode captcha"
        aria-label="Masukkan kode captcha"
        autoComplete="off"
        value={userInput}
        onChange={(e) => handleInputChange(e.target.value)}
        className={isValid === null ? "" : isValid ? "border-success" : "border-destructive"}
        maxLength={6}
      />
      {isValid === false && userInput.length === 6 && (
        <p className="text-xs text-destructive">Captcha tidak cocok</p>
      )}
    </div>
  );
}
