import { useEffect, useState } from "react";

const HeroSection = () => {
  const [blurAmount, setBlurAmount] = useState(0);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      // Start blurring immediately, max out at 15px blur after 500px scroll
      const blur = Math.min(15, scrollY * 0.03); 
      // Fade out slightly when scrolling down
      const currentOpacity = Math.max(0, 1 - scrollY * 0.002);
      
      setBlurAmount(blur);
      setOpacity(currentOpacity);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToArticles = () => {
    document.getElementById("articles")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section 
      className="pt-32 md:pt-40 lg:pt-48 pb-6 md:pb-16 lg:pb-24 px-4 md:px-8 transition-[filter,opacity] duration-75 ease-out will-change-[filter,opacity]"
      style={{ 
        filter: `blur(${blurAmount}px)`,
        opacity: opacity 
      }}
    >
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-medium mb-6 md:mb-10 inline-flex flex-col items-center">
          <div className="flex items-center">
            <span className="border border-foreground px-3 md:px-6 py-2 md:py-4 text-foreground animate-fade-in" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>Discover</span>
            <span className="bg-[#ff6bff] border border-foreground px-3 md:px-6 py-2 md:py-4 rounded-[20px] md:rounded-[40px] -ml-px text-foreground animate-fade-in" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>articles</span>
          </div>
          <div className="flex items-center -mt-px">
            <span className="border border-foreground px-3 md:px-6 py-2 md:py-4 text-foreground animate-fade-in" style={{ animationDelay: '0.5s', animationFillMode: 'both' }}>that</span>
            <span className="border border-l-0 border-foreground px-3 md:px-6 py-2 md:py-4 text-foreground animate-fade-in" style={{ animationDelay: '0.6s', animationFillMode: 'both' }}>inspire</span>
          </div>
        </h1>
        <p className="text-sm md:text-base lg:text-[18px] text-foreground max-w-2xl mx-auto animate-fade-in" style={{ animationDelay: '0.7s', animationFillMode: 'both' }}>
          Explore trending stories on wellness, travel, creativity, and personal growth. Stories that illuminate paths of meaning and discovery.
        </p>
      </div>
    </section>
  );
};

export default HeroSection;
