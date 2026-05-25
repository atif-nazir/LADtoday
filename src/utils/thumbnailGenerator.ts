import { supabase } from "@/integrations/supabase/client";

// ─── Theme System ────────────────────────────────────────────────────────────

export interface ThumbnailTheme {
  name: string;
  primaryColor: string;   // banner background
  textColor: string;      // headline text color
  accentColor: string;    // stripe pattern color (darker variant)
  labelBg: string;        // background behind category label
}

export const THUMBNAIL_THEMES: Record<string, ThumbnailTheme> = {
  pink: {
    name: "Pink (Default)",
    primaryColor: "#E91E8C",
    textColor: "#FFFFFF",
    accentColor: "#C2177A",
    labelBg: "rgba(0,0,0,0.15)",
  },
  red: {
    name: "Red (News)",
    primaryColor: "#CC0000",
    textColor: "#FFFFFF",
    accentColor: "#990000",
    labelBg: "rgba(0,0,0,0.15)",
  },
  blue: {
    name: "Blue",
    primaryColor: "#1565C0",
    textColor: "#FFFFFF",
    accentColor: "#0D47A1",
    labelBg: "rgba(0,0,0,0.15)",
  },
  dark: {
    name: "Dark",
    primaryColor: "#1A1A2E",
    textColor: "#FFFFFF",
    accentColor: "#0F0F1E",
    labelBg: "rgba(255,255,255,0.1)",
  },
  white: {
    name: "White",
    primaryColor: "#FFFFFF",
    textColor: "#111111",
    accentColor: "#E8E8E8",
    labelBg: "rgba(0,0,0,0.08)",
  },
};

// Map category slugs to default themes
export const CATEGORY_THEME_MAP: Record<string, string> = {
  news: "red",
  breaking: "red",
  talks: "blue",
  default: "pink",
};

export function getThemeForCategory(categorySlug?: string): ThumbnailTheme {
  const themeKey = CATEGORY_THEME_MAP[categorySlug?.toLowerCase() || ""] || CATEGORY_THEME_MAP.default;
  return THUMBNAIL_THEMES[themeKey] || THUMBNAIL_THEMES.pink;
}

// Small helper to darken a hex color for the accent stripe
function darkenHex(hex: string, percent = 20): string {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);

  r = Math.floor(r * (100 - percent) / 100);
  g = Math.floor(g * (100 - percent) / 100);
  b = Math.floor(b * (100 - percent) / 100);

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function getThemeByKey(key: string): ThumbnailTheme {
  if (key && key.startsWith("#")) {
    return {
      name: "Custom",
      primaryColor: key,
      textColor: "#FFFFFF",
      accentColor: darkenHex(key, 20),
      labelBg: "rgba(0,0,0,0.15)",
    };
  }
  return THUMBNAIL_THEMES[key] || THUMBNAIL_THEMES.pink;
}

