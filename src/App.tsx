import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Category from "./pages/Category";
import Article from "./pages/Article";
import About from "./pages/About";
import Authors from "./pages/Authors";
import Contact from "./pages/Contact";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import NotFound from "./pages/NotFound";
import SignIn from "./pages/SignIn";
import Admin from "./pages/Admin";
import AdminCategories from "./pages/AdminCategories";
import AdminMedia from "./pages/AdminMedia";
import AdminSettings from "./pages/AdminSettings";
import AdminLogs from "./pages/AdminLogs";
import AdminFacebookPages from "./pages/AdminFacebookPages";
import AdminFacebookQueue from "./pages/AdminFacebookQueue";
import AdminScraperSources from "./pages/AdminScraperSources";
import AdminPipeline from "./pages/AdminPipeline";

import { HelmetProvider } from "react-helmet-async";
import ScrollToTop from "./components/ScrollToTop";

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/category/:slug" element={<Category />} />
          <Route path="/article/:category/:slug" element={<Article />} />
          <Route path="/about" element={<About />} />
          <Route path="/authors" element={<Authors />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/categories" element={<AdminCategories />} />
          <Route path="/admin/media" element={<AdminMedia />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
          <Route path="/admin/logs" element={<AdminLogs />} />
          <Route path="/admin/facebook" element={<AdminFacebookPages />} />
          <Route path="/admin/facebook/queue/:pageId" element={<AdminFacebookQueue />} />
          <Route path="/admin/scraper" element={<AdminScraperSources />} />
          <Route path="/admin/pipeline" element={<AdminPipeline />} />
          <Route path="/admin/pipeline/:runId" element={<AdminPipeline />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </HelmetProvider>
);

export default App;
