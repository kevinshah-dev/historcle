"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

type ShareButtonProps = {
  text: string;
};

export function ShareButton({ text }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" className="share-button" onClick={handleClick}>
      {copied ? <Check aria-hidden="true" size={18} /> : <Copy aria-hidden="true" size={18} />}
      {copied ? "Copied" : "Share result"}
    </button>
  );
}
