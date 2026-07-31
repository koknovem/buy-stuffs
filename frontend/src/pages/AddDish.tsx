import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import type { DraftIngredient } from '../types';

const DISH_EMOJIS = ['🍜', '🍝', '🍛', '🍲', '🥗', '🍣', '🍕', '🌮', '🥘', '🥩', '🐟', '🍗'];
const ING_EMOJIS = ['🥚', '🧅', '🧄', '🥕', '🥦', '🍅', '🧀', '🥛', '🥩', '🍗', '🐟', '🦐', '🍚', '🍝', '🫒', '🌶️'];

export function AddDishPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🍜');
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualIcon, setManualIcon] = useState('🛒');
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!id || !name.trim()) return;
    setGenBusy(true);
    setError(null);
    try {
      const { draft } = await api.generateDish(id, name.trim());
      if (draft.icon) setIcon(draft.icon);
      setIngredients(draft.ingredients);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenBusy(false);
    }
  };

  const save = async () => {
    if (!id || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.addDish(id, { name: name.trim(), icon, ingredients });
      navigate(`/trip/${id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addManual = () => {
    const n = manualName.trim();
    if (!n) return;
    setIngredients((prev) => [...prev, { name: n, icon: manualIcon }]);
    setManualName('');
  };

  return (
    <div className="app-shell">
      <div className="topbar">
        <button className="icon-btn" onClick={() => navigate(-1)}>←</button>
        <span style={{ fontSize: '1.6rem' }}>{icon}</span>
        <button
          className="icon-btn"
          disabled={genBusy || !name.trim()}
          onClick={() => void generate()}
          title="generate"
        >
          {genBusy ? '⏳' : '✨'}
        </button>
      </div>

      <input
        className="field"
        placeholder="dish"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div className="emoji-grid">
        {DISH_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            className={`emoji-pick ${icon === e ? 'active' : ''}`}
            onClick={() => setIcon(e)}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="draft-grid">
        {ingredients.map((ing, idx) => (
          <button
            key={`${ing.name}-${idx}`}
            type="button"
            className="draft-chip"
            onClick={() => setIngredients((prev) => prev.filter((_, i) => i !== idx))}
          >
            <span>{ing.icon}</span>
            <span>{ing.name}</span>
            <span className="x">✕</span>
          </button>
        ))}
      </div>

      <div className="row">
        <button
          type="button"
          className="emoji-pick"
          style={{ width: 52, flex: '0 0 auto' }}
          onClick={() => {
            const i = ING_EMOJIS.indexOf(manualIcon);
            setManualIcon(ING_EMOJIS[(i + 1) % ING_EMOJIS.length]);
          }}
        >
          {manualIcon}
        </button>
        <input
          className="field"
          placeholder="+"
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addManual();
          }}
        />
        <button className="icon-btn" type="button" onClick={addManual}>
          ＋
        </button>
      </div>

      <button
        className="action-btn primary wide"
        disabled={busy || !name.trim()}
        onClick={() => void save()}
      >
        ✅
      </button>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
