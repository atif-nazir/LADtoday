import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ArticleWithCategory {
  id: string;
  title: string;
  subtitle: string | null;
  slug: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  date: string;
  read_time: string;
  image: string;
  author_name: string;
  author_avatar: string | null;
  author_bio: string | null;
  author_twitter: string | null;
  author_instagram: string | null;
  author_linkedin: string | null;
  author_facebook: string | null;
  introduction: string | null;
  sections: { heading: string; content: string; image?: string | null }[];
  conclusion: string | null;
  tags: string[] | null;
  published: boolean;
  created_at: string;
  updated_at: string;
  view_count?: number;
  ai_rewrite_count?: number;
  ai_rewrite_status?: string;
  thumbnail_generated_count?: number;
  ai_thumbnail_url?: string | null;
  fb_caption?: string | null;
  source_id?: string | null;
  scraper_sources?: {
    name: string;
    thumbnail_theme: string;
    thumbnail_template: string;
  } | null;
}

async function fetchArticles(publishedOnly = true): Promise<ArticleWithCategory[]> {
  let query = supabase
    .from("articles")
    .select("*, categories(name, slug), scraper_sources(name, thumbnail_theme, thumbnail_template)")
    .order("created_at", { ascending: false });

  if (publishedOnly) {
    query = query.eq("published", true);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("fetchArticles error:", error.message);
    return [];
  }

  return (data || []).map((a: any) => ({
    id: a.id,
    title: a.title,
    subtitle: a.subtitle,
    slug: a.slug,
    category_id: a.category_id,
    category_name: a.categories?.name ?? "",
    category_slug: a.categories?.slug ?? "",
    date: a.date,
    read_time: a.read_time,
    image: a.image,
    author_name: a.author_name,
    author_avatar: a.author_avatar,
    author_bio: a.author_bio,
    author_twitter: a.author_twitter,
    author_instagram: a.author_instagram,
    author_linkedin: a.author_linkedin,
    author_facebook: a.author_facebook,
    introduction: a.introduction,
    sections: a.sections as { heading: string; content: string; image?: string | null }[],
    conclusion: a.conclusion,
    tags: a.tags,
    published: a.published,
    created_at: a.created_at,
    updated_at: a.updated_at,
    view_count: a.view_count || 0,
    ai_rewrite_count: a.ai_rewrite_count || 0,
    ai_rewrite_status: a.ai_rewrite_status || "pending",
    thumbnail_generated_count: a.thumbnail_generated_count || 0,
    ai_thumbnail_url: a.ai_thumbnail_url || null,
    fb_caption: a.fb_caption || null,
    source_id: a.source_id || null,
    scraper_sources: a.scraper_sources || null,
  }));
}

async function fetchArticleBySlugs(categorySlug: string, articleSlug: string): Promise<ArticleWithCategory | null> {
  const { data: cat } = await supabase
    .from("categories")
    .select("id, name, slug")
    .eq("slug", categorySlug)
    .single();

  if (!cat) return null;

  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .eq("slug", articleSlug)
    .eq("category_id", cat.id)
    .eq("published", true)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    title: data.title,
    subtitle: data.subtitle,
    slug: data.slug,
    category_id: data.category_id,
    category_name: cat.name,
    category_slug: cat.slug,
    date: data.date,
    read_time: data.read_time,
    image: data.image,
    author_name: data.author_name,
    author_avatar: data.author_avatar,
    author_bio: data.author_bio,
    author_twitter: (data as any).author_twitter,
    author_instagram: (data as any).author_instagram,
    author_linkedin: (data as any).author_linkedin,
    author_facebook: (data as any).author_facebook,
    introduction: data.introduction,
    sections: data.sections as unknown as { heading: string; content: string; image?: string | null }[],
    conclusion: data.conclusion,
    tags: data.tags,
    published: data.published,
    created_at: data.created_at,
    updated_at: data.updated_at,
    view_count: (data as any).view_count || 0,
    ai_rewrite_count: (data as any).ai_rewrite_count || 0,
    ai_rewrite_status: (data as any).ai_rewrite_status || "pending",
    thumbnail_generated_count: (data as any).thumbnail_generated_count || 0,
    ai_thumbnail_url: (data as any).ai_thumbnail_url || null,
    fb_caption: (data as any).fb_caption || null,
  };
}

export function useAllArticles() {
  return useQuery({
    queryKey: ["articles"],
    queryFn: () => fetchArticles(true),
  });
}

export function useAllArticlesAdmin() {
  return useQuery({
    queryKey: ["articles", "admin"],
    queryFn: () => fetchArticles(false),
  });
}

export function useArticlesByCategory(categorySlug: string) {
  return useQuery({
    queryKey: ["articles", "category", categorySlug],
    queryFn: async () => {
      const all = await fetchArticles(true);
      return all.filter((a) => a.category_slug === categorySlug);
    },
  });
}

export function useArticleBySlugs(categorySlug: string, articleSlug: string) {
  return useQuery({
    queryKey: ["article", categorySlug, articleSlug],
    queryFn: () => fetchArticleBySlugs(categorySlug, articleSlug),
    enabled: !!categorySlug && !!articleSlug,
  });
}

export function getArticlePath(article: { category_slug: string; slug: string }) {
  return `/article/${article.category_slug}/${article.slug}`;
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });
}
