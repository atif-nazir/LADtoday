import { ArrowDown } from "lucide-react";

const BrowseBadge = () => {
  return (
    <div className="relative w-20 h-20 md:w-24 md:h-24">
      {/* Rotating text */}
      <svg className="w-full h-full animate-spin-slow" viewBox="0 0 100 100">
        <defs>
          <path id="circlePath" d="M 50,50 m -37,0 a 37,37 0 1,1 74,0 a 37,37 0 1,1 -74,0" />
        </defs>
        <text className="fill-accent text-[11px] font-bold uppercase tracking-[0.3em]">
          <textPath href="#circlePath">
            BROWSE · BROWSE · BROWSE · 
          </textPath>
        </text>
      </svg>
      {/* Center arrow */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-accent flex items-center justify-center">
          <ArrowDown className="w-5 h-5 md:w-6 md:h-6 text-accent-foreground" />
        </div>
      </div>
    </div>
  );
};

export default BrowseBadge;
