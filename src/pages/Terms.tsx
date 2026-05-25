import { useState, useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Scale, Zap, AlertTriangle, ShieldAlert, Mail } from "lucide-react";

const sections = [
  { id: "agreement", title: "AGREEMENT" },
  { id: "disclaimer", title: "DISCLAIMER" },
  { id: "prohibited", title: "PROHIBITED" },
  { id: "mods", title: "CHANGES" },
  { id: "contact", title: "CONTACT" }
];

const Terms = () => {
  const [activeTab, setActiveTab] = useState("agreement");
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Deep-link support for terms#disclaimer, terms#contact, etc.
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

  return (
    <div className="min-h-screen bg-background animate-fade-in font-sans">
      <Header />
      
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-0">
        {/* Boxy Hero - Refined Lily Pink Gradient */}
        <div className="mb-10 border border-border/50 p-10 pt-20 bg-gradient-to-br from-[#FA76FF]/20 to-background relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#FA76FF]/10 to-transparent translate-x-12 -translate-y-12 rotate-45" />
          <div className="inline-block border border-foreground/20 px-3 py-1 bg-[#FA76FF] text-foreground text-[10px] font-black uppercase tracking-widest mb-6">
            <Scale className="w-3 h-3 inline-block mr-2" />
            LEGAL
          </div>
          <h1 className="text-4xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-4">
            <span className="bg-gradient-to-r from-[#FA76FF] to-foreground bg-clip-text text-transparent">TERMS</span> <br /> & CONDITIONS
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">
            LATEST UPDATE: APRIL 21, 2026
          </p>
        </div>

        {/* Quick Jump Index - 5 Button Grid matching Privacy */}
        <div className="mb-10 border border-border/50 bg-foreground p-px grid grid-cols-2 md:grid-cols-5 gap-px">
          {sections.map((s, idx) => (
            <button 
              key={s.id} 
              onClick={() => handleTabChange(s.id)}
              className={`py-3 text-[10px] font-black text-center uppercase tracking-widest transition-all
                ${activeTab === s.id ? "bg-[#FA76FF] text-foreground" : "bg-background text-foreground hover:bg-muted"}
                ${idx === 4 ? "col-span-2 md:col-span-1" : "col-span-1"}
              `}
            >
              {s.title}
            </button>
          ))}
        </div>

        {/* Content Area with Switcher */}
        <div className={`relative transition-all duration-300 ${activeTab === 'contact' ? 'mb-0' : 'mb-4'}`}>
          <div className={`transition-all duration-300 ease-in-out transform ${isTransitioning ? "opacity-0 -translate-y-2 pointer-events-none" : "opacity-100 translate-y-0"}`}>
            {activeTab === "agreement" && (
              <section className="border border-border/50 p-8 bg-card animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-6">
                   <Zap className="w-5 h-5 text-[#FA76FF]" />
                   <h2 className="text-2xl font-black uppercase tracking-tight">AGREEMENT</h2>
                </div>
                <p className="text-xs md:text-sm font-bold uppercase tracking-tight leading-relaxed">
                  BY ACCESSING LADtoday, YOU AGREE TO BE BOUND BY THESE TERMS. IF YOU DISAGREE, YOU MAY NOT ACCESS OUR SERVICES.
                </p>
              </section>
            )}

            {activeTab === "disclaimer" && (
              <section className="border border-border/50 p-8 bg-card animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-6">
                   <ShieldAlert className="w-5 h-5 text-[#FA76FF]" />
                   <h2 className="text-2xl font-black uppercase tracking-tight">DISCLAIMER</h2>
                </div>
                <div className="space-y-4">
                  {[
                    "INFORMATIONAL PURPOSES ONLY",
                    "NO GUARANTEE OF 100% ACCURACY",
                    "NOT FOR HIGH-STAKES DECISIONS"
                  ].map(text => (
                    <div key={text} className="flex items-center gap-4 border border-border/50 p-4 text-[10px] font-black uppercase tracking-widest bg-[#FA76FF]/5">
                       <div className="w-2 h-2 bg-foreground" />
                       {text}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === "prohibited" && (
              <section className="border border-border/50 p-8 bg-card animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-6">
                   <AlertTriangle className="w-5 h-5 text-[#FA76FF]" />
                   <h2 className="text-2xl font-black uppercase tracking-tight">PROHIBITED</h2>
                </div>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    "COPY OR REUSE CONTENT",
                    "ILLEGAL ACTIVITY",
                    "SITE INTERFERENCE",
                    "MALICIOUS CODE"
                  ].map(item => (
                    <li key={item} className="border border-background/20 p-4 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                       <span className="text-red-500">×</span> {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {activeTab === "mods" && (
              <section className="border border-border/50 p-8 bg-card animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-6">
                   <Zap className="w-5 h-5 text-[#FA76FF]" />
                   <h2 className="text-2xl font-black uppercase tracking-tight">CHANGES</h2>
                </div>
                <p className="text-xs font-bold uppercase tracking-widest leading-relaxed opacity-80">
                  WE MAY UPDATE CONTENT AT ANY TIME. CONTINUED USE MEANS ACCEPTANCE OF NEW TERMS.
                </p>
              </section>
            )}

            {activeTab === "contact" && (
              <section className="border border-border/50 border-b-0 p-8 bg-card animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-3 mb-6">
                   <Mail className="w-5 h-5 text-[#FA76FF] fill-[#FA76FF]" />
                   <h2 className="text-2xl font-black uppercase tracking-tight">SUPPORT CONTACT</h2>
                </div>
                <div className="space-y-4 text-xs md:text-base font-black uppercase tracking-tight opacity-100 leading-tight">
                  <p>WE ARE AVAILABLE FOR DIRECT INQUIRIES REGARDING YOUR LEGAL RIGHTS OR TERMS OF SERVICE.</p>
                  <p>EXPECT A RESPONSE WITHIN 48 HOURS.</p>
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Persistent Bottom Section - Merged when activeTab is contact */}
        <section className={`border border-border/50 p-12 text-center bg-[#FA76FF] transition-all duration-300 ${activeTab === 'contact' ? 'mt-0 border-t-0' : 'mt-4'}`}>
          <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-8 text-foreground leading-none">NEED HELP?</h2>
          <a 
            href="/contact" 
            className="inline-block bg-foreground px-12 py-5 text-[14px] font-black uppercase tracking-[0.1em] text-background hover:bg-muted-foreground transition-all shadow-[0px_4px_0px_0px_rgba(0,0,0,0.3)] active:translate-y-px active:shadow-none"
          >
            CONTACT SUPPORT
          </a>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Terms;
