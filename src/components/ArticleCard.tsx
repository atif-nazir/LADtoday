import { Clock, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { getArticlePath } from "@/hooks/useArticles";
import { formatDistanceToNow } from "date-fns";

interface ArticleCardProps {
  title: string;
  category_name: string;
  category_slug: string;
  slug: string;
  date: string;
  read_time: string;
  image: string;
  author_name: string;
  author_avatar?: string | null;
  size?: "small" | "large";
  truncateTo?: number;
  created_at?: string;
  updated_at?: string;
  tags?: string[] | null;
  view_count?: number;
}

const ArticleCard = ({ title, category_name, category_slug, slug, read_time, image, author_name, created_at, updated_at, tags, view_count = 0, truncateTo }: ArticleCardProps) => {


  const isEdited = tags?.includes("show_edit_tag");
  const displayDate = isEdited && updated_at ? updated_at : (created_at || new Date().toISOString());
  const timeAgo = formatDistanceToNow(new Date(displayDate), { addSuffix: true });

  return (
    <Link
      to={getArticlePath({ category_slug, slug })}
      className="group block overflow-hidden card-hover border border-border/50 h-full"
    >
      <div className="relative aspect-video overflow-hidden bg-muted">
        <img
          src={image}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute top-1.5 left-1.5 flex flex-wrap gap-1">
          <span className="px-1.5 py-0.5 text-[8px] font-medium uppercase border border-foreground bg-black/60 text-white backdrop-blur-sm">
            {timeAgo}
          </span>
          {isEdited && (
            <span className="px-1.5 py-0.5 text-[8px] font-medium uppercase border border-foreground bg-secondary text-secondary-foreground shadow">
              Updated
            </span>
          )}
        </div>
      </div>

      <div className="p-2.5 space-y-1">
        <h3 className="text-sm font-bold leading-tight line-clamp-2 group-hover:text-accent transition-colors" title={title}>
          {truncateTo && title.length > truncateTo ? `${title.slice(0, truncateTo - 3)}...` : title}
        </h3>

        <div className="flex items-center justify-between text-[9px] text-muted-foreground mt-1">
          <span className="line-clamp-1 flex items-center gap-0.5 uppercase text-muted-foreground">
            {category_name}
          </span>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-0.5 flex-shrink-0">
              <Clock className="w-2.5 h-2.5" />
              {read_time}
            </span>
            <span className="flex items-center gap-0.5 flex-shrink-0">
              <Eye className="w-2.5 h-2.5" />
              {view_count}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default ArticleCard;
