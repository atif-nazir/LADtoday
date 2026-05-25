import { useParams, Navigate, Link } from "react-router-dom";
import Header from "@/components/Header";
import ArticleCard from "@/components/ArticleCard";
import { useArticleBySlugs, useAllArticles, getArticlePath } from "@/hooks/useArticles";
import { Facebook, Twitter, Linkedin, Instagram, Link2, Clock, Eye, Share2, Printer, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Helmet } from "react-helmet-async";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCarouselScroll } from "@/hooks/useCarouselScroll";
import { Skeleton } from "@/components/ui/skeleton";

const Article = () => {
  const { category, slug } = useParams<{ category: string; slug: string }>();
  const { data: article, isLoading } = useArticleBySlugs(category || "", slug || "");
  const { data: allArticles } = useAllArticles();
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [category, slug]);

  const relatedArticlesRaw = (() => {
    if (!article) return [];
    const same = (allArticles || []).filter(a => a.id !== article.id && a.category_slug === article.category_slug).slice(0, 8);
    if (same.length < 8) {
      same.push(...(allArticles || []).filter(a => a.id !== article.id && a.category_slug !== article.category_slug).slice(0, 8 - same.length));
    }
    return same;
  })();

  const relatedRef = useCarouselScroll(relatedArticlesRaw.length, 'left');

  useEffect(() => {
    if (!article) return;
    const incrementViews = async () => {
      const sessionKey = `viewed_${article.id}`;
      if (!sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, "true");
        const { error } = await (supabase.rpc as any)("increment_view_count", { article_id: article.id });
        if (error) {
          await supabase
            .from("articles")
            .update({ view_count: (article.view_count || 0) + 1 } as any)
            .eq("id", article.id);
        }
      }
    };
    incrementViews();
  }, [article?.id, article?.view_count]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center pt-24 pb-12 px-4">
        <div className="w-full max-w-4xl space-y-8">
          <Skeleton className="w-full h-[50vh] md:h-[600px] mb-4 rounded-none" />
          <Skeleton className="w-3/4 h-10 md:h-14 rounded-none mb-4" />
          <Skeleton className="w-1/2 h-5 rounded-none mb-8" />
          <div className="flex flex-col gap-6 pt-8">
            <Skeleton className="w-full h-4 rounded-none" />
            <Skeleton className="w-full h-4 rounded-none" />
            <Skeleton className="w-4/5 h-4 rounded-none" />
          </div>
        </div>
      </div>
    );
  }

  if (!article) return <Navigate to="/404" replace />;

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(window.location.href);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = window.location.href;
        textArea.style.position = "absolute";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      toast.success("Link copied to clipboard!");
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
      toast.error("Failed to copy link");
    }
  };

  const authorSocials = [
    { url: article.author_twitter, icon: Twitter, label: "Twitter" },
    { url: article.author_instagram, icon: Instagram, label: "Instagram" },
    { url: article.author_linkedin, icon: Linkedin, label: "LinkedIn" },
    { url: article.author_facebook, icon: Facebook, label: "Facebook" },
  ].filter(s => s.url);

  const formattedDate = (() => {
    try {
      const d = new Date(article.date);
      const datePart = d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      const timePart = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const tzAbbr = d.toLocaleTimeString("en-US", { timeZoneName: "short" }).split(" ").pop();
      return `${datePart} ${timePart} ${tzAbbr}`;
    } catch {
      return article.date;
    }
  })();

  return (
    <div className="min-h-screen bg-background animate-fade-in">
      <Helmet>
        <meta name="google-adsense-account" content="ca-pub-4052323679941467" />
        <title>{article.title} – LADtoday</title>
        <meta name="description" content={article.subtitle || article.introduction?.slice(0, 160) || "Read this article on LADtoday."} />
        <meta property="og:title" content={article.title} />
        <meta property="og:description" content={article.subtitle || article.introduction?.slice(0, 160) || ""} />
        <meta property="og:image" content={article.ai_thumbnail_url || article.image} />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={article.title} />
        <meta name="twitter:description" content={article.subtitle || article.introduction?.slice(0, 160) || ""} />
        <meta name="twitter:image" content={article.ai_thumbnail_url || article.image} />
      </Helmet>

      <Header />

      <main>
        {/* ─── Full-width hero image with title overlay ─── */}
        <div className="relative w-full">
          <img
            src={article.image}
            alt={article.title}
            className="w-full h-[50vh] md:h-[65vh] lg:h-[75vh] object-cover"
          />
          {/* Dark gradient at bottom for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

          {/* Title overlay at bottom-left */}
          <div className="absolute bottom-0 left-0 right-0 px-4 md:px-8 lg:px-16 pb-6 md:pb-10">
            <div className="max-w-[800px]">
              <h1 className="font-serif text-[28px] sm:text-[34px] md:text-[40px] lg:text-[48px] font-bold leading-[1.15] text-white">
                {article.title}
              </h1>
            </div>
          </div>
        </div>

        {/* ─── Image caption ─── */}
        {article.subtitle && (
          <div className="max-w-[900px] mx-auto px-4 md:px-8 lg:px-16 pt-3 pb-2">
            <p className="text-[13px] text-muted-foreground italic leading-snug">{article.subtitle}</p>
          </div>
        )}

        {/* ─── Article body layout: content + sidebar ─── */}
        <div className="max-w-[1200px] mx-auto px-4 md:px-8 lg:px-16 pt-6 pb-16">
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-16">

            {/* ─── Floating share buttons (desktop left) ─── */}
            <div className="hidden lg:flex flex-col items-center gap-3 sticky top-32 self-start pt-2">
              <button
                onClick={handleCopyLink}
                className="w-10 h-10 rounded-full border border-border hover:border-accent hover:text-accent transition-all flex items-center justify-center text-muted-foreground"
                aria-label="Copy link"
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => window.print()}
                className="w-10 h-10 rounded-full border border-border hover:border-accent hover:text-accent transition-all flex items-center justify-center text-muted-foreground"
                aria-label="Print"
              >
                <Printer className="w-4 h-4" />
              </button>
            </div>

            {/* ─── Main content ─── */}
            <article className="flex-1 max-w-[680px]">
              {/* Introduction */}
              {article.introduction && (
                <p className="font-serif text-[16px] md:text-[18px] leading-[1.65] text-foreground mb-8">
                  {article.introduction}
                </p>
              )}

              {/* Sections */}
              {article.sections.map((section, index) => (
                <div key={index} className="mb-8">
                  {section.heading && (
                    <h2 className="font-sans text-[22px] md:text-[26px] font-bold leading-[1.3] text-foreground mb-4 mt-10">
                      {section.heading}
                    </h2>
                  )}
                  {section.image && (
                    <figure className="mb-5">
                      <img
                        src={section.image}
                        alt={section.heading ?? "Section image"}
                        className="w-full object-cover max-h-[500px]"
                      />
                    </figure>
                  )}
                  <p className="font-serif text-[16px] md:text-[18px] leading-[1.7] text-foreground/90">
                    {section.content}
                  </p>
                </div>
              ))}

              {/* Conclusion */}
              {article.conclusion && (
                <div className="mt-10 pt-6 border-t border-border">
                  <blockquote className="border-l-4 border-accent/40 pl-5 py-3 bg-muted/40 rounded-r-sm">
                    <p className="font-serif text-[16px] md:text-[18px] leading-[1.7] text-foreground/80 italic">
                      {article.conclusion}
                    </p>
                  </blockquote>
                </div>
              )}

              {/* Tags */}
              {article.tags && article.tags.filter(t => t !== "show_edit_tag" && t !== "is_featured").length > 0 && (
                <div className="mt-10 pt-6 border-t border-border">
                  <div className="flex flex-wrap gap-2">
                    {article.tags
                      .filter(t => t !== "show_edit_tag" && t !== "is_featured")
                      .map((tag) => (
                        <span key={tag} className="px-3 py-1.5 text-[13px] bg-muted text-foreground rounded-sm font-sans">
                          {tag}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {/* Mobile share */}
              <div className="lg:hidden mt-10 pt-6 border-t border-border">
                <p className="text-[13px] font-semibold uppercase tracking-wider mb-4 text-muted-foreground">Share this article</p>
                <div className="flex items-center gap-3">
                  <button onClick={handleCopyLink} className="flex-1 py-3 border border-border hover:border-accent transition-all flex items-center justify-center gap-2 text-[13px]">
                    <Link2 className="w-4 h-4" /> Copy link
                  </button>
                  <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noopener noreferrer" className="w-11 h-11 border border-border hover:border-accent transition-all flex items-center justify-center" aria-label="Share on Twitter">
                    <Twitter className="w-4 h-4" />
                  </a>
                  <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noopener noreferrer" className="w-11 h-11 border border-border hover:border-accent transition-all flex items-center justify-center" aria-label="Share on Facebook">
                    <Facebook className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </article>

            {/* ─── Right sidebar (Author + info) ─── */}
            <aside className="w-full lg:w-[300px] shrink-0 lg:sticky lg:top-32 self-start space-y-5 order-first lg:order-last">
              {/* Published date */}
              <p className="text-[13px] text-foreground font-sans">
                Published: {formattedDate}
              </p>

              {/* Author box */}
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center flex-shrink-0">
                  <ChevronDown className="w-3.5 h-3.5" />
                </span>
                <p className="text-[13px] leading-snug">
                  <span className="font-bold text-foreground">{article.author_name}</span>
                  {article.author_bio && (
                    <span className="font-normal italic text-muted-foreground">,{" "}{article.author_bio}</span>
                  )}
                </p>
              </div>

              {/* Share bar — URL preview + copy + Share article */}
              <div className="flex items-center gap-2">
                {/* URL bar with embedded copy button */}
                <div className={`flex-1 min-w-0 flex items-center rounded-full pr-1 py-1 pl-4 gap-2 transition-colors duration-300 ${linkCopied ? 'bg-green-500' : 'bg-muted'}`}>
                  {linkCopied ? (
                    <span className="text-[13px] text-white font-medium flex items-center gap-1.5 animate-fade-in">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      Link copied
                    </span>
                  ) : (
                    <span className="text-[13px] text-muted-foreground truncate">
                      {window.location.href}
                    </span>
                  )}
                  <button
                    onClick={handleCopyLink}
                    className="ml-auto w-9 h-9 rounded-full bg-foreground text-background hover:opacity-80 transition-all flex items-center justify-center flex-shrink-0"
                    aria-label="Copy link"
                  >
                    <Link2 className="w-4 h-4" />
                  </button>
                </div>
                {/* Share article button */}
                <button
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({ title: article.title, url: window.location.href }).catch(console.error);
                    } else {
                      handleCopyLink();
                    }
                  }}
                  className="flex items-center gap-2 bg-foreground text-background rounded-full px-5 py-2.5 text-[13px] font-medium hover:opacity-90 transition-opacity flex-shrink-0"
                >
                  <Share2 className="w-4 h-4" />
                  Share article
                </button>
              </div>

              {/* Article meta + category — single row */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center gap-2 text-[13px] text-muted-foreground flex-wrap">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{article.read_time} read</span>
                  <span className="text-border">·</span>
                  <Eye className="w-3.5 h-3.5" />
                  <span>{article.view_count?.toLocaleString() || 0} views</span>
                  <span className="text-border">·</span>
                  <Link
                    to={`/${article.category_slug}`}
                    className="text-[13px] font-semibold text-accent hover:underline uppercase tracking-wider"
                  >
                    {article.category_name}
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        </div>

        {/* ─── Related articles ─── */}
        {relatedArticlesRaw.length > 0 && (
          <section className="bg-muted py-16 animate-fade-in border-t border-border/40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
              <h2 className="text-[11px] font-medium uppercase tracking-wider">YOU MIGHT ALSO LIKE</h2>
            </div>
            <div className="w-full bg-muted pb-8">
              <div
                ref={relatedRef}
                className="relative overflow-x-auto overflow-y-hidden scrollbar-hide select-none cursor-grab active:cursor-grabbing"
              >
                <div className="flex gap-px w-max">
                  {[...relatedArticlesRaw, ...relatedArticlesRaw, ...relatedArticlesRaw].map((a, index) => (
                    <div
                      key={`related-${a.id}-${index}`}
                      className="flex-shrink-0 w-[85vw] sm:w-[50vw] md:w-[calc(40vw-0.5px)] animate-fade-in"
                      style={{ animationDelay: `${(index % relatedArticlesRaw.length) * 0.1}s`, animationFillMode: 'both' }}
                    >
                      <ArticleCard {...a} size="small" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default Article;
