import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { Eye, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getArticlePath, ArticleWithCategory } from "@/hooks/useArticles";
import { useIsMobile } from "@/hooks/use-mobile";

interface CategoryBrowserProps {
  articles: ArticleWithCategory[];
}

function formatViews(n: number | undefined): string {
  if (!n) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function getCategoryClass(cat: string): string {
  const normalized = cat.toLowerCase();
  if (normalized.includes("financ")) return "tag-financing";
  if (normalized.includes("lifestyle")) return "tag-lifestyle";
  if (normalized.includes("community")) return "tag-community";
  if (normalized.includes("wellness")) return "tag-wellness";
  if (normalized.includes("travel")) return "tag-travel";
  if (normalized.includes("creativ")) return "tag-creativity";
  if (normalized.includes("growth")) return "tag-growth";
  return "tag-lifestyle";
}

const CategoryBrowser = ({ articles }: CategoryBrowserProps) => {
  const isMobile = useIsMobile();
  // Derive unique categories from articles
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const cats: Array<{ id: string; name: string }> = [];
    articles.forEach((a) => {
      if (!seen.has(a.category_id)) {
        seen.add(a.category_id);
        cats.push({ id: a.category_id, name: a.category_name });
      }
    });
    return cats;
  }, [articles]);

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const [showCategories, setShowCategories] = useState(false);

  const filtered = useMemo(() => {
    const sorted = [...articles].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (activeCategory === "all") return sorted;
    return sorted.filter((a) => a.category_id === activeCategory);
  }, [articles, activeCategory]);

  // Reset featured index and visible count when category changes
  useEffect(() => {
    setFeaturedIndex(0);
    setCurrentPage(1);
  }, [activeCategory]);

  const candidatesForFeatured = useMemo(() => {
    const featuredOnly = filtered.filter((a) => a.tags?.includes("is_featured"));
    if (featuredOnly.length > 0) return featuredOnly;
    return filtered;
  }, [filtered]);

  // Auto-cycle through featured candidates every 4s
  useEffect(() => {
    if (candidatesForFeatured.length <= 1) return;
    const timer = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setFeaturedIndex((prev) => (prev + 1) % Math.min(candidatesForFeatured.length, 5));
        setIsTransitioning(false);
      }, 350);
    }, 4000);
    return () => clearInterval(timer);
  }, [candidatesForFeatured.length]);

  const featured = candidatesForFeatured[featuredIndex] || candidatesForFeatured[0];
  const allNewsList = filtered.filter((a) => a.id !== featured?.id);
  const newsList = allNewsList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(allNewsList.length / itemsPerPage);

  if (articles.length === 0) return null;

  // Brutalist button styles matching header
  const btnBase =
    "flex-shrink-0 whitespace-nowrap relative overflow-hidden h-[34px] px-4 flex items-center text-[11px] font-medium uppercase border border-foreground leading-none group transition-colors duration-200";
  const btnActive = "bg-foreground text-background";
  const btnInactive = "bg-background text-foreground";

  // Magenta hover slide — same as header
  const hoverSlide = (
    <span className="absolute inset-0 bg-[#FA76FF] translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out pointer-events-none" />
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-8">
        <h2 className="text-[11px] font-medium uppercase tracking-wider">BROWSE</h2>
        <button 
          onClick={() => setShowCategories(!showCategories)}
          className="relative overflow-hidden group text-[11px] font-medium uppercase tracking-wider border border-foreground px-4 h-[34px] flex items-center leading-none text-foreground bg-background transition-colors duration-200"
        >
          <span className="relative z-10">BY CATEGORY</span>
          {hoverSlide}
        </button>
      </div>

      {/* Category tabs — brutalist style, flush borders like header */}
      <div className={`${showCategories ? 'flex' : 'hidden'} items-center mb-8 overflow-x-auto scrollbar-hide`}>
        {/* "ALL" is the leftmost, with a left border */}
        <button
          onClick={() => setActiveCategory("all")}
          className={`${btnBase} border-l ${activeCategory === "all" ? btnActive : btnInactive}`}
        >
          <span className="relative z-10">All</span>
          {activeCategory !== "all" && hoverSlide}
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`${btnBase} border-l-0 ${activeCategory === cat.id ? btnActive : btnInactive}`}
          >
            <span className="relative z-10">{cat.name}</span>
            {activeCategory !== cat.id && hoverSlide}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Auto-cycling featured card */}
        {featured && (
          <div
            className={`transition-opacity duration-350 ease-in-out ${isTransitioning ? "opacity-0" : "opacity-100"}`}
          >
            <Link
              to={getArticlePath({ category_slug: featured.category_slug, slug: featured.slug })}
              className="group block overflow-hidden border border-border hover:border-foreground transition-all duration-300"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                <img
                  src={featured.image}
                  alt={featured.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                {/* Tags top-left */}
                <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                  <span className={`px-2 py-0.5 text-[10px] uppercase border border-foreground font-semibold ${getCategoryClass(featured.category_name)}`}>
                    {featured.category_name}
                  </span>
                </div>
                <div className="absolute top-3 right-3">
                  <span className="px-2 py-0.5 text-[10px] font-semibold uppercase border border-foreground bg-black/60 text-white backdrop-blur-sm">
                    {formatDistanceToNow(new Date(featured.created_at), { addSuffix: true })}
                  </span>
                </div>
                {/* Progress dots for cycle indicator */}
                {candidatesForFeatured.length > 1 && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {Array.from({ length: Math.min(candidatesForFeatured.length, 5) }).map((_, i) => (
                      <button
                        key={i}
                        onClick={(e) => { e.preventDefault(); setFeaturedIndex(i); }}
                        className={`w-1.5 h-1.5 transition-all duration-300 ${i === featuredIndex ? "bg-white w-4" : "bg-white/50"}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="p-5 space-y-3 border-t border-border">
                <h3 className="text-xl font-bold leading-snug group-hover:text-[#FA76FF] transition-colors line-clamp-2">
                  {featured.title}
                </h3>
                {featured.subtitle && (
                  <p className="text-sm text-muted-foreground truncate">{featured.subtitle}</p>
                )}
                <div className="flex items-center flex-wrap gap-x-3 gap-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {featured.author_avatar ? (
                      <img src={featured.author_avatar} alt={featured.author_name} className="w-6 h-6 object-cover" />
                    ) : (
                      <div className="w-6 h-6 bg-accent/20 flex items-center justify-center text-sm font-bold text-accent border border-border">
                        {featured.author_name.charAt(0)}
                      </div>
                    )}
                    <span className="whitespace-nowrap">By <span className="font-medium text-foreground">{featured.author_name}</span></span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span>·</span>
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <Eye className="w-3 h-3" />
                      {formatViews(featured.view_count)} views
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        )}

        {/* News list column */}
        <div className="flex flex-col justify-between">
          <div className="divide-y divide-border/60">
          {newsList.map((article) => (
            <Link
              key={article.id}
              to={getArticlePath({ category_slug: article.category_slug, slug: article.slug })}
              className="group flex gap-4 py-4 hover:bg-muted/30 transition-colors px-2 -mx-2"
            >
              {/* Thumbnail — square, brutalist no-rounding */}
              <div className="flex-shrink-0 w-20 h-16 overflow-hidden bg-muted border border-border/50">
                <img
                  src={article.image}
                  alt={article.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>

              {/* Info: title on top, date + views below */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <h4 className="text-sm font-bold leading-snug line-clamp-2 group-hover:text-[#FA76FF] transition-colors">
                  {article.title}
                </h4>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>
                    {new Date(article.created_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Eye className="w-3 h-3" />
                    {formatViews(article.view_count)} views
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        
          {totalPages > 1 && (
            <div className="mt-8 flex justify-center gap-2 pt-4">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="relative overflow-hidden group w-8 h-8 flex items-center justify-center text-xs font-bold border border-foreground transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed bg-background text-foreground"
              >
                <span className="relative z-10">&lt;</span>
                {currentPage !== 1 && hoverSlide}
              </button>
              
              {(() => {
                const visiblePages = isMobile ? 3 : 5;
                const endWindow = Math.min(totalPages, currentPage + visiblePages - 1);
                
                const elements: (number | string)[] = [];
                for (let i = currentPage; i <= endWindow; i++) {
                  elements.push(i);
                }
                if (endWindow < totalPages) {
                  if (endWindow < totalPages - 1) {
                    elements.push("dot1", "dot2", "dot3");
                  }
                  elements.push(totalPages);
                }

                return elements.map((item, idx) => {
                  if (typeof item === "string" && item.startsWith("dot")) {
                    return (
                      <div key={item} className="w-8 h-8 flex items-end justify-center pb-2 text-xs font-bold border border-foreground bg-background text-foreground">
                        .
                      </div>
                    );
                  }
                  
                  const page = item as number;
                  return (
                    <button
                      key={`page-${page}`}
                      onClick={() => setCurrentPage(page)}
                      className={`relative overflow-hidden group w-8 h-8 flex items-center justify-center text-xs font-bold border border-foreground transition-colors duration-200 ${
                        currentPage === page 
                          ? "bg-foreground text-background" 
                          : "bg-background text-foreground hover:bg-foreground/5"
                      }`}
                    >
                      <span className="relative z-10">{page}</span>
                      {currentPage !== page && hoverSlide}
                    </button>
                  );
                });
              })()}

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="relative overflow-hidden group w-8 h-8 flex items-center justify-center text-xs font-bold border border-foreground transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed bg-background text-foreground"
              >
                <span className="relative z-10">&gt;</span>
                {currentPage !== totalPages && hoverSlide}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CategoryBrowser;
