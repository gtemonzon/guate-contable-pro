import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CopyAmountButtonProps {
  amount: number;
}

export default function CopyAmountButton({ amount }: CopyAmountButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = Math.abs(amount).toFixed(2);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      type="button"
      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded hover:bg-accent"
      onClick={handleCopy}
      title="Copiar monto"
      aria-label="Copiar monto al portapapeles"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </button>
  );
}
