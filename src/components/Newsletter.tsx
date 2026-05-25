import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail } from "lucide-react";

interface NewsletterProps {
  title?: string;
  description?: string;
  variant?: "pill" | "standard";
}

const Newsletter = ({ 
  title = "Join Our Community", 
  description = "Subscribe to receive our latest articles, insights, and inspiration directly in your inbox.",
  variant = "pill"
}: NewsletterProps) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setLoading(true);
    const { error } = await supabase.from("subscribers" as any).insert({ email });

    if (error) {
      // If it's a 'unique_violation' (they are already subscribed), treat it as success
      if (error.code === '23505') {
        toast.success("You are already on the list! Stay tuned.");
        setEmail("");
      } else {
        toast.error("Failed to subscribe. Try again.");
      }
    } else {
      toast.success("Subscribed! You'll get notified of new articles.");
      setEmail("");
    }
    setLoading(false);
  };

  if (variant === "pill") {
    return (
      <section className="text-center py-12 rounded-2xl bg-card border border-border/50 animate-scale-in">
        <h2 className="text-3xl font-bold mb-4">{title}</h2>
        <p className="text-muted-foreground mb-8 max-w-2xl mx-auto px-4">
          {description}
        </p>
        <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto px-4">
          <input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="flex-1 px-5 py-3 rounded-full border border-input bg-background focus:outline-none focus:ring-2 focus:ring-[#FA76FF] transition-all"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-3 rounded-full bg-foreground text-background font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? "..." : (
              <>
                <Mail className="w-4 h-4" />
                <span>Subscribe Now</span>
              </>
            )}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="my-20 rounded-2xl border border-border p-8 md:p-16 text-center animate-scale-in">
      <div className="max-w-2xl mx-auto space-y-6">
        <h2 className="text-3xl md:text-4xl font-bold">{title}</h2>
        <p className="text-muted-foreground leading-relaxed">
          {description}
        </p>
        <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
          <input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="flex-1 px-5 py-3 rounded-full border border-input bg-background focus:outline-none focus:ring-2 focus:ring-[#FA76FF] transition-all"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-3 rounded-full bg-accent text-accent-foreground font-medium hover:opacity-90 transition-all disabled:opacity-50"
          >
            {loading ? "..." : "Subscribe"}
          </button>
        </form>
      </div>
    </section>
  );
};

export default Newsletter;
