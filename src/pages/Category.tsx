import { useParams, Link } from "react-router-dom";
import Header from "@/components/Header";
import { useArticlesByCategory, useCategories, getArticlePath } from "@/hooks/useArticles";
import { Helmet } from "react-helmet-async";
import Newsletter from "@/components/Newsletter";
import { useMemo, useState, useEffect } from "react";
import { ChevronDown, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const Category = () => {
  const { slug } = useParams<{ slug: string }>();
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 7;
  
  const { data: articles, isLoading } = useArticlesByCategory(slug || "");
  const { data: categories } = useCategories();
  
  const category = categories?.find(c => c.slug === slug);
  const categoryName = category?.name || (slug ? (slug.charAt(0).toUpperCase() + slug.slice(1)) : "Category");

  const sortedArticles = useMemo(() => {
    if (!articles) return [];
    return [...articles].sort((a, b) => {
      const dA = new Date(a.created_at).getTime(), dB = new Date(b.created_at).getTime();
      return sortOrder === "newest" ? dB - dA : dA - dB;
    });
  }, [articles, sortOrder]);

  const totalPages = Math.ceil(sortedArticles.length / itemsPerPage);
  const paginatedArticles = sortedArticles.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Scroll to top of list on page change
  useEffect(() => {
    if (currentPage > 1) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentPage]);

  return (
    <div className="min-h-screen bg-background animate-fade-in">
      <Helmet>
        <title>{categoryName} - LADtoday</title>
        <meta name="description" content={`Explore informative stories and updates about ${categoryName} on LADtoday.`} />
      </Helmet>
      
      <Header />
      
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-12">
        {/* Header with Admin-style Filter */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 border-b border-border pb-6">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
            {categoryName}
          </h1>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mr-1">Sort:</span>
            <DropdownMenu onOpenChange={() => {}}>
              <DropdownMenuTrigger asChild>
                <button className="h-8 px-3 text-[11px] font-medium rounded-lg border border-border bg-background hover:bg-muted transition-colors flex items-center gap-2">
                  {sortOrder === "newest" ? "Newest First" : "Oldest First"}
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 p-1 rounded-xl shadow-lg border border-border/80 text-foreground bg-card">
                <DropdownMenuItem onClick={() => { setSortOrder("newest"); setCurrentPage(1); }} className="text-xs rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-muted">
                  Newest First
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortOrder("oldest"); setCurrentPage(1); }} className="text-xs rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-muted">
                  Oldest First
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <section className="min-h-[400px]">
          {isLoading ? (
            <div className="text-center py-20 text-muted-foreground animate-pulse font-medium text-xs tracking-widest">LOADING ARTICLES...</div>
          ) : !paginatedArticles.length ? (
            <div className="text-center py-20 border border-dashed border-border rounded-2xl bg-muted/10">
              <p className="text-muted-foreground text-sm font-medium">No articles found in this category yet.</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border/60">
                {paginatedArticles.map((article) => (
                  <Link
                    key={article.id}
                    to={getArticlePath(article)}
                    className="group flex gap-4 md:gap-6 py-5 md:py-6 hover:bg-muted/30 transition-all px-2 -mx-2 first:pt-0"
                  >
                    {/* Thumbnail Row */}
                    <div className="relative flex-shrink-0 w-24 h-20 md:w-32 md:h-24 overflow-hidden rounded-xl border border-border shadow-sm group-hover:border-foreground/20 transition-all duration-300">
                      <img
                        src={article.image}
                        alt={article.title}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors" />
                    </div>

                    {/* Info Column */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5 md:gap-2">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] uppercase font-bold text-[#FA76FF] tracking-wider">{article.category_name}</span>
                        <span className="text-muted-foreground/30">·</span>
                        <span className="text-[10px] font-medium text-muted-foreground uppercase">{new Date(article.created_at).toLocaleDateString()}</span>
                      </div>
                      
                      <h2 className="text-base md:text-xl font-bold leading-tight line-clamp-2 md:line-clamp-none group-hover:text-[#FA76FF] transition-colors">
                        {article.title}
                      </h2>
                      
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/70 tracking-tight">By {article.author_name}</span>
                        <div className="flex items-center gap-1 opacity-60">
                           <Eye className="w-3 h-3" />
                           <span>{(article.view_count || 0) > 1000 ? `${(article.view_count / 1000).toFixed(1)}k` : article.view_count || 0}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Pagination UI */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-1 mt-12 py-8 border-t border-border/40">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-30 transition-colors mr-2"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }).map((_, i) => {
                      const page = i + 1;
                      // Show limited pages on mobile, all on desktop for now
                      if (totalPages > 5 && Math.abs(page - currentPage) > 1 && page !== 1 && page !== totalPages) {
                         if (page === 2 || page === totalPages - 1) return <span key={page} className="px-1 text-muted-foreground/40">...</span>;
                         return null;
                      }

                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`min-w-[32px] h-8 px-2 rounded-lg text-[11px] font-bold border transition-all ${
                            currentPage === page 
                              ? "bg-foreground text-background border-foreground" 
                              : "bg-background text-foreground border-border hover:border-foreground/30"
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-30 transition-colors ml-2"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <div className="mt-20">
          <Newsletter 
            title={`Stay updated on ${categoryName}`} 
            variant="pill"
          />
        </div>
      </main>
    </div>
  );
};

export default Category;
