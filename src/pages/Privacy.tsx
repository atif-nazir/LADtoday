import { useState, useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Mail, Shield, ShieldCheck, Zap, Cookie } from "lucide-react";

const sections = [
  { id: "intro", title: "INTRODUCTION" },
  { id: "collect", title: "COLLECTION" },
  { id: "usage", title: "USAGE" },
  { id: "cookies", title: "COOKIES" },
  { id: "security", title: "SECURITY" },
  { id: "contact", title: "CONTACT" }
];

const Privacy = () => {
  const [activeTab, setActiveTab] = useState("intro");
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Deep-link support for privacy#security, privacy#usage, etc.
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
    }, 300); // Match this with CSS transition duration
  };

  return (
    <div className="min-h-screen bg-background animate-fade-in font-sans">
      <Header />
      
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-0">
        {/* Boxy Hero - Refined Lily Pink Gradient */}
        <div className="mb-10 border border-border/50 p-10 pt-20 bg-gradient-to-br from-[#FA76FF]/20 to-background relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#FA76FF]/10 to-transparent translate-x-12 -translate-y-12 rotate-45" />
          <div className="inline-block border border-foreground/20 px-3 py-1 bg-[#FA76FF] text-foreground text-[10px] font-black uppercase tracking-widest mb-6">
            <ShieldCheck className="w-3 h-3 inline-block mr-2" />
            PROTECTED
          </div>
          <h1 className="text-4xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-4 text-foreground">
            <span className="bg-gradient-to-r from-[#FA76FF] to-foreground bg-clip-text text-transparent">PRIVACY</span> <br /> POLICY
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70 text-foreground">
            LATEST UPDATE: APRIL 21, 2026
          </p>
        </div>

        {/* Quick Jump Index - Fixed Grid for Mobile */}
        <div className="mb-10 border border-border/50 bg-foreground p-px grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px">
          {sections.map((s) => (
            <button 
              key={s.id} 
              onClick={() => handleTabChange(s.id)}
              className={`py-3 text-[10px] font-black text-center uppercase tracking-widest transition-colors
                ${activeTab === s.id ? "bg-[#FA76FF] text-foreground" : "bg-background text-foreground hover:bg-muted"}
              `}
            >
              {s.title}
            </button>
          ))}
        </div>

        {/* Content Area with Vanish/Come Animation */}
        <div className={`relative ${activeTab === 'contact' ? 'mb-0' : 'mb-4'}`}>
          <div className={`transition-all duration-300 ease-in-out transform ${isTransitioning ? "opacity-0 -translate-y-2 pointer-events-none" : "opacity-100 translate-y-0"}`}>
            {activeTab === "intro" && (
              <section className="border border-border/50 p-8 bg-card animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-6">
                   <Zap className="w-4 h-4 text-[#FA76FF]" />
                   <h2 className="text-2xl font-black uppercase tracking-tight">INTRODUCTION</h2>
                </div>
                <p className="text-xs md:text-sm font-bold uppercase tracking-tight leading-relaxed opacity-90">
                  At LADtoday, we respect your privacy. This policy informs you how we look after your personal data when you visit our 
                  website and tells you about your privacy rights.
                </p>
              </section>
            )}

            {activeTab === "collect" && (
              <section className="border border-border/50 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-6">
                   <Zap className="w-4 h-4 text-[#FA76FF]" />
                   <h2 className="text-2xl font-black uppercase tracking-tight">DATA COLLECTION</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border/50 border border-border/50">
                  {["IDENTITY NAME", "CONTACT EMAIL", "TECH-BROWSER"].map(t => (
                    <div key={t} className="bg-background p-4 text-[10px] font-black text-center uppercase tracking-widest">
                      {t}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === "usage" && (
              <section className="border border-border/50 p-8 bg-card animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-6">
                   <Zap className="w-4 h-4 text-[#FA76FF]" />
                   <h2 className="text-2xl font-black uppercase tracking-tight">HOW WE USE IT</h2>
                </div>
                <ul className="space-y-3">
                  {[
                    "IMPROVE USER EXPERIENCE",
                    "ANALYTICS & BEHAVIOR",
                    "RESPOND TO MESSAGES",
                    "SITE SECURITY"
                  ].map(item => (
                    <li key={item} className="flex items-center gap-3 text-xs font-black uppercase tracking-widest">
                      <div className="w-2 h-2 bg-[#FA76FF]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {activeTab === "cookies" && (
              <section className="border border-border/50 p-8 bg-card animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-3 mb-6">
                   <Cookie className="w-5 h-5 text-[#FA76FF]" />
                   <h2 className="text-2xl font-black uppercase tracking-tight">ADS & COOKIES</h2>
                </div>
                <div className="space-y-6 text-xs md:text-sm font-bold uppercase tracking-tight leading-relaxed opacity-90">
                  <p>
                    WE USE COOKIES TO PERSONALIZE CONTENT AND ADS, TO PROVIDE SOCIAL MEDIA FEATURES AND TO ANALYZE OUR TRAFFIC.
                  </p>
                  <div className="border-l-4 border-[#FA76FF] pl-6 space-y-4">
                    <p>
                      GOOGLE, AS A THIRD-PARTY VENDOR, USES COOKIES TO SERVE ADS ON OUR SITE. GOOGLE'S USE OF ADVERTISING COOKIES ENABLES IT AND ITS PARTNERS TO SERVE ADS TO OUR USERS BASED ON THEIR VISIT TO OUR SITE AND/OR OTHER SITES ON THE INTERNET.
                    </p>
                    <p>
                      USERS MAY OPT OUT OF PERSONALIZED ADVERTISING BY VISITING ADS SETTINGS OR BY VISITING WWW.ABOUTADS.INFO.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {activeTab === "security" && (
              <section className="border border-border/50 p-8 bg-card text-foreground animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-6">
                   <ShieldCheck className="w-5 h-5 text-[#FA76FF]" />
                   <h2 className="text-2xl font-black uppercase tracking-tight text-foreground">SECURITY</h2>
                </div>
                <p className="text-[10px] md:text-xs font-black uppercase tracking-widest leading-relaxed">
                  WE DO NOT SELL OR SHARE YOUR DATA. YOUR TRUST IS OUR MOST VALUABLE ASSET. WE USE COOKIES TO TRACK PERFORMANCE AND IMPROVE EXPERIENCE.
                </p>
              </section>
            )}

            {activeTab === "contact" && (
              <section className="border border-border/50 border-b-0 p-8 bg-card animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-3 mb-6">
                   <Zap className="w-5 h-5 text-[#FA76FF] fill-[#FA76FF]" />
                   <h2 className="text-2xl font-black uppercase tracking-tight">DIRECT CONTACT</h2>
                </div>
                <div className="space-y-4 text-xs md:text-base font-black uppercase tracking-tight opacity-100 leading-tight">
                  <p>WE ARE AVAILABLE FOR DIRECT INQUIRIES REGARDING YOUR DATA PRIVACY RIGHTS.</p>
                  <p>RESPONSE TIME: WITHIN 24-48 HOURS.</p>
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Persistent Bottom Section - Merged when activeTab is contact */}
        <section className={`border border-border/50 p-12 text-center bg-card transition-all duration-300 ${activeTab === 'contact' ? 'mt-0 border-t-0' : 'mt-4'}`}>
          <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-8 text-foreground leading-none">QUESTIONS?</h2>
          <a 
            href="mailto:ladtoday@gmail.com" 
            className="inline-block bg-[#FA76FF] px-12 py-5 text-[14px] font-black uppercase tracking-[0.1em] text-white hover:bg-[#e060e6] transition-all shadow-[0px_4px_0px_0px_#e060e6] active:translate-y-px active:shadow-none"
          >
            EMAIL THE TEAM
          </a>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Privacy;
