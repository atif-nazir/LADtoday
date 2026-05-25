import { useState, useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Target, TrendingUp, BookOpen, Bell, Zap, Globe } from "lucide-react";
import { toast } from "sonner";

const sections = [
  { id: "goal", title: "GOAL" },
  { id: "focus", title: "FOCUS" },
  { id: "story", title: "STORY" }
];

const About = () => {
  const [activeTab, setActiveTab] = useState("goal");
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Deep-link support for about#story, about#focus, etc.
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (sections.some(s => s.id === hash)) {
      setActiveTab(hash);
    }
  }, []);

  const handleTabChange = (id: string) => {
    if (id === activeTab || isTransitioning) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setActiveTab(id);
      setIsTransitioning(false);
    }, 300);
  };

  const handleNewsletter = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Welcome! You're now subscribed to LADtoday.");
  };

  return (
    <div className="min-h-screen bg-background animate-fade-in font-sans text-foreground">
      <Header />
      
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-0">
        {/* Compressed Hero - Lily Pink Sync */}
        <div className="mb-6 border border-border/50 p-6 md:p-10 pt-12 md:pt-20 bg-gradient-to-br from-[#FA76FF]/20 to-background relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#FA76FF]/10 to-transparent translate-x-12 -translate-y-12 rotate-45" />
          <div className="inline-block border border-foreground/20 px-3 py-1 bg-[#FA76FF] text-foreground text-[10px] font-black uppercase tracking-widest mb-6">
            EST. 2025
          </div>
          <h1 className="text-5xl md:text-8xl font-black uppercase tracking-tighter leading-[0.8] mb-8">
            ABOUT <br /> 
            <span className="bg-gradient-to-r from-[#FA76FF] to-foreground bg-clip-text text-transparent">LAD</span>TODAY
          </h1>
          <p className="text-lg md:text-2xl font-bold uppercase tracking-tight leading-[1.1] max-w-2xl opacity-90">
            A modern blog and news platform sharing trending stories and updates worldwide.
          </p>
        </div>

        {/* Interactive Switcher - Matching Site-Wide UX */}
        <div className="mb-8 border border-border/50 bg-foreground p-px grid grid-cols-3 gap-px">
          {sections.map((s) => (
            <button 
              key={s.id} 
              onClick={() => handleTabChange(s.id)}
              className={`py-4 text-[10px] font-black text-center uppercase tracking-widest transition-all
                ${activeTab === s.id ? "bg-[#FA76FF] text-foreground" : "bg-background text-foreground hover:bg-muted"}
              `}
            >
              {s.title}
            </button>
          ))}
        </div>

        {/* Content Area with Animation */}
        <div className="relative mb-12">
          <div className={`transition-all duration-300 ease-in-out transform ${isTransitioning ? "opacity-0 -translate-y-2 pointer-events-none" : "opacity-100 translate-y-0"}`}>
            
            {activeTab === "goal" && (
              <section className="border border-border/50 p-6 md:p-10 bg-card animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-3 mb-6">
                   <Target className="w-5 h-5 text-[#FA76FF]" />
                   <h2 className="text-xl font-black uppercase tracking-tight">OUR GOAL</h2>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    "Deliver quick and easy-to-understand news",
                    "Keep readers updated with what's happening globally",
                    "Provide clean, engaging, and accessible content"
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-4 border border-border/10 p-3 hover:border-[#FA76FF]/30 transition-colors bg-background/50">
                      <div className="font-black text-[#FA76FF] text-lg leading-none shrink-0">0{i + 1}</div>
                      <span className="text-[11px] font-bold uppercase tracking-tight leading-none">{item}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === "focus" && (
              <section className="border border-border/50 p-8 md:p-12 bg-card animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-3 mb-6">
                   <TrendingUp className="w-5 h-5 text-[#FA76FF]" />
                   <h2 className="text-xl font-black uppercase tracking-tight">FOCUS AREAS</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["LATEST NEWS", "TRENDING", "UPDATES"].map((topic) => (
                    <div key={topic} className="flex-1 min-w-[120px] border border-border px-4 py-6 bg-background group hover:bg-[#FA76FF] transition-all text-center">
                       <Zap className="w-4 h-4 mx-auto mb-2 text-[#FA76FF] group-hover:text-background" />
                       <h3 className="font-black text-[10px] uppercase tracking-widest group-hover:text-background">{topic}</h3>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === "story" && (
              <section className="border border-border/50 p-8 md:p-12 bg-card animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-3 mb-8">
                   <BookOpen className="w-5 h-5 text-[#FA76FF]" />
                   <h2 className="text-2xl font-black uppercase tracking-tight">THE STORY</h2>
                </div>
                <div className="space-y-6 text-sm md:text-base font-bold uppercase tracking-tight opacity-90 leading-tight">
                  <p>LADtoday simplifies the news cycle. We believe clarity and speed are paramount in an era of information overload.</p>
                  <p className="border-l-4 border-[#FA76FF] pl-6 text-[#FA76FF]">FROM LOCAL NEWS TO GLOBAL TRENDS, WE PROVIDE A CLEAN EXPERIENCE THAT RESPECTS YOUR TIME.</p>
                </div>
              </section>
            )}

          </div>
        </div>

        {/* WANT TO CONTRIBUTE Section - Matching Authors & User Image */}
        <section className="mt-12 mb-12">
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

export default About;
