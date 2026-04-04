import { Toaster } from "sileo";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { CRMProvider } from "@/contexts/CRMContext";
import { CustomFieldsProvider } from "@/contexts/CustomFieldsContext";
import { PortfolioProvider } from "@/contexts/PortfolioContext";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { TaxonomyProvider } from "@/contexts/TaxonomyContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import Index from "./pages/Index";
import CompanyProfilePage from "./pages/CompanyProfilePage";
import Tasks from "./pages/Tasks";
import Portafolio from "./pages/Portafolio";
import Stats from "./pages/Stats";
import ProfilePage from "./pages/ProfilePage";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <ProfileProvider>
        <CRMProvider>
          <TaxonomyProvider>
          <CustomFieldsProvider>
          <PortfolioProvider>
          <Toaster position="bottom-right" options={{ fill: "#171717", roundness: 14, duration: 3000, styles: { title: "!text-white", description: "!text-white/75" } }} />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route path="/" element={<Index />} />
                <Route path="/empresa/:id" element={<CompanyProfilePage />} />
                <Route path="/tareas" element={<Tasks />} />
                <Route path="/portafolio" element={<Portafolio />} />
                <Route path="/stats" element={<Stats />} />
                <Route path="/perfil" element={<ProfilePage />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
          </PortfolioProvider>
          </CustomFieldsProvider>
          </TaxonomyProvider>
        </CRMProvider>
        </ProfileProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
