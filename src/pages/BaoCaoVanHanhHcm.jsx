import React from 'react';
import BaoCaoVanHanhHtml from './BaoCaoVanHanhHtml';

export default function BaoCaoVanHanhHcm() {
  // Reuse the same component; HCM-specific filtering and data source handling lives inside it when needed.
  // For now we render the same UI; route, icon, and permission will gate access.
  return <BaoCaoVanHanhHtml />;
}

