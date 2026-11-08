import React, { useState } from 'react';

export const DEFAULT_TAGS = [
  { id: 'work', name: 'Work', color: '#B8925A' },
  { id: 'study', name: 'Study', color: '#4A8C78' },
  { id: 'reading', name: 'Reading', color: '#7E3E53' },
  { id: 'writing', name: 'Writing', color: '#B86536' },
  { id: 'code', name: 'Coding', color: '#3A688C' }
];

/**
 * @param {Object} props
 * @param {Array<{id: string, name: string, color: string}>} props.tags
 * @param {string} props.selectedTagId
 * @param {Function} props.onSelectTag
 * @param {Function} props.onAddTag
 */
export function TagSelector({ tags = DEFAULT_TAGS, selectedTagId, onSelectTag, onAddTag }) {
  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#B8925A');

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    const newTag = {
      id: newTagName.toLowerCase().replace(/\s+/g, '-'),
      name: newTagName.trim(),
      color: newTagColor
    };
    onAddTag(newTag);
    onSelectTag(newTag.id);
    setNewTagName('');
    setIsCreating(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.78rem', color: 'var(--color-gold)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Discipline Tag:
      </span>

      {tags.map(t => {
        const isSelected = t.id === selectedTagId;
        return (
          <button
            key={t.id}
            type="button"
            className="btn-brass"
            onClick={() => onSelectTag(t.id)}
            style={{
              padding: '4px 10px',
              fontSize: '0.8rem',
              borderColor: isSelected ? t.color : 'rgba(184, 146, 90, 0.3)',
              background: isSelected ? 'rgba(184, 146, 90, 0.2)' : undefined,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color }} />
            {t.name}
          </button>
        );
      })}

      {!isCreating ? (
        <button
          type="button"
          className="btn-brass"
          onClick={() => setIsCreating(true)}
          style={{ padding: '4px 8px', fontSize: '0.78rem' }}
        >
          + New Tag
        </button>
      ) : (
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Tag Name"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            style={{ background: '#120C0E', border: '1px solid var(--color-brass)', color: '#FFF', padding: '3px 8px', fontSize: '0.8rem' }}
          />
          <input
            type="color"
            value={newTagColor}
            onChange={(e) => setNewTagColor(e.target.value)}
            style={{ width: 24, height: 24, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
          />
          <button type="submit" className="btn-wax" style={{ padding: '3px 8px', fontSize: '0.75rem' }}>
            Save
          </button>
          <button type="button" className="btn-brass" onClick={() => setIsCreating(false)} style={{ padding: '3px 6px', fontSize: '0.75rem' }}>
            ✕
          </button>
        </form>
      )}
    </div>
  );
}
