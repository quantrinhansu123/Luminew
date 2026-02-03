import React from 'react';

const FloatingActionButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button 
        onClick={onClick} 
        className="fixed bottom-4 right-4 md:bottom-8 md:right-8 w-16 h-16 bg-brand rounded-full shadow-large flex items-center justify-center text-white text-4xl leading-none cursor-pointer z-[9998] transition-all hover:scale-110 hover:rotate-12 hover:bg-brand-dark"
        aria-label="Add new task"
    >
        +
    </button>
);

export default FloatingActionButton;
