import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { generateThumbnailCanvas, uploadThumbnailBlob } from "@/utils/thumbnailGenerator";

export function useAutoThumbnailGenerator(isAdmin: boolean) {
  const isProcessing = useRef(false);

  useEffect(() => {
    if (!isAdmin) return;

    // We use a recursive function to process the queue slowly in the background
    const processQueue = async () => {
      if (isProcessing.current) return;
      isProcessing.current = true;

      try {
        // Check if auto-thumbnails are enabled in settings
        const { data: setting } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "auto_thumbnail_enabled")
          .maybeSingle();

        if (setting && setting.value === false) {
          isProcessing.current = false;
          setTimeout(processQueue, 5000); // Check again in 5s
          return;
        }

        // Find one article that has been rewritten but lacks a thumbnail
        const { data: articles, error } = await supabase
          .from("articles")
          .select("id, title, image")
          .eq("ai_rewrite_status", "completed")
          .is("ai_thumbnail_url", null)
          .not("image", "is", null)
          .limit(1);

        if (error) {
          console.error("AutoThumbnail: Error fetching queue", error.message);
          isProcessing.current = false;
          return;
        }

        if (!articles || articles.length === 0) {
          // Queue is empty, stop processing (we can check again if the component re-mounts or we could set an interval)
          isProcessing.current = false;
          return;
        }

        const article = articles[0];
        console.log(`🤖 AutoThumbnail: Generating for "${article.title}"...`);

        const titleText = article.title;
        const blob = await generateThumbnailCanvas(article.image, titleText);
        const url = await uploadThumbnailBlob(article.id, blob);

        if (url) {
          await supabase
            .from("articles")
            .update({ ai_thumbnail_url: url })
            .eq("id", article.id);
          
          console.log(`✅ AutoThumbnail: Success for "${article.title}"`);
        } else {
          console.error(`❌ AutoThumbnail: Upload failed for "${article.title}"`);
        }

      } catch (err) {
        console.error("AutoThumbnail: Exception during generation", err);
      }

      isProcessing.current = false;
      
      // Schedule the next one with a delay to not lock up the browser UI
      // 3 seconds gives the browser time to breathe and Supabase time to settle
      setTimeout(processQueue, 3000);
    };

    // Initial kick-off after a short delay (let the page render first)
    const timer = setTimeout(processQueue, 2000);
    return () => clearTimeout(timer);

  }, [isAdmin]);
}
