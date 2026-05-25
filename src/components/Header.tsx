import { useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let lastScrollY = window.pageYOffset;
    let ticking = false;

    const updateScrollDir = () => {
      const scrollY = window.pageYOffset;
      if (Math.abs(scrollY - lastScrollY) < 10) {
        ticking = false;
        return;
      }
      setIsVisible(scrollY < lastScrollY || scrollY < 50);
      lastScrollY = scrollY > 0 ? scrollY : 0;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollDir);
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldBeDark = savedTheme === "dark" || (!savedTheme && prefersDark);
    setIsDark(shouldBeDark);
    if (shouldBeDark) document.documentElement.classList.add("dark");

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Lock body scroll when menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isMenuOpen]);

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    if (newTheme) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const navLinks = [
    { href: "/", label: "HOME" },
    { href: "/#articles", label: "LATEST" },
    { href: "/category/talks", label: "TALKS" },
    { href: "/about", label: "ABOUT" },
  ];

  // Shared classes for the brutalist nav link style
  const navLinkBase =
    "relative overflow-hidden bg-background text-foreground h-[34px] px-3 flex items-center text-[11px] font-medium uppercase border border-foreground leading-none group border-l-0";

  // The sliding magenta hover background
  const hoverSlide = (
    <span className="absolute inset-0 bg-[#FA76FF] translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out pointer-events-none" />
  );

  return (
    <>
      {/* ─── Fixed Top-Left Navbar ─── */}
      <nav className={`fixed top-8 left-4 md:left-8 z-[2000] flex items-center gap-0 transition-transform duration-500 ease-in-out ${isVisible ? 'translate-y-0 opacity-100' : '-translate-y-[200%] opacity-0'}`} id="main-nav">
        {/* Logo — solid square with smiley icon */}
        <Link
          to="/"
          className="bg-foreground text-background h-[34px] px-2.5 border border-foreground flex items-center justify-center shrink-0"
          aria-label="Home"
        >
          <span className="text-[11px] font-black uppercase tracking-tight leading-none">LAD<span className="text-[#FA76FF]">today</span></span>
        </Link>

        {/* ─── Desktop Navigation ─── */}
        <div className="hidden md:flex items-center">
          {navLinks.map((link) => (
            <Link key={link.href} to={link.href} className={navLinkBase}>
              <span className="relative z-10">{link.label}</span>
              {hoverSlide}
            </Link>
          ))}

          {user && (
            <button onClick={handleSignOut} className={navLinkBase}>
              <span className="relative z-10">SIGN OUT</span>
              {hoverSlide}
            </button>
          )}
        </div>

        {/* ─── Theme Toggle (Desktop) ─── */}
        <button
          onClick={toggleTheme}
          className="hidden md:flex relative overflow-hidden bg-background text-foreground h-[34px] w-[34px] border border-foreground border-l-0 items-center justify-center group"
          aria-label="Toggle theme"
        >
          <span className="relative z-10">
            {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </span>
          {hoverSlide}
        </button>

        {/* ─── Mobile: MENU Button ─── */}
        <button
          onClick={() => setIsMenuOpen(true)}
          className="md:hidden relative overflow-hidden bg-background text-foreground h-[34px] px-3 border border-foreground border-l-0 flex items-center justify-center text-[11px] font-medium uppercase leading-none group"
          aria-label="Open menu"
        >
          <span className="relative z-10">MENU</span>
          {hoverSlide}
        </button>

        {/* ─── Mobile: Theme Toggle (always visible) ─── */}
        <button
          onClick={toggleTheme}
          className="md:hidden relative overflow-hidden bg-background text-foreground h-[34px] w-[34px] border border-foreground border-l-0 flex items-center justify-center group"
          aria-label="Toggle theme"
        >
          <span className="relative z-10">
            {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </span>
          {hoverSlide}
        </button>
      </nav>

      {/* ─── Full-Screen Mobile Menu ─── */}
      {isMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[3000] flex flex-col animate-in slide-in-from-top duration-300">
          {/* Close bar */}
          <div className="bg-foreground flex items-center justify-center py-16 animate-in fade-in duration-500">
            <button
              onClick={() => setIsMenuOpen(false)}
              className="text-background text-[15px] font-medium uppercase tracking-wider"
            >
              CLOSE
            </button>
          </div>

          {/* Nav links */}
          <div className="flex-1 flex flex-col bg-background">
            {navLinks.map((link, i) => (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setIsMenuOpen(false)}
                className="flex-1 flex items-center justify-center text-foreground text-[17px] font-medium uppercase border-b border-foreground tracking-[-0.34px] animate-fade-in"
                style={{ animationDelay: `${0.1 + i * 0.1}s`, animationFillMode: "both" }}
              >
                {link.label}
              </Link>
            ))}

            {user && (
              <button
                onClick={() => { handleSignOut(); setIsMenuOpen(false); }}
                className="flex-1 flex items-center justify-center text-foreground text-[17px] font-medium uppercase tracking-[-0.34px] animate-fade-in border-b border-foreground md:border-b-0"
                style={{ animationDelay: "0.6s", animationFillMode: "both" }}
              >
                SIGN OUT
              </button>
            )}

            {/* Mobile theme toggle */}
            <div className="flex items-center justify-center py-6 animate-fade-in" style={{ animationDelay: "0.8s", animationFillMode: "both" }}>
              <button
                onClick={toggleTheme}
                className="p-3 border border-foreground hover:bg-[#FA76FF] hover:border-[#FA76FF] transition-all duration-300"
                aria-label="Toggle theme"
              >
                {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
