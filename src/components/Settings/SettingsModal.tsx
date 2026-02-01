import { useSettingsStore } from '../../store/settingsStore';
import { useUserStore } from '../../store/userStore';
import type { Operation } from '../../lib/mathEngine';
import { X, RefreshCcw } from 'lucide-react';
import styles from './SettingsModal.module.css';

interface SettingsModalProps {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { settings, updateSettings, resetToDefault } = useSettingsStore();
  const { theme, setTheme } = useUserStore();

  const themes: Array<{ id: 'carbon' | 'classic' | 'nord' | 'light'; label: string; color: string }> = [
    { id: 'carbon', label: 'Carbon', color: '#323437' },
    { id: 'classic', label: 'Classic', color: '#cccccc' },
    { id: 'nord', label: 'Nord Teal', color: '#2e3440' },
    { id: 'light', label: 'Light', color: '#ffffff' }
  ];

  const toggleOperation = (op: Operation) => {
    const newOps = settings.operations.includes(op)
      ? settings.operations.filter(o => o !== op)
      : [...settings.operations, op];
    
    // Don't allow zero operations
    if (newOps.length > 0) {
      updateSettings({ operations: newOps });
    }
  };

  const handleRangeChange = (opKey: string, field: 'min' | 'max', value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue)) return;

    updateSettings({
      ranges: {
        ...settings.ranges,
        [opKey]: {
          ...(settings.ranges as any)[opKey],
          [field]: numValue
        }
      }
    });
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Game Settings</h2>
          <button className={styles.closeBtn} onClick={onClose}>
             <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          <section className={styles.section}>
            <h3>Operations</h3>
            <div className={styles.opsGrid}>
              {['+', '-', '*', '/'].map((op) => (
                <button
                  key={op}
                  className={`${styles.opBtn} ${settings.operations.includes(op as Operation) ? styles.active : ''}`}
                  onClick={() => toggleOperation(op as Operation)}
                >
                  {op}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <h3>Themes</h3>
            <div className={styles.themesGrid}>
              {themes.map((t) => (
                <button
                  key={t.id}
                  className={`${styles.themeBtn} ${theme === t.id ? styles.active : ''}`}
                  onClick={() => setTheme(t.id)}
                >
                  <div className={styles.themePreview} style={{ backgroundColor: t.color }}></div>
                  <span className={styles.themeLabel}>{t.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <h3>Number Ranges</h3>
            <div className={styles.rangesGrid}>
              {[
                { label: 'Addition', key: 'add' },
                { label: 'Subtraction', key: 'sub' },
                { label: 'Multiplication', key: 'mult' },
                { label: 'Division', key: 'div' }
              ].map(({ label, key }) => (
                <div key={key} className={styles.rangeRow}>
                  <span className={styles.rangeLabel}>{label}</span>
                  <div className={styles.inputs}>
                    <input
                      type="number"
                      value={(settings.ranges as any)[key].min}
                      onChange={(e) => handleRangeChange(key, 'min', e.target.value)}
                      min="1"
                    />
                    <span>to</span>
                    <input
                      type="number"
                      value={(settings.ranges as any)[key].max}
                      onChange={(e) => handleRangeChange(key, 'max', e.target.value)}
                      min="1"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className={styles.footer}>
          <button className={styles.resetBtn} onClick={resetToDefault}>
            <RefreshCcw size={16} /> Reset to Standard
          </button>
        </div>
      </div>
    </div>
  );
}
