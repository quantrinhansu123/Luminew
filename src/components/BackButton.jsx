import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

function BackButton({ to = '/', className = '' }) {
  return (
    <Link 
      to={to} 
      className={`text-gray-600 hover:text-gray-900 transition-colors ${className}`}
    >
      <ChevronLeft className="w-5 h-5" />
    </Link>
  );
}

export default BackButton;








