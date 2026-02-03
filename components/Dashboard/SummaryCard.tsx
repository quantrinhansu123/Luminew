
import React from 'react';
import { SummaryCardData } from '../../types';

interface Props {
  data: SummaryCardData;
}

const SummaryCard: React.FC<Props> = ({ data }) => {
  const isUp = data.trend === 'up';
  
  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm flex flex-col justify-between border-l-4 border-l-[#50a050]">
      <div className="flex justify-between items-start">
        <h3 className="text-gray-500 font-bold text-xs uppercase tracking-wider">{data.title}</h3>
      </div>
      <div className="mt-2">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-[#50a050]">{data.value}</span>
          {data.subValue && <span className="text-sm text-green-600 font-medium">{data.subValue}</span>}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-sm flex items-center ${isUp ? 'text-green-500' : 'text-red-500'}`}>
            {isUp ? '↑' : '↓'} {data.percentage}
          </span>
          <span className="text-[10px] font-bold text-green-800 uppercase px-1.5 py-0.5 bg-green-50 rounded border border-green-100">{data.avgValue}</span>
        </div>
      </div>
    </div>
  );
};

export default SummaryCard;
