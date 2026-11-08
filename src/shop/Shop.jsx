import React from 'react';
import { formatLsd } from '../models/types.js';

export const SHOP_CATALOG = [
  // Building Variants
  {
    id: 'bldg_gothic_church',
    category: 'building',
    name: 'Gothic-Revival Church',
    costPence: 240, // £1
    description: 'Bespoke parish church with flying buttresses and stained-glass lancets.',
    icon: '⛪'
  },
  {
    id: 'bldg_gasworks',
    category: 'building',
    name: 'Victorian Gasworks',
    costPence: 360, // £1 10s
    description: 'Iron telescopic gas holders fueling the street illumination of London.',
    icon: '🏭'
  },
  {
    id: 'bldg_lighthouse',
    category: 'building',
    name: 'Coastal Lighthouse',
    costPence: 480, // £2
    description: 'Fresnel-lens beacon guiding ships through dense smog and coastal fog.',
    icon: '🏮'
  },
  {
    id: 'bldg_crystal_palace',
    category: 'building',
    name: 'Crystal Palace Glasshouse',
    costPence: 720, // £3
    description: 'Cast-iron and plate-glass exhibition palace inspired by Paxton.',
    icon: '🏛️'
  },
  {
    id: 'bldg_analytical_engine',
    category: 'building',
    name: 'Analytical Engine Workshop',
    costPence: 1200, // £5
    description: 'Ada Lovelace & Babbage’s mechanical computing laboratory with steam-powered brass gears.',
    icon: '⚙️'
  },

  // City Cosmetics
  {
    id: 'cosmetic_gas_lamps',
    category: 'cosmetic',
    name: 'Ornate Gas Lamps',
    costPence: 60, // 5s
    description: 'Gilded cast-iron street lamps illuminating the cobblestones at dusk.',
    icon: '🪔'
  },
  {
    id: 'cosmetic_thames_river',
    category: 'cosmetic',
    name: 'Thames River Embankment',
    costPence: 180, // 15s
    description: 'A granite river wall with passing coal barges and Victorian bridges.',
    icon: '🌊'
  },
  {
    id: 'cosmetic_fog_density',
    category: 'cosmetic',
    name: 'Atmospheric Fog Layers',
    costPence: 36, // 3s
    description: 'Dense drifting coal-and-river pea-souper fog over the districts.',
    icon: '🌫️'
  },
  {
    id: 'cosmetic_clock_tower',
    category: 'cosmetic',
    name: 'St. Stephen Clock Tower',
    costPence: 600, // £2 10s
    description: 'Majestic neo-Gothic clock tower sounding deep resonant chimes.',
    icon: '🕰️'
  }
];

/**
 * @param {Object} props
 * @param {number} props.balancePence
 * @param {string[]} props.unlockedItemIds
 * @param {Function} props.onPurchase
 */
export function Shop({ balancePence, unlockedItemIds = [], onPurchase }) {
  return (
    <div className="shop-section gothic-card" style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid rgba(184, 146, 90, 0.3)', paddingBottom: 10, marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--color-gold-bright)', fontSize: '1.4rem' }}>
            Victorian Exchange & Manufactory
          </h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-ash)', fontStyle: 'italic' }}>
            Acquire bespoke architectural commissions and civic improvements
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.4)', padding: '6px 14px', border: '1px solid var(--color-gold)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-ash)', textTransform: 'uppercase' }}>Available Funds:</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--color-parchment)' }}>
            {formatLsd(balancePence)}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
        {SHOP_CATALOG.map(item => {
          const isOwned = unlockedItemIds.includes(item.id);
          const canAfford = balancePence >= item.costPence;

          return (
            <div
              key={item.id}
              style={{
                background: 'rgba(26, 19, 22, 0.75)',
                border: `1px solid ${isOwned ? 'var(--color-success-teal)' : 'var(--color-panel-border)'}`,
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>{item.icon}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--color-parchment)' }}>
                  {item.name}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-ash)', marginTop: 4, minHeight: 40 }}>
                  {item.description}
                </div>
              </div>

              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: 'var(--color-gold-bright)' }}>
                  {formatLsd(item.costPence)}
                </span>

                {isOwned ? (
                  <span style={{ color: 'var(--color-success-teal)', fontSize: '0.82rem', fontWeight: 600 }}>
                    ✓ Commissioned
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn-wax"
                    style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                    disabled={!canAfford}
                    onClick={() => onPurchase(item)}
                  >
                    Acquire
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
