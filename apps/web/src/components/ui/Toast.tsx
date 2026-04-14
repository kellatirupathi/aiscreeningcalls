import { useEffect, useState } from "react";
import { CheckCircle } from "lucide-react";

let showToastFn: ((message: string) => void) | null = null;

export function toast(message: string) {
  showToastFn?.(message);
}

export function ToastProvider() {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    showToastFn = (msg: string) => {
      setMessage(msg);
      setVisible(true);
      setTimeout(() => setVisible(false), 2000);
    };
    return () => { showToastFn = null; };
  }, []);

  if (!visible) return null;

  return (
    <div className="toast-notification">
      <CheckCircle size={15} />
      <span>{message}</span>
    </div>
  );
}
