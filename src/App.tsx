
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import ErrorBoundary from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import FishGuide from "./pages/FishGuide";
import MyTrips from "./pages/MyTrips";
import SharedTrip from "./pages/SharedTrip";
import Licenses from "./pages/Licenses";
import Regulations from "./pages/Regulations";
import MyCatches from "./pages/MyCatches";
import Leaderboard from "./pages/Leaderboard";
import Pricing from "./pages/Pricing";
import Checkout from "./pages/Checkout";
import CheckoutSuccess from "./pages/CheckoutSuccess";
import NotFound from "./pages/NotFound";
import StripeSetup from "./pages/StripeSetup";
import ShareQR from "./pages/ShareQR";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import Contact from "./pages/Contact";
import { AdminDashboard, ProOnlyRoute } from "@/components/SubscriptionModal";


const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider defaultTheme="light">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/fish-guide" element={<FishGuide />} />
              <Route path="/my-trips" element={<ProOnlyRoute><MyTrips /></ProOnlyRoute>} />
              <Route path="/trip/:shareId" element={<SharedTrip />} />
              <Route path="/licenses" element={<Licenses />} />
              <Route path="/regulations" element={<Regulations />} />
              <Route path="/my-catches" element={<ProOnlyRoute><MyCatches /></ProOnlyRoute>} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/checkout/success" element={<CheckoutSuccess />} />
              <Route path="/admin/stripe-setup" element={<StripeSetup />} />
              <Route path="/admin/FamousPay-setup" element={<StripeSetup />} />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/fishing-spots" element={<AdminDashboard />} />
              <Route path="/admin/fishing-spots/new" element={<AdminDashboard />} />
              <Route path="/admin/species" element={<AdminDashboard />} />
              <Route path="/admin/accommodations" element={<AdminDashboard />} />
              <Route path="/admin/users" element={<AdminDashboard />} />
              <Route path="/admin/memberships" element={<AdminDashboard />} />
              {/* Fallback aliases — buttons throughout the app sometimes link
                  to the un-prefixed paths; honor those instead of 404'ing. */}
              <Route path="/stripe-setup" element={<StripeSetup />} />
              <Route path="/FamousPay-setup" element={<StripeSetup />} />
              <Route path="/share-qr" element={<ShareQR />} />
              <Route path="/qr" element={<ShareQR />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="*" element={<NotFound />} />




            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
