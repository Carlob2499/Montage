import { useUIStore } from './state/uiStore';
import HomeScreen from './components/home/HomeScreen';
import WelcomeScreen from './components/home/WelcomeScreen';
import LibraryScreen from './components/library/LibraryScreen';
import EditorScreen from './components/editor/EditorScreen';
import PreviewScreen from './components/preview/PreviewScreen';
import Toasts from './components/shared/Toasts';
import { useShareInbox } from './hooks/useShareInbox';

export default function App() {
  const screen = useUIStore((s) => s.screen);
  const welcomed = useUIStore((s) => s.welcomed);
  useShareInbox();
  return (
    <div className="h-full">
      {screen === 'home' && (welcomed ? <HomeScreen /> : <WelcomeScreen />)}
      {screen === 'library' && <LibraryScreen />}
      {screen === 'editor' && <EditorScreen />}
      {screen === 'preview' && <PreviewScreen />}
      <Toasts />
    </div>
  );
}
