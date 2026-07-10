import Sheet from '../../shared/Sheet';
import { useProjectStore } from '../../../state/projectStore';

export default function CaptionsSheet({ onClose }: { onClose: () => void }) {
  const doc = useProjectStore((s) => s.doc);
  if (!doc) return null;
  const store = useProjectStore.getState();

  return (
    <Sheet title="Panel captions" onClose={onClose} tall>
      <p className="mb-3 text-xs text-ink-400">
        Saved with the project and exported as a text file next to your panels.
      </p>
      <div className="space-y-3">
        {doc.captions.map((c, i) => (
          <label key={i} className="block">
            <span className="mb-1 block text-xs font-medium text-ink-500">Panel {i + 1}</span>
            <textarea
              className="input-base min-h-16"
              value={c}
              placeholder="Caption, alt text, hashtags…"
              onChange={(e) =>
                store.preview((d) => ({
                  ...d,
                  captions: d.captions.map((cc, ii) => (ii === i ? e.target.value : cc)),
                }))
              }
              onBlur={() => store.commit((d) => d)}
            />
          </label>
        ))}
      </div>
    </Sheet>
  );
}
