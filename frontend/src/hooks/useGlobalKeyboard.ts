import { useEffect, useRef } from "react";

// Cmd/Ctrl+J listener — callback held in a ref so the listener binds once and stays current.
export function useGlobalKeyboard(onTrigger: () => void): void {
  const handlerRef = useRef(onTrigger);
  handlerRef.current = onTrigger;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && (event.key === "j" || event.key === "J")) {
        event.preventDefault();
        handlerRef.current();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}
