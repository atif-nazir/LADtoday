import { Link } from "react-router-dom";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const footerSections = [
    {
      title: "Explore",
      links: [
        { label: "Talks", href: "/category/talks" },
        { label: "Latest", href: "/#articles" },
        { label: "About Us", href: "/about" },
      ],
    },
    {
      title: "About",
      links: [
        { label: "Our Story", href: "/about#story" },
        { label: "Authors", href: "/authors" },
        { label: "Contact", href: "/contact" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "Our Story", href: "/about#story" },
        { label: "Newsletter", href: "/#newsletter" },
        { label: "Admin", href: "/admin" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy Policy", href: "/privacy" },
        { label: "Terms of Service", href: "/terms" },
      ],
    },
  ];

  return (
    <footer className="border-t border-border mt-8 bg-card/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-12">
          {footerSections.map((section) => (
            <div key={section.title} className="space-y-4">
              <h3 className="font-bold text-xs uppercase tracking-widest text-foreground/70">
                {section.title}
              </h3>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith("/#") ? (
                      <a 
                        href={link.href} 
                        className="text-sm text-muted-foreground hover:text-[#FA76FF] transition-all duration-300 flex items-center group"
                      >
                        <span className="relative overflow-hidden">
                          {link.label}
                          <span className="absolute bottom-0 left-0 w-full h-[1px] bg-[#FA76FF] translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300" />
                        </span>
                      </a>
                    ) : (
                      <Link 
                        to={link.href} 
                        className="text-sm text-muted-foreground hover:text-[#FA76FF] transition-all duration-300 flex items-center group"
                      >
                        <span className="relative overflow-hidden">
                          {link.label}
                          <span className="absolute bottom-0 left-0 w-full h-[1px] bg-[#FA76FF] translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300" />
                        </span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        
        <div className="pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-black text-lg tracking-tighter">
              LAD<span className="text-[#FA76FF]">today</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground font-medium">
            © {currentYear} LADtoday. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a 
              href="https://www.facebook.com/profile.php?id=61583736495022&mibextid=ZbWKwL" 
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-[#FA76FF] transition-colors text-xs font-black uppercase tracking-widest"
            >
              Facebook
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
