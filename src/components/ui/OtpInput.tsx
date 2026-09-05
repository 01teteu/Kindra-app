import { useRef, KeyboardEvent, ClipboardEvent } from 'react';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
}

export function OtpInput({ value, onChange, length = 6 }: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Garantir que o array tenha sempre o tamanho exato de `length`
  const otpArray = value.split('').concat(Array(length).fill('')).slice(0, length);

  const handleOtpChange = (index: number, char: string) => {
    // Permite apenas números
    if (!/^\d*$/.test(char)) return;
    
    const newValue = char.slice(-1);
    const newOtpArray = [...otpArray];
    newOtpArray[index] = newValue;
    
    const finalString = newOtpArray.join('');
    onChange(finalString);

    // Auto-focus no próximo campo
    if (newValue && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    // Retorna para o campo anterior ao pressionar Backspace se estiver vazio
    if (e.key === 'Backspace' && !otpArray[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    // Extrai apenas os números e limita ao tamanho
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    
    if (pastedData) {
      const newOtpArray = [...otpArray];
      for (let i = 0; i < pastedData.length; i++) {
        newOtpArray[i] = pastedData[i];
      }
      onChange(newOtpArray.join(''));
      
      const nextIndex = Math.min(pastedData.length, length - 1);
      inputRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div className="flex justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
      {otpArray.map((digit, index) => (
        <input
          key={index}
          ref={(el) => (inputRefs.current[index] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleOtpChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold font-display text-kindra-950 bg-kindra-50 border-2 border-kindra-200 rounded-xl focus:border-kindra-950 focus:ring-0 transition-colors outline-none"
        />
      ))}
    </div>
  );
}
