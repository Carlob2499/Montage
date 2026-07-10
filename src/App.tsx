import { useUIStore } from './state/uiStore';
import HomeScreen from './components/home/HomeScreen';
import LibraryScreen from './components/library/LibraryScreen';
import EditorScreen from './components/editor/EditorScreen';
import PreviewScreen from './components/preview/PreviewScreen';
import Toasts from './components/shared/Toasts';
import { useShareInbox } from './hooks/useShareInbox';

export default function App() {
  const screen = useUIStore((s) => s.screen);
  useShareInbox();
  return (
    <div className="h-full">
      {screen === 'home' && <HomeScreen />}
      {screen === 'library' && <LibraryScreen />}
      {screen === 'editor' && <EditorScreen />}
      {screen === 'preview' && <PreviewScreen />}
      <Toasts />
    </div>
  );
}
