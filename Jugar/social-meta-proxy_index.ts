import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apiKey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const articleId = url.searchParams.get('id')
    
    if (!articleId) {
      return new Response("Article ID is required", { status: 400 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch article data
    const { data: article, error } = await supabase
      .from('articles')
      .select('title, subtitle, ai_title, fb_caption, ai_thumbnail_url, image, slug, category_slug')
      .eq('id', articleId)
      .single()

    if (error || !article) {
      console.error("Error fetching article:", error)
      return new Response("Article not found", { status: 404 })
    }

    const title = article.ai_title || article.title
    const description = article.fb_caption || article.subtitle || ""
    const image = article.ai_thumbnail_url || article.image
    const destinationUrl = `https://ladtoday.vercel.app/article/${article.category_slug || 'general'}/${article.slug}`

    // Detect if the request is from a social media crawler
    const userAgent = req.headers.get('user-agent') || ''
    const isCrawler = /facebookexternalhit|twitterbot|linkedinbot|pinterest/i.test(userAgent)

    if (isCrawler) {
      // Return HTML with social tags for the crawler
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <meta name="description" content="${description}">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="article">
    <meta property="og:url" content="${destinationUrl}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${image}">
    <meta property="og:image:width" content="1080">
    <meta property="og:image:height" content="1350">

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${destinationUrl}">
    <meta property="twitter:title" content="${title}">
    <meta property="twitter:description" content="${description}">
    <meta property="twitter:image" content="${image}">

    <!-- Redirection for non-crawlers (as fallback) -->
    <meta http-equiv="refresh" content="0; url=${destinationUrl}">
</head>
<body>
    <p>Redirecting to <a href="${destinationUrl}">${title}</a>...</p>
    <script>window.location.href = "${destinationUrl}";</script>
</body>
</html>
      `.trim()

      return new Response(html, {
        headers: { ...corsHeaders, 'Content-Type': 'text/html' },
      })
    } else {
      // Direct redirect for real users
      return Response.redirect(destinationUrl, 302)
    }

  } catch (err) {
    console.error("Proxy error:", err)
    return new Response("Internal Server Error", { status: 500 })
  }
})
