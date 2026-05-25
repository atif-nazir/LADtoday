import { Helmet } from "react-helmet-async";
import Header from "@/components/Header";
import ArticleCard from "@/components/ArticleCard";
import HeroSection from "@/components/HeroSection";
import CategoryBrowser from "@/components/CategoryBrowser";
import { useAllArticles } from "@/hooks/useArticles";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RotatingBadge } from "@/components/RotatingBadge";
import { ArrowDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCarouselScroll } from "@/hooks/useCarouselScroll";
import Newsletter from "@/components/Newsletter";
import Footer from "@/components/Footer";

const Index = () => {
  const { data: articles, isLoading } = useAllArticles();
  const location = useLocation();
  
  // All articles mapped for the CategoryBrowser
  const allArticles = articles || [];
  const latestArticles = allArticles.slice(0, 10);

  const latestRef = useCarouselScroll(latestArticles.length, 'left');

  const [subEmail, setSubEmail] = useState("");
  const [subLoading, setSubLoading] = useState(false);

  const handleSubscribe = async () => {
    if (!subEmail) return;
    setSubLoading(true);
    const { error } = await supabase.from("subscribers" as any).upsert(
      { email: subEmail },
      { onConflict: "email" }
    );
    if (error) {
      toast.error("Failed to subscribe. Try again.");
    } else {
      toast.success("Subscribed! You'll get notified of new articles.");
      setSubEmail("");
    }
    setSubLoading(false);
  };

  const scrollToArticles = () => {
    const articlesSection = document.getElementById("articles");
    articlesSection?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (location.hash === "#articles") {
      // Slight delay to ensure the section is rendered, especially on first load
      const timer = setTimeout(() => {
        const articlesSection = document.getElementById("articles");
        if (articlesSection) {
          articlesSection.scrollIntoView({ behavior: "smooth" });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [location]);

  return (
    <div className="min-h-screen bg-background animate-fade-in">
      <Helmet>
        <title>LADtoday - Discover Articles That Inspire</title>
        <meta name="description" content="Explore stories on wellness, travel, creativity, and personal growth. Content that illuminates paths of meaning and discovery." />
      </Helmet>
      
      <Header />
      
      <RotatingBadge 
        text="BROWSE" 
        onClick={scrollToArticles}
        showIcon={true}
        icon={<ArrowDown className="w-6 h-6 md:w-7 md:h-7 lg:w-12 lg:h-12" />}
      />

      <main>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <HeroSection />
        </div>

        <section id="articles" className="py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
            <div className="flex items-center gap-3">
              <h2 className="text-[11px] font-medium uppercase tracking-wider">LATEST</h2>
              <h2 className="text-[11px] font-medium uppercase tracking-wider border border-foreground px-4 h-[34px] flex items-center leading-none">ARTICLES</h2>
            </div>
          </div>

          {isLoading ? (
            <div className="w-full py-12">
              <div className="flex gap-4 overflow-hidden w-full">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="flex-shrink-0 w-[65vw] md:w-[calc(40vw-0.5px)] h-[250px] md:h-[300px] rounded-none border border-border" />
                ))}
              </div>
            </div>
          ) : latestArticles.length === 0 ? (
            <div className="text-center py-12 text-accent">No articles found</div>
          ) : (
            <div className="space-y-12">
              <div className="w-full bg-background">
                <div 
                  ref={latestRef}
                  className="relative overflow-x-auto overflow-y-hidden scrollbar-hide select-none cursor-grab active:cursor-grabbing"
                >
                  <div className="flex gap-px w-max">
                    {[...latestArticles, ...latestArticles, ...latestArticles].map((article, index) => (
                      <div
                        key={`latest-${article.id}-${index}`}
                        className="flex-shrink-0 w-[65vw] md:w-[calc(40vw-0.5px)] animate-fade-in"
                        style={{ animationDelay: `${(index % latestArticles.length) * 0.1}s`, animationFillMode: 'both' }}
                      >
                        <ArticleCard {...article} size="small" truncateTo={40} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Category Browser — with Categories, Featured, and News */}
              <div className="border-t border-border/40">
                <CategoryBrowser articles={allArticles} />
              </div>
            </div>
          )}
        </section>

        <div id="newsletter" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <Newsletter 
             title="Stay inspired." 
             variant="standard" 
           />
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Index;