export async function generateThumbnailCanvas(
  imageUrl: string,
  title: string,
  categoryLabel?: string,
  theme?: ThumbnailTheme,
  template: 'classic' | 'bordered' = 'classic'
): Promise<Blob> {
  const t = theme || THUMBNAIL_THEMES.pink;
  const label = (categoryLabel || "TODAY'S NEWS").toUpperCase();
  const headline = title;

  return new Promise((resolve, reject) => {
    const W = 1080;
    const H = 1350;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("Canvas context failed"));

    const drawDesign = (bgImg?: HTMLImageElement) => {
      if (template === 'bordered') {
        // ── BORDERED TEMPLATE (Daily Beast style) ──
        // 1. Solid canvas background
        ctx.fillStyle = t.primaryColor;
        ctx.fillRect(0, 0, W, H);

        if (bgImg) {
          const mTop = 30;
          const mSides = 30;
          const imgH = H * 0.73; // Image takes top ~73%
          const imgW = W - (mSides * 2);

          // Calculate "object-fit: cover"
          const scale = Math.max(imgW / bgImg.width, imgH / bgImg.height);
          const w = bgImg.width * scale;
          const h = bgImg.height * scale;
          const ox = mSides + (imgW - w) / 2;
          const oy = mTop + (imgH - h) / 2;

          ctx.save();
          ctx.beginPath();
          ctx.rect(mSides, mTop, imgW, imgH);
          ctx.clip();
          ctx.drawImage(bgImg, ox, oy, w, h);
          ctx.restore();
        }

        // 2. Headline Text (Bottom Section)
        const upperHeadline = headline.toUpperCase();
        const maxTextWidth = W - 120; // 60px margin each side
        let fontSize = 72;
        let lines: string[] = [];

        const charSpacing = fontSize * 0.08; // 8% of font size for significant breathing room
        
        const wrapTextBordered = (size: number): string[] => {
          const spacing = size * 0.08;
          ctx.font = `italic 800 ${size}px 'Impact', 'Baskerville Classico', sans-serif`;
          const words = upperHeadline.split(" ");
          const result: string[] = [];
          
          const measureLine = (text: string) => {
            if (!text) return 0;
            let w = 0;
            const cs = text.split("");
            cs.forEach(c => { w += ctx.measureText(c).width + spacing; });
            return w - spacing;
          };

          let currentLine = words[0] || "";

          for (let i = 1; i < words.length; i++) {
            const testLine = currentLine + " " + words[i];
            if (measureLine(testLine) < maxTextWidth) {
              currentLine = testLine;
            } else {
              result.push(currentLine);
              currentLine = words[i];
            }
          }
          if (currentLine) result.push(currentLine);
          return result;
        };

        lines = wrapTextBordered(fontSize);
        while (lines.length > 3 && fontSize > 40) {
          fontSize -= 4;
          lines = wrapTextBordered(fontSize);
        }

        // Vertically center text in the remaining space
        const remainingTop = (H * 0.73) + 30; // Where image ended
        const remainingSpace = H - remainingTop - 50; // leave room for publisher at bottom
        
        const currentSpacing = fontSize * 0.08;
        ctx.font = `italic 800 ${fontSize}px 'Impact', 'Baskerville Classico', sans-serif`;
        const lineHeight = fontSize * 1.25;
        const totalTextHeight = lines.length * lineHeight;
        const textStartY = remainingTop + (remainingSpace - totalTextHeight) / 2 + (fontSize * 0.85);

        ctx.fillStyle = t.textColor;
        ctx.textAlign = "left"; // Manual placement
        
        lines.forEach((line, index) => {
          const chars = line.split("");
          let lineWidth = 0;
          chars.forEach(c => { lineWidth += ctx.measureText(c).width + currentSpacing; });
          lineWidth -= currentSpacing;

          let cursorX = (W - lineWidth) / 2;
          const ly = textStartY + (index * lineHeight);
          
          chars.forEach(c => {
            ctx.fillText(c, cursorX, ly);
            cursorX += ctx.measureText(c).width + currentSpacing;
          });
        });

        // 3. Publisher Label
        ctx.font = "800 16px 'Inter', sans-serif";
        ctx.fillText(label, W / 2, H - 30);
      } else {
        // ── CLASSIC TEMPLATE (Diagonal Banner Overlap) ──
      const imgTop = H * 0.22;
      if (bgImg) {
        const scale = Math.max(W / bgImg.width, (H - imgTop) / bgImg.height);
        const w = bgImg.width * scale;
        const h = bgImg.height * scale;
        const ox = (W - w) / 2;
        const oy = imgTop + (H - imgTop - h) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, imgTop - 30, W, H - imgTop + 30);
        ctx.clip();
        ctx.drawImage(bgImg, ox, oy, w, h);
        // Slight darkening for contrast
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        ctx.fillRect(0, imgTop - 30, W, H - imgTop + 30);
        ctx.restore();
      } else {
        // Fallback solid dark background
        ctx.fillStyle = "#111";
        ctx.fillRect(0, imgTop - 30, W, H - imgTop + 30);
      }

      // ── 2. Draw the colored banner (top section with diagonal bottom edge) ──
      const bannerH = H * 0.30;
      const diagonalDrop = 60; // how far the diagonal dips on one side

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W, 0);
      ctx.lineTo(W, bannerH);
      ctx.lineTo(0, bannerH - diagonalDrop);
      ctx.closePath();
      ctx.fillStyle = t.primaryColor;
      ctx.fill();
      ctx.restore();

      // ── 3. Draw diagonal stripes pattern in top-right corner ──
      ctx.save();
      // Clip to the banner shape
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W, 0);
      ctx.lineTo(W, bannerH);
      ctx.lineTo(0, bannerH - diagonalDrop);
      ctx.closePath();
      ctx.clip();

      // Draw stripes in the upper-right quadrant
      const stripeWidth = 14;
      const stripeGap = 10;
      const stripeArea = W * 0.50;
      ctx.strokeStyle = t.accentColor;
      ctx.lineWidth = stripeWidth;
      ctx.globalAlpha = 0.35;

      for (let i = 0; i < 30; i++) {
        const offset = i * (stripeWidth + stripeGap);
        const x = W - stripeArea + offset;
        ctx.beginPath();
        ctx.moveTo(x, -20);
        ctx.lineTo(x - bannerH * 0.8, bannerH + 20);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // ── 4. Draw category label (top-right) ──
      ctx.save();
      ctx.font = "700 18px 'Inter', 'Segoe UI', Arial, sans-serif";
      ctx.textAlign = "left"; // Use left alignment for manual character placement
      ctx.textBaseline = "top";
      
      const chars = label.split("");
      const letterSpacing = 3;
      const labelPadH = 16;
      const labelPadV = 8;
      const labelXEnd = W - 40; // Right boundary
      const labelY = 36;

      // Calculate exact total width with spacing
      let totalLabelW = 0;
      chars.forEach(c => { totalLabelW += ctx.measureText(c).width + letterSpacing; });
      totalLabelW -= letterSpacing;

      // Label background pill
      ctx.fillStyle = t.labelBg;
      const pillW = totalLabelW + labelPadH * 2;
      const pillH = 18 + labelPadV * 2;
      const pillX = labelXEnd - pillW;
      const pillY = labelY - labelPadV;
      
      ctx.beginPath();
      const r = 6;
      ctx.moveTo(pillX + r, pillY);
      ctx.lineTo(pillX + pillW - r, pillY);
      ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + r, r);
      ctx.lineTo(pillX + pillW, pillY + pillH - r);
      ctx.arcTo(pillX + pillW, pillY + pillH, pillX + pillW - r, pillY + pillH, r);
      ctx.lineTo(pillX + r, pillY + pillH);
      ctx.arcTo(pillX, pillY + pillH, pillX, pillY + pillH - r, r);
      ctx.lineTo(pillX, pillY + r);
      ctx.arcTo(pillX, pillY, pillX + r, pillY, r);
      ctx.closePath();
      ctx.fill();

      // Label text
      ctx.fillStyle = t.textColor;
      let cx = pillX + labelPadH;
      chars.forEach(c => {
        ctx.fillText(c, cx, labelY);
        cx += ctx.measureText(c).width + letterSpacing;
      });
      ctx.restore();

      // ── 5. Draw accent line (centered) ──
      ctx.save();
      ctx.fillStyle = t.textColor;
      ctx.fillRect(W / 2 - 35, 80, 70, 5);
      ctx.restore();

      // ── 6. Draw headline text ──
      const upperHeadline = headline;
      const maxTextWidth = W - 120; // 60px margin each side
      let fontSize = 62;
      let lines: string[] = [];

      const wrapText = (size: number): string[] => {
        ctx.font = `bold ${size}px 'Baskerville Classico', 'Baskerville', 'Georgia', serif`;
        const words = upperHeadline.split(" ");
        const result: string[] = [];
        let currentLine = words[0] || "";

        for (let i = 1; i < words.length; i++) {
          const testLine = currentLine + " " + words[i];
          if (ctx.measureText(testLine).width < maxTextWidth) {
            currentLine = testLine;
          } else {
            result.push(currentLine);
            currentLine = words[i];
          }
        }
        if (currentLine) result.push(currentLine);
        return result;
      };

      // Shrink font until text fits 
      while (fontSize >= 24) {
        lines = wrapText(fontSize);
        if (lines.length * (fontSize * 1.18) < (bannerH * 0.6)) break; // Ensure it fits vertically within banner
        fontSize -= 2;
      }

      ctx.font = `bold ${fontSize}px 'Baskerville Classico', 'Baskerville', 'Georgia', serif`;
      const lineHeight = fontSize * 1.18;
      const totalTextHeight = lines.length * lineHeight;
      const textStartY = 105; 
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = t.textColor;

      lines.forEach((line, i) => {
        ctx.fillText(line, W / 2, textStartY + i * lineHeight);
      });

      ctx.restore();
      } // End template block

      // ── 7. Shared Branding Logic ──
      const drawBranding = (position: 'top-left' | 'bottom-left' | 'bottom-right') => {
        ctx.save();
        let x = 20;
        let y = H - 64;
        
        if (position === 'top-left') {
          x = 45;
          y = 45;
        } else if (position === 'bottom-right') {
          x = W - 180;
          y = H - 64;
        }

        const logoBgW = 160;
        const logoBgH = 44;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.beginPath();
        ctx.moveTo(x + 8, y);
        ctx.lineTo(x + logoBgW - 8, y);
        ctx.arcTo(x + logoBgW, y, x + logoBgW, y + 8, 8);
        ctx.lineTo(x + logoBgW, y + logoBgH - 8);
        ctx.arcTo(x + logoBgW, y + logoBgH, x + logoBgW - 8, y + logoBgH, 8);
        ctx.lineTo(x + 8, y + logoBgH);
        ctx.arcTo(x, y + logoBgH, x, y + logoBgH - 8, 8);
        ctx.lineTo(x, y + 8);
        ctx.arcTo(x, y, x + 8, y, 8);
        ctx.closePath();
        ctx.fill();

        ctx.font = "900 24px 'Arial Black', Impact, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const logoY = y + logoBgH / 2;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText("LAD", x + 14, logoY);
        const ladW = ctx.measureText("LAD").width;
        ctx.fillStyle = "#FA76FF";
        ctx.fillText("today", x + 14 + ladW, logoY);
        ctx.restore();
      };

      if (template === 'bordered') {
        drawBranding('top-left');
      } else {
        drawBranding('bottom-left');
      }


      // ── 8. Export ──
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob failed"));
        },
        "image/png",
      );
    };

    // Load background image
    const bgImg = new Image();
    bgImg.crossOrigin = "anonymous";
    bgImg.onload = () => drawDesign(bgImg);
    bgImg.onerror = () => drawDesign(); // Fallback: no image
    bgImg.src = imageUrl;
  });
}

// ─── Upload ──────────────────────────────────────────────────────────────────

export async function uploadThumbnailBlob(articleId: string, blob: Blob): Promise<string | null> {
  try {
    const path = `ai/${articleId}.png`;
    const arrayBuf = await blob.arrayBuffer();

    await supabase.storage.from("thumbnails").remove([path]);
    const { error } = await supabase.storage
      .from("thumbnails")
      .upload(path, arrayBuf, { contentType: "image/png", upsert: true });

    if (error) {
      console.error("Thumbnail upload failed:", error.message);
      return null;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("thumbnails").getPublicUrl(path);

    // Append a timestamp to the URL to bust the browser cache,
    // ensuring the new image is immediately fetched everywhere.
    return `${publicUrl}?t=${Date.now()}`;
  } catch (err) {
    console.error("Thumbnail upload error:", err);
    return null;
  }
}
