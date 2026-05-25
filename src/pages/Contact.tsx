import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Mail, MessageSquare, Send, Facebook, Zap, MessageCircle } from "lucide-react";
import { toast } from "sonner";

const Contact = () => {
  const [activeTab, setActiveTab] = useState("message");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });

  const sections = [
    { id: "message", title: "MESSAGE" },
    { id: "direct", title: "DIRECT" },
    { id: "inquiries", title: "INQUIRIES" }
  ];

  const handleTabChange = (id: string) => {
    if (id === activeTab || isTransitioning) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setActiveTab(id);
      setIsTransitioning(false);
    }, 300);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) {
      toast.error("Please fill in the blanks!");
      return;
    }
    toast.success("Message sent! We'll get back to you soon.");
    setFormData({ name: "", email: "", message: "" });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <div className="min-h-screen bg-background animate-fade-in font-sans">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-0">
        {/* Compressed Hero - Lily Pink Sync */}
        <div className="mb-6 border border-border/50 p-6 md:p-8 pt-12 md:pt-16 bg-gradient-to-br from-[#FA76FF]/20 to-background relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#FA76FF]/10 to-transparent translate-x-12 -translate-y-12 rotate-45" />
          <div className="inline-block border border-foreground/20 px-3 py-1 bg-[#FA76FF] text-foreground text-[10px] font-black uppercase tracking-widest mb-4">
            <MessageCircle className="w-3 h-3 inline-block mr-2" />
            LET'S TALK
          </div>
          <h1 className="text-4xl md:text-7xl font-black uppercase tracking-tighter leading-[0.8] mb-4">
            CONTACT <br /> <span className="bg-gradient-to-r from-[#FA76FF] to-foreground bg-clip-text text-transparent">THE TEAM</span>
          </h1>
          <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] opacity-70">
            RESPONSE TIME: WITHIN 24-48 HOURS
          </p>
        </div>

        {/* Responsive Button Grid - 2x1 Mobile, 3-wide Desktop */}
        <div className="mb-8 border border-border/50 bg-foreground p-px grid grid-cols-2 md:grid-cols-3 gap-px">
          {sections.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => handleTabChange(s.id)}
              className={`py-3 md:py-4 text-[10px] items-center justify-center flex font-black text-center uppercase tracking-widest transition-all
                ${activeTab === s.id ? "bg-[#FA76FF] text-foreground" : "bg-background text-foreground hover:bg-muted"}
                ${idx === 2 ? "col-span-2 md:col-span-1" : "col-span-1"}
              `}
            >
              <span className="flex items-center gap-2">
                {s.id === 'message' && <MessageSquare className="w-3 h-3" />}
                {s.id === 'direct' && <Facebook className="w-3 h-3" />}
                {s.id === 'inquiries' && <Zap className="w-3 h-3" />}
                {s.title}
              </span>
            </button>
          ))}
        </div>

        {/* Content Area with Switcher Animation */}
        <div className="relative mb-12">
          <div className={`transition-all duration-300 ease-in-out transform ${isTransitioning ? "opacity-0 -translate-y-2" : "opacity-100 translate-y-0"}`}>

            {activeTab === "message" && (
              <section className="border border-border/50 p-8 md:p-12 bg-card animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden">
                <div className="flex items-center gap-3 mb-8">
                  <h2 className="text-xl md:text-2xl font-black uppercase tracking-tighter text-[#FA76FF]">SAY SOMETHING</h2>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8 md:space-y-10">
                  <div className="text-lg md:text-3xl font-black uppercase tracking-tight leading-[1.2] text-foreground">
                    HELLO! MY NAME IS{" "}
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="YOUR NAME"
                      className="border-b border-[#FA76FF] bg-transparent focus:outline-none placeholder:text-muted-foreground/20 text-[#FA76FF] w-full md:w-auto min-w-[150px] transition-colors focus:border-foreground"
                    />{" "}
                    AND I'M WRITING FROM{" "}
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="YOUR EMAIL"
                      className="border-b border-[#FA76FF] bg-transparent focus:outline-none placeholder:text-muted-foreground/20 text-[#FA76FF] w-full md:w-auto min-w-[200px] transition-colors focus:border-foreground"
                    />{" "}
                    I'D REALLY LIKE TO TALK ABOUT{" "}
                    <span className="inline-block w-full mt-2">
                      <textarea
                        name="message"
                        value={formData.message}
                        onChange={handleChange}
                        placeholder="TELL US MORE..."
                        rows={3}
                        className="border-b border-[#FA76FF] bg-transparent focus:outline-none placeholder:text-muted-foreground/20 text-[#FA76FF] w-full resize-none leading-tight transition-colors focus:border-foreground [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                      />
                    </span>
                  </div>

                  <button
                    type="submit"
                    className="mt-4 w-full md:w-auto bg-[#FA76FF] text-foreground px-10 py-5 text-sm md:text-lg font-black uppercase tracking-widest hover:bg-foreground hover:text-[#FA76FF] transition-all shadow-[0px_4px_0px_0px_rgba(0,0,0,0.2)] active:translate-y-1 active:shadow-none"
                  >
                    SEND MESSAGE
                  </button>
                </form>
              </section>
            )}

            {activeTab === "direct" && (
              <section className="bg-gradient-to-br from-[#FA76FF]/20 to-background p-10 md:p-14 border border-border/50 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden">
                <div className="flex items-center gap-3 mb-8">
                  <h2 className="text-xl font-black uppercase tracking-tighter">DIRECT LINE</h2>
                </div>
                <div className="space-y-10">
                  <div className="flex items-start gap-5 group">
                    <div className="w-12 h-12 border border-foreground bg-background flex items-center justify-center shrink-0">
                      <Mail className="w-5 h-5 text-[#FA76FF]" />
                    </div>
                    <div className="overflow-hidden">
                      <h3 className="text-[9px] font-black uppercase tracking-widest opacity-50 mb-1">EMAIL US</h3>
                      <a 
                        href="mailto:ladtoday@gmail.com" 
                        className="text-xl md:text-4xl font-black uppercase tracking-tighter leading-none break-all md:break-normal hover:text-[#FA76FF] transition-colors"
                      >
                        ladtoday@gmail.com
                      </a>
                    </div>
                  </div>
                  <div className="flex items-start gap-5 group">
                    <div className="w-12 h-12 border border-foreground bg-background flex items-center justify-center shrink-0">
                      <MessageCircle className="w-5 h-5 text-[#FA76FF]" />
                    </div>
                    <div>
                      <h3 className="text-[9px] font-black uppercase tracking-widest opacity-50 mb-1">PRESENCE</h3>
                      <a 
                        href="https://www.facebook.com/profile.php?id=61583736495022&mibextid=ZbWKwL" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xl md:text-4xl font-black uppercase tracking-tighter leading-none text-foreground hover:text-[#FA76FF] transition-colors"
                      >
                        FACEBOOK
                      </a>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeTab === "inquiries" && (
              <section className="bg-background animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Brutalist Bento Inquiries */}
                  <div className="group relative border border-border/50 bg-card p-10 overflow-hidden hover:bg-[#FA76FF] transition-all duration-500">
                    <div className="relative z-10">
                      <div className="text-[10px] font-black uppercase tracking-[0.3em] mb-4 opacity-70 group-hover:opacity-100 transition-opacity">COLLABORATION</div>
                      <h3 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none mb-10 group-hover:scale-105 transition-transform origin-left">
                        WRITE <br /> <span className="text-[#FA76FF] group-hover:text-background">FOR US</span>
                      </h3>
                      <p className="text-xs font-bold uppercase tracking-tight opacity-70 group-hover:opacity-100 leading-tight max-w-[200px]">
                        SHARE YOUR VOICE WITH A GLOBAL AUDIENCE.
                      </p>
                    </div>
                    <Zap className="absolute -bottom-8 -right-8 w-32 h-32 text-foreground/5 group-hover:text-background/10 transition-colors" />
                  </div>

                  <div className="group relative border border-border/50 bg-foreground p-10 overflow-hidden hover:bg-background transition-all duration-500">
                    <div className="relative z-10">
                      <div className="text-[10px] font-black uppercase tracking-[0.3em] mb-4 text-[#FA76FF]">PARTNERSHIPS</div>
                      <h3 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none mb-10 text-background group-hover:text-foreground group-hover:scale-105 transition-transform origin-left">
                        AD <br /> <span className="text-[#FA76FF]">MEDIA</span>
                      </h3>
                      <p className="text-xs font-bold uppercase tracking-tight text-background/70 group-hover:text-foreground/70 leading-tight max-w-[200px]">
                        REACH AN ENGAGED, TECH-SAVVY NEWS AUDIENCE.
                      </p>
                    </div>
                    <Facebook className="absolute -bottom-8 -right-8 w-32 h-32 text-background/10 group-hover:text-foreground/5 transition-colors" />
                  </div>
                </div>
              </section>
            )}

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Contact;
