import React, { useState, useEffect } from 'react';
import badgeImage from '@/assets/badge.png';
import arrowDown from '@/assets/arrow-down.png';

interface RotatingBadgeProps {
  text: string;
  onClick?: () => void;
  showIcon?: boolean;
  icon?: React.ReactNode;
  className?: string;
  
}

export const RotatingBadge: React.FC<RotatingBadgeProps> = ({
  text,
  onClick,
  showIcon = false,
  icon,
  className = "fixed top-4 right-4 md:top-8 md:right-8"
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    let lastScrollY = window.pageYOffset;
    let ticking = false;

    const updateScrollDir = () => {
      const scrollY = window.pageYOffset;
      if (Math.abs(scrollY - lastScrollY) < 10) {
        ticking = false;
        return;
      }
      setIsVisible(scrollY < lastScrollY || scrollY < 50);
      lastScrollY = scrollY > 0 ? scrollY : 0;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollDir);
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Calculate how many times to repeat the text based on its length
  const getTextRepetitions = (text: string) => {
    const baseRepetitions = 5;
    const textLength = text.length;
    
    if (textLength <= 4) return 8; // Short text like "LIVE"
    if (textLength <= 6) return 6; // Medium text like "BROWSE"
    return baseRepetitions; // Longer text
  };

  const repetitions = getTextRepetitions(text);
  const offsetIncrement = 100 / repetitions;

  return (
    <div 
      className={`${className} w-[60px] h-[60px] md:w-[72px] md:h-[72px] lg:w-[154px] lg:h-[154px] ${onClick ? 'cursor-pointer' : ''} z-40 animate-fade-in transition-transform duration-500 ease-in-out ${isVisible ? 'translate-y-0 opacity-100' : '-translate-y-[200%] opacity-0'}`}
      style={{ animationDelay: '0.2s', animationFillMode: 'both' }}
      onClick={onClick}
    >
      {/* Rotating badge background */}
      <div className="w-full h-full animate-[spin_20s_linear_infinite]">
        <img src={badgeImage} alt="Badge" className="w-full h-full" />
        
        {/* Circular text repeated around badge */}
        <svg viewBox="0 0 200 200" className="w-full h-full absolute inset-0">
          <defs>
            <path id="circlePath" d="M 100, 30 a 70,70 0 1,1 0,140 a 70,70 0 1,1 0,-140" />
          </defs>
          {Array.from({ length: repetitions }).map((_, index) => (
            <text key={index} className="text-[16px] font-bold uppercase" fill="black">
              <textPath href="#circlePath" startOffset={`${index * offsetIncrement}%`}>
                {text}
              </textPath>
            </text>
          ))}
        </svg>
      </div>
      
      {/* Static icon in center */}
      {showIcon && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <img src={arrowDown} alt="Arrow" className="w-6 h-6 md:w-7 md:h-7 lg:w-12 lg:h-12" />
        </div>
      )}
    </div>
  );
};

export default RotatingBadge;
