import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Mail, Facebook, MessageCircle, Zap } from "lucide-react";

const Authors = () => {
  const authors = [
    {
      name: "Emma Thompson",
      role: "Wellness",
      bio: "Emma is a certified wellness coach with 10+ years of experience helping people create sustainable self-care practices.",
      image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&q=80",
    },
    {
      name: "Marcus Chen",
      role: "Travel",
      bio: "Marcus specializes in slow travel and cultural immersion, visiting over 60 countries to find transformative stories.",
      image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80",
    },
    {
      name: "Sofia Rodriguez",
      role: "Creative",
      bio: "Sofia helps individuals and teams unlock their creative potential through multidisciplinary art and consultations.",
      image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&q=80",
    },
    {
      name: "David Kim",
      role: "Growth",
      bio: "David explores intentional living through psychology and philosophy, emphasizing progress over perfection.",
      image: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&q=80",
    },
  ];

  // Double the authors for seamless infinite scroll
  const displayAuthors = [...authors, ...authors];

  return (
    <div className="min-h-screen bg-background animate-fade-in font-sans">
      <Header />
      
      <main className="pt-8 pb-0">
        {/* Boxy Hero - Lily Pink Sync */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-10">
          <div className="border border-border/50 p-10 pt-20 bg-gradient-to-br from-[#FA76FF]/20 to-background relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#FA76FF]/10 to-transparent translate-x-12 -translate-y-12 rotate-45" />
            <div className="inline-block border border-foreground/20 px-3 py-1 bg-[#FA76FF] text-foreground text-[10px] font-black uppercase tracking-widest mb-6">
              THE SQUAD
            </div>
            <h1 className="text-5xl md:text-8xl font-black uppercase tracking-tighter leading-[0.8] mb-6">
              MEET THE <br /> <span className="bg-gradient-to-r from-[#FA76FF] to-foreground bg-clip-text text-transparent">VOICES</span>
            </h1>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">
              EDITORIAL TEAM & CONTRIBUTORS
            </p>
          </div>
        </div>

        {/* Infinite Auto-Scroll Ticker Section */}
        <div className="relative w-full overflow-hidden border-y border-border/50 bg-card py-12 group">
          {/* Subtle Vanish Gradients */}
          <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-card to-transparent z-10" />
          <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-card to-transparent z-10" />

          <div className="flex w-fit animate-infinite-scroll">
            {displayAuthors.map((author, idx) => (
              <div 
                key={`${author.name}-${idx}`} 
                className="w-[300px] md:w-[450px] shrink-0 px-4 group/card"
              >
                <div className="border border-border/50 bg-background p-6 md:p-8 flex flex-col md:flex-row gap-6 transition-all duration-500 hover:border-[#FA76FF] hover:shadow-[8px_8px_0px_0px_#FA76FF]">
                  <div className="w-full md:w-40 h-56 md:h-40 border border-border shrink-0 overflow-hidden relative">
                    <img 
                      src={author.image} 
                      alt={author.name} 
                      className="w-full h-full object-cover grayscale group-hover/card:grayscale-0 transition-all duration-700" 
                    />
                    <div className="absolute top-2 right-2 w-2 h-2 bg-[#FA76FF] rounded-full animate-pulse" />
                  </div>
                  <div className="flex-1 flex flex-col justify-between">
                    <div className="space-y-3">
                      <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tighter leading-none">{author.name}</h3>
                      <div className="inline-block border border-border px-2 py-0.5 text-[8px] font-black uppercase tracking-widest bg-[#FA76FF]">
                        {author.role}
                      </div>
                      <p className="text-xs font-bold uppercase tracking-tight opacity-70 leading-tight">
                        {author.bio}
                      </p>
                    </div>
                    <div className="flex gap-4 pt-4 mt-4 border-t border-border/10">
                      <a href="https://www.facebook.com/profile.php?id=61583736495022&mibextid=ZbWKwL" target="_blank" rel="noopener noreferrer">
                        <Facebook className="w-4 h-4 hover:text-[#FA76FF] transition-colors cursor-pointer" />
                      </a>
                      <Mail className="w-4 h-4 hover:text-[#FA76FF] transition-colors cursor-pointer" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* WANT TO CONTRIBUTE Section - Replica from image */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 mb-12">
          <div className="bg-[#FA76FF] border border-border p-8 md:p-16 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-4xl md:text-7xl font-black uppercase tracking-tighter text-foreground mb-8 leading-none">
              WANT TO <br /> CONTRIBUTE?
            </h2>
            <p className="text-[10px] md:text-sm font-black uppercase tracking-[0.3em] text-foreground/80 mb-12 leading-relaxed max-w-sm mx-auto">
              WE'RE ALWAYS LOOKING FOR <br className="hidden md:block" /> NEW PERSPECTIVES.
            </p>
            
            <div className="flex flex-col gap-4 max-w-md mx-auto">
              <a 
                href="/contact" 
                className="bg-card text-foreground py-5 text-sm md:text-base font-black uppercase tracking-widest shadow-[0px_4px_0px_0px_rgba(0,0,0,0.2)] hover:bg-foreground hover:text-[#FA76FF] transition-all"
              >
                SEND MESSAGE
              </a>
              <a 
                href="mailto:ladtoday@gmail.com" 
                className="bg-foreground text-background py-5 text-sm md:text-base font-black uppercase tracking-widest hover:bg-muted-foreground transition-all"
              >
                EMAIL DIRECT
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Authors;
