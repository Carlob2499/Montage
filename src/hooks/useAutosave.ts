import { useEffect } from 'react';
import { useProjectStore } from '../state/projectStore';

/** Autosave the open project every 30s and when the tab loses focus. */
export function useAutosave(): void {
  useEffect(() => {
    const save = () => void useProjectStore.getState().save();
    const interval = setInterval(save, 30_000);
    const onBlurOrHide = () => save();
    window.addEventListener('blur', onBlurOrHide);
    document.addEventListener('visibilitychange', onBlurOrHide);
    return () => {
      clearInterval(interval);
      window.removeEventListener('blur', onBlurOrHide);
      document.removeEventListener('visibilitychange', onBlurOrHide);
      save();
    };
  }, []);
}
